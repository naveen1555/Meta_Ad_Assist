"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/input";
import { EmptyState, PageHeader, PageLoader } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { canManage, useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/utils";

const TRIGGERS = [
  { value: "keyword", label: "Keyword", hint: "Starts when a contact sends one of your keywords" },
  { value: "new_conversation", label: "New conversation", hint: "Welcome flow for first-time messages" },
  { value: "lead", label: "New Meta lead", hint: "Runs after a Lead Ads submission (start with a template)" },
  { value: "manual", label: "Manual", hint: "Started by an agent or via the API" },
];

export default function FlowsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { workspace } = useAuth();
  const manager = canManage(workspace?.role);
  const flows = useQuery({ queryKey: ["flows"], queryFn: () => api<any[]>("/api/flows") });
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [trigger, setTrigger] = React.useState("keyword");

  const create = useMutation({
    mutationFn: () => api<{ id: string }>("/api/flows", { body: { name, triggerType: trigger } }),
    onSuccess: (f) => router.push(`/dashboard/flows/${f.id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const action = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flows"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="p-6">
      <PageHeader
        title="Chatbot flows"
        description="Automate replies, qualify leads and hand over to your team"
        actions={
          manager && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> New flow
            </Button>
          )
        }
      />
      {flows.isLoading ? (
        <PageLoader />
      ) : !flows.data?.length ? (
        <EmptyState icon={Bot} title="No flows yet" description="Build your first chatbot with the drag-and-drop editor." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flows.data.map((f) => (
            <Card key={f.id} className="transition-shadow hover:shadow-md">
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/dashboard/flows/${f.id}`} className="min-w-0">
                    <p className="truncate font-semibold hover:text-primary">{f.name}</p>
                    <p className="text-xs text-muted-foreground">Edited {timeAgo(f.updatedAt)} ago</p>
                  </Link>
                  <Switch
                    checked={f.active}
                    disabled={!manager}
                    onChange={(v) => action.mutate(() => api(`/api/flows/${f.id}/toggle`, { body: { active: v } }))}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="coral">{TRIGGERS.find((t) => t.value === f.triggerType)?.label}</Badge>
                  {f.keywords.slice(0, 4).map((k: string) => (
                    <Badge key={k} tone="muted">
                      {k}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {f.runs} runs - {f.completed} completed
                  </span>
                  {manager && (
                    <div className="flex">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Duplicate"
                        onClick={() => action.mutate(() => api(`/api/flows/${f.id}/duplicate`, { method: "POST" }))}
                      >
                        <Copy />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          confirm(`Delete ${f.name}?`) && action.mutate(() => api(`/api/flows/${f.id}`, { method: "DELETE" }))
                        }
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New chatbot flow"
        footer={
          <Button onClick={() => create.mutate()} disabled={!name} loading={create.isPending}>
            Create and open builder
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lead qualification" />
          </Field>
          <Field label="Trigger" hint={TRIGGERS.find((t) => t.value === trigger)?.hint}>
            <Select value={trigger} onChange={(e) => setTrigger(e.target.value)}>
              {TRIGGERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
