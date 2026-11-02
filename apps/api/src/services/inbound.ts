import type { Channel, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { emitToWorkspace } from "../lib/socket";
import { handleFlowsForInbound } from "../flows/engine";
import { findOrCreateContact, type ContactIdentity } from "./contacts";
import { conversationInclude, getOrCreateConversation } from "./conversations";
import { dispatchEvent, logActivity } from "./events";

export interface InboundMessage {
  externalId: string;
  type: string;
  body?: string | null;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  /** Id of the button / list row the contact tapped */
  replyId?: string | null;
  payload?: unknown;
  timestamp?: Date;
}

const STATUS_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3 };

export async function handleInbound(
  channel: Channel,
  identity: ContactIdentity,
  profileName: string | null | undefined,
  msg: InboundMessage,
) {
  if (msg.externalId) {
    const dup = await prisma.message.findFirst({ where: { externalId: msg.externalId, workspaceId: channel.workspaceId } });
    if (dup) return;
  }

  const { contact } = await findOrCreateContact(channel.workspaceId, {
    ...identity,
    name: profileName,
    source: channel.type.toLowerCase(),
  });
  const { conversation, created: newConversation } = await getOrCreateConversation(
    channel.workspaceId,
    contact.id,
    channel.id,
  );

  const message = await prisma.message.create({
    data: {
      workspaceId: channel.workspaceId,
      conversationId: conversation.id,
      direction: "INBOUND",
      type: msg.type,
      body: msg.body ?? null,
      mediaUrl: msg.mediaUrl ?? null,
      mediaMime: msg.mediaMime ?? null,
      externalId: msg.externalId || null,
      payload: (msg.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      status: "received",
      createdAt: msg.timestamp,
    },
  });

  const now = new Date();
  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: now,
      lastInboundAt: now,
      unreadCount: { increment: 1 },
      status: "OPEN",
      awaitingSince: conversation.awaitingSince ?? now,
    },
    include: conversationInclude,
  });

  emitToWorkspace(channel.workspaceId, "message:new", { conversationId: conversation.id, message });
  emitToWorkspace(channel.workspaceId, "conversation:updated", updated);

  await handleOptKeywords(contact.id, channel.workspaceId, msg.body);
  await attributeBroadcastReply(contact.id);
  await dispatchEvent(channel.workspaceId, "message.received", {
    conversationId: conversation.id,
    channel: channel.type,
    contact: { id: contact.id, name: contact.name, phone: contact.phone },
    message: { id: message.id, type: message.type, body: message.body, mediaUrl: message.mediaUrl },
  });

  await handleFlowsForInbound({
    conversationId: conversation.id,
    contactId: contact.id,
    workspaceId: channel.workspaceId,
    channelId: channel.id,
    text: msg.body ?? "",
    replyId: msg.replyId ?? null,
    newConversation,
  });
}

async function handleOptKeywords(contactId: string, workspaceId: string, body?: string | null) {
  const text = body?.trim().toUpperCase();
  if (!text) return;
  if (["STOP", "UNSUBSCRIBE"].includes(text)) {
    await prisma.contact.update({ where: { id: contactId }, data: { optIn: false } });
    await logActivity(workspaceId, contactId, "contact.opt_out", "Opted out of marketing messages");
  } else if (["START", "SUBSCRIBE"].includes(text)) {
    await prisma.contact.update({ where: { id: contactId }, data: { optIn: true, optInAt: new Date() } });
    await logActivity(workspaceId, contactId, "contact.opt_in", "Opted in to marketing messages");
  }
}

async function attributeBroadcastReply(contactId: string) {
  const since = new Date(Date.now() - 72 * 3600 * 1000);
  const recipient = await prisma.broadcastRecipient.findFirst({
    where: { contactId, status: { in: ["sent", "delivered", "read"] }, sentAt: { gte: since } },
    orderBy: { sentAt: "desc" },
  });
  if (recipient) {
    await prisma.broadcastRecipient.update({ where: { id: recipient.id }, data: { status: "replied" } });
  }
}

/** Applies a delivery status update from Meta to the matching message and broadcast recipient. */
export async function handleStatus(externalId: string, status: string, error?: string) {
  const message = await prisma.message.findFirst({ where: { externalId } });
  if (!message) return;
  const current = STATUS_RANK[message.status] ?? -1;
  const next = STATUS_RANK[status];
  const isFailure = status === "failed";
  if (!isFailure && (next === undefined || next <= current)) return;

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { status, error: isFailure ? error ?? "Delivery failed" : undefined },
  });
  emitToWorkspace(message.workspaceId, "message:status", {
    conversationId: message.conversationId,
    id: message.id,
    status: updated.status,
    error: updated.error,
  });

  const recipient = await prisma.broadcastRecipient.findFirst({ where: { externalId } });
  if (recipient && recipient.status !== "replied") {
    const rRank = STATUS_RANK[recipient.status] ?? -1;
    if (isFailure || (next !== undefined && next > rRank)) {
      await prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: { status, error: isFailure ? error : undefined },
      });
    }
  }
}
