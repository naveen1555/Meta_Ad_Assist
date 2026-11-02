"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { FLOW_NODE_META, type FlowNodeData, type FlowNodeType } from "@chatnova/shared";
import { Button } from "@/components/ui/button";
import { Input, Select, Switch } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/misc";
import { NODE_STYLE, nodeTypes } from "@/components/flows/node-types";
import { NodeEditor } from "@/components/flows/node-editor";
import { api, errorMessage } from "@/lib/api";
import { useChannels } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const PALETTE: FlowNodeType[] = ["message", "buttons", "list", "question", "template", "condition", "delay", "assign", "tag", "webhook", "end"];

const TRIGGER_OPTIONS = [
  { value: "keyword", label: "Keyword" },
  { value: "new_conversation", label: "New conversation" },
  { value: "lead", label: "New Meta lead" },
  { value: "manual", label: "Manual" },
];

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

function defaultData(type: FlowNodeType): FlowNodeData {
  switch (type) {
    case "buttons":
      return { text: "", buttons: [{ id: uid("b"), title: "Yes" }, { id: uid("b"), title: "No" }] };
    case "list":
      return { text: "", buttonText: "View options", rows: [{ id: uid("r"), title: "Option 1" }] };
    case "delay":
      return { minutes: 5 };
    case "assign":
      return { mode: "round_robin" };
    case "condition":
      return { source: "var", operator: "equals" };
    case "webhook":
      return { method: "POST" };
    default:
      return {};
  }
}

