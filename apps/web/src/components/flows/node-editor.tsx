"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { FLOW_NODE_META, type FlowNodeData, type FlowNodeType, type FlowOption } from "@chatnova/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useMembers, useTemplates } from "@/lib/hooks";

const uid = () => Math.random().toString(36).slice(2, 8);

function OptionsEditor({
  options,
  max,
  withDescription,
  onChange,
}: {
  options: FlowOption[];
  max: number;
  withDescription?: boolean;
  onChange: (o: FlowOption[]) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((o, i) => (
        <div key={o.id} className="space-y-1 rounded-lg border p-2">
          <div className="flex gap-1">
            <Input
              className="h-8 text-xs"
              value={o.title}
              maxLength={withDescription ? 24 : 20}
              placeholder={`Option ${i + 1}`}
              onChange={(e) => onChange(options.map((x) => (x.id === o.id ? { ...x, title: e.target.value } : x)))}
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onChange(options.filter((x) => x.id !== o.id))}>
              <X />
            </Button>
          </div>
          {withDescription && (
            <Input
              className="h-8 text-xs"
              value={o.description ?? ""}
              maxLength={72}
              placeholder="Description (optional)"
              onChange={(e) => onChange(options.map((x) => (x.id === o.id ? { ...x, description: e.target.value } : x)))}
            />
          )}
        </div>
      ))}
      {options.length < max && (
        <Button size="sm" variant="outline" onClick={() => onChange([...options, { id: uid(), title: "" }])}>
          <Plus /> Add option
        </Button>
      )}
      <p className="text-[11px] text-muted-foreground">Connect each option to the next step on the canvas.</p>
    </div>
  );
}

