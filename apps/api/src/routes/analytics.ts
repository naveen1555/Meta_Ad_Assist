import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { broadcastStats } from "../services/broadcasts";

/** Mounted behind requireAuth + requireWorkspace. */
export const analyticsRouter = Router();

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

analyticsRouter.get("/analytics/overview", async (req, res) => {
  const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
  const workspaceId = req.workspaceId!;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const [messageRows, leadRows, inbound, outbound, leads, contactsTotal, contactsNew, openConversations, response, leadSources, broadcasts, channelRows] =
    await Promise.all([
      prisma.$queryRaw<{ d: string; direction: string; c: number }[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d, "direction"::text AS direction, count(*)::int AS c
        FROM "Message"
        WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${since} AND "type" <> 'note'
        GROUP BY 1, 2`,
      prisma.$queryRaw<{ d: string; c: number }[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d, count(*)::int AS c
        FROM "Lead" WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${since}
        GROUP BY 1`,
      prisma.message.count({ where: { workspaceId, direction: "INBOUND", createdAt: { gte: since } } }),
      prisma.message.count({ where: { workspaceId, direction: "OUTBOUND", type: { not: "note" }, createdAt: { gte: since } } }),
      prisma.lead.count({ where: { workspaceId, createdAt: { gte: since } } }),
      prisma.contact.count({ where: { workspaceId } }),
      prisma.contact.count({ where: { workspaceId, createdAt: { gte: since } } }),
      prisma.conversation.count({ where: { workspaceId, status: "OPEN" } }),
      prisma.message.aggregate({
        where: { workspaceId, createdAt: { gte: since }, responseTimeSec: { not: null } },
        _avg: { responseTimeSec: true },
      }),
      prisma.lead.groupBy({ by: ["source"], where: { workspaceId, createdAt: { gte: since } }, _count: true }),
      prisma.broadcast.findMany({
        where: { workspaceId, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, name: true, status: true, createdAt: true },
      }),
      prisma.$queryRaw<{ type: string; c: number }[]>`
        SELECT ch."type"::text AS type, count(m.*)::int AS c
        FROM "Message" m JOIN "Conversation" cv ON cv.id = m."conversationId" JOIN "Channel" ch ON ch.id = cv."channelId"
        WHERE m."workspaceId" = ${workspaceId} AND m."createdAt" >= ${since} AND m."type" <> 'note'
        GROUP BY 1`,
    ]);

  const daily: Record<string, { date: string; inbound: number; outbound: number; leads: number }> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    daily[dayKey(d)] = { date: dayKey(d), inbound: 0, outbound: 0, leads: 0 };
  }
  for (const r of messageRows) {
    const row = daily[r.d];
    if (row) row[r.direction === "INBOUND" ? "inbound" : "outbound"] = r.c;
  }
  for (const r of leadRows) if (daily[r.d]) daily[r.d]!.leads = r.c;

  const qualified = await prisma.lead.count({
    where: { workspaceId, createdAt: { gte: since }, status: { in: ["qualified", "won"] } },
  });
  const stats = await broadcastStats(broadcasts.map((b) => b.id));

  res.json({
    totals: {
      inbound,
      outbound,
      leads,
      qualifiedLeads: qualified,
      contactsTotal,
      contactsNew,
      openConversations,
      avgResponseSec: response._avg.responseTimeSec,
    },
    daily: Object.values(daily),
    leadSources: leadSources.map((s) => ({ source: s.source, count: s._count })),
    channels: channelRows,
    campaigns: broadcasts.map((b) => ({ ...b, ...stats[b.id] })),
  });
});
