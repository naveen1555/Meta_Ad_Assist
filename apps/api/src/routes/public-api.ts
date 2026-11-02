import { Router, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { contactInputSchema } from "@chatnova/shared";
import { prisma } from "../db";
import { HttpError, badRequest, notFound } from "../lib/errors";
import { assertFeature, assertLimit } from "../lib/limits";
import { normalizePhone, renderText, sha256 } from "../lib/utils";
import { renderTemplateBody, type OutMessage } from "../meta/send";
import { startFlow } from "../flows/engine";
import { findOrCreateContact } from "../services/contacts";
import { getOrCreateConversation } from "../services/conversations";
import { createLead, getLeadSettings } from "../services/leads";
import { sendMessage } from "../services/messaging";

/** Public REST API, authenticated with workspace API keys. Mounted at /v1. */
export const publicApiRouter = Router();

const apiKeyAuth: RequestHandler = async (req, _res, next) => {
  const header = req.header("x-api-key") || req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!header) return next(new HttpError(401, "Missing API key (X-API-Key header)"));
  const key = await prisma.apiKey.findUnique({ where: { keyHash: sha256(header) } });
  if (!key) return next(new HttpError(401, "Invalid API key"));
  try {
    await assertFeature(key.workspaceId, "api");
  } catch (err) {
    return next(err);
  }
  req.workspaceId = key.workspaceId;
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  next();
};

publicApiRouter.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));
publicApiRouter.use(apiKeyAuth);

async function defaultCountryCode(workspaceId: string) {
  return (await getLeadSettings(workspaceId)).defaultCountryCode;
}

async function whatsappChannel(workspaceId: string, channelId?: string) {
  const channel = await prisma.channel.findFirst({
    where: { workspaceId, type: "WHATSAPP", ...(channelId ? { id: channelId } : {}) },
    orderBy: { createdAt: "asc" },
  });
  if (!channel) throw badRequest("No WhatsApp channel connected");
  return channel;
}

publicApiRouter.get("/channels", async (req, res) => {
  res.json(
    await prisma.channel.findMany({
      where: { workspaceId: req.workspaceId },
      select: { id: true, type: true, name: true, phoneNumber: true, status: true },
    }),
  );
});

publicApiRouter.get("/contacts", async (req, res) => {
  const q = z
    .object({ phone: z.string().optional(), email: z.string().optional(), tag: z.string().optional(), page: z.coerce.number().min(1).default(1) })
    .parse(req.query);
  const where = {
    workspaceId: req.workspaceId,
    ...(q.phone ? { phone: normalizePhone(q.phone, await defaultCountryCode(req.workspaceId!)) } : {}),
    ...(q.email ? { email: q.email.toLowerCase() } : {}),
    ...(q.tag ? { tags: { has: q.tag } } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.contact.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * 100, take: 100 }),
    prisma.contact.count({ where }),
  ]);
  res.json({ data, total, page: q.page });
});

publicApiRouter.post("/contacts", async (req, res) => {
  const input = contactInputSchema.parse(req.body);
  const phone = normalizePhone(input.phone, await defaultCountryCode(req.workspaceId!));
  if (!phone && !input.email) throw badRequest("phone or email is required");
  const exists = await prisma.contact.findFirst({
    where: { workspaceId: req.workspaceId, OR: [...(phone ? [{ phone }] : []), ...(input.email ? [{ email: input.email }] : [])] },
  });
  if (!exists) await assertLimit(req.workspaceId!, "contacts");
  const { contact, created } = await findOrCreateContact(req.workspaceId!, {
    name: input.name,
    phone,
    email: input.email || null,
    tags: input.tags,
    customFields: input.customFields,
    optIn: input.optIn,
    source: "api",
  });
  res.status(created ? 201 : 200).json(contact);
});

const messageSchema = z
  .object({
    phone: z.string().min(6),
    channelId: z.string().optional(),
    name: z.string().optional(),
    text: z.string().min(1).max(4096).optional(),
    template: z
      .object({ name: z.string(), language: z.string().default("en"), params: z.array(z.string()).default([]) })
      .optional(),
  })
  .refine((v) => v.text || v.template, { message: "Provide either text or template" });

publicApiRouter.post("/messages", async (req, res) => {
  const input = messageSchema.parse(req.body);
  const channel = await whatsappChannel(req.workspaceId!, input.channelId);
  const phone = normalizePhone(input.phone, await defaultCountryCode(req.workspaceId!));
  if (!phone) throw badRequest("Invalid phone number");
  const { contact } = await findOrCreateContact(req.workspaceId!, { phone, name: input.name, source: "api" });
  const { conversation } = await getOrCreateConversation(req.workspaceId!, contact.id, channel.id);

  let message: OutMessage;
  if (input.template) {
    const template = await prisma.template.findFirst({
      where: { channelId: channel.id, name: input.template.name, language: input.template.language },
    });
    if (!template) throw notFound(`Template ${input.template.name} (${input.template.language})`);
    const params = input.template.params.map((p) => renderText(p, { contact }));
    message = {
      kind: "template",
      name: template.name,
      language: template.language,
      bodyParams: params,
      preview: renderTemplateBody(template.components, params),
    };
  } else {
    message = { kind: "text", text: renderText(input.text!, { contact }) };
  }
  const sent = await sendMessage({ conversationId: conversation.id, message });
  res.status(sent.status === "failed" ? 502 : 201).json({
    id: sent.id,
    status: sent.status,
    error: sent.error,
    externalId: sent.externalId,
    conversationId: conversation.id,
    contactId: contact.id,
  });
});

publicApiRouter.post("/leads", async (req, res) => {
  const input = z
    .object({
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      source: z.string().max(40).default("api"),
      fields: z.record(z.string()).default({}),
    })
    .refine((v) => v.phone || v.email, { message: "phone or email is required" })
    .parse(req.body);
  const lead = await createLead(req.workspaceId!, { ...input, source: input.source });
  res.status(201).json(lead);
});

publicApiRouter.post("/flows/:id/run", async (req, res) => {
  const { phone, channelId } = z.object({ phone: z.string(), channelId: z.string().optional() }).parse(req.body);
  const flow = await prisma.flow.findFirst({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  if (!flow) throw notFound("Flow");
  const channel = await whatsappChannel(req.workspaceId!, channelId ?? flow.channelId ?? undefined);
  const normalized = normalizePhone(phone, await defaultCountryCode(req.workspaceId!));
  if (!normalized) throw badRequest("Invalid phone number");
  const { contact } = await findOrCreateContact(req.workspaceId!, { phone: normalized, source: "api" });
  const { conversation } = await getOrCreateConversation(req.workspaceId!, contact.id, channel.id);
  const run = await startFlow(flow, { contactId: contact.id, conversationId: conversation.id });
  res.status(201).json(await prisma.flowRun.findUnique({ where: { id: run.id } }));
});