export default function FlowBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const channels = useChannels();
  const flow = useQuery({ queryKey: ["flow", id], queryFn: () => api(`/api/flows/${id}`) });
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [rf, setRf] = React.useState<ReactFlowInstance | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [meta, setMeta] = React.useState({ name: "", triggerType: "keyword", keywords: "", channelId: "" });
  const [active, setActive] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (!flow.data) return;
    setNodes(
      (flow.data.nodes as Node<FlowNodeData>[]).map((n) => (n.type === "start" ? { ...n, deletable: false } : n)),
    );
    setEdges(flow.data.edges as Edge[]);
    setMeta({
      name: flow.data.name,
      triggerType: flow.data.triggerType,
      keywords: flow.data.keywords.join(", "),
      channelId: flow.data.channelId ?? "",
    });
    setActive(flow.data.active);
    setDirty(false);
  }, [flow.data, setNodes, setEdges]);

  React.useEffect(() => {
    const keywords = meta.keywords.split(",").map((k) => k.trim()).filter(Boolean);
    setNodes((ns) =>
      ns.map((n) => (n.type === "start" ? { ...n, data: { ...n.data, trigger: meta.triggerType, keywords } as FlowNodeData } : n)),
    );
  }, [meta.triggerType, meta.keywords, setNodes]);

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const onConnect = React.useCallback(
    (c: Connection) => {
      setEdges((es) =>
        addEdge(
          { ...c, id: uid("e"), animated: true, style: { stroke: "#7C3AED", strokeWidth: 2 } },
          // One outgoing connection per handle keeps branching unambiguous.
          es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? null) === (c.sourceHandle ?? null))),
        ),
      );
      setDirty(true);
    },
    [setEdges],
  );

  function addNode(type: FlowNodeType) {
    const center = rf?.project({ x: window.innerWidth / 2 - 300, y: window.innerHeight / 2 - 150 }) ?? { x: 300, y: 200 };
    const node: Node<FlowNodeData> = {
      id: uid(type),
      type,
      position: { x: center.x + Math.random() * 60, y: center.y + Math.random() * 60 },
      data: defaultData(type),
    };
    setNodes((ns) => [...ns, node]);
    setSelectedId(node.id);
    setDirty(true);
  }

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const updateSelected = React.useCallback(
    (data: FlowNodeData) => {
      if (!selectedId) return;
      setNodes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, data } : n)));
      setDirty(true);
    },
    [selectedId, setNodes],
  );

  function deleteSelected() {
    if (!selectedId) return;
    setNodes((ns) => ns.filter((n) => n.id !== selectedId));
    setEdges((es) => es.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
    setDirty(true);
  }

  const save = useMutation({
    mutationFn: () =>
      api(`/api/flows/${id}`, {
        method: "PUT",
        body: {
          name: meta.name,
          triggerType: meta.triggerType,
          keywords: meta.keywords.split(",").map((k) => k.trim()).filter(Boolean),
          channelId: meta.channelId || null,
          nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
          edges: edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({ id, source, target, sourceHandle, targetHandle })),
        },
      }),
    onSuccess: () => {
      toast.success("Flow saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["flows"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const toggle = useMutation({
    mutationFn: async (value: boolean) => {
      if (dirty) await save.mutateAsync();
      return api(`/api/flows/${id}/toggle`, { body: { active: value } });
    },
    onSuccess: (_r, value) => {
      setActive(value);
      toast.success(value ? "Flow is live" : "Flow paused");
      qc.invalidateQueries({ queryKey: ["flows"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (flow.isLoading) return <PageLoader />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b bg-white px-4 py-3">
        <Link href="/dashboard/flows" className="text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Input
          className="h-9 w-56 font-semibold"
          value={meta.name}
          onChange={(e) => {
            setMeta({ ...meta, name: e.target.value });
            setDirty(true);
          }}
        />
        <Select
          className="h-9 w-44 text-sm"
          value={meta.triggerType}
          onChange={(e) => {
            setMeta({ ...meta, triggerType: e.target.value });
            setDirty(true);
          }}
        >
          {TRIGGER_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              Trigger: {t.label}
            </option>
          ))}
        </Select>
        {meta.triggerType === "keyword" && (
          <Input
            className="h-9 w-56 text-sm"
            placeholder="Keywords: hi, price, menu"
            value={meta.keywords}
            onChange={(e) => {
              setMeta({ ...meta, keywords: e.target.value });
              setDirty(true);
            }}
          />
        )}
        <Select
          className="h-9 w-44 text-sm"
          value={meta.channelId}
          onChange={(e) => {
            setMeta({ ...meta, channelId: e.target.value });
            setDirty(true);
          }}
        >
          <option value="">All channels</option>
          {channels.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="ml-auto flex items-center gap-3">
          <span className={cn("text-sm font-medium", active ? "text-success" : "text-muted-foreground")}>
            {active ? "Live" : "Paused"}
          </span>
          <Switch checked={active} onChange={(v) => toggle.mutate(v)} disabled={toggle.isPending} />
          <Button onClick={() => save.mutate()} loading={save.isPending} variant={dirty ? "accent" : "default"}>
            <Save /> {dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-48 shrink-0 space-y-1 overflow-y-auto border-r bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add step</p>
          {PALETTE.map((t) => {
            const s = NODE_STYLE[t];
            return (
              <button
                key={t}
                onClick={() => addNode(t)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-violet-50"
              >
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-md text-white", s.color)}>
                  <s.icon className="h-3.5 w-3.5" />
                </span>
                {FLOW_NODE_META[t].label}
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 bg-violet-50/40">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={setRf}
            onNodesChange={(c) => {
              onNodesChange(c);
              if (c.some((x) => x.type === "position" || x.type === "remove")) setDirty(true);
            }}
            onEdgesChange={(c) => {
              onEdgesChange(c);
              if (c.some((x) => x.type === "remove")) setDirty(true);
            }}
            onConnect={onConnect}
            onNodeClick={(_e, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            defaultEdgeOptions={{ animated: true, style: { stroke: "#7C3AED", strokeWidth: 2 } }}
            fitView
            fitViewOptions={{ maxZoom: 1 }}
          >
            <Background color="#C4B5FD" gap={20} />
            <Controls />
            <MiniMap pannable zoomable nodeColor="#8B5CF6" />
          </ReactFlow>
        </div>

        <div className="w-80 shrink-0 overflow-y-auto border-l bg-white p-4">
          {selected ? (
            <NodeEditor
              key={selected.id}
              type={selected.type as FlowNodeType}
              data={selected.data}
              onChange={updateSelected}
              onDelete={deleteSelected}
            />
          ) : (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">Building your flow</p>
              <p>Add steps from the left, then drag from a step&apos;s right handle to the next step to connect them.</p>
              <p>Buttons, list menus and conditions have one handle per branch.</p>
              <p>Select a step to edit it. Press Backspace to delete a selected connection.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
