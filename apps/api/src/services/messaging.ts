import type { Message, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { badRequest } from "../lib/errors";
import { assertMessageQuota, incrementUsage } from "../lib/limits";
import { emitToWorkspace } from "../lib/socket";
import { GraphError } from "../meta/graph";
import { messageBodyOf, messageTypeOf, sendViaChannel, type OutMessage } from "../meta/send";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWindowOpen(lastInboundAt: Date | null) {
  return Boolean(lastInboundAt && Date.now() - lastInboundAt.getTime() < WINDOW_MS);
}

interface SendOptions {
  conversationId: string;
  message: OutMessage;
  senderId?: string | null;
  isBot?: boolean;
  broadcastId?: string;
  skipQuota?: boolean;
}

/**
 * Sends a message to a conversation's contact. Pre-flight problems (closed 24h window, quota) throw;
 * provider failures are stored on the message with status "failed" and returned.
 */
export async function sendMessage(opts: SendOptions): Promise<Message> {
  const conv = await prisma.conversation.findUniqueOrThrow({
    where: { id: opts.conversationId },
    include: { channel: true, contact: true },
  });
  const { channel, contact } = conv;
  const recipient =
    channel.type === "WHATSAPP" ? contact.phone : channel.type === "MESSENGER" ? contact.messengerId : contact.instagramId;
  if (!recipient) throw badRequest(`This contact has no ${channel.type.toLowerCase()} identifier`);
  if (opts.message.kind === "template" && channel.type !== "WHATSAPP") {
    throw badRequest("Templates can only be sent on WhatsApp channels");
  }
  if (opts.message.kind !== "template" && !isWindowOpen(conv.lastInboundAt)) {
    throw badRequest(
      channel.type === "WHATSAPP"
        ? "The 24-hour customer service window is closed. Send an approved template to restart the conversation."
        : "The 24-hour messaging window is closed for this contact.",
    );
  }
  if (!opts.skipQuota) await assertMessageQuota(conv.workspaceId);

  let message = await prisma.message.create({
    data: {
      workspaceId: conv.workspaceId,
      conversationId: conv.id,
      direction: "OUTBOUND",
      type: messageTypeOf(opts.message),
      body: messageBodyOf(opts.message),
      mediaUrl: opts.message.kind === "media" ? opts.message.url : null,
      payload: opts.message as unknown as Prisma.InputJsonObject,
      status: "queued",
      senderId: opts.senderId ?? null,
      isBot: opts.isBot ?? false,
      broadcastId: opts.broadcastId,
    },
    include: { sender: { select: { id: true, name: true } } },
  });

  try {
    const externalId = await sendViaChannel(channel, recipient, opts.message);
    const responseTimeSec =
      conv.awaitingSince && !opts.broadcastId
        ? Math.round((Date.now() - conv.awaitingSince.getTime()) / 1000)
        : undefined;
    message = await prisma.message.update({
      where: { id: message.id },
      data: { status: "sent", externalId, responseTimeSec },
      include: { sender: { select: { id: true, name: true } } },
    });
    await incrementUsage(conv.workspaceId);
  } catch (err) {
    const error = err instanceof GraphError || err instanceof Error ? err.message : "Send failed";
    message = await prisma.message.update({
      where: { id: message.id },
      data: { status: "failed", error },
      include: { sender: { select: { id: true, name: true } } },
    });
  }

  await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      lastMessageAt: new Date(),
      ...(message.status === "sent" && !opts.broadcastId ? { awaitingSince: null, unreadCount: 0 } : {}),
    },
  });
  emitToWorkspace(conv.workspaceId, "message:new", { conversationId: conv.id, message });
  return message;
}
