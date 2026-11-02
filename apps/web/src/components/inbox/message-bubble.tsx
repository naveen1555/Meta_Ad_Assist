import { AlertCircle, Bot, Check, CheckCheck, Clock, FileText, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MessageDto {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  type: string;
  body?: string | null;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  payload?: any;
  status: string;
  error?: string | null;
  isBot: boolean;
  createdAt: string;
  sender?: { id: string; name: string } | null;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "queued") return <Clock className="h-3 w-3" />;
  if (status === "sent") return <Check className="h-3 w-3" />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3" />;
  if (status === "read") return <CheckCheck className="h-3 w-3 text-sky-500" />;
  if (status === "failed") return <AlertCircle className="h-3 w-3 text-destructive" />;
  return null;
}

function Media({ m }: { m: MessageDto }) {
  if (!m.mediaUrl) return null;
  if (m.type === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.mediaUrl} alt="" className="mb-1 max-h-64 rounded-lg object-cover" />;
  }
  if (m.type === "video") return <video src={m.mediaUrl} controls className="mb-1 max-h-64 rounded-lg" />;
  if (m.type === "audio") return <audio src={m.mediaUrl} controls className="mb-1 w-60" />;
  return (
    <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded-lg bg-black/5 p-2 text-sm underline">
      <FileText className="h-4 w-4" /> {m.body || "Document"}
    </a>
  );
}

export function MessageBubble({ m }: { m: MessageDto }) {
  const time = new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  if (m.type === "note") {
    return (
      <div className="mx-auto max-w-[80%] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
        <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-amber-700">
          <StickyNote className="h-3 w-3" /> Internal note - {m.sender?.name}
        </p>
        <p className="whitespace-pre-wrap">{m.body}</p>
        <p className="mt-1 text-right text-[10px] text-amber-600">{time}</p>
      </div>
    );
  }

  const outbound = m.direction === "OUTBOUND";
  const options: { id: string; title: string }[] =
    m.type === "interactive" ? m.payload?.buttons ?? m.payload?.rows ?? [] : [];

  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          outbound ? "rounded-tr-sm bg-violet-100" : "rounded-tl-sm bg-white",
          m.status === "failed" && "ring-1 ring-destructive/40",
        )}
      >
        {outbound && (m.isBot || m.type === "template") && (
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
            {m.isBot ? <Bot className="h-3 w-3" /> : null}
            {m.isBot ? "Chatbot" : "Template"}
          </p>
        )}
        <Media m={m} />
        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
        {options.length > 0 && (
          <div className="mt-2 grid gap-1">
            {options.map((o) => (
              <span key={o.id} className="rounded-md border border-violet-200 bg-white/60 px-2 py-1 text-center text-xs text-violet-700">
                {o.title}
              </span>
            ))}
          </div>
        )}
        {m.type === "reply" && <p className="mt-0.5 text-[10px] text-muted-foreground">Button reply</p>}
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          {outbound && m.sender?.name && !m.isBot && <span>{m.sender.name} -</span>}
          {time}
          {outbound && <StatusIcon status={m.status} />}
        </div>
        {m.status === "failed" && m.error && <p className="mt-1 text-xs text-destructive">{m.error}</p>}
      </div>
    </div>
  );
}
