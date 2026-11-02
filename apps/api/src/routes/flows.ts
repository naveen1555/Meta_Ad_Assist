import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { DEFAULT_FLOW_NODES } from "@chatnova/shared";
import { prisma } from "../db";
import { requireManager } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";
import { assertLimit } from "../lib/limits";
import { startFlow } from "../flows/engine";

type Json = Prisma.InputJsonArray;

/** Mounted behind requireAuth + requireWorkspace. */
export const flowsRouter = Router();

const nodeSchema = z.object({
  id: z.string(),
  type: z.enum(["start", "message", "template", "buttons", "list", "question", "condition", "delay", "webhook", "assign", "tag", "end"]),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.any()).default({}),
});

const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
});

const flowSchema = z.object({
  name: z.string().min(1).max(120),
  triggerType: z.enum(["keyword", "new_conversation", "lead", "manual"]),
  keywords: z.array(z.string().min(1).max(60)).default([]),
  channelId: z.string().nullable().optional(),
  nodes: z.array(nodeSchema).max(300),
  edges: z.array(edgeSchema).max(600),
});

function validateGraph(input: z.infer<typeof flowSchema>) {
  if (input.nodes.filter((n) => n.type === "start").length !== 1) throw badRequest("A flow needs exactly one trigger node");
  for (const n of input.nodes) {
    if (n.type === "buttons" && ((n.data.buttons as unknown[])?.length ?? 0) > 3) {
      throw badRequest("Button nodes support up to 3 buttons (WhatsApp limit)");
    }
    if (n.type === "list" && ((n.data.rows as unknown[])?.length ?? 0) > 10) {
      throw badRequest("List nodes support up to 10 options");
    }
  }
}

flowsRouter.get("/flows", async (req, res) => {
  const flows = await prisma.flow.findMany({
    where: { workspaceId: req.workspaceId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, active: true, triggerType: true, keywords: true, channelId: true, createdAt: true, updatedAt: true },
  });
  const runs = await prisma.flowRun.groupBy({
    by: ["flowId", "status"],
    where: { flowId: { in: flows.map((f) => f.id) } },
    _count: true,
  });
  res.json(
    flows.map((f) => {
      const mine = runs.filter((r) => r.flowId === f.id);
      return {
        ...f,
        runs: mine.reduce((s, r) => s + r._count, 0),
        completed: mine.find((r) => r.status === "completed")?._count ?? 0,
      };
    }),
  );
});

flowsRouter.post("/flows", requireManager, async (req, res) => {
  await assertLimit(req.workspaceId!, "flows");
  const input = flowSchema
    .partial({ nodes: true, edges: true })
    .parse({ triggerType: "keyword", ...req.body });
  const flow = await prisma.flow.create({
    data: {
      workspaceId: req.workspaceId!,
      name: input.name,
      triggerType: input.triggerType,
      keywords: input.keywords,
      channelId: input.channelId ?? null,
      nodes: (input.nodes ?? DEFAULT_FLOW_NODES) as Json,
      edges: (input.edges ?? []) as Json,
    },
  });
  res.status(201).json(flow);
});

flowsRouter.get("/flows/:id", async (req, res) => {
  const flow = await prisma.flow.findFirst({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  if (!flow) throw notFound("Flow");
  res.json(flow);
});

flowsRouter.put("/flows/:id", requireManager, async (req, res) => {
  const input = flowSchema.parse(req.body);
  validateGraph(input);
  const existing = await prisma.flow.findFirst({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  if (!existing) throw notFound("Flow");
  if (existing.active && input.triggerType === "keyword" && !input.keywords.length) {
    throw badRequest("Add at least one keyword for an active keyword flow");
  }
  res.json(
    await prisma.flow.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        triggerType: input.triggerType,
        keywords: input.keywords.map((k) => k.trim()).filter(Boolean),
        channelId: input.channelId ?? null,
        nodes: input.nodes as Json,
        edges: input.edges as Json,
      },
    }),
  );
});

flowsRouter.post("/flows/:id/toggle", requireManager, async (req, res) => {
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  const flow = await prisma.flow.findFirst({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  if (!flow) throw notFound("Flow");
  if (active && flow.triggerType === "keyword" && !flow.keywords.length) {
    throw badRequest("Add at least one keyword before activating this flow");
  }
  if (active && ["new_conversation", "lead"].includes(flow.triggerType)) {
    const clash = await prisma.flow.findFirst({
      where: {
        workspaceId: req.workspaceId,
        active: true,
        triggerType: flow.triggerType,
        channelId: flow.channelId,
        id: { not: flow.id },
      },
    });
    if (clash) throw badRequest(`"${clash.name}" already uses this trigger. Deactivate it first.`);
  }
  res.json(await prisma.flow.update({ where: { id: flow.id }, data: { active } }));
});

flowsRouter.post("/flows/:id/duplicate", requireManager, async (req, res) => {
  await assertLimit(req.workspaceId!, "flows");
  const flow = await prisma.flow.findFirst({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  if (!flow) throw notFound("Flow");
  const copy = await prisma.flow.create({
    data: {
      workspaceId: flow.workspaceId,
      name: `${flow.name} (copy)`,
      triggerType: flow.triggerType,
      keywords: flow.keywords,
      channelId: flow.channelId,
      nodes: flow.nodes as Json,
      edges: flow.edges as Json,
    },
  });
  res.status(201).json(copy);
});

flowsRouter.delete("/flows/:id", requireManager, async (req, res) => {
  await prisma.flow.deleteMany({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  res.json({ ok: true });
});

/** Manually starts a flow for a conversation (e.g. from the inbox or for testing). */
flowsRouter.post("/flows/:id/run", async (req, res) => {
  const { conversationId } = z.object({ conversationId: z.string() }).parse(req.body);
  const [flow, conversation] = await Promise.all([
    prisma.flow.findFirst({ where: { id: req.params.id, workspaceId: req.workspaceId } }),
    prisma.conversation.findFirst({ where: { id: conversationId, workspaceId: req.workspaceId } }),
  ]);
  if (!flow) throw notFound("Flow");
  if (!conversation) throw notFound("Conversation");
  const run = await startFlow(flow, { contactId: conversation.contactId, conversationId: conversation.id });
  const fresh = await prisma.flowRun.findUnique({ where: { id: run.id } });
  res.json(fresh);
});
