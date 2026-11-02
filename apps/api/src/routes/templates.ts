import { Router } from "express";
import type { Template } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { requireManager } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";
import { graph, GraphError } from "../meta/graph";
import { renderTemplateBody, templateHeaderFormat, templateVariableCount } from "../meta/send";

/** Mounted behind requireAuth + requireWorkspace. */
export const templatesRouter = Router();

export function serializeTemplate(t: Template) {
  return {
    ...t,
    variableCount: templateVariableCount(t.components),
    headerFormat: templateHeaderFormat(t.components),
    bodyText: renderTemplateBody(t.components, []) ?? "",
  };
}

async function waChannel(workspaceId: string, channelId: string) {
  const channel = await prisma.channel.findFirst({ where: { id: channelId, workspaceId, type: "WHATSAPP" } });
  if (!channel) throw notFound("WhatsApp channel");
  if (!channel.wabaId) throw badRequest("This channel has no WhatsApp Business Account ID");
  return channel;
}

templatesRouter.get("/templates", async (req, res) => {
  const channelId = typeof req.query.channelId === "string" ? req.query.channelId : undefined;
  const templates = await prisma.template.findMany({
    where: { workspaceId: req.workspaceId, ...(channelId ? { channelId } : {}) },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  res.json(templates.map(serializeTemplate));
});

templatesRouter.post("/templates/sync", requireManager, async (req, res) => {
  const { channelId } = z.object({ channelId: z.string() }).parse(req.body);
  const channel = await waChannel(req.workspaceId!, channelId);

  const remote: any[] = [];
  let next: string | undefined = `${channel.wabaId}/message_templates`;
  let query: Record<string, string | number> | undefined = { fields: "id,name,language,status,category,components", limit: 200 };
  try {
    while (next && remote.length < 2000) {
      const page: { data: any[]; paging?: { next?: string } } = await graph(next, { token: channel.accessToken, query });
      remote.push(...page.data);
      next = page.paging?.next;
      query = undefined;
    }
  } catch (err) {
    throw badRequest(`Could not fetch templates: ${err instanceof GraphError ? err.message : "unknown error"}`);
  }

  const keep: string[] = [];
  for (const t of remote) {
    const saved = await prisma.template.upsert({
      where: { channelId_name_language: { channelId: channel.id, name: t.name, language: t.language } },
      create: {
        workspaceId: req.workspaceId!,
        channelId: channel.id,
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        components: t.components ?? [],
        externalId: t.id,
      },
      update: { category: t.category, status: t.status, components: t.components ?? [], externalId: t.id },
    });
    keep.push(saved.id);
  }
  await prisma.template.deleteMany({ where: { channelId: channel.id, id: { notIn: keep } } });
  res.json({ synced: remote.length });
});

const buttonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("QUICK_REPLY"), text: z.string().min(1).max(25) }),
  z.object({ type: z.literal("URL"), text: z.string().min(1).max(25), url: z.string().url() }),
  z.object({ type: z.literal("PHONE_NUMBER"), text: z.string().min(1).max(25), phone_number: z.string().min(6) }),
]);

templatesRouter.post("/templates", requireManager, async (req, res) => {
  const input = z
    .object({
      channelId: z.string(),
      name: z.string().min(1).max(512).regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores"),
      language: z.string().min(2).max(10),
      category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
      headerText: z.string().max(60).optional(),
      body: z.string().min(1).max(1024),
      footer: z.string().max(60).optional(),
      examples: z.array(z.string()).default([]),
      buttons: z.array(buttonSchema).max(10).default([]),
    })
    .parse(req.body);
  const channel = await waChannel(req.workspaceId!, input.channelId);

  const varCount = new Set(input.body.match(/\{\{(\d+)\}\}/g) ?? []).size;
  if (varCount && input.examples.filter(Boolean).length < varCount) {
    throw badRequest(`Provide an example value for each of the ${varCount} body variables`);
  }

  const components: any[] = [];
  if (input.headerText) components.push({ type: "HEADER", format: "TEXT", text: input.headerText });
  components.push({
    type: "BODY",
    text: input.body,
    ...(varCount ? { example: { body_text: [input.examples.slice(0, varCount)] } } : {}),
  });
  if (input.footer) components.push({ type: "FOOTER", text: input.footer });
  if (input.buttons.length) components.push({ type: "BUTTONS", buttons: input.buttons });

  let created: { id: string; status: string; category: string };
  try {
    created = await graph(`${channel.wabaId}/message_templates`, {
      token: channel.accessToken,
      body: { name: input.name, language: input.language, category: input.category, components },
    });
  } catch (err) {
    throw badRequest(`Meta rejected the template: ${err instanceof GraphError ? err.message : "unknown error"}`);
  }

  const template = await prisma.template.upsert({
    where: { channelId_name_language: { channelId: channel.id, name: input.name, language: input.language } },
    create: {
      workspaceId: req.workspaceId!,
      channelId: channel.id,
      name: input.name,
      language: input.language,
      category: created.category ?? input.category,
      status: created.status ?? "PENDING",
      components,
      externalId: created.id,
    },
    update: { status: created.status ?? "PENDING", components, externalId: created.id },
  });
  res.status(201).json(serializeTemplate(template));
});

templatesRouter.delete("/templates/:id", requireManager, async (req, res) => {
  const template = await prisma.template.findFirst({
    where: { id: String(req.params.id), workspaceId: req.workspaceId },
    include: { channel: true },
  });
  if (!template) throw notFound("Template");
  try {
    await graph(`${template.channel.wabaId}/message_templates`, {
      method: "DELETE",
      token: template.channel.accessToken,
      query: { name: template.name },
    });
  } catch (err) {
    if (!(err instanceof GraphError) || err.status !== 404) {
      throw badRequest(`Meta could not delete the template: ${(err as Error).message}`);
    }
  }
  await prisma.template.deleteMany({ where: { channelId: template.channelId, name: template.name } });
  res.json({ ok: true });
});
