import { PLANS, isPlanId, type PlanId } from "@chatnova/shared";
import { config } from "../config";
import { prisma } from "../db";
import { HttpError, badRequest } from "../lib/errors";
import { hmacSha256, safeEqual } from "../lib/utils";

const PERIOD_DAYS = 30;

/** Grants a plan for one billing period. Idempotent per payment reference. */
export async function activatePlan(opts: {
  workspaceId: string;
  plan: PlanId;
  provider: string;
  providerRef: string;
  amount?: number;
  currency?: string;
  subscriptionRef?: string;
  days?: number;
}) {
  if (opts.providerRef) {
    const seen = await prisma.payment.findUnique({ where: { providerRef: opts.providerRef } });
    if (seen) return;
  }
  const existing = await prisma.subscription.findUnique({ where: { workspaceId: opts.workspaceId } });
  const base =
    existing?.plan === opts.plan && existing.currentPeriodEnd && existing.currentPeriodEnd > new Date()
      ? existing.currentPeriodEnd
      : new Date();
  const currentPeriodEnd = new Date(base.getTime() + (opts.days ?? PERIOD_DAYS) * 86400_000);

  await prisma.$transaction([
    prisma.subscription.upsert({
      where: { workspaceId: opts.workspaceId },
      create: {
        workspaceId: opts.workspaceId,
        plan: opts.plan,
        status: "active",
        provider: opts.provider,
        providerRef: opts.subscriptionRef ?? opts.providerRef,
        currentPeriodEnd,
      },
      update: {
        plan: opts.plan,
        status: "active",
        provider: opts.provider,
        providerRef: opts.subscriptionRef ?? existing?.providerRef ?? opts.providerRef,
        currentPeriodEnd,
      },
    }),
    prisma.workspace.update({ where: { id: opts.workspaceId }, data: { plan: opts.plan } }),
    ...(opts.providerRef
      ? [
          prisma.payment.create({
            data: {
              workspaceId: opts.workspaceId,
              provider: opts.provider,
              providerRef: opts.providerRef,
              plan: opts.plan,
              amount: opts.amount ?? 0,
              currency: opts.currency ?? "INR",
            },
          }),
        ]
      : []),
  ]);
}

// ------------------------------------------------------------------ Razorpay

function razorpayAuth() {
  if (!config.razorpay.keyId || !config.razorpay.keySecret) throw badRequest("Razorpay is not configured");
  return `Basic ${Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString("base64")}`;
}

async function razorpay<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: { Authorization: razorpayAuth(), "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw badRequest(data?.error?.description || "Razorpay request failed");
  return data as T;
}

export async function createRazorpayOrder(workspaceId: string, planId: PlanId) {
  const plan = PLANS[planId];
  if (!plan.priceInr) throw badRequest("This plan is free");
  const order = await razorpay<{ id: string; amount: number; currency: string }>("orders", {
    body: {
      amount: plan.priceInr * 100,
      currency: "INR",
      receipt: `ws_${workspaceId.slice(-12)}_${Date.now()}`,
      notes: { workspaceId, plan: planId },
    },
  });
  return { orderId: order.id, amount: order.amount, currency: order.currency, keyId: config.razorpay.keyId, planName: plan.name };
}

async function activateFromRazorpayOrder(orderId: string, paymentId: string, expectedWorkspace?: string) {
  const order = await razorpay<{ id: string; amount: number; currency: string; notes: { workspaceId?: string; plan?: string } }>(
    `orders/${orderId}`,
  );
  const workspaceId = order.notes?.workspaceId;
  const plan = order.notes?.plan;
  if (!workspaceId || !isPlanId(plan)) throw badRequest("Order is missing plan details");
  if (expectedWorkspace && workspaceId !== expectedWorkspace) throw new HttpError(403, "Order belongs to another workspace");
  await activatePlan({ workspaceId, plan, provider: "razorpay", providerRef: paymentId, amount: order.amount, currency: order.currency });
  return { workspaceId, plan };
}

export async function verifyRazorpayPayment(
  workspaceId: string,
  input: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
) {
  const expected = hmacSha256(config.razorpay.keySecret, `${input.razorpay_order_id}|${input.razorpay_payment_id}`);
  if (!safeEqual(expected, input.razorpay_signature)) throw badRequest("Payment signature verification failed");
  return activateFromRazorpayOrder(input.razorpay_order_id, input.razorpay_payment_id, workspaceId);
}

