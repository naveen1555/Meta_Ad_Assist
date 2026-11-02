import type { Channel } from "@prisma/client";
import { prisma } from "../db";
import { saveBuffer } from "../lib/storage";
import { enqueue } from "../queue";
import { handleInbound, handleStatus, type InboundMessage } from "../services/inbound";
import { graph, graphDownload } from "./graph";

/** Entry point for every POST /webhooks/meta payload (already signature-verified). */
export async function processMetaWebhook(body: any) {
  const entries: any[] = body?.entry ?? [];
  switch (body?.object) {
    case "whatsapp_business_account":
      for (const entry of entries) for (const change of entry.changes ?? []) await handleWhatsAppChange(change);
      break;
    case "page":
      for (const entry of entries) await handlePageEntry(entry);
      break;
    case "instagram":
      for (const entry of entries) await handleInstagramEntry(entry);
      break;
  }
}

// ---------------------------------------------------------------- WhatsApp

async function handleWhatsAppChange(change: any) {
  const value = change.value ?? {};
  if (change.field === "message_template_status_update") {
    if (value.message_template_id) {
      await prisma.template.updateMany({
        where: { externalId: String(value.message_template_id) },
        data: { status: String(value.event || "").toUpperCase() },
      });
    }
    return;
  }
  if (change.field !== "messages") return;

  const phoneNumberId = value.metadata?.phone_number_id;
  const channel = await prisma.channel.findUnique({
    where: { type_externalId: { type: "WHATSAPP", externalId: String(phoneNumberId) } },
  });
  if (!channel) return;

  const names = new Map<string, string>();
  for (const c of value.contacts ?? []) names.set(c.wa_id, c.profile?.name);

  for (const m of value.messages ?? []) {
    try {
      const parsed = await parseWhatsAppMessage(channel, m);
      await handleInbound(channel, { phone: m.from }, names.get(m.from), parsed);
    } catch (err) {
      console.error("[webhook] whatsapp message failed", err);
    }
  }
  for (const s of value.statuses ?? []) {
    const error = s.errors?.[0] ? `${s.errors[0].title}${s.errors[0].error_data?.details ? `: ${s.errors[0].error_data.details}` : ""}` : undefined;
    await handleStatus(s.id, s.status, error);
  }
}

async function downloadWhatsAppMedia(channel: Channel, mediaId: string) {
  const meta = await graph<{ url: string; mime_type: string }>(mediaId, { token: channel.accessToken });
  const buffer = await graphDownload(meta.url, channel.accessToken);
  return { url: await saveBuffer(buffer, meta.mime_type), mime: meta.mime_type };
}

async function parseWhatsAppMessage(channel: Channel, m: any): Promise<InboundMessage> {
  const base = { externalId: m.id, timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000) : undefined };
  switch (m.type) {
    case "text":
      return { ...base, type: "text", body: m.text?.body };
    case "interactive": {
      const reply = m.interactive?.button_reply ?? m.interactive?.list_reply;
      return { ...base, type: "reply", body: reply?.title, replyId: reply?.id, payload: m.interactive };
    }
    case "button":
      return { ...base, type: "reply", body: m.button?.text, replyId: m.button?.payload, payload: m.button };
    case "image":
    case "video":
    case "audio":
    case "document":
    case "sticker": {
      const media = m[m.type];
      let stored: { url: string; mime: string } | null = null;
      try {
        stored = await downloadWhatsAppMedia(channel, media.id);
      } catch (err) {
        console.error("[webhook] media download failed", err);
      }
      return {
        ...base,
        type: m.type === "sticker" ? "image" : m.type,
        body: media.caption ?? media.filename ?? null,
        mediaUrl: stored?.url,
        mediaMime: stored?.mime ?? media.mime_type,
      };
    }
    case "location":
      return {
        ...base,
        type: "location",
        body: `${m.location?.name ?? "Location"}: https://maps.google.com/?q=${m.location?.latitude},${m.location?.longitude}`,
        payload: m.location,
      };
    case "contacts":
      return { ...base, type: "text", body: `Shared contact: ${m.contacts?.[0]?.name?.formatted_name ?? ""}`, payload: m.contacts };
    default:
      return { ...base, type: "unsupported", body: `[${m.type} message]` };
  }
}

