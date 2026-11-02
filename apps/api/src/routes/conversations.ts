import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { badRequest, notFound } from "../lib/errors";
import { emitToWorkspace } from "../lib/socket";
import { renderText } from "../lib/utils";
import { renderTemplateBody, type OutMessage } from "../meta/send";
import { assignConversation, conversationInclude, getOrCreateConversation } from "../services/conversations";
import { isWindowOpen, sendMessage } from "../services/messaging";

/** Mounted behind requireAuth + requireWorkspace. */
export const conversationsRouter = Router();

async function loadConversation(workspaceId: string, id: string) {
  const conv = await prisma.conversation.findFirst({ where: { id, workspaceId }, include: conversationInclude });
  if (!conv) throw notFound("Conversation");
  return conv;
}

conversationsRouter.get("/conversations", async (req, res) => {
  const q = z
    .object({
      filter: z.enum(["all", "mine", "unassigned"]).default("all"),
      status: z.enum(["OPEN", "PENDING", "CLOSED", "all"]).default("OPEN"),
      search: z.string().optional(),
      channelId: z.string().optional(),
    })
    .parse(req.query);

  const where: Prisma.ConversationWhereInput = { workspaceId: req.workspaceId };
  if (q.status !== "all") where.status = q.status;
  if (q.filter === "mine") where.assigneeId = req.user!.id;
  if (q.filter === "unassigned") where.assigneeId = null;
  if (q.channelId) where.channelId = q.channelId;
  if (q.search) {
    where.contact = {
      OR: [
        { name: { contains: q.search, mode: "insensitive" } },
        { phone: { contains: q.search.replace(/\D/g, "") || q.search } },
        { email: { contains: q.search, mode: "insensitive" } },
      ],
    };
  }

  const conversations = await prisma.conversation.findMany({
    where,
    include: {
      ...conversationInclude,
      messages: { orderBy: { createdAt: "desc" }, take: 1, where: { type: { not: "note" } } },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });
  res.json(
    conversations.map(({ messages, ...c }) => ({ ...c, lastMessage: messages[0] ?? null, windowOpen: isWindowOpen(c.lastInboundAt) })),
  );
});

conversationsRouter.get("/conversations/counts", async (req, res) => {
  const base = { workspaceId: req.workspaceId, status: "OPEN" as const };
  const [all, mine, unassigned] = await Promise.all([
    prisma.conversation.count({ where: base }),
    prisma.conversation.count({ where: { ...base, assigneeId: req.user!.id } }),
    prisma.conversation.count({ where: { ...base, assigneeId: null } }),
  ]);
  res.json({ all, mine, unassigned });
});

conversationsRouter.post("/conversations/start", async (req, res) => {
  const { contactId, channelId } = z.object({ contactId: z.string(), channelId: z.string() }).parse(req.body);
  const [contact, channel] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, workspaceId: req.workspaceId } }),
    prisma.channel.findFirst({ where: { id: channelId, workspaceId: req.workspaceId } }),
  ]);
  if (!contact) throw notFound("Contact");
  if (!channel) throw notFound("Channel");
  if (channel.type === "WHATSAPP" && !contact.phone) throw badRequest("This contact has no phone number");
  if (channel.type === "MESSENGER" && !contact.messengerId) throw badRequest("This contact has not messaged your Facebook page");
  if (channel.type === "INSTAGRAM" && !contact.instagramId) throw badRequest("This contact has not messaged your Instagram account");
  const { conversation } = await getOrCreateConversation(req.workspaceId!, contact.id, channel.id);
  res.json(conversation);
});

conversationsRouter.get("/conversations/:id", async (req, res) => {
  const conv = await loadConversation(req.workspaceId!, req.params.id);
  res.json({ ...conv, windowOpen: isWindowOpen(conv.lastInboundAt) });
});

conversationsRouter.get("/conversations/:id/messages", async (req, res) => {
  await loadConversation(req.workspaceId!, req.params.id);
  const before = typeof req.query.before === "string" ? new Date(req.query.before) : undefined;
  const messages = await prisma.message.findMany({
    where: { conversationId: req.params.id, ...(before ? { createdAt: { lt: before } } : {}) },
    include: { sender: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  res.json(messages.reverse());
});

const sendSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1).max(4096) }),
  z.object({ type: z.literal("note"), text: z.string().min(1).max(4096) }),
  z.object({
    type: z.literal("media"),
    url: z.string().url(),
    mediaType: z.enum(["image", "video", "audio", "document"]),
    caption: z.string().max(1024).optional(),
    filename: z.string().optional(),
  }),
  z.object({
    type: z.literal("template"),
    templateId: z.string(),
    params: z.array(z.string()).default([]),
    headerMediaUrl: z.string().url().optional(),
  }),
]);