export async function handleRazorpayWebhook(raw: Buffer, signature: string, body: any) {
  if (!config.razorpay.webhookSecret) throw badRequest("Razorpay webhook secret not configured");
  if (!safeEqual(hmacSha256(config.razorpay.webhookSecret, raw), signature)) throw new HttpError(401, "Invalid signature");
  if (body?.event === "payment.captured" || body?.event === "order.paid") {
    const payment = body.payload?.payment?.entity;
    if (payment?.order_id && payment?.id) await activateFromRazorpayOrder(payment.order_id, payment.id);
  }
}

// ------------------------------------------------------------------ Stripe

async function stripe<T>(path: string, params?: Record<string, string>, method = "POST"): Promise<T> {
  if (!config.stripe.secretKey) throw badRequest("Stripe is not configured");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.stripe.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw badRequest(data?.error?.message || "Stripe request failed");
  return data as T;
}

export async function createStripeCheckout(workspaceId: string, planId: PlanId, email: string) {
  const plan = PLANS[planId];
  if (!plan.priceUsd) throw badRequest("This plan is free");
  const session = await stripe<{ url: string }>("checkout/sessions", {
    mode: "subscription",
    customer_email: email,
    client_reference_id: workspaceId,
    success_url: `${config.webUrl}/dashboard/billing?success=1`,
    cancel_url: `${config.webUrl}/dashboard/billing?cancelled=1`,
    "metadata[workspaceId]": workspaceId,
    "metadata[plan]": planId,
    "subscription_data[metadata][workspaceId]": workspaceId,
    "subscription_data[metadata][plan]": planId,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(plan.priceUsd * 100),
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][product_data][name]": `ChatNova ${plan.name}`,
  });
  return { url: session.url };
}

function verifyStripeSignature(raw: Buffer, header: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts.t;
  const v1 = header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  if (!t || !v1.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = hmacSha256(config.stripe.webhookSecret, `${t}.${raw.toString("utf8")}`);
  return v1.some((sig) => safeEqual(sig, expected));
}

export async function handleStripeWebhook(raw: Buffer, signature: string, event: any) {
  if (!config.stripe.webhookSecret) throw badRequest("Stripe webhook secret not configured");
  if (!verifyStripeSignature(raw, signature)) throw new HttpError(401, "Invalid signature");
  const obj = event?.data?.object ?? {};

  if (event.type === "checkout.session.completed") {
    const { workspaceId, plan } = obj.metadata ?? {};
    if (workspaceId && isPlanId(plan)) {
      await activatePlan({
        workspaceId,
        plan,
        provider: "stripe",
        providerRef: obj.invoice || obj.id,
        subscriptionRef: obj.subscription,
        amount: obj.amount_total,
        currency: String(obj.currency || "usd").toUpperCase(),
      });
    }
  } else if (event.type === "invoice.paid" && obj.billing_reason !== "subscription_create") {
    const meta = obj.subscription_details?.metadata ?? obj.lines?.data?.[0]?.metadata ?? {};
    if (meta.workspaceId && isPlanId(meta.plan)) {
      await activatePlan({
        workspaceId: meta.workspaceId,
        plan: meta.plan,
        provider: "stripe",
        providerRef: obj.id,
        subscriptionRef: obj.subscription,
        amount: obj.amount_paid,
        currency: String(obj.currency || "usd").toUpperCase(),
      });
    }
  } else if (event.type === "customer.subscription.deleted") {
    const workspaceId = obj.metadata?.workspaceId;
    if (workspaceId) {
      await prisma.subscription.updateMany({ where: { workspaceId }, data: { status: "cancelled", currentPeriodEnd: new Date() } });
      await prisma.workspace.update({ where: { id: workspaceId }, data: { plan: "free" } }).catch(() => undefined);
    }
  }
}

export async function cancelSubscription(workspaceId: string) {
  const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
  if (!sub || sub.plan === "free") throw badRequest("No paid subscription to cancel");
  if (sub.provider === "stripe" && sub.providerRef?.startsWith("sub_")) {
    await stripe(`subscriptions/${sub.providerRef}`, { cancel_at_period_end: "true" });
  }
  await prisma.subscription.update({ where: { workspaceId }, data: { status: "cancelled" } });
}
