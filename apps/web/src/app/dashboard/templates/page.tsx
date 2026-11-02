"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, statusTone } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, PageHeader, PageLoader } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { canManage, useAuth } from "@/lib/auth";
import { useChannels, useTemplates } from "@/lib/hooks";

export default function TemplatesPage() {
  const qc = useQueryClient();
  const { workspace } = useAuth();
  const manager = canManage(workspace?.role);
  const channels = useChannels();
  const waChannels = channels.data?.filter((c) => c.type === "WHATSAPP") ?? [];
  const [channelId, setChannelId] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const activeChannel = channelId || waChannels[0]?.id || "";
  const templates = useTemplates(activeChannel || null);

  const sync = useMutation({
    mutationFn: () => api<{ synced: number }>("/api/templates/sync", { body: { channelId: activeChannel } }),
    onSuccess: (r) => {
      toast.success(`Synced ${r.synced} templates from Meta`);
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (channels.isLoading) return <PageLoader />;
  if (!waChannels.length) {
    return (
      <div className="p-6">
        <PageHeader title="Message templates" />
        <EmptyState icon={FileText} title="Connect WhatsApp first" description="Templates belong to a WhatsApp Business Account." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Message templates"
        description="Pre-approved WhatsApp messages for broadcasts, lead replies and re-opening conversations"
        actions={
          <>
            <Select value={activeChannel} onChange={(e) => setChannelId(e.target.value)} className="w-56">
              {waChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {manager && (
              <>
                <Button variant="outline" onClick={() => sync.mutate()} loading={sync.isPending}>
                  <RefreshCw /> Sync from Meta
                </Button>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus /> New template
                </Button>
              </>
            )}
          </>
        }
      />
      {templates.isLoading ? (
        <PageLoader />
      ) : !templates.data?.length ? (
        <EmptyState icon={FileText} title="No templates yet" description="Sync existing templates from Meta or submit a new one for approval." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.data.map((t) => (
            <Card key={t.id}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.language} - {t.category.toLowerCase()}
                    </p>
                  </div>
                  <Badge tone={statusTone(t.status)}>{t.status.toLowerCase()}</Badge>
                </div>
                <div className="chat-pattern rounded-xl p-3">
                  <div className="rounded-xl rounded-tl-sm bg-white p-3 text-sm shadow-sm">
                    {t.components.find((c) => c.type === "HEADER")?.text && (
                      <p className="mb-1 font-semibold">{t.components.find((c) => c.type === "HEADER")?.text}</p>
                    )}
                    {t.headerFormat && t.headerFormat !== "TEXT" && (
                      <p className="mb-2 rounded bg-muted px-2 py-6 text-center text-xs text-muted-foreground">{t.headerFormat} header</p>
                    )}
                    <p className="whitespace-pre-wrap">{t.bodyText}</p>
                    {t.components.find((c) => c.type === "FOOTER")?.text && (
                      <p className="mt-1 text-xs text-muted-foreground">{t.components.find((c) => c.type === "FOOTER")?.text}</p>
                    )}
                  </div>
                  {t.components
                    .find((c) => c.type === "BUTTONS")
                    ?.buttons?.map((b: any, i: number) => (
                      <div key={i} className="mt-1 rounded-lg bg-white py-1.5 text-center text-xs font-medium text-sky-600 shadow-sm">
                        {b.text}
                      </div>
                    ))}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t.variableCount} variable(s)</span>
                  {manager && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => confirm(`Delete template ${t.name} from Meta?`) && remove.mutate(t.id)}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <CreateTemplateDialog open={createOpen} onClose={() => setCreateOpen(false)} channelId={activeChannel} />
    </div>
  );
}

type ButtonDraft = { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phone_number?: string };

function CreateTemplateDialog({ open, onClose, channelId }: { open: boolean; onClose: () => void; channelId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = React.useState({
    name: "",
    language: "en",
    category: "MARKETING",
    headerText: "",
    body: "Hi {{1}}, thanks for your interest! How can we help you today?",
    footer: "",
  });
  const [examples, setExamples] = React.useState<string[]>(["Priya"]);
  const [buttons, setButtons] = React.useState<ButtonDraft[]>([]);
  const varCount = new Set(form.body.match(/\{\{(\d+)\}\}/g) ?? []).size;

  React.useEffect(() => {
    setExamples((ex) => Array.from({ length: varCount }, (_, i) => ex[i] ?? ""));
  }, [varCount]);

  const create = useMutation({
    mutationFn: () =>
      api("/api/templates", {
        body: {
          channelId,
          ...form,
          headerText: form.headerText || undefined,
          footer: form.footer || undefined,
          examples,
          buttons,
        },
      }),
    onSuccess: () => {
      toast.success("Template submitted to Meta for review");
      qc.invalidateQueries({ queryKey: ["templates"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="max-w-2xl"
      title="New WhatsApp template"
      description="Meta usually reviews templates within minutes. Use {{1}}, {{2}} for variables."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} loading={create.isPending}>
            Submit for approval
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name" className="sm:col-span-3">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
              placeholder="lead_welcome"
            />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
              <option value="AUTHENTICATION">Authentication</option>
            </Select>
          </Field>
          <Field label="Language">
            <Select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
              {[
                ["en", "English"],
                ["en_US", "English (US)"],
                ["en_GB", "English (UK)"],
                ["hi", "Hindi"],
                ["ta", "Tamil"],
                ["te", "Telugu"],
                ["kn", "Kannada"],
                ["ml", "Malayalam"],
                ["mr", "Marathi"],
                ["bn", "Bengali"],
                ["ar", "Arabic"],
                ["es", "Spanish"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Header (optional)">
            <Input value={form.headerText} onChange={(e) => setForm({ ...form, headerText: e.target.value })} maxLength={60} />
          </Field>
        </div>
        <Field label="Body">
          <Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={1024} />
        </Field>
        {examples.map((ex, i) => (
          <Field key={i} label={`Example for {{${i + 1}}}`}>
            <Input value={ex} onChange={(e) => setExamples(examples.map((x, j) => (j === i ? e.target.value : x)))} />
          </Field>
        ))}
        <Field label="Footer (optional)">
          <Input value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })} maxLength={60} />
        </Field>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Buttons</span>
            <Select
              className="h-8 w-44 text-xs"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                setButtons([...buttons, { type: e.target.value as ButtonDraft["type"], text: "" }]);
              }}
            >
              <option value="">+ Add button</option>
              <option value="QUICK_REPLY">Quick reply</option>
              <option value="URL">Visit website</option>
              <option value="PHONE_NUMBER">Call phone</option>
            </Select>
          </div>
          <div className="space-y-2">
            {buttons.map((b, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="Button text"
                  value={b.text}
                  maxLength={25}
                  onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                />
                {b.type === "URL" && (
                  <Input
                    placeholder="https://"
                    value={b.url ?? ""}
                    onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                  />
                )}
                {b.type === "PHONE_NUMBER" && (
                  <Input
                    placeholder="+919876543210"
                    value={b.phone_number ?? ""}
                    onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, phone_number: e.target.value } : x)))}
                  />
                )}
                <Button size="icon" variant="ghost" onClick={() => setButtons(buttons.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
