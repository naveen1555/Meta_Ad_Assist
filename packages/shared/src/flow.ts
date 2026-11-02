export type FlowTriggerType = "keyword" | "new_conversation" | "lead" | "manual";

export type FlowNodeType =
  | "start"
  | "message"
  | "template"
  | "buttons"
  | "list"
  | "question"
  | "condition"
  | "delay"
  | "webhook"
  | "assign"
  | "tag"
  | "end";

export interface FlowOption {
  id: string;
  title: string;
  description?: string;
}

export interface FlowNodeData {
  label?: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio" | "document";
  buttons?: FlowOption[];
  rows?: FlowOption[];
  buttonText?: string;
  saveAs?: string;
  saveToField?: string;
  source?: "var" | "field" | "tag";
  key?: string;
  operator?: "equals" | "not_equals" | "contains" | "exists" | "has_tag";
  value?: string;
  minutes?: number;
  url?: string;
  method?: "GET" | "POST";
  mode?: "round_robin" | "user";
  userId?: string;
  tags?: string[];
  templateId?: string;
  variables?: string[];
  /** Template node: pause until the contact replies (e.g. taps a template quick-reply button) */
  waitForReply?: boolean;
}

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export const FLOW_NODE_META: Record<
  FlowNodeType,
  { label: string; description: string; waitsForInput?: boolean }
> = {
  start: { label: "Trigger", description: "Where the flow starts" },
  message: { label: "Send message", description: "Text with optional media" },
  template: { label: "Send template", description: "Approved WhatsApp template" },
  buttons: { label: "Buttons", description: "Up to 3 reply buttons", waitsForInput: true },
  list: { label: "List menu", description: "Up to 10 options", waitsForInput: true },
  question: { label: "Ask question", description: "Save the reply to a field", waitsForInput: true },
  condition: { label: "Condition", description: "Branch on data" },
  delay: { label: "Delay", description: "Wait before continuing" },
  webhook: { label: "Webhook", description: "Call an external URL" },
  assign: { label: "Assign agent", description: "Hand over to a human" },
  tag: { label: "Add tags", description: "Tag the contact" },
  end: { label: "End", description: "Stop the flow" },
};

export const DEFAULT_FLOW_NODES: FlowNode[] = [
  { id: "start", type: "start", position: { x: 80, y: 160 }, data: {} },
];
