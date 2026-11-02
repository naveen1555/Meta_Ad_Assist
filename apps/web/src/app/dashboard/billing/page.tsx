"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CreditCard, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { formatLimit, type Plan, type PlanId, type PlanLimits } from "@chatnova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, statusTone } from "@/components/ui/card";
import { PageHeader, PageLoader, Table, Tabs, Td, Th } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { canManage, useAuth } from "@/lib/auth";
import { cn, formatDate } from "@/lib/utils";

interface BillingDto {
  plan: Plan;
  plans: Plan[];
  subscription: { plan: string; status: string; provider: string | null; currentPeriodEnd: string | null } | null;
  usage: PlanLimits;
  payments: { id: string; provider: string; plan: string; amount: number; currency: string; createdAt: string }[];
  providers: { razorpay: boolean; stripe: boolean };
}

type Currency = "INR" | "USD";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: any) => void) => void };
  }
}

function loadRazorpay() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Razorpay checkout"));
    document.body.appendChild(s);
  });
}

const USAGE_ROWS: { key: keyof PlanLimits; label: string; monthly?: boolean }[] = [
  { key: "messagesPerMonth", label: "Messages this month", monthly: true },
  { key: "contacts", label: "Contacts" },
  { key: "agents", label: "Team members" },
  { key: "flows", label: "Chatbot flows" },
  { key: "channels", label: "Channels" },
];

export default function BillingPage() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <Billing />
    </React.Suspense>
  );
}

