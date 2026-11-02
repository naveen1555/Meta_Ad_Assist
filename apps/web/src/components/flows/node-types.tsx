"use client";

import * as React from "react";
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "reactflow";
import {
  Clock,
  FileText,
  GitBranch,
  HelpCircle,
  List,
  MessageSquare,
  MousePointerClick,
  Play,
  Square,
  Tag,
  UserCheck,
  Webhook,
} from "lucide-react";
import { FLOW_NODE_META, type FlowNodeData, type FlowNodeType } from "@chatnova/shared";
import { cn } from "@/lib/utils";

export const NODE_STYLE: Record<FlowNodeType, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  start: { icon: Play, color: "bg-violet-700" },
  message: { icon: MessageSquare, color: "bg-violet-500" },
  template: { icon: FileText, color: "bg-emerald-600" },
  buttons: { icon: MousePointerClick, color: "bg-coral-500" },
  list: { icon: List, color: "bg-coral-600" },
  question: { icon: HelpCircle, color: "bg-sky-600" },
  condition: { icon: GitBranch, color: "bg-amber-500" },
  delay: { icon: Clock, color: "bg-slate-500" },
  webhook: { icon: Webhook, color: "bg-indigo-600" },
  assign: { icon: UserCheck, color: "bg-teal-600" },
  tag: { icon: Tag, color: "bg-pink-600" },
  end: { icon: Square, color: "bg-slate-700" },
};

const TRIGGER_LABEL: Record<string, string> = {
  keyword: "Keyword received",
  new_conversation: "New conversation",
  lead: "New Meta lead",
  manual: "Started manually",
};

function summary(type: FlowNodeType, d: FlowNodeData): string {
  switch (type) {
    case "message":
      return d.text || (d.mediaUrl ? `[${d.mediaType ?? "media"}]` : "Empty message");
    case "question":
      return d.text || "Ask something";
    case "buttons":
    case "list":
      return d.text || "Choose an option";
    case "template":
      return d.label || "Select a template";
    case "condition":
      return d.key || d.operator === "has_tag" || d.source === "tag"
        ? `${d.source === "tag" || d.operator === "has_tag" ? "has tag" : `${d.source}.${d.key} ${d.operator}`} ${d.value ?? ""}`
        : "Set a condition";
    case "delay":
      return `Wait ${d.minutes ?? 1} minute(s)`;
    case "webhook":
      return d.url || "Set a URL";
    case "assign":
      return d.mode === "user" ? "Assign to a specific agent" : "Round robin";
    case "tag":
      return d.tags?.length ? d.tags.join(", ") : "Add tags";
    case "end":
      return "Flow ends";
    default:
      return "";
  }
}

const handleClass = "!h-3 !w-3 !border-2 !border-white !bg-violet-500";

function OptionHandles({ options, withOther }: { options: { id: string; title: string }[]; withOther: boolean }) {
  return (
    <div className="space-y-1 border-t px-3 py-2">
      {options.map((o) => (
        <div key={o.id} className="relative rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800">
          {o.title || "Untitled"}
          <Handle type="source" position={Position.Right} id={o.id} className={handleClass} style={{ right: -18 }} />
        </div>
      ))}
      {withOther && (
        <div className="relative rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          Any other reply
          <Handle type="source" position={Position.Right} id="other" className={cn(handleClass, "!bg-slate-400")} style={{ right: -18 }} />
        </div>
      )}
    </div>
  );
}

export function FlowNodeCard({ id, type, data, selected }: NodeProps<FlowNodeData & { trigger?: string; keywords?: string[] }>) {
  const t = type as FlowNodeType;
  const style = NODE_STYLE[t];
  const updateInternals = useUpdateNodeInternals();
  const options = t === "buttons" ? data.buttons ?? [] : t === "list" ? data.rows ?? [] : [];
  const optionKey = options.map((o) => o.id).join(",");

  React.useEffect(() => {
    updateInternals(id);
  }, [id, optionKey, updateInternals]);

  return (
    <div
      className={cn(
        "w-64 rounded-xl border bg-white shadow-md transition-shadow",
        selected ? "border-violet-500 ring-2 ring-violet-300" : "border-violet-100",
      )}
    >
      {t !== "start" && <Handle type="target" position={Position.Left} className={handleClass} />}
      <div className={cn("flex items-center gap-2 rounded-t-xl px-3 py-2 text-white", style.color)}>
        <style.icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{FLOW_NODE_META[t].label}</span>
      </div>
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {t === "start" ? (
          <>
            <p className="font-semibold text-violet-950">{TRIGGER_LABEL[data.trigger ?? "keyword"]}</p>
            {data.trigger === "keyword" && <p className="mt-0.5 line-clamp-2">{data.keywords?.join(", ") || "No keywords yet"}</p>}
          </>
        ) : (
          <p className="line-clamp-3 whitespace-pre-wrap">{summary(t, data)}</p>
        )}
        {data.saveAs && <p className="mt-1 text-[10px] text-violet-600">saves to {`{{var.${data.saveAs}}}`}</p>}
      </div>
      {(t === "buttons" || t === "list") && <OptionHandles options={options} withOther />}
      {t === "condition" && (
        <div className="space-y-1 border-t px-3 py-2">
          {(["true", "false"] as const).map((h) => (
            <div
              key={h}
              className={cn(
                "relative rounded-md px-2 py-1 text-xs font-medium",
                h === "true" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
              )}
            >
              {h === "true" ? "Yes" : "No"}
              <Handle type="source" position={Position.Right} id={h} className={handleClass} style={{ right: -18 }} />
            </div>
          ))}
        </div>
      )}
      {!["buttons", "list", "condition", "end"].includes(t) && (
        <Handle type="source" position={Position.Right} className={handleClass} />
      )}
    </div>
  );
}

export const nodeTypes = Object.fromEntries(
  (Object.keys(NODE_STYLE) as FlowNodeType[]).map((t) => [t, FlowNodeCard]),
);
