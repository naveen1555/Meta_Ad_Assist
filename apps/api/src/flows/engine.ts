import type { Flow, FlowRun, Prisma } from "@prisma/client";
import type { FlowEdge, FlowNode, FlowOption, FlowTriggerType } from "@chatnova/shared";
import { prisma } from "../db";
import { renderText } from "../lib/utils";
import { renderTemplateBody, type OutMessage } from "../meta/send";
import { enqueue } from "../queue";
import { addTags } from "../services/contacts";
import { assignConversation, nextRoundRobinAgent } from "../services/conversations";
import { logActivity } from "../services/events";
import { sendMessage } from "../services/messaging";

const MAX_STEPS = 50;
const MAX_RETRIES = 2;
const ACTIVE = ["running", "waiting", "delayed"];

type Vars = Record<string, unknown>;

interface Graph {
  nodes: Map<string, FlowNode>;
  edges: FlowEdge[];
}

function graphOf(flow: Flow): Graph {
  const nodes = (flow.nodes as unknown as FlowNode[]) ?? [];
  return { nodes: new Map(nodes.map((n) => [n.id, n])), edges: (flow.edges as unknown as FlowEdge[]) ?? [] };
}

function nextNode(g: Graph, nodeId: string, handle?: string | null): string | null {
  const edges = g.edges.filter((e) => e.source === nodeId);
  if (handle !== undefined) return edges.find((e) => (e.sourceHandle ?? null) === handle)?.target ?? null;
  return (edges.find((e) => !e.sourceHandle) ?? edges[0])?.target ?? null;
}

async function cancelActiveRuns(conversationId: string) {
  await prisma.flowRun.updateMany({
    where: { conversationId, status: { in: ACTIVE } },
    data: { status: "cancelled" },
  });
}

// ------------------------------------------------------------------ triggers

export async function handleFlowsForInbound(p: {
  conversationId: string;
  contactId: string;
  workspaceId: string;
  channelId: string;
  text: string;
  replyId: string | null;
  newConversation: boolean;
}) {
  const waiting = await prisma.flowRun.findFirst({
    where: { conversationId: p.conversationId, status: "waiting" },
    orderBy: { createdAt: "desc" },
  });

  const flows = await prisma.flow.findMany({
    where: { workspaceId: p.workspaceId, active: true, OR: [{ channelId: null }, { channelId: p.channelId }] },
    orderBy: { createdAt: "asc" },
  });
  const normalized = p.text.trim().toLowerCase();
  const keywordFlow = normalized
    ? flows.find((f) => f.triggerType === "keyword" && f.keywords.some((k) => k.trim().toLowerCase() === normalized))
    : undefined;

  if (keywordFlow) {
    await startFlow(keywordFlow, { contactId: p.contactId, conversationId: p.conversationId });
    return;
  }
  if (waiting) {
    await resumeWithInput(waiting, { text: p.text, replyId: p.replyId });
    return;
  }
  if (p.newConversation) {
    const welcome = flows.find((f) => f.triggerType === "new_conversation");
    if (welcome) await startFlow(welcome, { contactId: p.contactId, conversationId: p.conversationId });
  }
}

export async function startTriggeredFlows(
  trigger: FlowTriggerType,
  ctx: { workspaceId: string; contactId: string; conversationId: string; channelId: string; variables?: Vars },
) {
  const flow = await prisma.flow.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      active: true,
      triggerType: trigger,
      OR: [{ channelId: null }, { channelId: ctx.channelId }],
    },
    orderBy: { createdAt: "asc" },
  });
  if (flow) await startFlow(flow, ctx);
}

export async function startFlow(
  flow: Flow,
  ctx: { contactId: string; conversationId: string; variables?: Vars },
): Promise<FlowRun> {
  await cancelActiveRuns(ctx.conversationId);
  const g = graphOf(flow);
  const start = [...g.nodes.values()].find((n) => n.type === "start");
  const run = await prisma.flowRun.create({
    data: {
      flowId: flow.id,
      workspaceId: flow.workspaceId,
      contactId: ctx.contactId,
      conversationId: ctx.conversationId,
      status: "running",
      currentNodeId: start?.id,
      variables: (ctx.variables ?? {}) as Prisma.InputJsonObject,
    },
  });
  await logActivity(flow.workspaceId, ctx.contactId, "flow.started", `Chatbot flow "${flow.name}" started`);
  await executeFrom(run.id, start ? nextNode(g, start.id) : null);
  return run;
}