function Billing() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const { user, workspace, refresh } = useAuth();
  const manager = canManage(workspace?.role);
  const { data, isLoading } = useQuery({ queryKey: ["billing"], queryFn: () => api<BillingDto>("/api/billing") });
  const [currency, setCurrency] = React.useState<Currency>("INR");
  const [pending, setPending] = React.useState<PlanId | null>(null);

  React.useEffect(() => {
    if (data && !data.providers.razorpay && data.providers.stripe) setCurrency("USD");
  }, [data]);

  React.useEffect(() => {
    if (params.get("success")) {
      toast.success("Payment received. Your plan will update in a few seconds.");
      const t = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["billing"] });
        refresh();
      }, 3000);
      return () => clearTimeout(t);
    }
    if (params.get("cancelled")) toast("Checkout cancelled");
  }, [params, qc, refresh]);

  const onPaid = async () => {
    toast.success("Payment successful. Your plan is now active.");
    await qc.invalidateQueries({ queryKey: ["billing"] });
    await refresh();
  };

  const payRazorpay = async (plan: PlanId) => {
    const order = await api<{ orderId: string; amount: number; currency: string; keyId: string; planName: string }>(
      "/api/billing/razorpay/order",
      { body: { plan } },
    );
    await loadRazorpay();
    await new Promise<void>((resolve, reject) => {
      const rzp = new window.Razorpay!({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "ChatNova",
        description: `${order.planName} plan - 1 month`,
        prefill: { email: user?.email, name: user?.name },
        theme: { color: "#5B21B6" },
        handler: async (resp: Record<string, string>) => {
          try {
            await api("/api/billing/razorpay/verify", { body: resp });
            await onPaid();
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        modal: { ondismiss: () => resolve() },
      });
      rzp.on("payment.failed", (r) => reject(new Error(r?.error?.description || "Payment failed")));
      rzp.open();
    });
  };

  const payStripe = async (plan: PlanId) => {
    const { url } = await api<{ url: string }>("/api/billing/stripe/checkout", { body: { plan } });
    window.location.href = url;
  };

  const upgrade = async (plan: PlanId) => {
    setPending(plan);
    try {
      if (currency === "INR") await payRazorpay(plan);
      else await payStripe(plan);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(null);
    }
  };

  const cancel = useMutation({
    mutationFn: () => api("/api/billing/cancel", { method: "POST" }),
    onSuccess: () => {
      toast.success("Subscription cancelled. You keep access until the end of the period.");
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading || !data) return <PageLoader />;
  const { plan, subscription } = data;
  const canPay = currency === "INR" ? data.providers.razorpay : data.providers.stripe;
  const isActivePaid = plan.id !== "free" && subscription?.status === "active";

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Billing" description="Your plan, usage and payments" />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardDescription>Current plan</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              {plan.name}
              {subscription && plan.id !== "free" && <Badge tone={statusTone(subscription.status)}>{subscription.status}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{plan.tagline}</p>
            {subscription?.currentPeriodEnd && plan.id !== "free" && (
              <p>
                {subscription.status === "cancelled" ? "Access ends" : "Renews / valid until"}{" "}
                <span className="font-medium">{formatDate(subscription.currentPeriodEnd)}</span>
              </p>
            )}
            {isActivePaid && manager && workspace?.role === "OWNER" && (
              <Button
                variant="outline"
                size="sm"
                loading={cancel.isPending}
                onClick={() => {
                  if (confirm("Cancel your subscription? You keep access until the end of the current period.")) cancel.mutate();
                }}
              >
                Cancel subscription
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Usage</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {USAGE_ROWS.map((row) => {
              const limit = plan.limits[row.key];
              const used = data.usage[row.key];
              const ratio = limit < 0 ? 0 : Math.min(1, used / Math.max(1, limit));
              return (
                <div key={row.key}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span>{row.label}</span>
                    <span className="text-muted-foreground">
                      {used.toLocaleString("en-IN")} / {formatLimit(limit)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", ratio > 0.9 ? "bg-coral-500" : "bg-primary")}
                      style={{ width: `${limit < 0 ? 4 : Math.max(2, ratio * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Plans</h2>
        <Tabs<Currency>
          value={currency}
          onChange={setCurrency}
          tabs={[
            { value: "INR", label: "₹ INR · Razorpay" },
            { value: "USD", label: "$ USD · Stripe" },
          ]}
        />
      </div>
      {!canPay && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {currency === "INR" ? "Razorpay" : "Stripe"} is not configured on the server yet. Add the API keys to enable payments.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.plans.map((p) => {
          const current = p.id === plan.id;
          const price = currency === "INR" ? `₹${p.priceInr.toLocaleString("en-IN")}` : `$${p.priceUsd}`;
          return (
            <div
              key={p.id}
              className={cn(
                "relative flex flex-col rounded-xl border bg-white p-5 shadow-sm",
                p.popular && "border-primary ring-1 ring-primary",
              )}
            >
              {p.popular && (
                <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-white">
                  <Sparkles className="h-3 w-3" /> Most popular
                </span>
              )}
              <h3 className="font-semibold">{p.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{p.tagline}</p>
              <p className="mt-4 text-3xl font-bold">
                {p.priceInr === 0 ? "Free" : price}
                {p.priceInr > 0 && <span className="text-sm font-normal text-muted-foreground"> /month</span>}
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {current ? (
                  <Button variant="secondary" className="w-full" disabled>
                    {isActivePaid ? "Current plan · extend" : "Current plan"}
                  </Button>
                ) : p.id === "free" ? (
                  <Button variant="outline" className="w-full" disabled>
                    Included
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={p.popular ? "default" : "outline"}
                    disabled={!manager || !canPay || (pending !== null && pending !== p.id)}
                    loading={pending === p.id}
                    onClick={() => upgrade(p.id)}
                  >
                    <CreditCard /> Upgrade
                  </Button>
                )}
                {current && isActivePaid && canPay && manager && (
                  <Button variant="link" size="sm" className="mt-1 w-full" loading={pending === p.id} onClick={() => upgrade(p.id)}>
                    Pay for another month
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!manager && <p className="text-sm text-muted-foreground">Only workspace owners and admins can change the plan.</p>}

      <div>
        <h2 className="mb-3 text-lg font-semibold">Payment history</h2>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Plan</Th>
              <Th>Amount</Th>
              <Th>Method</Th>
              <Th>Reference</Th>
            </tr>
          </thead>
          <tbody>
            {data.payments.map((p) => (
              <tr key={p.id}>
                <Td>{formatDate(p.createdAt)}</Td>
                <Td className="capitalize">{p.plan}</Td>
                <Td>
                  {(p.amount / 100).toLocaleString(p.currency === "INR" ? "en-IN" : "en-US", {
                    style: "currency",
                    currency: p.currency,
                  })}
                </Td>
                <Td className="capitalize">{p.provider}</Td>
                <Td className="font-mono text-xs text-muted-foreground">{p.id.slice(-10)}</Td>
              </tr>
            ))}
            {!data.payments.length && (
              <tr>
                <Td colSpan={5} className="py-10 text-center text-muted-foreground">
                  No payments yet.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