conversationsRouter.post("/conversations/:id/messages", async (req, res) => {
  const conv = await loadConversation(req.workspaceId!, req.params.id);
  const input = sendSchema.parse(req.body);

  if (input.type === "note") {
    const note = await prisma.message.create({
      data: {
        workspaceId: conv.workspaceId,
        conversationId: conv.id,
        direction: "OUTBOUND",
        type: "note",
        body: input.text,
        status: "sent",
        senderId: req.user!.id,
      },
      include: { sender: { select: { id: true, name: true } } },
    });
    emitToWorkspace(conv.workspaceId, "message:new", { conversationId: conv.id, message: note });
    res.status(201).json(note);
    return;
  }

  let message: OutMessage;
  if (input.type === "text") {
    message = { kind: "text", text: renderText(input.text, { contact: conv.contact }) };
  } else if (input.type === "media") {
    message = { kind: "media", mediaType: input.mediaType, url: input.url, caption: input.caption, filename: input.filename };
  } else {
    const template = await prisma.template.findFirst({
      where: { id: input.templateId, workspaceId: req.workspaceId, channelId: conv.channelId },
    });
    if (!template) throw notFound("Template for this channel");
    if (template.status !== "APPROVED") throw badRequest("Only approved templates can be sent");
    const params = input.params.map((p) => renderText(p, { contact: conv.contact }));
    const header = (template.components as any[]).find((c) => c.type === "HEADER");
    const headerFormat = String(header?.format ?? "").toLowerCase();
    message = {
      kind: "template",
      name: template.name,
      language: template.language,
      bodyParams: params,
      preview: renderTemplateBody(template.components, params),
      headerMedia:
        input.headerMediaUrl && ["image", "video", "document"].includes(headerFormat)
          ? { type: headerFormat as "image" | "video" | "document", url: input.headerMediaUrl }
          : undefined,
    };
  }

  const sent = await sendMessage({ conversationId: conv.id, message, senderId: req.user!.id });
  res.status(201).json(sent);
});

conversationsRouter.post("/conversations/:id/read", async (req, res) => {
  const conv = await loadConversation(req.workspaceId!, req.params.id);
  const updated = await prisma.conversation.update({
    where: { id: conv.id },
    data: { unreadCount: 0 },
    include: conversationInclude,
  });
  emitToWorkspace(conv.workspaceId, "conversation:updated", updated);
  res.json({ ok: true });
});

conversationsRouter.patch("/conversations/:id", async (req, res) => {
  const input = z
    .object({
      status: z.enum(["OPEN", "PENDING", "CLOSED"]).optional(),
      assigneeId: z.string().nullable().optional(),
    })
    .parse(req.body);
  let conv = await loadConversation(req.workspaceId!, req.params.id);

  if (input.assigneeId !== undefined && input.assigneeId !== conv.assigneeId) {
    if (input.assigneeId) {
      const member = await prisma.member.findUnique({
        where: { userId_workspaceId: { userId: input.assigneeId, workspaceId: req.workspaceId! } },
      });
      if (!member) throw badRequest("Assignee is not a member of this workspace");
    }
    conv = await assignConversation(conv, input.assigneeId, req.user!.id);
  }
  if (input.status && input.status !== conv.status) {
    conv = await prisma.conversation.update({
      where: { id: conv.id },
      data: { status: input.status, ...(input.status === "CLOSED" ? { awaitingSince: null } : {}) },
      include: conversationInclude,
    });
    if (input.status === "CLOSED") {
      await prisma.flowRun.updateMany({
        where: { conversationId: conv.id, status: { in: ["running", "waiting", "delayed"] } },
        data: { status: "cancelled" },
      });
    }
    emitToWorkspace(conv.workspaceId, "conversation:updated", conv);
  }
  res.json({ ...conv, windowOpen: isWindowOpen(conv.lastInboundAt) });
});