// ---------------------------------------------------------------- Messenger / Instagram

async function handlePageEntry(entry: any) {
  const pageId = String(entry.id);
  for (const change of entry.changes ?? []) {
    if (change.field === "leadgen" && change.value?.leadgen_id) {
      await enqueue(
        "lead.process",
        {
          pageId: String(change.value.page_id ?? pageId),
          leadgenId: String(change.value.leadgen_id),
          formId: change.value.form_id ? String(change.value.form_id) : null,
          adId: change.value.ad_id ? String(change.value.ad_id) : null,
        },
        { jobId: `lead-${change.value.leadgen_id}` },
      );
    }
  }
  if (!entry.messaging?.length) return;
  const channel = await prisma.channel.findUnique({
    where: { type_externalId: { type: "MESSENGER", externalId: pageId } },
  });
  if (!channel) return;
  for (const ev of entry.messaging) await handleMessagingEvent(channel, ev, "messenger");
}

async function handleInstagramEntry(entry: any) {
  const channel = await prisma.channel.findUnique({
    where: { type_externalId: { type: "INSTAGRAM", externalId: String(entry.id) } },
  });
  if (!channel) return;
  for (const ev of entry.messaging ?? []) await handleMessagingEvent(channel, ev, "instagram");
}

async function fetchProfileName(channel: Channel, userId: string, kind: "messenger" | "instagram") {
  try {
    const fields = kind === "messenger" ? "first_name,last_name" : "name,username";
    const p = await graph<any>(userId, { token: channel.accessToken, query: { fields } });
    return kind === "messenger" ? [p.first_name, p.last_name].filter(Boolean).join(" ") : p.name || p.username;
  } catch {
    return null;
  }
}

async function handleMessagingEvent(channel: Channel, ev: any, kind: "messenger" | "instagram") {
  const senderId = String(ev.sender?.id ?? "");
  if (!senderId || senderId === channel.externalId || senderId === channel.pageId) return;

  if (ev.delivery?.mids) {
    for (const mid of ev.delivery.mids) await handleStatus(mid, "delivered");
    return;
  }
  if (ev.read) {
    const outbound = await prisma.message.findMany({
      where: {
        conversation: { channelId: channel.id, contact: kind === "messenger" ? { messengerId: senderId } : { instagramId: senderId } },
        direction: "OUTBOUND",
        status: { in: ["sent", "delivered"] },
        externalId: { not: null },
      },
      select: { externalId: true },
      take: 50,
    });
    for (const m of outbound) await handleStatus(m.externalId!, "read");
    return;
  }

  let parsed: InboundMessage | null = null;
  const timestamp = ev.timestamp ? new Date(Number(ev.timestamp)) : undefined;
  if (ev.message && !ev.message.is_echo) {
    const att = ev.message.attachments?.[0];
    const typeMap: Record<string, string> = { image: "image", video: "video", audio: "audio", file: "document" };
    parsed = {
      externalId: ev.message.mid,
      timestamp,
      type: ev.message.quick_reply ? "reply" : att ? typeMap[att.type] ?? "unsupported" : "text",
      body: ev.message.text ?? (att ? null : "[unsupported message]"),
      mediaUrl: att?.payload?.url ?? null,
      replyId: ev.message.quick_reply?.payload ?? null,
    };
  } else if (ev.postback) {
    parsed = {
      externalId: ev.postback.mid ?? `pb-${senderId}-${ev.timestamp}`,
      timestamp,
      type: "reply",
      body: ev.postback.title,
      replyId: ev.postback.payload,
    };
  }
  if (!parsed) return;

  const workspaceId = channel.workspaceId;
  const existing = await prisma.contact.findFirst({
    where: { workspaceId, ...(kind === "messenger" ? { messengerId: senderId } : { instagramId: senderId }) },
  });
  const name = existing?.name ?? (await fetchProfileName(channel, senderId, kind));
  await handleInbound(channel, kind === "messenger" ? { messengerId: senderId } : { instagramId: senderId }, name, parsed);
}
