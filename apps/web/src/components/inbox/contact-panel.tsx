"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Mail, Phone, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/card";
import { Input, Switch } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { ContactDto } from "./types";

export function ContactPanel({ contact }: { contact: ContactDto }) {
  const qc = useQueryClient();
  const [tag, setTag] = React.useState("");

  const update = useMutation({
    mutationFn: (body: Partial<ContactDto>) => api(`/api/contacts/${contact.id}`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["contact-tags"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <aside className="hidden w-72 shrink-0 overflow-y-auto border-l bg-white p-5 xl:block">
      <div className="flex flex-col items-center text-center">
        <Avatar name={contact.name || contact.phone} className="h-16 w-16 text-lg" />
        <p className="mt-3 font-semibold">{contact.name || "Unknown"}</p>
        <Link href={`/dashboard/contacts/${contact.id}`} className="mt-1 flex items-center gap-1 text-xs text-primary">
          View full profile <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div className="mt-6 space-y-3 text-sm">
        {contact.phone && (
          <p className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" /> +{contact.phone}
          </p>
        )}
        {contact.email && (
          <p className="flex items-center gap-2 break-all">
            <Mail className="h-4 w-4 text-muted-foreground" /> {contact.email}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Source: {contact.source || "-"} - since {formatDate(contact.createdAt, false)}
        </p>
      </div>
      <div className="mt-6 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2">
        <span className="text-sm">Marketing opt-in</span>
        <Switch checked={contact.optIn} onChange={(v) => update.mutate({ optIn: v })} />
      </div>
      <div className="mt-6">
        <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Tag className="h-3 w-3" /> Tags
        </p>
        <div className="flex flex-wrap gap-1.5">
          {contact.tags.map((t) => (
            <Badge key={t}>
              {t}
              <button onClick={() => update.mutate({ tags: contact.tags.filter((x) => x !== t) })}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <form
          className="mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!tag.trim()) return;
            update.mutate({ tags: [...contact.tags, tag.trim()] });
            setTag("");
          }}
        >
          <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add tag and press Enter" className="h-8 text-xs" />
        </form>
      </div>
      {Object.keys(contact.customFields ?? {}).length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fields</p>
          <dl className="space-y-1.5 text-sm">
            {Object.entries(contact.customFields).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="truncate text-right font-medium">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </aside>
  );
}
