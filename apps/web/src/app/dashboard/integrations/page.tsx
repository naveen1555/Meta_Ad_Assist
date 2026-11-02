"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FileSpreadsheet, KeyRound, Plug, Plus, Send, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";
import { INTEGRATION_EVENTS } from "@chatnova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Switch } from "@/components/ui/input";
import { EmptyState, PageHeader, PageLoader, Tabs } from "@/components/ui/misc";
import { API_URL, api, errorMessage } from "@/lib/api";
import { canManage, useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

type Tab = "integrations" | "keys" | "docs";

const copy = (text: string) => {
  navigator.clipboard?.writeText(text);
  toast.success("Copied");
};

export default function IntegrationsPage() {
  const [tab, setTab] = React.useState<Tab>("integrations");
  return (
    <div className="p-6">
      <PageHeader title="Integrations" description="Send events to your tools and connect via the REST API" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "integrations", label: "Webhooks & Sheets" },
          { value: "keys", label: "API keys" },
          { value: "docs", label: "API reference" },
        ]}
      />
      <div className="mt-6">
        {tab === "integrations" && <IntegrationsTab />}
        {tab === "keys" && <ApiKeysTab />}
        {tab === "docs" && <DocsTab />}
      </div>
    </div>
  );
}

function IntegrationsTab() {
  const qc = useQueryClient();
  const { workspace } = useAuth();
  const manager = canManage(workspace?.role);
  const list = useQuery({ queryKey: ["integrations"], queryFn: () => api("/api/integrations") });
  const [editing, setEditing] = React.useState<any | null>(null);

  const action = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const test = useMutation({
    mutationFn: (id: string) => api(`/api/integrations/${id}/test`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Test event delivered");
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
  });

  if (list.isLoading) return <PageLoader />;
  const items: any[] = list.data?.items ?? [];

  return (
    <>
      {manager && (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          {[
            {
              type: "webhook",
              icon: Webhook,
              title: "Webhook / Zapier / Pabbly",
              text: "POST signed JSON to any URL when leads, contacts or messages arrive.",
            },
            {
              type: "google_sheets",
              icon: FileSpreadsheet,
              title: "Google Sheets",
              text: "Append a row to a spreadsheet for every new lead or contact.",
            },
          ].map((c) => (
            <button
              key={c.type}
              onClick={() =>
                setEditing({ type: c.type, name: c.title, events: ["lead.created"], active: true, config: { sheetName: "Sheet1" } })
              }
              className="flex gap-4 rounded-xl border bg-white p-5 text-left transition-colors hover:border-violet-300"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light">
                <c.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="flex items-center gap-2 font-semibold">
                  {c.title} <Plus className="h-4 w-4 text-primary" />
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{c.text}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {!items.length ? (
        <EmptyState icon={Plug} title="No integrations yet" description="Add a webhook or Google Sheet to sync leads automatically." />
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <Card key={i.id}>
              <CardContent className="flex flex-wrap items-center gap-4 pt-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light">
                  {i.type === "webhook" ? <Webhook className="h-5 w-5 text-primary" /> : <FileSpreadsheet className="h-5 w-5 text-primary" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{i.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {i.type === "webhook" ? i.config.url : `Sheet ${i.config.spreadsheetId} / ${i.config.sheetName}`}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {i.events.map((e: string) => (
                      <Badge key={e} tone="muted">
                        {e}
                      </Badge>
                    ))}
                  </div>
                  {i.lastError ? (
                    <p className="mt-1 text-xs text-destructive">Last error: {i.lastError}</p>
                  ) : i.lastRunAt ? (
                    <p className="mt-1 text-xs text-success">Last delivered {formatDate(i.lastRunAt)}</p>
                  ) : null}
                </div>
                {manager && (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={i.active}
                      onChange={(v) =>
                        action.mutate(() =>
                          api(`/api/integrations/${i.id}`, { method: "PUT", body: { type: i.type, name: i.name, events: i.events, config: i.config, active: v } }),
                        )
                      }
                    />
                    <Button size="sm" variant="outline" onClick={() => test.mutate(i.id)} loading={test.isPending && test.variables === i.id}>
                      <Send /> Test
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(i)}>
                      Edit
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => confirm(`Delete ${i.name}?`) && action.mutate(() => api(`/api/integrations/${i.id}`, { method: "DELETE" }))}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <IntegrationDialog
          value={editing}
          serviceAccount={list.data?.googleServiceAccountEmail}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function IntegrationDialog({ value, serviceAccount, onClose }: { value: any; serviceAccount?: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = React.useState(value);
  const isNew = !value.id;
  const save = useMutation({
    mutationFn: () =>
      api(isNew ? "/api/integrations" : `/api/integrations/${value.id}`, {
        method: isNew ? "POST" : "PUT",
        body: { type: form.type, name: form.name, events: form.events, active: form.active, config: form.config },
      }),
    onSuccess: () => {
      toast.success("Integration saved");
      qc.invalidateQueries({ queryKey: ["integrations"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setConfig = (patch: Record<string, string>) => setForm({ ...form, config: { ...form.config, ...patch } });

  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? "New integration" : "Edit integration"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        {form.type === "webhook" ? (
          <>
            <Field label="Endpoint URL" hint="Paste a Zapier / Pabbly / Make catch-hook URL or your own endpoint">
              <Input value={form.config.url ?? ""} onChange={(e) => setConfig({ url: e.target.value })} placeholder="https://hooks.zapier.com/..." />
            </Field>
            <Field label="Signing secret" hint="Requests include X-ChatNova-Signature: sha256=HMAC(secret, body). Leave empty to auto-generate.">
              <div className="flex gap-2">
                <Input value={form.config.secret ?? ""} onChange={(e) => setConfig({ secret: e.target.value })} />
                {form.config.secret && (
                  <Button variant="outline" size="icon" onClick={() => copy(form.config.secret)}>
                    <Copy />
                  </Button>
                )}
              </div>
            </Field>
          </>
        ) : (
          <>
            <div className="rounded-lg bg-violet-50 p-3 text-xs text-violet-900">
              Share your Google Sheet with{" "}
              {serviceAccount ? (
                <button className="font-semibold underline" onClick={() => copy(serviceAccount)}>
                  {serviceAccount}
                </button>
              ) : (
                <b>the server&apos;s service account (not configured yet)</b>
              )}{" "}
              as an Editor.
            </div>
            <Field label="Spreadsheet ID" hint="The long ID in the sheet URL between /d/ and /edit">
              <Input value={form.config.spreadsheetId ?? ""} onChange={(e) => setConfig({ spreadsheetId: e.target.value.trim() })} />
            </Field>
            <Field label="Sheet (tab) name">
              <Input value={form.config.sheetName ?? "Sheet1"} onChange={(e) => setConfig({ sheetName: e.target.value })} />
            </Field>
          </>
        )}
        <Field label="Events">
          <div className="space-y-2">
            {INTEGRATION_EVENTS.map((ev) => (
              <label key={ev} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.events.includes(ev)}
                  onChange={() =>
                    setForm({
                      ...form,
                      events: form.events.includes(ev) ? form.events.filter((x: string) => x !== ev) : [...form.events, ev],
                    })
                  }
                />
                <code>{ev}</code>
              </label>
            ))}
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

function ApiKeysTab() {
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => api<any[]>("/api/api-keys") });
  const [name, setName] = React.useState("");
  const [created, setCreated] = React.useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api<{ key: string }>("/api/api-keys", { body: { name } }),
    onSuccess: (r) => {
      setCreated(r.key);
      setName("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create API key</CardTitle>
          <CardDescription>Keys give full access to this workspace&apos;s API. Store them securely.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Zapier production" />
            <Button type="submit" loading={create.isPending}>
              <KeyRound /> Create
            </Button>
          </form>
          {created && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-xs font-semibold text-amber-800">Copy this key now - it won&apos;t be shown again.</p>
              <div className="flex gap-2">
                <Input readOnly value={created} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => copy(created)}>
                  <Copy />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="divide-y pt-5">
          {keys.data?.length === 0 && <p className="py-3 text-sm text-muted-foreground">No API keys yet.</p>}
          {keys.data?.map((k) => (
            <div key={k.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{k.name}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {k.prefix}... - last used {k.lastUsedAt ? formatDate(k.lastUsedAt) : "never"}
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => confirm("Revoke this key?") && remove.mutate(k.id)}>
                <Trash2 className="text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

const ENDPOINTS = [
  { method: "GET", path: "/v1/channels", body: null, text: "List connected channels" },
  { method: "GET", path: "/v1/contacts?phone=919876543210", body: null, text: "Find contacts by phone, email or tag" },
  {
    method: "POST",
    path: "/v1/contacts",
    body: { name: "Priya Sharma", phone: "+91 98765 43210", email: "priya@example.com", tags: ["webinar"], optIn: true },
    text: "Create or update a contact",
  },
  {
    method: "POST",
    path: "/v1/messages",
    body: { phone: "919876543210", template: { name: "lead_welcome", language: "en", params: ["{{name}}"] } },
    text: "Send a WhatsApp template (or { text } inside the 24-hour window)",
  },
  {
    method: "POST",
    path: "/v1/leads",
    body: { name: "Rahul", phone: "9876543210", source: "website", fields: { city: "Pune" } },
    text: "Push a lead from any source; runs your lead automation",
  },
  { method: "POST", path: "/v1/flows/{flowId}/run", body: { phone: "919876543210" }, text: "Start a chatbot flow for a number" },
];

function DocsTab() {
  return (
    <div className="max-w-4xl space-y-4">
      <Card>
        <CardContent className="space-y-2 pt-5 text-sm">
          <p>
            Base URL: <code className="rounded bg-muted px-1.5 py-0.5">{API_URL}</code>
          </p>
          <p>
            Authenticate with the header <code className="rounded bg-muted px-1.5 py-0.5">X-API-Key: cn_live_...</code>. Rate limit: 120
            requests per minute.
          </p>
          <p className="text-muted-foreground">
            Webhook events are POSTed as <code>{`{ event, workspaceId, timestamp, data }`}</code> with an{" "}
            <code>X-ChatNova-Signature</code> header.
          </p>
        </CardContent>
      </Card>
      {ENDPOINTS.map((e) => (
        <Card key={e.path + e.method}>
          <CardContent className="space-y-2 pt-5">
            <div className="flex items-center gap-2">
              <Badge tone={e.method === "GET" ? "success" : "coral"}>{e.method}</Badge>
              <code className="text-sm font-semibold">{e.path}</code>
            </div>
            <p className="text-sm text-muted-foreground">{e.text}</p>
            <pre className="overflow-x-auto rounded-lg bg-violet-950 p-4 text-xs text-violet-100">
              {`curl -X ${e.method} "${API_URL}${e.path}" \\\n  -H "X-API-Key: $CHATNOVA_KEY"${
                e.body ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(e.body)}'` : ""
              }`}
            </pre>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
