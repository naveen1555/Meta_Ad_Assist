import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { broadcastInputSchema } from "@chatnova/shared";
import { z } from "zod";
import { prisma } from "../db";
import { requireManager } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";
import { getEffectivePlan, getMonthlyUsage } from "../lib/limits";
import { audienceWhere, broadcastStats, scheduleBroadcast, type Audience } from "../services/broadcasts";

/** Mounted behind requireAuth + requireWorkspace. */
export const broadcastsRouter = Router();

const audienceSchema = z.object({ tags: z.array(z.string()).default([]), optInOnly: z.boolean().default(true) });

broadcastsRouter.get("/broadcasts", async (req, res) => {
  const broadcasts = await prisma.broadcast.findMany({
    where: { workspaceId: req.workspaceId },
    include: { channel: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const stats = await broadcastStats(broadcasts.map((b) => b.id));
  const templates = await prisma.template.findMany({
    where: { id: { in: broadcasts.map((b) => b.templateId) } },
    select: { id: true, name: true },
  });
  const names = new Map(templates.map((t) => [t.id, t.name]));
  res.json(broadcasts.map((b) => ({ ...b, templateName: names.get(b.templateId) ?? "(deleted)", stats: stats[b.id] })));
});

broadcastsRouter.post("/broadcasts/audience-count", async (req, res) => {
  const audience = audienceSchema.parse(req.body);
  res.json({ count: await prisma.contact.count({ where: audienceWhere(req.workspaceId!, audience) }) });
});

broadcastsRouter.post("/broadcasts", requireManager, async (req, res) => {
  const input = broadcastInputSchema.parse(req.body);
  const channel = await prisma.channel.findFirst({
    where: { id: input.channelId, workspaceId: req.workspaceId, type: "WHATSAPP" },
  });
  if (!channel) throw notFound("WhatsApp channel");
  const template = await prisma.template.findFirst({ where: { id: input.templateId, channelId: channel.id } });
  if (!template) throw notFound("Template");
  if (template.status !== "APPROVED") throw badRequest("Only approved templates can be broadcast");

  const audience: Audience = input.audience;
  const contacts = await prisma.contact.findMany({ where: audienceWhere(req.workspaceId!, audience), select: { id: true } });
  if (!contacts.length) throw badRequest("No contacts match this audience");

  const plan = await getEffectivePlan(req.workspaceId!);
  if (plan.limits.messagesPerMonth >= 0) {
    const remaining = plan.limits.messagesPerMonth - (await getMonthlyUsage(req.workspaceId!));
    if (contacts.length > remaining) {
      throw badRequest(
        `This broadcast needs ${contacts.length} messages but only ${Math.max(0, remaining)} remain this month on the ${plan.name} plan.`,
      );
    }
  }

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const isScheduled = scheduledAt && scheduledAt.getTime() > Date.now() + 30_000;
  const broadcast = await prisma.broadcast.create({
    data: {
      workspaceId: req.workspaceId!,
      channelId: channel.id,
      templateId: template.id,
      name: input.name,
      variables: input.variables,
      audience: audience as unknown as Prisma.InputJsonObject,
      status: isScheduled ? "scheduled" : "sending",
      scheduledAt: isScheduled ? scheduledAt : null,
    },
  });
  for (let i = 0; i < contacts.length; i += 1000) {
    await prisma.broadcastRecipient.createMany({
      data: contacts.slice(i, i + 1000).map((c) => ({ broadcastId: broadcast.id, contactId: c.id })),
      skipDuplicates: true,
    });
  }
  await scheduleBroadcast(broadcast.id, isScheduled ? scheduledAt : null);
  res.status(201).json(broadcast);
});

broadcastsRouter.get("/broadcasts/:id", async (req, res) => {
  const broadcast = await prisma.broadcast.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
    include: { channel: { select: { id: true, name: true, phoneNumber: true } } },
  });
  if (!broadcast) throw notFound("Broadcast");
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const [stats, recipients, template] = await Promise.all([
    broadcastStats([broadcast.id]),
    prisma.broadcastRecipient.findMany({
      where: { broadcastId: broadcast.id, ...(status ? { status } : {}) },
      include: { contact: { select: { id: true, name: true, phone: true } } },
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
    prisma.template.findUnique({ where: { id: broadcast.templateId } }),
  ]);
  res.json({ ...broadcast, stats: stats[broadcast.id], recipients, template });
});

broadcastsRouter.post("/broadcasts/:id/cancel", requireManager, async (req, res) => {
  const broadcast = await prisma.broadcast.findFirst({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  if (!broadcast) throw notFound("Broadcast");
  if (!["scheduled", "sending"].includes(broadcast.status)) throw badRequest("Only scheduled or sending broadcasts can be cancelled");
  await prisma.broadcast.update({ where: { id: broadcast.id }, data: { status: "cancelled", completedAt: new Date() } });
  await prisma.broadcastRecipient.updateMany({
    where: { broadcastId: broadcast.id, status: "pending" },
    data: { status: "failed", error: "Broadcast cancelled" },
  });
  res.json({ ok: true });
});

broadcastsRouter.delete("/broadcasts/:id", requireManager, async (req, res) => {
  const broadcast = await prisma.broadcast.findFirst({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  if (!broadcast) throw notFound("Broadcast");
  if (broadcast.status === "sending") throw badRequest("Cancel the broadcast before deleting it");
  await prisma.broadcast.delete({ where: { id: broadcast.id } });
  res.json({ ok: true });
});
