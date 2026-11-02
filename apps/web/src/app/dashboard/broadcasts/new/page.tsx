"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Switch } from "@/components/ui/input";
import { Badge } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { useChannels, useTags, useTemplates } from "@/lib/hooks";

export default function NewBroadcastPage() {
  const router = useRouter();
  const channels = useChannels();
  const tags = useTags();
  const waChannels = channels.data?.filter((c) => c.type === "WHATSAPP") ?? [];
  const [name, setName] = React.useState("");
  const [channelId, setChannelId] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  const [variables, setVariables] = React.useState<string[]>([]);
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [optInOnly, setOptInOnly] = React.useState(true);
  const [schedule, setSchedule] = React.useState(false);
  const [scheduledAt, setScheduledAt] = React.useState("");

  const activeChannel = channelId || waChannels[0]?.id || "";
  const templates = useTemplates(activeChannel || null, true);
  const template = templates.data?.find((t) => t.id === templateId);

  React.useEffect(() => {
    if (template) setVariables(Array.from({ length: template.variableCount }, (_, i) => (i === 0 ? "{{name}}" : "")));
  }, [template]);

  const audience = useQuery({
    queryKey: ["audience-count", selectedTags, optInOnly],
    queryFn: () =>
      api<{ count: number }>("/api/broadcasts/audience-count", { body: { tags: selectedTags, optInOnly } }),
  });

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/broadcasts", {
        body: {
          name,
          channelId: activeChannel,
          templateId,
          variables,
          audience: { tags: selectedTags, optInOnly },
          scheduledAt: schedule && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        },
      }),
    onSuccess: (b) => {
      toast.success(schedule ? "Broadcast scheduled" : "Broadcast started");
      router.push(`/dashboard/broadcasts/${b.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const preview = template?.bodyText?.replace(/\{\{(\d+)\}\}/g, (_m, i) => variables[Number(i) - 1] || `{{${i}}}`);

  return (
    <div className="p-6">
      <Link href="/dashboard/broadcasts" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Broadcasts
      </Link>
      <h1 className="mb-6 text-2xl font-bold">New broadcast</h1>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>1. Message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Campaign name">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali offer - Nov 2026" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="WhatsApp channel">
                  <Select
                    value={activeChannel}
                    onChange={(e) => {
                      setChannelId(e.target.value);
                      setTemplateId("");
                    }}
                  >
                    {waChannels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Approved template">
                  <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    <option value="">Select template</option>
                    {templates.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.language})
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {variables.map((v, i) => (
                <Field key={i} label={`Variable {{${i + 1}}}`} hint="Personalise with {{name}}, {{phone}}, {{email}} or {{field.key}}">
                  <Input value={v} onChange={(e) => setVariables(variables.map((x, j) => (j === i ? e.target.value : x)))} />
                </Field>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>2. Audience</CardTitle>
              <CardDescription>Contacts with a phone number matching any selected tag. No tags means everyone.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {tags.data?.length === 0 && <p className="text-sm text-muted-foreground">No tags yet</p>}
                {tags.data?.map((t) => {
                  const on = selectedTags.includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => setSelectedTags(on ? selectedTags.filter((x) => x !== t) : [...selectedTags, t])}
                      className={`rounded-full border px-3 py-1 text-sm ${on ? "border-primary bg-primary text-white" : "hover:border-violet-300"}`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/60 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Opted-in contacts only</p>
                  <p className="text-xs text-muted-foreground">Recommended to stay compliant with WhatsApp policy</p>
                </div>
                <Switch checked={optInOnly} onChange={setOptInOnly} />
              </div>
              <p className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-primary" />
                <b>{audience.data?.count ?? "..."}</b> recipients
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>3. Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch checked={schedule} onChange={setSchedule} />
                <span className="text-sm">Schedule for later</span>
              </div>
              {schedule && (
                <Field label="Send at (your local time)">
                  <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                </Field>
              )}
              <Button
                variant="accent"
                size="lg"
                disabled={!name || !templateId || !audience.data?.count || (schedule && !scheduledAt)}
                loading={create.isPending}
                onClick={() => confirm(`Send to ${audience.data?.count} contacts?`) && create.mutate()}
              >
                <Send /> {schedule ? "Schedule broadcast" : "Send now"}
              </Button>
            </CardContent>
          </Card>
        </div>
        <div>
          <div className="sticky top-6 rounded-[2rem] border-8 border-violet-950 bg-white shadow-xl">
            <div className="rounded-t-[1.4rem] bg-violet-800 px-4 py-3 text-sm font-semibold text-white">Preview</div>
            <div className="chat-pattern min-h-[300px] rounded-b-[1.4rem] p-4">
              {template ? (
                <div className="rounded-xl rounded-tl-sm bg-white p-3 text-sm shadow-sm">
                  <p className="whitespace-pre-wrap">{preview}</p>
                  <Badge tone="muted" className="mt-2">
                    {template.category.toLowerCase()}
                  </Badge>
                </div>
              ) : (
                <p className="pt-20 text-center text-sm text-muted-foreground">Choose a template to preview</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
