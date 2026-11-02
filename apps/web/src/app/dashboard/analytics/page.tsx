"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Clock, MessageSquare, MessagesSquare, Target, TrendingUp, UserPlus } from "lucide-react";
import { CHANNEL_LABELS, type ChannelType } from "@chatnova/shared";
import { DonutChart, LeadsChart, MessagesChart, type AnalyticsOverview } from "@/components/analytics/charts";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, statusTone } from "@/components/ui/card";
import { PageHeader, PageLoader, StatCard, Table, Tabs, Td, Th } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate, formatDuration } from "@/lib/utils";

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  facebook_lead_ad: "Facebook / Instagram ads",
  api: "REST API",
  manual: "Manual",
  test: "Test leads",
};

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

export default function AnalyticsPage() {
  const [range, setRange] = React.useState<(typeof RANGES)[number]["value"]>("30");
  const { data, isLoading } = useQuery({
    queryKey: ["analytics", Number(range)],
    queryFn: () => api<AnalyticsOverview>(`/api/analytics/overview?days=${range}`),
  });
  const t = data?.totals;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Analytics"
        description="Conversations, lead response and campaign performance"
        actions={<Tabs value={range} onChange={setRange} tabs={[...RANGES]} />}
      />

      {isLoading || !data || !t ? (
        <PageLoader />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Messages received" value={t.inbound.toLocaleString("en-IN")} icon={MessageSquare} />
            <StatCard label="Messages sent" value={t.outbound.toLocaleString("en-IN")} icon={MessagesSquare} />
            <StatCard
              label="Avg. first response"
              value={t.avgResponseSec != null ? formatDuration(t.avgResponseSec) : "—"}
              icon={Clock}
              hint="Agent reply time after a customer message"
            />
            <StatCard label="Leads" value={t.leads} icon={Target} hint={`${pct(t.qualifiedLeads, t.leads)} qualified or won`} />
            <StatCard label="New contacts" value={t.contactsNew} icon={UserPlus} hint={`${t.contactsTotal.toLocaleString("en-IN")} total`} />
            <StatCard label="Open conversations" value={t.openConversations} icon={TrendingUp} hint="Right now" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Message volume</CardTitle>
              <CardDescription>Received vs. sent per day (excluding internal notes)</CardDescription>
            </CardHeader>
            <CardContent>
              <MessagesChart data={data.daily} height={300} />
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Leads per day</CardTitle>
              </CardHeader>
              <CardContent>
                <LeadsChart data={data.daily} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Lead sources</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart data={data.leadSources.map((s) => ({ name: SOURCE_LABELS[s.source] ?? s.source, value: s.count }))} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Messages by channel</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart
                  data={data.channels.map((c) => ({ name: CHANNEL_LABELS[c.type as ChannelType] ?? c.type, value: c.c }))}
                />
              </CardContent>
            </Card>
            <div className="xl:col-span-2">
              <h3 className="mb-3 font-semibold">Recent campaigns</h3>
              <Table>
                <thead>
                  <tr>
                    <Th>Campaign</Th>
                    <Th>Recipients</Th>
                    <Th>Delivered</Th>
                    <Th>Read</Th>
                    <Th>Replied</Th>
                    <Th>Failed</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((c) => {
                    const total = c.total ?? 0;
                    return (
                      <tr key={c.id}>
                        <Td>
                          <Link href={`/dashboard/broadcasts/${c.id}`} className="font-medium hover:text-primary">
                            {c.name}
                          </Link>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                            {formatDate(c.createdAt)}
                          </div>
                        </Td>
                        <Td>{total}</Td>
                        <Td>{pct(c.funnelDelivered ?? 0, total)}</Td>
                        <Td>{pct(c.funnelRead ?? 0, total)}</Td>
                        <Td>{pct(c.replied ?? 0, total)}</Td>
                        <Td className={c.failed ? "text-red-600" : undefined}>{c.failed ?? 0}</Td>
                      </tr>
                    );
                  })}
                  {!data.campaigns.length && (
                    <tr>
                      <Td colSpan={6} className="py-10 text-center text-muted-foreground">
                        No campaigns in this period.
                      </Td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
