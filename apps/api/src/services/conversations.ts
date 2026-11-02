import type { Conversation } from "@prisma/client";
import { prisma } from "../db";
import { emitToUser, emitToWorkspace } from "../lib/socket";
import { logActivity } from "./events";

export const conversationInclude = {
  contact: true,
  channel: { select: { id: true, type: true, name: true, phoneNumber: true } },
  assignee: { select: { id: true, name: true, email: true } },
} as const;

export async function getOrCreateConversation(workspaceId: string, contactId: string, channelId: string) {
  const existing = await prisma.conversation.findUnique({ where: { channelId_contactId: { channelId, contactId } } });
  if (existing) return { conversation: existing, created: false };
  try {
    const conversation = await prisma.conversation.create({ data: { workspaceId, contactId, channelId } });
    return { conversation, created: true };
  } catch {
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { channelId_contactId: { channelId, contactId } },
    });
    return { conversation, created: false };
  }
}

/** Picks the next workspace member in rotation. */
export async function nextRoundRobinAgent(workspaceId: string): Promise<string | null> {
  const members = await prisma.member.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  if (!members.length) return null;
  const ws = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { roundRobinIndex: { increment: 1 } },
  });
  return members[(ws.roundRobinIndex - 1) % members.length]!.userId;
}

export async function assignConversation(conversation: Conversation, assigneeId: string | null, byUserId?: string) {
  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: { assigneeId },
    include: conversationInclude,
  });
  emitToWorkspace(updated.workspaceId, "conversation:updated", updated);
  if (assigneeId && assigneeId !== byUserId) {
    emitToUser(assigneeId, "conversation:assigned-to-you", {
      conversationId: updated.id,
      contactName: updated.contact.name || updated.contact.phone,
    });
  }
  if (assigneeId) {
    await logActivity(updated.workspaceId, updated.contactId, "conversation.assigned", `Assigned to ${updated.assignee?.name}`);
  }
  return updated;
}
