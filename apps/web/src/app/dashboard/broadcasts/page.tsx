"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/card";
import { EmptyState, PageHeader, PageLoader, Table, Td, Th } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { canManage, useAuth } from "@/lib/auth";
import { useSocketEvent } from "@/lib/socket";
import { formatDate } from "@/lib/utils";

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "-");

export default function BroadcastsPage() {
  const { workspace } = useAuth();
  const list = useQuery({ queryKey: ["broadcasts"], queryFn: () => api<any[]>("/api/broadcasts"), refetchInterval: 15_000 });
  useSocketEvent("broadcast:updated", () => list.refetch());

  return (
    <div className="p-6">
      <PageHeader
        title="Broadcasts"
        description="Send approved WhatsApp templates to segments of opted-in contacts"
        actions={
          canManage(workspace?.role) && (
            <Link href="/dashboard/broadcasts/new">
              <Button>
                <Plus /> New broadcast
              </Button>
            </Link>
          )
        }
      />
      {list.isLoading ? (
        <PageLoader />
      ) : !list.data?.length ? (
        <EmptyState
          icon={Megaphone}
          title="No broadcasts yet"
          description="Create your first campaign to reach opted-in contacts with a WhatsApp template."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Campaign</Th>
              <Th>Status</Th>
              <Th>Recipients</Th>
              <Th>Delivered</Th>
              <Th>Read</Th>
              <Th>Replied</Th>
              <Th>Failed</Th>
              <Th>Date</Th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((b) => (
              <tr key={b.id} className="hover:bg-muted/40">
                <Td>
                  <Link href={`/dashboard/broadcasts/${b.id}`} className="font-medium hover:text-primary">
                    {b.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {b.templateName} - {b.channel.name}
                  </p>
                </Td>
                <Td>
                  <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                </Td>
                <Td>{b.stats.total}</Td>
                <Td>{pct(b.stats.funnelDelivered, b.stats.total)}</Td>
                <Td>{pct(b.stats.funnelRead, b.stats.total)}</Td>
                <Td>{pct(b.stats.replied, b.stats.total)}</Td>
                <Td className={b.stats.failed ? "text-destructive" : ""}>{b.stats.failed}</Td>
                <Td className="whitespace-nowrap text-muted-foreground">{formatDate(b.scheduledAt ?? b.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
