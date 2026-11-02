import { Router } from "express";
import { z } from "zod";
import { isPlanId } from "@chatnova/shared";
import { prisma } from "../db";
import { badRequest, notFound } from "../lib/errors";
import { activatePlan } from "../services/billing";

/** Mounted behind requireAuth + requireSuperAdmin. */
export const adminRouter = Router();

adminRouter.get("/stats", async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [workspaces, users, paying, messages30d, leads30d, revenue, plans] = await Promise.all([
    prisma.workspace.count(),
    prisma.user.count(),
    prisma.workspace.count({ where: { plan: { not: "free" } } }),
    prisma.message.count({ where: { createdAt: { gte: since } } }),
    prisma.lead.count({ where: { createdAt: { gte: since } } }),
    prisma.payment.groupBy({ by: ["currency"], _sum: { amount: true } }),
    prisma.workspace.groupBy({ by: ["plan"], _count: true }),
  ]);
  res.json({
    workspaces,
    users,
    paying,
    messages30d,
    leads30d,
    revenue: revenue.map((r) => ({ currency: r.currency, amount: (r._sum.amount ?? 0) / 100 })),
    plans: plans.map((p) => ({ plan: p.plan, count: p._count })),
  });
});

adminRouter.get("/workspaces", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const workspaces = await prisma.workspace.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { members: { some: { user: { email: { contains: search, mode: "insensitive" } } } } },
          ],
        }
      : undefined,
    include: {
      subscription: true,
      members: { where: { role: "OWNER" }, include: { user: { select: { email: true, name: true } } }, take: 1 },
      _count: { select: { members: true, contacts: true, channels: true, leads: true, messages: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(workspaces);
});

adminRouter.patch("/workspaces/:id", async (req, res) => {
  const { plan, days } = z.object({ plan: z.string(), days: z.number().int().min(1).max(3650).default(30) }).parse(req.body);
  if (!isPlanId(plan)) throw badRequest("Unknown plan");
  const ws = await prisma.workspace.findUnique({ where: { id: req.params.id } });
  if (!ws) throw notFound("Workspace");
  if (plan === "free") {
    await prisma.workspace.update({ where: { id: ws.id }, data: { plan: "free" } });
    await prisma.subscription.updateMany({ where: { workspaceId: ws.id }, data: { plan: "free", status: "cancelled" } });
  } else {
    await activatePlan({ workspaceId: ws.id, plan, provider: "manual", providerRef: `manual_${ws.id}_${Date.now()}`, days });
  }
  res.json({ ok: true });
});

adminRouter.get("/contact-requests", async (_req, res) => {
  res.json(await prisma.contactRequest.findMany({ orderBy: { createdAt: "desc" }, take: 200 }));
});
