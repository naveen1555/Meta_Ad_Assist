import { PLANS, isPlanId, type Plan, type PlanId, type PlanLimits } from "@chatnova/shared";
import { prisma } from "../db";
import { HttpError } from "./errors";
import { currentPeriod } from "./utils";

/** The plan a workspace is entitled to right now (paid plans fall back to free once the period ends). */
export async function getEffectivePlan(workspaceId: string): Promise<Plan> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { subscription: true },
  });
  if (!ws) throw new HttpError(404, "Workspace not found");
  let planId: PlanId = isPlanId(ws.plan) ? ws.plan : "free";
  const sub = ws.subscription;
  if (planId !== "free" && sub?.currentPeriodEnd && sub.currentPeriodEnd < new Date()) {
    planId = "free";
    await prisma.$transaction([
      prisma.workspace.update({ where: { id: workspaceId }, data: { plan: "free" } }),
      prisma.subscription.update({ where: { workspaceId }, data: { status: "expired" } }),
    ]);
  }
  return PLANS[planId];
}

type CountedLimit = Exclude<keyof PlanLimits, "messagesPerMonth">;

async function countFor(workspaceId: string, key: CountedLimit) {
  switch (key) {
    case "contacts":
      return prisma.contact.count({ where: { workspaceId } });
    case "agents": {
      const [members, invites] = await Promise.all([
        prisma.member.count({ where: { workspaceId } }),
        prisma.invite.count({ where: { workspaceId, acceptedAt: null } }),
      ]);
      return members + invites;
    }
    case "flows":
      return prisma.flow.count({ where: { workspaceId } });
    case "channels":
      return prisma.channel.count({ where: { workspaceId } });
  }
}

const LIMIT_LABELS: Record<CountedLimit, string> = {
  contacts: "contacts",
  agents: "team members",
  flows: "chatbot flows",
  channels: "channels",
};

export async function assertLimit(workspaceId: string, key: CountedLimit, adding = 1) {
  const plan = await getEffectivePlan(workspaceId);
  const limit = plan.limits[key];
  if (limit < 0) return;
  const used = await countFor(workspaceId, key);
  if (used + adding > limit) {
    throw new HttpError(
      402,
      `Your ${plan.name} plan allows ${limit} ${LIMIT_LABELS[key]}. Upgrade your plan to add more.`,
    );
  }
}

/** Returns remaining contact slots (Infinity when unlimited). */
export async function remainingContacts(workspaceId: string) {
  const plan = await getEffectivePlan(workspaceId);
  if (plan.limits.contacts < 0) return Infinity;
  const used = await countFor(workspaceId, "contacts");
  return Math.max(0, plan.limits.contacts - used);
}

const FEATURE_PLANS: Record<"integrations" | "api", PlanId[]> = {
  integrations: ["starter", "growth", "pro"],
  api: ["growth", "pro"],
};

export async function assertFeature(workspaceId: string, feature: keyof typeof FEATURE_PLANS) {
  const plan = await getEffectivePlan(workspaceId);
  if (!FEATURE_PLANS[feature].includes(plan.id)) {
    const label = feature === "api" ? "REST API access" : "Integrations";
    throw new HttpError(402, `${label} is not included in the ${plan.name} plan. Upgrade to unlock it.`);
  }
}

export async function getMonthlyUsage(workspaceId: string) {
  const usage = await prisma.usage.findUnique({
    where: { workspaceId_period: { workspaceId, period: currentPeriod() } },
  });
  return usage?.messagesSent ?? 0;
}

export async function assertMessageQuota(workspaceId: string) {
  const plan = await getEffectivePlan(workspaceId);
  const used = await getMonthlyUsage(workspaceId);
  if (plan.limits.messagesPerMonth >= 0 && used >= plan.limits.messagesPerMonth) {
    throw new HttpError(
      402,
      `Monthly message limit of ${plan.limits.messagesPerMonth.toLocaleString()} reached on the ${plan.name} plan.`,
    );
  }
}

export async function incrementUsage(workspaceId: string, by = 1) {
  const period = currentPeriod();
  await prisma.usage.upsert({
    where: { workspaceId_period: { workspaceId, period } },
    create: { workspaceId, period, messagesSent: by },
    update: { messagesSent: { increment: by } },
  });
}
