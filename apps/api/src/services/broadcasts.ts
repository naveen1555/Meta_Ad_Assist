import type { Prisma } from "@prisma/client";
import { config } from "../config";
import { prisma } from "../db";
import { HttpError } from "../lib/errors";
import { emitToWorkspace } from "../lib/socket";
import { renderText, sleep } from "../lib/utils";
import { renderTemplateBody } from "../meta/send";
import { enqueue, usingRedis } from "../queue";
import { getOrCreateConversation } from "./conversations";
import { sendMessage } from "./messaging";

export interface Audience {
  tags: string[];
  optInOnly: boolean;
}

export function audienceWhere(workspaceId: string, audience: Audience): Prisma.ContactWhereInput {
  return {
    workspaceId,
    phone: { not: null },
    ...(audience.tags.length ? { tags: { hasSome: audience.tags } } : {}),
    ...(audience.optInOnly ? { optIn: true } : {}),
  };
}

export async function scheduleBroadcast(broadcastId: string, at?: Date | null) {
  const delayMs = at ? Math.max(0, at.getTime() - Date.now()) : 0;
  await enqueue("broadcast.send", { broadcastId }, { delayMs, jobId: `broadcast-${broadcastId}-${at?.getTime() ?? Date.now()}` });
}

export async function broadcastStats(broadcastIds: string[]) {
  const rows = await prisma.broadcastRecipient.groupBy({
    by: ["broadcastId", "status"],
    where: { broadcastId: { in: broadcastIds } },
    _count: true,
  });
  const stats: Record<string, Record<string, number>> = {};
  for (const id of broadcastIds) stats[id] = { total: 0, pending: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 };
  for (const r of rows) {
    const s = stats[r.broadcastId]!;
    s[r.status] = (s[r.status] ?? 0) + r._count;
    s.total! += r._count;
  }
  // Funnel counts: a "read" message was also delivered and sent, etc.
  for (const s of Object.values(stats)) {
    const replied = s.replied ?? 0;
    const read = (s.read ?? 0) + replied;
    const delivered = (s.delivered ?? 0) + read;
    s.funnelSent = (s.sent ?? 0) + delivered;
    s.funnelDelivered = delivered;
    s.funnelRead = read;
  }
  return stats;
}

/** Job handler: sends a broadcast's pending recipients at a controlled rate. */
export async function runBroadcast({ broadcastId }: { broadcastId: string }) {
  let broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  if (!broadcast || ["cancelled", "completed", "failed"].includes(broadcast.status)) return;
  if (broadcast.scheduledAt && broadcast.scheduledAt.getTime() - Date.now() > 5000) return;

  const template = await prisma.template.findUnique({ where: { id: broadcast.templateId } });
  if (!template || template.status !== "APPROVED") {
    await prisma.broadcast.update({ where: { id: broadcastId }, data: { status: "failed", completedAt: new Date() } });
    return;
  }

  broadcast = await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: "sending", startedAt: broadcast.startedAt ?? new Date() },
  });
  emitToWorkspace(broadcast.workspaceId, "broadcast:updated", { id: broadcastId, status: "sending" });

  const variables = (broadcast.variables as string[]) ?? [];
  const intervalMs = Math.max(10, Math.floor(1000 / Math.max(1, config.broadcastRatePerSecond)));
  let stopReason: string | null = null;

  while (!stopReason) {
    const batch = await prisma.broadcastRecipient.findMany({
      where: { broadcastId, status: "pending" },
      include: { contact: true },
      take: 100,
    });
    if (!batch.length) break;

    const fresh = await prisma.broadcast.findUnique({ where: { id: broadcastId }, select: { status: true } });
    if (fresh?.status === "cancelled") return;

    for (const r of batch) {
      if (!r.contact.phone) {
        await prisma.broadcastRecipient.update({ where: { id: r.id }, data: { status: "failed", error: "No phone number" } });
        continue;
      }
      try {
        const { conversation } = await getOrCreateConversation(broadcast.workspaceId, r.contactId, broadcast.channelId);
        const params = variables.map((v) => renderText(v, { contact: r.contact }));
        const msg = await sendMessage({
          conversationId: conversation.id,
          broadcastId,
          message: {
            kind: "template",
            name: template.name,
            language: template.language,
            bodyParams: params,
            preview: renderTemplateBody(template.components, params),
          },
        });
        await prisma.broadcastRecipient.update({
          where: { id: r.id },
          data:
            msg.status === "failed"
              ? { status: "failed", error: msg.error, messageId: msg.id }
              : { status: "sent", externalId: msg.externalId, messageId: msg.id, sentAt: new Date() },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Send failed";
        await prisma.broadcastRecipient.update({ where: { id: r.id }, data: { status: "failed", error: message } });
        if (err instanceof HttpError && err.status === 402) {
          stopReason = message;
          break;
        }
      }
      await sleep(intervalMs);
    }
  }

  if (stopReason) {
    await prisma.broadcastRecipient.updateMany({
      where: { broadcastId, status: "pending" },
      data: { status: "failed", error: stopReason },
    });
  }
  await prisma.broadcast.update({ where: { id: broadcastId }, data: { status: "completed", completedAt: new Date() } });
  emitToWorkspace(broadcast.workspaceId, "broadcast:updated", { id: broadcastId, status: "completed" });
}

/** Without Redis, timers are lost on restart; re-schedule unfinished broadcasts on boot. */
export async function recoverBroadcasts() {
  if (usingRedis()) return;
  const pending = await prisma.broadcast.findMany({ where: { status: { in: ["scheduled", "sending"] } } });
  for (const b of pending) await scheduleBroadcast(b.id, b.status === "scheduled" ? b.scheduledAt : null);
  if (pending.length) console.log(`[broadcasts] recovered ${pending.length} broadcast(s)`);
}
