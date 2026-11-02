"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Circle, Clock, MessageSquare, Target, Users } from "lucide-react";
import type { LeadSettings } from "@chatnova/shared";
import { MessagesChart, type AnalyticsOverview } from "@/components/analytics/charts";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, statusTone } from "@/components/ui/card";
import { Avatar, PageLoader, StatCard } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useChannels } from "@/lib/hooks";
import { cn, formatDuration, timeAgo } from "@/lib/utils";

interface RecentLead {
  id: string;
  status: string;
  source: string;
  createdAt: string;
  contact: { id: string; name: string | null; phone: string | null };
}

export default function DashboardHome() {
  const { user } = useAuth();
  const overview = useQuery({
    queryKey: ["analytics", 14],
    queryFn: () => api<AnalyticsOverview>("/api/analytics/overview?days=14"),
  });
  const leads = useQuery({
    queryKey: ["leads", "recent"],
    queryFn: () => api<{ items: RecentLead[] }>("/api/leads"),
  });
  const channels = useChannels();
  const leadSettings = useQuery({
    queryKey: ["lead-settings"],
    queryFn: () => api<LeadSettings>("/api/workspace/lead-settings"),
  });
  const flows = useQuery({
    queryKey: ["flows"],
    queryFn: () => api<{ id: string; active: boolean }[]>("/api/flows"),
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const steps = [
    {
      done: (channels.data?.length ?? 0) > 0,
      title: "Connect a channel",
      body: "Link WhatsApp, a Facebook Page or Instagram.",
      href: "/dashboard/channels",
    },
    {
      done: Boolean(leadSettings.data?.enabled),
      title: "Turn on Lead Ads instant reply",
      body: "Message every new ad lead on WhatsApp within seconds.",
      href: "/dashboard/leads",
    },
    {
      done: Boolean(flows.data?.some((f) => f.active)),
      title: "Publish a chatbot flow",
      body: "Answer FAQs and qualify leads automatically.",
      href: "/dashboard/flows",
    },
  ];
  const remaining = steps.filter((s) => !s.done).length;
  const t = overview.data?.totals;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}, {user?.name?.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Here is what happened across your channels in the last 14 days.</p>
      </div>

      {remaining > 0 && !channels.isLoading && (
        <Card className="border-primary/20 bg-gradient-to-r from-violet-50 to-coral-50">
          <CardHeader>
            <CardTitle>Finish setting up ({steps.length - remaining}/{steps.length})</CardTitle>
            <CardDescription>A few steps and your leads will be answered on autopilot.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {steps.map((s) => (
              <Link
                key={s.title}
                href={s.href}
                className={cn(
                  "flex gap-3 rounded-lg border bg-white p-4 transition hover:border-primary/40 hover:shadow-sm",
                  s.done && "opacity-60",
                )}
              >
                {s.done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-primary" />
                )}
                <div>
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.body}</p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {overview.isLoading ? (
        <PageLoader />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="New leads" value={t?.leads ?? 0} icon={Target} hint={`${t?.qualifiedLeads ?? 0} qualified or won`} />
            <StatCard
              label="Messages"
              value={((t?.inbound ?? 0) + (t?.outbound ?? 0)).toLocaleString("en-IN")}
              icon={MessageSquare}
              hint={`${t?.inbound ?? 0} received · ${t?.outbound ?? 0} sent`}
            />
            <StatCard label="Open conversations" value={t?.openConversations ?? 0} icon={Users} hint={`${t?.contactsNew ?? 0} new contacts`} />
            <StatCard
              label="Avg. first response"
              value={t?.avgResponseSec != null ? formatDuration(t.avgResponseSec) : "—"}
              icon={Clock}
              hint="Time for an agent to reply"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Message volume</CardTitle>
                  <CardDescription>Received vs. sent per day</CardDescription>
                </div>
                <Link href="/dashboard/analytics" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Analytics <ArrowRight />
                </Link>
              </CardHeader>
              <CardContent>
                <MessagesChart data={overview.data?.daily ?? []} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Latest leads</CardTitle>
                <Link href="/dashboard/leads" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  All <ArrowRight />
                </Link>
              </CardHeader>
              <CardContent className="space-y-1">
                {(leads.data?.items ?? []).slice(0, 6).map((l) => (
                  <Link
                    key={l.id}
                    href={`/dashboard/contacts/${l.contact.id}`}
                    className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/60"
                  >
                    <Avatar name={l.contact.name} className="h-8 w-8" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.contact.name || l.contact.phone || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{timeAgo(l.createdAt)}</p>
                    </div>
                    <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                  </Link>
                ))}
                {leads.data && !leads.data.items.length && (
                  <p className="py-8 text-center text-sm text-muted-foreground">No leads yet. Connect a Facebook Page to start.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
