import type { Channel } from "@prisma/client";
import { graph } from "./graph";

export type MediaType = "image" | "video" | "audio" | "document";

export type OutMessage =
  | { kind: "text"; text: string }
  | { kind: "buttons"; text: string; buttons: { id: string; title: string }[] }
  | { kind: "list"; text: string; buttonText?: string; rows: { id: string; title: string; description?: string }[] }
  | { kind: "media"; mediaType: MediaType; url: string; caption?: string; filename?: string }
  | {
      kind: "template";
      name: string;
      language: string;
      bodyParams: string[];
      headerMedia?: { type: MediaType; url: string };
      /** Rendered body text, stored for display in the inbox */
      preview?: string;
    };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function whatsappPayload(to: string, msg: OutMessage) {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  switch (msg.kind) {
    case "text":
      return { ...base, type: "text", text: { body: clip(msg.text, 4096), preview_url: true } };
    case "buttons":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: clip(msg.text || " ", 1024) },
          action: {
            buttons: msg.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: clip(b.title, 20) } })),
          },
        },
      };
    case "list":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: clip(msg.text || " ", 1024) },
          action: {
            button: clip(msg.buttonText || "Choose", 20),
            sections: [
              {
                title: "Options",
                rows: msg.rows.slice(0, 10).map((r) => ({
                  id: r.id,
                  title: clip(r.title, 24),
                  ...(r.description ? { description: clip(r.description, 72) } : {}),
                })),
              },
            ],
          },
        },
      };
    case "media": {
      const media: Record<string, string> = { link: msg.url };
      if (msg.caption && msg.mediaType !== "audio") media.caption = msg.caption;
      if (msg.mediaType === "document") media.filename = msg.filename || "document";
      return { ...base, type: msg.mediaType, [msg.mediaType]: media };
    }
    case "template": {
      const components: unknown[] = [];
      if (msg.headerMedia) {
        components.push({
          type: "header",
          parameters: [{ type: msg.headerMedia.type, [msg.headerMedia.type]: { link: msg.headerMedia.url } }],
        });
      }
      if (msg.bodyParams.length) {
        components.push({
          type: "body",
          parameters: msg.bodyParams.map((text) => ({ type: "text", text: text || "-" })),
        });
      }
      return {
        ...base,
        type: "template",
        template: { name: msg.name, language: { code: msg.language }, components },
      };
    }
  }
}

function messengerMessage(msg: OutMessage) {
  switch (msg.kind) {
    case "text":
      return { text: clip(msg.text, 2000) };
    case "buttons":
      return {
        text: clip(msg.text || " ", 2000),
        quick_replies: msg.buttons.map((b) => ({ content_type: "text", title: clip(b.title, 20), payload: b.id })),
      };
    case "list":
      return {
        text: clip(msg.text || " ", 2000),
        quick_replies: msg.rows.slice(0, 13).map((r) => ({ content_type: "text", title: clip(r.title, 20), payload: r.id })),
      };
    case "media":
      return {
        attachment: {
          type: msg.mediaType === "document" ? "file" : msg.mediaType,
          payload: { url: msg.url, is_reusable: true },
        },
      };
    case "template":
      throw new Error("Message templates are only supported on WhatsApp");
  }
}

/** Sends a message through the channel's Meta API and returns the provider message id. */
export async function sendViaChannel(channel: Channel, recipientId: string, msg: OutMessage): Promise<string> {
  if (channel.type === "WHATSAPP") {
    const res = await graph<{ messages?: { id: string }[] }>(`${channel.externalId}/messages`, {
      token: channel.accessToken,
      body: whatsappPayload(recipientId, msg),
    });
    return res.messages?.[0]?.id ?? "";
  }
  const res = await graph<{ message_id?: string }>(`${channel.pageId || "me"}/messages`, {
    token: channel.accessToken,
    body: {
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: messengerMessage(msg),
    },
  });
  return res.message_id ?? "";
}

export function messageTypeOf(msg: OutMessage) {
  switch (msg.kind) {
    case "text":
      return "text";
    case "buttons":
    case "list":
      return "interactive";
    case "media":
      return msg.mediaType;
    case "template":
      return "template";
  }
}

export function messageBodyOf(msg: OutMessage) {
  switch (msg.kind) {
    case "text":
      return msg.text;
    case "buttons":
    case "list":
      return msg.text;
    case "media":
      return msg.caption ?? null;
    case "template":
      return msg.preview ?? `Template: ${msg.name}`;
  }
}

/** Builds the display text of a template from its BODY component and parameters. */
export function renderTemplateBody(components: unknown, params: string[]) {
  const body = (components as any[] | null)?.find((c) => c.type === "BODY")?.text as string | undefined;
  if (!body) return undefined;
  return body.replace(/\{\{(\d+)\}\}/g, (_m, i) => params[Number(i) - 1] ?? "");
}

export function templateVariableCount(components: unknown) {
  const body = (components as any[] | null)?.find((c) => c.type === "BODY")?.text as string | undefined;
  const matches = body?.match(/\{\{(\d+)\}\}/g) ?? [];
  return new Set(matches).size;
}

export function templateHeaderFormat(components: unknown): MediaType | "TEXT" | null {
  const header = (components as any[] | null)?.find((c) => c.type === "HEADER");
  if (!header) return null;
  const f = String(header.format || "TEXT").toUpperCase();
  if (f === "IMAGE") return "image";
  if (f === "VIDEO") return "video";
  if (f === "DOCUMENT") return "document";
  return "TEXT";
}
