"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, MessageSquare, Search, Target, Zap } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_LEAD_SETTINGS, type LeadSettings } from "@chatnova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/input";
import { EmptyState, PageHeader, PageLoader, Table, Tabs, Td, Th } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { canManage, useAuth } from "@/lib/auth";
import { useChannels, useMembers, useTemplates } from "@/lib/hooks";
import { formatDate } from "@/lib/utils";

const STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;

export default function LeadsPage() {
  const [tab, setTab] = React.useState<"leads" | "automation">("leads");
  const [testOpen, setTestOpen] = React.useState(false);
  return (
    <div className="p-6">
      <PageHeader
        title="Lead Ads"
        description="Leads from Facebook and Instagram instant forms, answered on WhatsApp automatically"
        actions={
          <Button variant="outline" onClick={() => setTestOpen(true)}>
            <FlaskConical /> Send test lead
          </Button>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "leads", label: "Leads" },
          { value: "automation", label: "Instant reply automation" },
        ]}
      />
      <div className="mt-6">{tab === "leads" ? <LeadsList /> : <AutomationSettings />}</div>
      <TestLeadDialog open={testOpen} onClose={() => setTestOpen(false)} />
    </div>
  );
}

function LeadsList() {
  const qc = useQueryClient();
  const [status, setStatus] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const leads = useQuery({
    queryKey: ["leads", status, debounced],
    queryFn: () =>
      api(`/api/leads?${new URLSearchParams({ ...(status ? { status } : {}), ...(debounced ? { search: debounced } : {}) })}`),
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/api/leads/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const counts: Record<string, number> = leads.data?.counts ?? {};

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(status === s ? "" : s)}
            className={`rounded-xl border bg-white p-4 text-left transition-colors ${status === s ? "border-primary ring-2 ring-primary/20" : "hover:border-violet-300"}`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s}</p>
            <p className="mt-1 text-2xl font-bold">{counts[s] ?? 0}</p>
          </button>
        ))}
      </div>
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads" className="pl-9" />
      </div>
      {leads.isLoading ? (
        <PageLoader />
      ) : !leads.data?.items.length ? (
        <EmptyState
          icon={Target}
          title="No leads yet"
          description="Connect your Facebook page on the Channels page. New Lead Ads submissions will appear here instantly."
          action={
            <Link href="/dashboard/channels">
              <Button>Connect Facebook page</Button>
            </Link>
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Lead</Th>
              <Th>Source</Th>
              <Th>Answers</Th>
              <Th>Status</Th>
              <Th>Received</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {leads.data.items.map((l: any) => (
              <tr key={l.id} className="hover:bg-muted/40">
                <Td>
                  <Link href={`/dashboard/contacts/${l.contact.id}`} className="font-medium hover:text-primary">
                    {l.contact.name || "Unknown"}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {l.contact.phone ? `+${l.contact.phone}` : ""} {l.contact.email ?? ""}
                  </p>
                </Td>
                <Td>
                  <Badge tone={l.source === "facebook_lead_ad" ? "default" : "muted"}>{l.source.replace(/_/g, " ")}</Badge>
                  {l.fields?.campaign_name && <p className="mt-1 text-xs text-muted-foreground">{l.fields.campaign_name}</p>}
                </Td>
                <Td className="max-w-xs">
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {Object.entries(l.fields ?? {})
                      .filter(([k]) => !["full_name", "phone_number", "email", "campaign_name", "ad_name"].includes(k))
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" - ") || "-"}
                  </p>
                </Td>
                <Td>
                  <Select
                    className="h-8 w-32 text-xs"
                    value={l.status}
                    onChange={(e) => update.mutate({ id: l.id, status: e.target.value })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">{formatDate(l.createdAt)}</Td>
                <Td>
                  {l.contact.conversations?.[0] && (
                    <Link href={`/dashboard/inbox?c=${l.contact.conversations[0].id}`}>
                      <Button size="sm" variant="secondary">
                        <MessageSquare /> Chat
                      </Button>
                    </Link>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

function AutomationSettings() {
  const qc = useQueryClient();
  const { workspace } = useAuth();
  const manager = canManage(workspace?.role);
  const settings = useQuery({ queryKey: ["lead-settings"], queryFn: () => api<LeadSettings>("/api/workspace/lead-settings") });
  const channels = useChannels();
  const members = useMembers();
  const [form, setForm] = React.useState<LeadSettings>(DEFAULT_LEAD_SETTINGS);
  const templates = useTemplates(form.channelId, true);
  const template = templates.data?.find((t) => t.id === form.templateId);

  React.useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  React.useEffect(() => {
    if (template && form.variables.length !== template.variableCount) {
      setForm((f) => ({
        ...f,
        variables: Array.from({ length: template.variableCount }, (_, i) => f.variables[i] ?? (i === 0 ? "{{name}}" : "")),
      }));
    }
  }, [template, form.variables.length]);

  const save = useMutation({
    mutationFn: () => api("/api/workspace/lead-settings", { method: "PUT", body: form }),
    onSuccess: () => {
      toast.success("Automation saved");
      qc.invalidateQueries({ queryKey: ["lead-settings"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (settings.isLoading) return <PageLoader />;
  const waChannels = channels.data?.filter((c) => c.type === "WHATSAPP") ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-coral-500" /> Instant WhatsApp reply
              </CardTitle>
              <CardDescription>Send an approved template the moment a new lead arrives</CardDescription>
            </div>
            <Switch checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} disabled={!manager} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="WhatsApp channel">
              <Select
                value={form.channelId ?? ""}
                onChange={(e) => setForm({ ...form, channelId: e.target.value || null, templateId: null })}
              >
                <option value="">Select channel</option>
                {waChannels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phoneNumber ? `(${c.phoneNumber})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Template">
              <Select
                value={form.templateId ?? ""}
                onChange={(e) => setForm({ ...form, templateId: e.target.value || null })}
                disabled={!form.channelId}
              >
                <option value="">Select approved template</option>
                {templates.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {template && (
            <div className="space-y-3 rounded-xl bg-violet-50 p-4">
              <p className="whitespace-pre-wrap text-sm">{template.bodyText}</p>
              {form.variables.map((v, i) => (
                <Field
                  key={i}
                  label={`Variable {{${i + 1}}}`}
                  hint="Use {{name}}, {{phone}}, {{email}} or a form answer like {{lead.city}}"
                >
                  <Input
                    value={v}
                    onChange={(e) => setForm({ ...form, variables: form.variables.map((x, j) => (j === i ? e.target.value : x)) })}
                  />
                </Field>
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Assign new leads">
              <Select value={form.assignMode} onChange={(e) => setForm({ ...form, assignMode: e.target.value as LeadSettings["assignMode"] })}>
                <option value="none">Leave unassigned</option>
                <option value="round_robin">Round robin across team</option>
                <option value="user">Always to one person</option>
              </Select>
            </Field>
            {form.assignMode === "user" && (
              <Field label="Assignee">
                <Select value={form.assigneeId ?? ""} onChange={(e) => setForm({ ...form, assigneeId: e.target.value || null })}>
                  <option value="">Select member</option>
                  {members.data?.members.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Default country code" hint="Added to 10-digit numbers without a country code">
              <Input
                value={form.defaultCountryCode}
                onChange={(e) => setForm({ ...form, defaultCountryCode: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              />
            </Field>
            <Field label="Tags for new leads" hint="Comma separated">
              <Input
                value={form.tags.join(", ")}
                onChange={(e) => setForm({ ...form, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
              />
            </Field>
          </div>
          {manager && (
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              Save automation
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-3 pl-4 text-sm text-muted-foreground">
            <li>Connect your Facebook page (with Lead Ads permissions) on the Channels page.</li>
            <li>Connect a WhatsApp number and sync or create an approved utility/marketing template.</li>
            <li>Choose the template and how leads are assigned, then enable the automation.</li>
            <li>
              Optionally build a chatbot flow with the <b>New lead</b> trigger to qualify leads after the first message.
            </li>
            <li>Use &quot;Send test lead&quot; with your own number to try it end to end.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function TestLeadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = React.useState({ name: "", phone: "", email: "" });
  const run = useMutation({
    mutationFn: () => api("/api/leads/test", { body: form }),
    onSuccess: () => {
      toast.success("Test lead created - check the inbox for the instant reply");
      qc.invalidateQueries({ queryKey: ["leads"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Send a test lead"
      description="Simulates a Lead Ads submission and runs your automation."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => run.mutate()} loading={run.isPending}>
            Create test lead
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="WhatsApp number" hint="Use your own number to receive the template">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Email (optional)">
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
      </div>
    </Dialog>
  );
}
