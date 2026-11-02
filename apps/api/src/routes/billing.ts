import { Router } from "express";
import { z } from "zod";
import { PLAN_LIST, isPlanId } from "@chatnova/shared";
import { prisma } from "../db";
import { config } from "../config";
import { requireRole } from "../lib/auth";
import { badRequest } from "../lib/errors";
import { getEffectivePlan, getMonthlyUsage } from "../lib/limits";
import { cancelSubscription, createRazorpayOrder, createStripeCheckout, verifyRazorpayPayment } from "../services/billing";

/** Mounted behind requireAuth + requireWorkspace. */
export const billingRouter = Router();

const planSchema = z.object({ plan: z.string().refine(isPlanId, "Unknown plan") });

billingRouter.get("/billing", async (req, res) => {
  const workspaceId = req.workspaceId!;
  const plan = await getEffectivePlan(workspaceId);
  const [subscription, messages, contacts, members, invites, flows, channels, payments] = await Promise.all([
    prisma.subscription.findUnique({ where: { workspaceId } }),
    getMonthlyUsage(workspaceId),
    prisma.contact.count({ where: { workspaceId } }),
    prisma.member.count({ where: { workspaceId } }),
    prisma.invite.count({ where: { workspaceId, acceptedAt: null } }),
    prisma.flow.count({ where: { workspaceId } }),
    prisma.channel.count({ where: { workspaceId } }),
    prisma.payment.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  res.json({
    plan,
    plans: PLAN_LIST,
    subscription,
    usage: { messagesPerMonth: messages, contacts, agents: members + invites, flows, channels },
    payments,
    providers: { razorpay: Boolean(config.razorpay.keyId), stripe: Boolean(config.stripe.secretKey) },
  });
});

billingRouter.post("/billing/razorpay/order", requireRole("OWNER", "ADMIN"), async (req, res) => {
  const { plan } = planSchema.parse(req.body);
  if (!isPlanId(plan)) throw badRequest("Unknown plan");
  res.json(await createRazorpayOrder(req.workspaceId!, plan));
});

billingRouter.post("/billing/razorpay/verify", requireRole("OWNER", "ADMIN"), async (req, res) => {
  const input = z
    .object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() })
    .parse(req.body);
  res.json(await verifyRazorpayPayment(req.workspaceId!, input));
});

billingRouter.post("/billing/stripe/checkout", requireRole("OWNER", "ADMIN"), async (req, res) => {
  const { plan } = planSchema.parse(req.body);
  if (!isPlanId(plan)) throw badRequest("Unknown plan");
  res.json(await createStripeCheckout(req.workspaceId!, plan, req.user!.email));
});

billingRouter.post("/billing/cancel", requireRole("OWNER"), async (req, res) => {
  await cancelSubscription(req.workspaceId!);
  res.json({ ok: true });
});
