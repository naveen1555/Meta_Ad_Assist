import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import { DEFAULT_LEAD_SETTINGS, contactInputSchema, type LeadSettings } from "@chatnova/shared";
import { prisma } from "../db";
import { HttpError, badRequest, notFound } from "../lib/errors";
import { assertLimit, remainingContacts } from "../lib/limits";
import { normalizePhone } from "../lib/utils";
import { dispatchEvent, logActivity } from "../services/events";
import { serializeContact } from "../services/contacts";

/** Mounted behind requireAuth + requireWorkspace. */
export const contactsRouter = Router();

async function countryCode(workspaceId: string) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { leadSettings: true } });
  return ((ws?.leadSettings as LeadSettings | null)?.defaultCountryCode ?? DEFAULT_LEAD_SETTINGS.defaultCountryCode) || "";
}

contactsRouter.get("/contacts", async (req, res) => {
  const q = z
    .object({
      search: z.string().optional(),
      tag: z.string().optional(),
      optIn: z.enum(["true", "false"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    })
    .parse(req.query);

  const where: Prisma.ContactWhereInput = { workspaceId: req.workspaceId };
  if (q.tag) where.tags = { has: q.tag };
  if (q.optIn) where.optIn = q.optIn === "true";
  if (q.search) {
    const digits = q.search.replace(/\D/g, "");
    where.OR = [
      { name: { contains: q.search, mode: "insensitive" } },
      { email: { contains: q.search, mode: "insensitive" } },
      ...(digits ? [{ phone: { contains: digits } }] : []),
    ];
  }
  const [items, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.contact.count({ where }),
  ]);
  res.json({ items, total, page: q.page, pageSize: q.pageSize });
});

contactsRouter.get("/contacts/tags", async (req, res) => {
  const rows = await prisma.$queryRaw<{ tag: string }[]>`
    SELECT DISTINCT unnest("tags") AS tag FROM "Contact" WHERE "workspaceId" = ${req.workspaceId} ORDER BY tag`;
  res.json(rows.map((r) => r.tag));
});

contactsRouter.get("/contacts/export", async (req, res) => {
  const [contacts, fields] = await Promise.all([
    prisma.contact.findMany({ where: { workspaceId: req.workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.customField.findMany({ where: { workspaceId: req.workspaceId } }),
  ]);
  const header = ["name", "phone", "email", "tags", "opt_in", "source", "created_at", ...fields.map((f) => f.key)];
  const rows = contacts.map((c) => {
    const custom = (c.customFields as Record<string, unknown>) ?? {};
    return [
      c.name ?? "",
      c.phone ?? "",
      c.email ?? "",
      c.tags.join("|"),
      c.optIn ? "yes" : "no",
      c.source ?? "",
      c.createdAt.toISOString(),
      ...fields.map((f) => String(custom[f.key] ?? "")),
    ];
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="contacts-${Date.now()}.csv"`);
  res.send(stringify([header, ...rows]));
});

contactsRouter.post("/contacts/import", async (req, res) => {
  const input = z
    .object({
      csv: z.string().min(1).max(10_000_000),
      tags: z.array(z.string()).default([]),
      optIn: z.boolean().default(false),
    })
    .parse(req.body);

  let records: Record<string, string>[];
  try {
    records = parse(input.csv, { columns: (h: string[]) => h.map((c) => c.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true });
  } catch (err) {
    throw badRequest(`Could not read CSV: ${err instanceof Error ? err.message : "invalid file"}`);
  }
  if (!records.length) throw badRequest("The CSV file has no rows");

  const cc = await countryCode(req.workspaceId!);
  let remaining = await remainingContacts(req.workspaceId!);
  const knownFields = new Set(
    (await prisma.customField.findMany({ where: { workspaceId: req.workspaceId } })).map((f) => f.key),
  );
  const reserved = new Set(["name", "full_name", "phone", "mobile", "whatsapp", "phone_number", "email", "tags", "opt_in"]);
  const result = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };

  for (const [index, row] of records.entries()) {
    const phone = normalizePhone(row.phone || row.mobile || row.whatsapp || row.phone_number, cc);
    const email = row.email?.toLowerCase() || null;
    if (!phone && !email) {
      result.skipped++;
      if (result.errors.length < 10) result.errors.push(`Row ${index + 2}: missing phone and email`);
      continue;
    }
    const custom: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) if (!reserved.has(k) && knownFields.has(k) && v) custom[k] = v;
    const tags = [...input.tags, ...(row.tags ? row.tags.split(/[|,;]/).map((t) => t.trim()).filter(Boolean) : [])];
    const optIn = input.optIn || ["yes", "true", "1"].includes((row.opt_in || "").toLowerCase());

    const existing = await prisma.contact.findFirst({
      where: { workspaceId: req.workspaceId, OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])] },
    });
    if (existing) {
      await prisma.contact.update({
        where: { id: existing.id },
        data: {
          name: existing.name || row.name || row.full_name || undefined,
          email: existing.email || email,
          phone: existing.phone || phone,
          tags: Array.from(new Set([...existing.tags, ...tags])),
          customFields: { ...((existing.customFields as object) ?? {}), ...custom },
          ...(optIn && !existing.optIn ? { optIn: true, optInAt: new Date() } : {}),
        },
      });
      result.updated++;
      continue;
    }
    if (remaining <= 0) {
      result.skipped++;
      if (result.errors.length < 10) result.errors.push(`Row ${index + 2}: plan contact limit reached`);
      continue;
    }
    await prisma.contact.create({
      data: {
        workspaceId: req.workspaceId!,
        name: row.name || row.full_name || null,
        phone,
        email,
        tags: Array.from(new Set(tags)),
        customFields: custom,
        optIn,
        optInAt: optIn ? new Date() : null,
        source: "csv_import",
      },
    });
    remaining--;
    result.created++;
  }
  res.json(result);
});

contactsRouter.post("/contacts", async (req, res) => {
  const input = contactInputSchema.parse(req.body);
  await assertLimit(req.workspaceId!, "contacts");
  const phone = normalizePhone(input.phone, await countryCode(req.workspaceId!));
  if (input.phone && !phone) throw badRequest("Invalid phone number");
  if (!phone && !input.email) throw badRequest("Add a phone number or email");
  const contact = await prisma.contact.create({
    data: {
      workspaceId: req.workspaceId!,
      name: input.name || null,
      phone,
      email: input.email || null,
      tags: input.tags ?? [],
      customFields: input.customFields ?? {},
      optIn: input.optIn ?? false,
      optInAt: input.optIn ? new Date() : null,
      source: "manual",
    },
  });
  await logActivity(req.workspaceId!, contact.id, "contact.created", "Contact created manually");
  await dispatchEvent(req.workspaceId!, "contact.created", serializeContact(contact));
  res.status(201).json(contact);
});

contactsRouter.get("/contacts/:id", async (req, res) => {
  const contact = await prisma.contact.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
    include: {
      conversations: {
        include: { channel: { select: { id: true, type: true, name: true } } },
        orderBy: { lastMessageAt: "desc" },
      },
      leads: { orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!contact) throw notFound("Contact");
  res.json(contact);
});

contactsRouter.patch("/contacts/:id", async (req, res) => {
  const input = contactInputSchema.partial().parse(req.body);
  const existing = await prisma.contact.findFirst({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  if (!existing) throw notFound("Contact");
  const data: Prisma.ContactUpdateInput = {};
  if (input.name !== undefined) data.name = input.name || null;
  if (input.email !== undefined) data.email = input.email || null;
  if (input.phone !== undefined) {
    const phone = normalizePhone(input.phone, await countryCode(req.workspaceId!));
    if (input.phone && !phone) throw badRequest("Invalid phone number");
    data.phone = phone;
  }
  if (input.tags) data.tags = Array.from(new Set(input.tags.map((t) => t.trim()).filter(Boolean)));
  if (input.customFields) data.customFields = { ...((existing.customFields as object) ?? {}), ...input.customFields };
  if (input.optIn !== undefined && input.optIn !== existing.optIn) {
    data.optIn = input.optIn;
    data.optInAt = input.optIn ? new Date() : existing.optInAt;
    await logActivity(req.workspaceId!, existing.id, input.optIn ? "contact.opt_in" : "contact.opt_out", input.optIn ? "Marked as opted in" : "Marked as opted out");
  }
  try {
    res.json(await prisma.contact.update({ where: { id: existing.id }, data }));
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") throw new HttpError(409, "Another contact already uses this phone number");
    throw err;
  }
});

contactsRouter.delete("/contacts/:id", async (req, res) => {
  const { count } = await prisma.contact.deleteMany({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  if (!count) throw notFound("Contact");
  res.json({ ok: true });
});

contactsRouter.post("/contacts/bulk-delete", async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string()).min(1).max(1000) }).parse(req.body);
  const { count } = await prisma.contact.deleteMany({ where: { id: { in: ids }, workspaceId: req.workspaceId } });
  res.json({ deleted: count });
});
