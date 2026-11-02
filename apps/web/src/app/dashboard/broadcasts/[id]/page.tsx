"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, statusTone } from "@/components/ui/card";
import { PageLoader, Table, Td, Th } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { canManage, useAuth } from "@/lib/auth";
import { useSocketEvent } from "@/lib/socket";
import { formatDate } from "@/lib/utils";

export default function BroadcastDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useAuth();
  const [filter, setFilter] = React.useState("");
  const data = useQuery({
    queryKey: ["broadcast", id, filter],
    queryFn: () => api(`/api/broadcasts/${id}${filter ? `?status=${filter}` : ""}`),
    refetchInterval: (q) => (q.state.data?.status === "sending" ? 3000 : 20_000),
  });
  useSocketEvent("broadcast:updated", () => data.refetch());

  const cancel = useMutation({
    mutationFn: () => api(`/api/broadcasts/${id}/cancel`, { method: "POST" }),
    onSuccess: () => data.refetch(),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (data.isLoading) return <PageLoader />;
  const b = data.data;
  const s = b.stats;
  const funnel = [
    { label: "Recipients", value: s.total, key: "" },
    { label: "Sent", value: s.funnelSent, key: "sent" },
    { label: "Delivered", value: s.funnelDelivered, key: "delivered" },
    { label: "Read", value: s.funnelRead, key: "read" },
    { label: "Replied", value: s.replied, key: "replied" },
    { label: "Failed", value: s.failed, key: "failed" },
  ];

  return (
    <div className="p-6">
      <Link href="/dashboard/broadcasts" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Broadcasts
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold">
            {b.name} <Badge tone={statusTone(b.status)}>{b.status}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {b.template?.name} via {b.channel.name} -{" "}
            {b.scheduledAt ? `scheduled for ${formatDate(b.scheduledAt)}` : `created ${formatDate(b.createdAt)}`}
          </p>
        </div>
        {canManage(workspace?.role) && ["scheduled", "sending"].includes(b.status) && (
          <Button variant="outline" onClick={() => cancel.mutate()} loading={cancel.isPending}>
            <Ban /> Cancel broadcast
          </Button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        {funnel.map((f) => (
          <button
            key={f.label}
            onClick={() => setFilter(f.key)}
            className={`rounded-xl border bg-white p-4 text-left ${filter === f.key ? "border-primary ring-2 ring-primary/20" : ""}`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{f.label}</p>
            <p className="mt-1 text-2xl font-bold">{f.value ?? 0}</p>
            {s.total > 0 && f.key && (
              <div className="mt-2 h-1.5 rounded-full bg-muted">
                <div
                  className={`h-1.5 rounded-full ${f.key === "failed" ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${Math.round(((f.value ?? 0) / s.total) * 100)}%` }}
                />
              </div>
            )}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recipients {filter && `(${filter})`}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>Contact</Th>
                <Th>Status</Th>
                <Th>Sent at</Th>
                <Th>Error</Th>
              </tr>
            </thead>
            <tbody>
              {b.recipients.map((r: any) => (
                <tr key={r.id}>
                  <Td>
                    <Link href={`/dashboard/contacts/${r.contact.id}`} className="font-medium hover:text-primary">
                      {r.contact.name || "Unknown"}
                    </Link>
                    <p className="text-xs text-muted-foreground">+{r.contact.phone}</p>
                  </Td>
                  <Td>
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </Td>
                  <Td className="text-muted-foreground">{formatDate(r.sentAt)}</Td>
                  <Td className="max-w-sm text-xs text-destructive">{r.error}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
