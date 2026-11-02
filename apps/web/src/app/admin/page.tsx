"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, IndianRupee, MessageSquare, Search, ShieldAlert, Target, Users } from "lucide-react";
import { toast } from "sonner";
import { PLAN_LIST, type PlanId } from "@chatnova/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState, PageHeader, PageLoader, StatCard, Table, Tabs, Td, Th } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

interface AdminStats {
  workspaces: number;
  users: number;
  paying: number;
  messages30d: number;
  leads30d: number;
  revenue: { currency: string; amount: number }[];
  plans: { plan: string; count: number }[];
}

interface AdminWorkspace {
  id: string;
  name: string;
  plan: string;
  createdAt: string;
  subscription: { status: string; provider: string | null; currentPeriodEnd: string | null } | null;
  members: { user: { email: string; name: string } }[];
  _count: { members: number; contacts: number; channels: number; leads: number; messages: number };
}

interface ContactRequestDto {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  message: string;
  createdAt: string;
}

export default function AdminPage() {
  const { isSuperAdmin } = useAuth();
  const [tab, setTab] = React.useState<"workspaces" | "requests">("workspaces");
  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <EmptyState icon={ShieldAlert} title="Super admin only" description="Your email is not listed in SUPER_ADMIN_EMAILS." />
      </div>
    );
  }
  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Platform admin" description="All workspaces, plans and enquiries" />
      <Stats />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "workspaces", label: "Workspaces" },
          { value: "requests", label: "Contact requests" },
        ]}
      />
      {tab === "workspaces" ? <Workspaces /> : <Requests />}
    </div>
  );
}

function Stats() {
  const { data } = useQuery({ queryKey: ["admin", "stats"], queryFn: () => api<AdminStats>("/api/admin/stats") });
  if (!data) return null;
  const revenue = data.revenue.map((r) => r.amount.toLocaleString("en-IN", { style: "currency", currency: r.currency })).join(" + ");
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard label="Workspaces" value={data.workspaces} icon={Building2} hint={`${data.paying} paying`} />
      <StatCard label="Users" value={data.users} icon={Users} />
      <StatCard label="Messages (30d)" value={data.messages30d.toLocaleString("en-IN")} icon={MessageSquare} />
      <StatCard label="Leads (30d)" value={data.leads30d.toLocaleString("en-IN")} icon={Target} />
      <StatCard label="Lifetime revenue" value={revenue || "₹0"} icon={IndianRupee} />
    </div>
  );
}

function Workspaces() {
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [editing, setEditing] = React.useState<AdminWorkspace | null>(null);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "workspaces", debounced],
    queryFn: () => api<AdminWorkspace[]>(`/api/admin/workspaces?search=${encodeURIComponent(debounced)}`),
  });

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search name or owner email" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {isLoading ? (
        <PageLoader />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Workspace</Th>
              <Th>Plan</Th>
              <Th>Members</Th>
              <Th>Channels</Th>
              <Th>Contacts</Th>
              <Th>Leads</Th>
              <Th>Messages</Th>
              <Th>Created</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {data?.map((w) => (
              <tr key={w.id}>
                <Td>
                  <p className="font-medium">{w.name}</p>
                  <p className="text-xs text-muted-foreground">{w.members[0]?.user.email}</p>
                </Td>
                <Td>
                  <Badge tone={w.plan === "free" ? "muted" : "default"} className="capitalize">
                    {w.plan}
                  </Badge>
                  {w.subscription?.currentPeriodEnd && w.plan !== "free" && (
                    <p className="mt-1 text-xs text-muted-foreground">until {formatDate(w.subscription.currentPeriodEnd)}</p>
                  )}
                </Td>
                <Td>{w._count.members}</Td>
                <Td>{w._count.channels}</Td>
                <Td>{w._count.contacts.toLocaleString("en-IN")}</Td>
                <Td>{w._count.leads.toLocaleString("en-IN")}</Td>
                <Td>{w._count.messages.toLocaleString("en-IN")}</Td>
                <Td className="whitespace-nowrap">{formatDate(w.createdAt)}</Td>
                <Td>
                  <Button size="sm" variant="outline" onClick={() => setEditing(w)}>
                    Change plan
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <PlanDialog workspace={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function PlanDialog({ workspace, onClose }: { workspace: AdminWorkspace | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [plan, setPlan] = React.useState<PlanId>("starter");
  const [days, setDays] = React.useState("30");
  React.useEffect(() => {
    if (workspace) setPlan((workspace.plan as PlanId) || "free");
  }, [workspace]);
  const save = useMutation({
    mutationFn: () => api(`/api/admin/workspaces/${workspace!.id}`, { method: "PATCH", body: { plan, days: Number(days) || 30 } }),
    onSuccess: () => {
      toast.success("Plan updated");
      qc.invalidateQueries({ queryKey: ["admin"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={Boolean(workspace)}
      onClose={onClose}
      title={`Change plan · ${workspace?.name ?? ""}`}
      description="Grants the plan without a payment (e.g. for trials or offline invoices)."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Plan">
          <Select value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}>
            {PLAN_LIST.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        {plan !== "free" && (
          <Field label="Duration (days)">
            <Input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

function Requests() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "requests"],
    queryFn: () => api<ContactRequestDto[]>("/api/admin/contact-requests"),
  });
  if (isLoading) return <PageLoader />;
  return (
    <Table>
      <thead>
        <tr>
          <Th>From</Th>
          <Th>Company</Th>
          <Th>Message</Th>
          <Th>Received</Th>
        </tr>
      </thead>
      <tbody>
        {data?.map((r) => (
          <tr key={r.id}>
            <Td>
              <p className="font-medium">{r.name}</p>
              <a href={`mailto:${r.email}`} className="text-xs text-primary hover:underline">
                {r.email}
              </a>
              {r.phone && <p className="text-xs text-muted-foreground">{r.phone}</p>}
            </Td>
            <Td>{r.company || "—"}</Td>
            <Td className="max-w-md whitespace-pre-wrap text-sm">{r.message}</Td>
            <Td className="whitespace-nowrap">{formatDate(r.createdAt)}</Td>
          </tr>
        ))}
        {!data?.length && (
          <tr>
            <Td colSpan={4} className="py-10 text-center text-muted-foreground">
              No enquiries yet.
            </Td>
          </tr>
        )}
      </tbody>
    </Table>
  );
}
