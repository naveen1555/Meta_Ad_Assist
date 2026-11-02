"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Search } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Avatar, EmptyState, PageLoader, Spinner } from "@/components/ui/misc";
import { ChannelIcon } from "@/components/dashboard/channel-icon";
import { ChatThread } from "@/components/inbox/chat-thread";
import { ContactPanel } from "@/components/inbox/contact-panel";
import type { MessageDto } from "@/components/inbox/message-bubble";
import type { ConversationDto } from "@/components/inbox/types";
import { api } from "@/lib/api";
import { useSocketEvent } from "@/lib/socket";
import { cn, timeAgo } from "@/lib/utils";

type Filter = "mine" | "unassigned" | "all";

function preview(m?: MessageDto | null) {
  if (!m) return "No messages yet";
  const prefix = m.direction === "OUTBOUND" ? "You: " : "";
  if (m.body) return prefix + m.body;
  return prefix + `[${m.type}]`;
}

function InboxContent() {
  const qc = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("c");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [status, setStatus] = React.useState("OPEN");
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useQuery({
    queryKey: ["conversations", filter, status, debounced],
    queryFn: () =>
      api<ConversationDto[]>(
        `/api/conversations?filter=${filter}&status=${status}${debounced ? `&search=${encodeURIComponent(debounced)}` : ""}`,
      ),
  });
  const counts = useQuery({
    queryKey: ["conversation-counts"],
    queryFn: () => api<Record<Filter, number>>("/api/conversations/counts"),
  });
  const selectedFromList = list.data?.find((c) => c.id === selectedId);
  const single = useQuery({
    queryKey: ["conversation", selectedId],
    queryFn: () => api<ConversationDto>(`/api/conversations/${selectedId}`),
    enabled: Boolean(selectedId) && !selectedFromList,
  });
  const selected = selectedFromList ?? single.data;

  useSocketEvent<{ conversationId: string; message: MessageDto }>("message:new", ({ conversationId, message }) => {
    qc.setQueryData<MessageDto[]>(["messages", conversationId], (old) =>
      old && !old.some((m) => m.id === message.id) ? [...old, message] : old,
    );
    qc.invalidateQueries({ queryKey: ["conversations"] });
    qc.invalidateQueries({ queryKey: ["conversation-counts"] });
  });
  useSocketEvent<{ conversationId: string; id: string; status: string; error?: string }>("message:status", (p) => {
    qc.setQueryData<MessageDto[]>(["messages", p.conversationId], (old) =>
      old?.map((m) => (m.id === p.id ? { ...m, status: p.status, error: p.error ?? m.error } : m)),
    );
  });
  useSocketEvent("conversation:updated", () => {
    qc.invalidateQueries({ queryKey: ["conversations"] });
    qc.invalidateQueries({ queryKey: ["conversation-counts"] });
    if (selectedId) qc.invalidateQueries({ queryKey: ["conversation", selectedId] });
  });

  const select = (id: string | null) => router.replace(id ? `/dashboard/inbox?c=${id}` : "/dashboard/inbox");

  return (
    <div className="flex h-full">
      <div className={cn("flex w-full flex-col border-r bg-white md:w-80 md:shrink-0", selected && "hidden md:flex")}>
        <div className="space-y-3 border-b p-3">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
            {(["mine", "unassigned", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs font-medium capitalize",
                  filter === f ? "bg-white text-primary shadow-sm" : "text-muted-foreground",
                )}
              >
                {f} {counts.data ? <span className="opacity-60">({counts.data[f]})</span> : null}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="h-9 pl-8" />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-28 text-xs">
              <option value="OPEN">Open</option>
              <option value="PENDING">Pending</option>
              <option value="CLOSED">Closed</option>
              <option value="all">All</option>
            </Select>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {list.isLoading && (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          )}
          {list.data?.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No conversations</p>}
          {list.data?.map((c) => (
            <button
              key={c.id}
              onClick={() => select(c.id)}
              className={cn(
                "flex w-full items-start gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-violet-50/60",
                c.id === selectedId && "bg-violet-50",
              )}
            >
              <div className="relative">
                <Avatar name={c.contact.name || c.contact.phone} />
                <ChannelIcon type={c.channel.type} size="sm" className="absolute -bottom-1 -right-1 ring-2 ring-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{c.contact.name || c.contact.phone || "Unknown"}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(c.lastMessageAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-muted-foreground">{preview(c.lastMessage)}</p>
                  {c.unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-coral-500 px-1.5 text-[10px] font-bold text-white">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
                {c.assignee && <p className="mt-0.5 text-[11px] text-violet-600">@{c.assignee.name}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <>
          <ChatThread key={selected.id} conversation={selected} onBack={() => select(null)} />
          <ContactPanel contact={selected.contact} />
        </>
      ) : selectedId && single.isLoading ? (
        <div className="hidden flex-1 md:block">
          <PageLoader />
        </div>
      ) : (
        <div className="hidden flex-1 items-center justify-center p-8 md:flex">
          <EmptyState
            icon={Inbox}
            title="Select a conversation"
            description="Messages from WhatsApp, Messenger and Instagram appear here in real time."
          />
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <InboxContent />
    </React.Suspense>
  );
}