export async function resumeDelayedRun({ runId, nodeId }: { runId: string; nodeId: string | null }) {
  const run = await prisma.flowRun.findUnique({ where: { id: runId } });
  if (!run || run.status !== "delayed") return;
  await executeFrom(runId, nodeId);
}

// ------------------------------------------------------------------ execution

async function finish(runId: string, status: "completed" | "failed", error?: string) {
  await prisma.flowRun.update({ where: { id: runId }, data: { status, error, currentNodeId: null } });
}

async function resumeWithInput(run: FlowRun, input: { text: string; replyId: string | null }) {
  const flow = await prisma.flow.findUnique({ where: { id: run.flowId } });
  if (!flow || !run.currentNodeId) return finish(run.id, "completed");
  const g = graphOf(flow);
  const node = g.nodes.get(run.currentNodeId);
  if (!node) return finish(run.id, "completed");
  const vars = { ...((run.variables as Vars) ?? {}) };
  const text = input.text.trim();

  let next: string | null = null;
  if (node.type === "buttons" || node.type === "list") {
    const options: FlowOption[] = (node.type === "buttons" ? node.data.buttons : node.data.rows) ?? [];
    const byIndex = /^\d+$/.test(text) ? options[Number(text) - 1] : undefined;
    const match =
      options.find((o) => o.id === input.replyId) ??
      options.find((o) => o.title.trim().toLowerCase() === text.toLowerCase()) ??
      byIndex;
    if (match) {
      vars[node.data.saveAs || node.id] = match.title;
      delete vars.__retries;
      next = nextNode(g, node.id, match.id);
    } else {
      const other = nextNode(g, node.id, "other");
      if (other) {
        vars[node.data.saveAs || node.id] = text;
        next = other;
      } else {
        const retries = Number(vars.__retries ?? 0);
        if (retries >= MAX_RETRIES) return finish(run.id, "completed");
        vars.__retries = retries + 1;
        await prisma.flowRun.update({ where: { id: run.id }, data: { variables: vars as Prisma.InputJsonObject } });
        await executeFrom(run.id, node.id);
        return;
      }
    }
  } else if (node.type === "question" || node.type === "template") {
    if (node.data.saveAs) vars[node.data.saveAs] = text;
    if (node.type === "question" && node.data.saveToField) await saveToContact(run.contactId, node.data.saveToField, text);
    next = nextNode(g, node.id);
  } else {
    next = nextNode(g, node.id);
  }

  await prisma.flowRun.update({
    where: { id: run.id },
    data: { status: "running", variables: vars as Prisma.InputJsonObject },
  });
  await executeFrom(run.id, next);
}

async function saveToContact(contactId: string, field: string, value: string) {
  if (["name", "email"].includes(field)) {
    await prisma.contact.update({ where: { id: contactId }, data: { [field]: value } });
    return;
  }
  const c = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
  await prisma.contact.update({
    where: { id: contactId },
    data: { customFields: { ...((c.customFields as object) ?? {}), [field]: value } },
  });
}

function evaluate(node: FlowNode, vars: Vars, contact: { name: string | null; email: string | null; phone: string | null; tags: string[]; customFields: unknown }) {
  const { source = "var", key = "", operator = "equals", value = "" } = node.data;
  if (operator === "has_tag" || source === "tag") return contact.tags.map((t) => t.toLowerCase()).includes(value.toLowerCase());
  let actual: unknown;
  if (source === "field") {
    actual = ["name", "email", "phone"].includes(key)
      ? contact[key as "name" | "email" | "phone"]
      : (contact.customFields as Record<string, unknown>)?.[key];
  } else {
    actual = vars[key];
  }
  const a = actual == null ? "" : String(actual).trim().toLowerCase();
  const v = value.trim().toLowerCase();
  switch (operator) {
    case "equals":
      return a === v;
    case "not_equals":
      return a !== v;
    case "contains":
      return a.includes(v);
    case "exists":
      return a.length > 0;
    default:
      return false;
  }
}

