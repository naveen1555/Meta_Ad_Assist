"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Lock, Paperclip, Send, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { CHANNEL_LABELS } from "@chatnova/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/input";
import { Avatar, Spinner } from "@/components/ui/misc";
import { ChannelIcon } from "@/components/dashboard/channel-icon";
import { api, errorMessage } from "@/lib/api";
import { useMembers } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { MessageBubble, type MessageDto } from "./message-bubble";
import { TemplateSendDialog } from "./template-dialog";
import type { ConversationDto } from "./types";

export function ChatThread({ conversation, onBack }: { conversation: ConversationDto; onBack: () => void }) {
  const qc = useQueryClient();
  const members = useMembers();
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [text, setText] = React.useState("");
  const [mode, setMode] = React.useState<"reply" | "note">("reply");
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  const messages = useQuery({
    queryKey: ["messages", conversation.id],
    queryFn: () => api<MessageDto[]>(`/api/conversations/${conversation.id}/messages`),
  });
  const flows = useQuery({
    queryKey: ["flows"],
    queryFn: () => api<{ id: string; name: string; triggerType: string }[]>("/api/flows"),
  });
  const runFlow = useMutation({
    mutationFn: (flowId: string) => api(`/api/flows/${flowId}/run`, { body: { conversationId: conversation.id } }),
    onSuccess: (r: any) =>
      r?.status === "failed" ? toast.error(r.error || "Chatbot could not start") : toast.success("Chatbot started"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const quickReplies = useQuery({
    queryKey: ["quick-replies"],
    queryFn: () => api<{ id: string; shortcut: string; content: string }[]>("/api/quick-replies"),
  });

  React.useEffect(() => {
    if (conversation.unreadCount > 0) {
      api(`/api/conversations/${conversation.id}/read`, { method: "POST" }).catch(() => undefined);
    }
  }, [conversation.id, conversation.unreadCount]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data?.length]);

  const appendMessage = (m: MessageDto) =>
    qc.setQueryData<MessageDto[]>(["messages", conversation.id], (old) =>
      old && !old.some((x) => x.id === m.id) ? [...old, m] : old,
    );

  const send = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<MessageDto>(`/api/conversations/${conversation.id}/messages`, { body }),
    onSuccess: (m) => {
      appendMessage(m);
      if (m.status === "failed") toast.error(m.error || "Message failed to send");
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/api/conversations/${conversation.id}`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation-counts"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const slash = text.startsWith("/") && !text.includes(" ") ? text.slice(1).toLowerCase() : null;
  const suggestions = slash !== null ? (quickReplies.data ?? []).filter((q) => q.shortcut.toLowerCase().startsWith(slash)) : [];

  function submit() {
    const value = text.trim();
    if (!value) return;
    send.mutate({ type: mode === "note" ? "note" : "text", text: value });
    setText("");
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api<{ url: string; mediaType: string; name: string }>("/api/media", { formData: fd });
      send.mutate({ type: "media", url: r.url, mediaType: r.mediaType, filename: r.name, caption: text.trim() || undefined });
      setText("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const contact = conversation.contact;
  const windowClosed = !conversation.windowOpen;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onBack} className="md:hidden">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar name={contact.name || contact.phone} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{contact.name || contact.phone || "Unknown"}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ChannelIcon type={conversation.channel.type} size="sm" />
              {CHANNEL_LABELS[conversation.channel.type]} - {conversation.channel.name}
              {windowClosed ? (
                <Badge tone="warning" className="ml-1">
                  <Lock className="h-3 w-3" /> Window closed
                </Badge>
              ) : (
                <Badge tone="success" className="ml-1">
                  Window open
                </Badge>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {Boolean(flows.data?.length) && (
            <Select
              className="hidden h-9 w-36 text-xs lg:block"
              value=""
              onChange={(e) => e.target.value && runFlow.mutate(e.target.value)}
              disabled={runFlow.isPending}
            >
              <option value="">Run chatbot...</option>
              {flows.data?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          )}
          <Select
            className="hidden h-9 w-40 text-xs sm:block"
            value={conversation.assignee?.id ?? ""}
            onChange={(e) => update.mutate({ assigneeId: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {members.data?.members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.name}
              </option>
            ))}
          </Select>
          <Select
            className="h-9 w-28 text-xs"
            value={conversation.status}
            onChange={(e) => update.mutate({ status: e.target.value })}
          >
            <option value="OPEN">Open</option>
            <option value="PENDING">Pending</option>
            <option value="CLOSED">Closed</option>
          </Select>
        </div>
      </div>

      <div className="chat-pattern flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin">
        {messages.isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {messages.data?.map((m) => <MessageBubble key={m.id} m={m} />)}
        <div ref={bottomRef} />
      </div>

      <div className="relative border-t bg-white p-3">
        {suggestions.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-2 max-h-56 overflow-y-auto rounded-xl border bg-white p-1 shadow-xl">
            {suggestions.map((q) => (
              <button
                key={q.id}
                onClick={() => setText(q.content)}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="font-semibold text-primary">/{q.shortcut}</span>
                <span className="ml-2 line-clamp-1 text-muted-foreground">{q.content}</span>
              </button>
            ))}
          </div>
        )}
        {windowClosed && mode === "reply" && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span>
              The 24-hour window is closed.{" "}
              {conversation.channel.type === "WHATSAPP"
                ? "Send an approved template to restart the conversation."
                : "You can reply once the contact messages you again."}
            </span>
            {conversation.channel.type === "WHATSAPP" && (
              <Button size="sm" variant="secondary" onClick={() => setTemplateOpen(true)}>
                <FileText /> Template
              </Button>
            )}
          </div>
        )}
        <div className="mb-2 flex gap-1">
          {(["reply", "note"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium",
                mode === m ? (m === "note" ? "bg-amber-100 text-amber-800" : "bg-primary-light text-primary") : "text-muted-foreground hover:bg-muted",
              )}
            >
              {m === "note" ? <StickyNote className="h-3 w-3" /> : <Send className="h-3 w-3" />}
              {m === "note" ? "Internal note" : "Reply"}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (suggestions.length === 1) setText(suggestions[0]!.content);
                else submit();
              }
            }}
            placeholder={mode === "note" ? "Write a note only your team can see" : "Type a message, or / for quick replies"}
            className={cn("min-h-[44px] resize-none", mode === "note" && "bg-amber-50")}
          />
          {mode === "reply" && (
            <>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              />
              <Button variant="outline" size="icon" onClick={() => fileRef.current?.click()} loading={uploading} title="Attach file">
                {!uploading && <Paperclip />}
              </Button>
              {conversation.channel.type === "WHATSAPP" && (
                <Button variant="outline" size="icon" onClick={() => setTemplateOpen(true)} title="Send template">
                  <FileText />
                </Button>
              )}
            </>
          )}
          <Button onClick={submit} loading={send.isPending} size="icon" className="h-11 w-11" variant={mode === "note" ? "secondary" : "default"}>
            {!send.isPending && <Send />}
          </Button>
        </div>
      </div>

      <TemplateSendDialog
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        channelId={conversation.channel.id}
        sending={send.isPending}
        onSend={(d) => {
          send.mutate({ type: "template", ...d }, { onSuccess: () => setTemplateOpen(false) });
        }}
      />
    </div>
  );
}
