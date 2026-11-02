import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { badRequest, notFound } from "../lib/errors";
import { createLead } from "../services/leads";

/** Mounted behind requireAuth + requireWorkspace. */
export const leadsRouter = Router();

leadsRouter.get("/leads", async (req, res) => {
  const q = z
    .object({
      status: z.string().optional(),
      source: z.string().optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
    })
    .parse(req.query);
  const where: Prisma.LeadWhereInput = { workspaceId: req.workspaceId };
  if (q.status) where.status = q.status;
  if (q.source) where.source = q.source;
  if (q.search) {
    where.contact = {
      OR: [
        { name: { contains: q.search, mode: "insensitive" } },
        { email: { contains: q.search, mode: "insensitive" } },
        { phone: { contains: q.search.replace(/\D/g, "") || q.search } },
      ],
    };
  }
  const pageSize = 50;
  const [items, total, byStatus] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            conversations: { select: { id: true }, take: 1, orderBy: { lastMessageAt: "desc" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.lead.count({ where }),
    prisma.lead.groupBy({ by: ["status"], where: { workspaceId: req.workspaceId }, _count: true }),
  ]);
  res.json({
    items,
    total,
    page: q.page,
    pageSize,
    counts: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
  });
});

leadsRouter.patch("/leads/:id", async (req, res) => {
  const { status } = z.object({ status: z.enum(["new", "contacted", "qualified", "won", "lost"]) }).parse(req.body);
  const lead = await prisma.lead.findFirst({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  if (!lead) throw notFound("Lead");
  res.json(await prisma.lead.update({ where: { id: lead.id }, data: { status } }));
});

leadsRouter.delete("/leads/:id", async (req, res) => {
  await prisma.lead.deleteMany({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  res.json({ ok: true });
});

/** Creates a sample lead to test the instant-reply automation without running an ad. */
leadsRouter.post("/leads/test", async (req, res) => {
  const input = z
    .object({ name: z.string().min(1), phone: z.string().min(6), email: z.string().email().optional().or(z.literal("")) })
    .parse(req.body);
  const lead = await createLead(req.workspaceId!, {
    name: input.name,
    phone: input.phone,
    email: input.email || null,
    source: "test",
    fields: { full_name: input.name, phone_number: input.phone, ...(input.email ? { email: input.email } : {}) },
  });
  if (!lead) throw badRequest("Could not create the test lead");
  res.status(201).json(lead);
});