export function NodeEditor({
  type,
  data,
  onChange,
  onDelete,
}: {
  type: FlowNodeType;
  data: FlowNodeData;
  onChange: (data: FlowNodeData) => void;
  onDelete: () => void;
}) {
  const set = (patch: Partial<FlowNodeData>) => onChange({ ...data, ...patch });
  const templates = useTemplates(null, true);
  const members = useMembers();
  const fields = useQuery({ queryKey: ["custom-fields"], queryFn: () => api<any[]>("/api/custom-fields") });
  const [uploading, setUploading] = React.useState(false);
  const template = templates.data?.find((t) => t.id === data.templateId);

  React.useEffect(() => {
    if (type === "template" && template && (data.variables?.length ?? 0) !== template.variableCount) {
      onChange({
        ...data,
        label: template.name,
        variables: Array.from({ length: template.variableCount }, (_, i) => data.variables?.[i] ?? (i === 0 ? "{{name}}" : "")),
      });
    }
  }, [type, template, data, onChange]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api<{ url: string; mediaType: FlowNodeData["mediaType"] }>("/api/media", { formData: fd });
      set({ mediaUrl: r.url, mediaType: r.mediaType });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  const textHint = "Personalise with {{name}}, {{phone}}, {{field.key}} or {{var.answer}}";

  return (
    <div className="space-y-4">
      <div>
        <p className="font-semibold">{FLOW_NODE_META[type].label}</p>
        <p className="text-xs text-muted-foreground">{FLOW_NODE_META[type].description}</p>
      </div>

      {type === "start" && (
        <p className="rounded-lg bg-violet-50 p-3 text-xs text-violet-800">
          Configure the trigger (keywords, new conversation, new lead or manual) in the top bar.
        </p>
      )}

      {type === "message" && (
        <>
          <Field label="Message" hint={textHint}>
            <Textarea rows={5} value={data.text ?? ""} onChange={(e) => set({ text: e.target.value })} />
          </Field>
          <Field label="Media (optional)">
            <div className="flex gap-2">
              <Input value={data.mediaUrl ?? ""} onChange={(e) => set({ mediaUrl: e.target.value })} placeholder="https://" />
              <label className="inline-flex cursor-pointer items-center rounded-lg border px-3 hover:bg-muted">
                <Upload className="h-4 w-4" />
                <input type="file" className="hidden" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
            </div>
          </Field>
          {data.mediaUrl && (
            <Field label="Media type">
              <Select value={data.mediaType ?? "image"} onChange={(e) => set({ mediaType: e.target.value as FlowNodeData["mediaType"] })}>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="document">Document</option>
              </Select>
            </Field>
          )}
        </>
      )}

      {type === "template" && (
        <>
          <Field label="Approved template" hint="Templates work even when the 24-hour window is closed (e.g. new leads)">
            <Select value={data.templateId ?? ""} onChange={(e) => set({ templateId: e.target.value, variables: [] })}>
              <option value="">Select template</option>
              {templates.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.language})
                </option>
              ))}
            </Select>
          </Field>
          {template && <p className="whitespace-pre-wrap rounded-lg bg-muted p-2 text-xs">{template.bodyText}</p>}
          {(data.variables ?? []).map((v, i) => (
            <Field key={i} label={`Variable {{${i + 1}}}`}>
              <Input value={v} onChange={(e) => set({ variables: (data.variables ?? []).map((x, j) => (j === i ? e.target.value : x)) })} />
            </Field>
          ))}
          <div className="flex items-center justify-between">
            <span className="text-sm">Wait for the contact&apos;s reply</span>
            <Switch checked={Boolean(data.waitForReply)} onChange={(v) => set({ waitForReply: v })} />
          </div>
          {data.waitForReply && (
            <Field label="Save reply as variable">
              <Input value={data.saveAs ?? ""} onChange={(e) => set({ saveAs: e.target.value.replace(/\W/g, "_") })} placeholder="reply" />
            </Field>
          )}
        </>
      )}

      {(type === "buttons" || type === "list") && (
        <>
          <Field label="Message" hint={textHint}>
            <Textarea rows={4} value={data.text ?? ""} onChange={(e) => set({ text: e.target.value })} />
          </Field>
          {type === "list" && (
            <Field label="Menu button text">
              <Input value={data.buttonText ?? ""} maxLength={20} onChange={(e) => set({ buttonText: e.target.value })} placeholder="View options" />
            </Field>
          )}
          <OptionsEditor
            options={(type === "buttons" ? data.buttons : data.rows) ?? []}
            max={type === "buttons" ? 3 : 10}
            withDescription={type === "list"}
            onChange={(o) => set(type === "buttons" ? { buttons: o } : { rows: o })}
          />
          <Field label="Save choice as variable (optional)">
            <Input value={data.saveAs ?? ""} onChange={(e) => set({ saveAs: e.target.value.replace(/\W/g, "_") })} placeholder="choice" />
          </Field>
        </>
      )}

      {type === "question" && (
        <>
          <Field label="Question" hint={textHint}>
            <Textarea rows={3} value={data.text ?? ""} onChange={(e) => set({ text: e.target.value })} />
          </Field>
          <Field label="Save answer as variable">
            <Input value={data.saveAs ?? ""} onChange={(e) => set({ saveAs: e.target.value.replace(/\W/g, "_") })} placeholder="answer" />
          </Field>
          <Field label="Also save to contact field">
            <Select value={data.saveToField ?? ""} onChange={(e) => set({ saveToField: e.target.value || undefined })}>
              <option value="">Don&apos;t save</option>
              <option value="name">Name</option>
              <option value="email">Email</option>
              {fields.data?.map((f) => (
                <option key={f.id} value={f.key}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      {type === "condition" && (
        <>
          <Field label="Check">
            <Select value={data.source ?? "var"} onChange={(e) => set({ source: e.target.value as FlowNodeData["source"] })}>
              <option value="var">Flow variable</option>
              <option value="field">Contact field</option>
              <option value="tag">Contact tag</option>
            </Select>
          </Field>
          {data.source !== "tag" && (
            <>
              <Field label={data.source === "field" ? "Field key (name, email, phone or custom key)" : "Variable name"}>
                <Input value={data.key ?? ""} onChange={(e) => set({ key: e.target.value })} />
              </Field>
              <Field label="Operator">
                <Select value={data.operator ?? "equals"} onChange={(e) => set({ operator: e.target.value as FlowNodeData["operator"] })}>
                  <option value="equals">equals</option>
                  <option value="not_equals">does not equal</option>
                  <option value="contains">contains</option>
                  <option value="exists">is not empty</option>
                </Select>
              </Field>
            </>
          )}
          {data.operator !== "exists" && (
            <Field label={data.source === "tag" ? "Tag" : "Value"}>
              <Input value={data.value ?? ""} onChange={(e) => set({ value: e.target.value })} />
            </Field>
          )}
        </>
      )}

      {type === "delay" && (
        <Field label="Wait (minutes)">
          <Input type="number" min={0.1} step={0.5} value={data.minutes ?? 1} onChange={(e) => set({ minutes: Number(e.target.value) })} />
        </Field>
      )}

      {type === "webhook" && (
        <>
          <Field label="URL">
            <Input value={data.url ?? ""} onChange={(e) => set({ url: e.target.value })} placeholder="https://api.example.com/hook" />
          </Field>
          <Field label="Method">
            <Select value={data.method ?? "POST"} onChange={(e) => set({ method: e.target.value as "GET" | "POST" })}>
              <option value="POST">POST (sends contact + variables as JSON)</option>
              <option value="GET">GET</option>
            </Select>
          </Field>
          <Field label="Save response as variable (optional)">
            <Input value={data.saveAs ?? ""} onChange={(e) => set({ saveAs: e.target.value.replace(/\W/g, "_") })} />
          </Field>
        </>
      )}

      {type === "assign" && (
        <>
          <Field label="Assign to">
            <Select value={data.mode ?? "round_robin"} onChange={(e) => set({ mode: e.target.value as FlowNodeData["mode"] })}>
              <option value="round_robin">Next agent (round robin)</option>
              <option value="user">Specific agent</option>
            </Select>
          </Field>
          {data.mode === "user" && (
            <Field label="Agent">
              <Select value={data.userId ?? ""} onChange={(e) => set({ userId: e.target.value })}>
                <option value="">Select agent</option>
                {members.data?.members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </>
      )}

      {type === "tag" && (
        <Field label="Tags" hint="Comma separated">
          <Input
            value={(data.tags ?? []).join(", ")}
            onChange={(e) => set({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
          />
        </Field>
      )}

      {type !== "start" && (
        <Button variant="outline" className="w-full text-destructive" onClick={onDelete}>
          <Trash2 /> Delete step
        </Button>
      )}
    </div>
  );
}