async function executeFrom(runId: string, startNodeId: string | null) {
  const run = await prisma.flowRun.findUnique({ where: { id: runId }, include: { flow: true } });
  if (!run || !run.conversationId || ["completed", "failed", "cancelled"].includes(run.status)) return;
  const g = graphOf(run.flow);
  const vars: Vars = { ...((run.variables as Vars) ?? {}) };
  const conversationId = run.conversationId;
  let nodeId = startNodeId;

  const send = async (message: OutMessage) => {
    const m = await sendMessage({ conversationId, message, isBot: true });
    if (m.status === "failed") throw new Error(m.error || "Message failed");
  };
  const save = (data: Prisma.FlowRunUpdateInput) =>
    prisma.flowRun.update({ where: { id: runId }, data: { ...data, variables: vars as Prisma.InputJsonObject } });

  try {
    for (let step = 0; nodeId && step < MAX_STEPS; step++) {
      const node = g.nodes.get(nodeId);
      if (!node) break;
      const contact = await prisma.contact.findUniqueOrThrow({ where: { id: run.contactId } });
      const render = (t?: string) => renderText(t, { contact, vars });
      await save({ currentNodeId: node.id });

      switch (node.type) {
        case "start":
          nodeId = nextNode(g, node.id);
          break;

        case "message":
          if (node.data.mediaUrl) {
            await send({ kind: "media", mediaType: node.data.mediaType ?? "image", url: node.data.mediaUrl, caption: render(node.data.text) || undefined });
          } else if (node.data.text) {
            await send({ kind: "text", text: render(node.data.text) });
          }
          nodeId = nextNode(g, node.id);
          break;

        case "template": {
          const template = node.data.templateId
            ? await prisma.template.findUnique({ where: { id: node.data.templateId } })
            : null;
          if (!template) throw new Error("Template node has no template selected");
          const params = (node.data.variables ?? []).map((v) => render(v));
          await send({
            kind: "template",
            name: template.name,
            language: template.language,
            bodyParams: params,
            preview: renderTemplateBody(template.components, params),
          });
          if (node.data.waitForReply) {
            await save({ status: "waiting" });
            return;
          }
          nodeId = nextNode(g, node.id);
          break;
        }

        case "buttons":
          await send({
            kind: "buttons",
            text: render(node.data.text) || "Please choose an option",
            buttons: (node.data.buttons ?? []).map((b) => ({ id: b.id, title: render(b.title) })),
          });
          await save({ status: "waiting" });
          return;

        case "list":
          await send({
            kind: "list",
            text: render(node.data.text) || "Please choose an option",
            buttonText: node.data.buttonText || "Options",
            rows: (node.data.rows ?? []).map((r) => ({ id: r.id, title: render(r.title), description: r.description })),
          });
          await save({ status: "waiting" });
          return;

        case "question":
          await send({ kind: "text", text: render(node.data.text) || "?" });
          await save({ status: "waiting" });
          return;

        case "condition":
          nodeId = nextNode(g, node.id, evaluate(node, vars, contact) ? "true" : "false");
          break;

        case "delay": {
          const next = nextNode(g, node.id);
          const minutes = Math.max(0.1, Number(node.data.minutes ?? 1));
          await save({ status: "delayed", currentNodeId: next });
          await enqueue("flow.resume", { runId, nodeId: next }, { delayMs: Math.round(minutes * 60_000) });
          return;
        }

        case "webhook": {
          if (node.data.url) {
            try {
              const method = node.data.method ?? "POST";
              const res = await fetch(node.data.url, {
                method,
                headers: { "Content-Type": "application/json" },
                body:
                  method === "POST"
                    ? JSON.stringify({
                        flowId: run.flowId,
                        runId,
                        contact: { id: contact.id, name: contact.name, phone: contact.phone, email: contact.email, tags: contact.tags, customFields: contact.customFields },
                        variables: vars,
                      })
                    : undefined,
                signal: AbortSignal.timeout(10_000),
              });
              const body = await res.text();
              let parsed: unknown = body;
              try {
                parsed = JSON.parse(body);
              } catch {
                /* keep text */
              }
              if (node.data.saveAs) vars[node.data.saveAs] = parsed;
            } catch (err) {
              vars.webhook_error = (err as Error).message;
            }
          }
          nodeId = nextNode(g, node.id);
          break;
        }

        case "assign": {
          const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
          const userId = node.data.mode === "user" ? node.data.userId : await nextRoundRobinAgent(run.workspaceId);
          if (userId) await assignConversation(conversation, userId);
          nodeId = nextNode(g, node.id);
          break;
        }

        case "tag":
          if (node.data.tags?.length) await addTags(contact.id, node.data.tags);
          nodeId = nextNode(g, node.id);
          break;

        case "end":
          nodeId = null;
          break;
      }
    }
    await finish(runId, "completed");
  } catch (err) {
    console.error(`[flows] run ${runId} failed`, err);
    await save({});
    await finish(runId, "failed", (err as Error).message);
  }
}
