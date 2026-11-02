"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CHANNEL_LABELS } from "@chatnova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, statusTone } from "@/components/ui/card";
import { Field, Input, Select, Switch } from "@/components/ui/input";
import { Avatar, PageLoader } from "@/components/ui/misc";
import { ChannelIcon } from "@/components/dashboard/channel-icon";
import { api, errorMessage } from "@/lib/api";
import { useChannels } from "@/lib/hooks";
import { formatDate, timeAgo } from "@/lib/utils";

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const channels = useChannels();
  const contact = useQuery({ queryKey: ["contact", id], queryFn: () => api(`/api/contacts/${id}`) });
  const fields = useQuery({ queryKey: ["custom-fields"], queryFn: () => api<any[]>("/api/custom-fields") });
  const [form, setForm] = React.useState<any>(null);
  const [channelId, setChannelId] = React.useState("");

  React.useEffect(() => {
    if (contact.data) {
      setForm({
        name: contact.data.name ?? "",
        phone: contact.data.phone ?? "",
        email: contact.data.email ?? "",
        tags: contact.data.tags.join(", "),
        optIn: contact.data.optIn,
        customFields: contact.data.customFields ?? {},
      });
    }
  }, [contact.data]);

  const save = useMutation({
    mutationFn: () =>
      api(`/api/contacts/${id}`, {
        method: "PATCH",
        body: {
          name: form.name || null,
          phone: form.phone || null,
          email: form.email || null,
          optIn: form.optIn,
          tags: form.tags.split(",").map((t: string) => t.trim()).filter(Boolean),
          customFields: form.customFields,
        },
      }),
    onSuccess: () => {
      toast.success("Contact saved");
      qc.invalidateQueries({ queryKey: ["contact", id] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => api(`/api/contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => router.push("/dashboard/contacts"),
  });

  const start = useMutation({
    mutationFn: () => api<{ id: string }>("/api/conversations/start", { body: { contactId: id, channelId } }),
    onSuccess: (c) => router.push(`/dashboard/inbox?c=${c.id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (contact.isLoading || !form) return <PageLoader />;
  const c = contact.data;

  return (
    <div className="p-6">
      <Link href="/dashboard/contacts" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Contacts
      </Link>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={c.name || c.phone} className="h-14 w-14 text-lg" />
          <div>
            <h1 className="text-2xl font-bold">{c.name || "Unknown contact"}</h1>
            <p className="text-sm text-muted-foreground">
              Added {formatDate(c.createdAt)} from {c.source || "-"}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => confirm("Delete this contact and all conversations?") && remove.mutate()}>
          <Trash2 className="text-destructive" /> Delete
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="WhatsApp number">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Tags" hint="Comma separated">
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </Field>
              {fields.data?.map((f) => (
                <Field key={f.id} label={f.label}>
                  <Input
                    type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                    value={form.customFields[f.key] ?? ""}
                    onChange={(e) => setForm({ ...form, customFields: { ...form.customFields, [f.key]: e.target.value } })}
                  />
                </Field>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/60 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Marketing opt-in</p>
                <p className="text-xs text-muted-foreground">Only opted-in contacts receive broadcasts by default</p>
              </div>
              <Switch checked={form.optIn} onChange={(v) => setForm({ ...form, optIn: v })} />
            </div>
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              Save changes
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {c.conversations.map((conv: any) => (
                <Link
                  key={conv.id}
                  href={`/dashboard/inbox?c=${conv.id}`}
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
                >
                  <ChannelIcon type={conv.channel.type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{conv.channel.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {CHANNEL_LABELS[conv.channel.type as keyof typeof CHANNEL_LABELS]} - {timeAgo(conv.lastMessageAt)}
                    </p>
                  </div>
                  <Badge tone={conv.status === "OPEN" ? "success" : "muted"}>{conv.status.toLowerCase()}</Badge>
                </Link>
              ))}
              <div className="flex gap-2">
                <Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                  <option value="">Start chat on...</option>
                  {channels.data?.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {CHANNEL_LABELS[ch.type]} - {ch.name}
                    </option>
                  ))}
                </Select>
                <Button size="icon" disabled={!channelId} onClick={() => start.mutate()} loading={start.isPending}>
                  {!start.isPending && <MessageSquare />}
                </Button>
              </div>
            </CardContent>
          </Card>

          {c.leads.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Leads</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {c.leads.map((l: any) => (
                  <div key={l.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{l.source.replace(/_/g, " ")}</span>
                      <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(l.createdAt)}</p>
                    <dl className="mt-2 space-y-0.5 text-xs">
                      {Object.entries(l.fields ?? {}).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{k}</dt>
                          <dd className="truncate">{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l border-violet-200 pl-4">
                {c.activities.map((a: any) => (
                  <li key={a.id}>
                    <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-violet-500" />
                    <p className="text-sm">{a.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</p>
                  </li>
                ))}
                {c.activities.length === 0 && <p className="text-sm text-muted-foreground">No activity yet</p>}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
