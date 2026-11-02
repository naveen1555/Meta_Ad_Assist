import type { Contact, Lead, Prisma } from "@prisma/client";
import { DEFAULT_LEAD_SETTINGS, type LeadSettings } from "@chatnova/shared";
import { prisma } from "../db";
import { emitToWorkspace } from "../lib/socket";
import { normalizePhone, renderText } from "../lib/utils";
import { graph } from "../meta/graph";
import { renderTemplateBody } from "../meta/send";
import { startTriggeredFlows } from "../flows/engine";
import { findOrCreateContact } from "./contacts";
import { assignConversation, getOrCreateConversation, nextRoundRobinAgent } from "./conversations";
import { dispatchEvent, logActivity } from "./events";
import { sendMessage } from "./messaging";

export interface LeadInput {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  fields?: Record<string, string>;
  source: string;
  leadgenId?: string | null;
  formId?: string | null;
  adId?: string | null;
  pageId?: string | null;
}

export async function getLeadSettings(workspaceId: string): Promise<LeadSettings> {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { leadSettings: true } });
  return { ...DEFAULT_LEAD_SETTINGS, ...((ws.leadSettings as Partial<LeadSettings>) ?? {}) };
}

/** Background job: fetches a Lead Ads submission from Meta and creates the lead. */
export async function processLeadgenJob(data: { pageId: string; leadgenId: string; formId?: string | null; adId?: string | null }) {
  if (await prisma.lead.findUnique({ where: { leadgenId: data.leadgenId } })) return;
  const channel = await prisma.channel.findFirst({
    where: { type: "MESSENGER", OR: [{ externalId: data.pageId }, { pageId: data.pageId }] },
  });
  if (!channel) {
    console.warn(`[leads] no connected page ${data.pageId} for leadgen ${data.leadgenId}`);
    return;
  }

  let raw: any;
  try {
    raw = await graph(data.leadgenId, {
      token: channel.accessToken,
      query: { fields: "created_time,field_data,ad_id,ad_name,campaign_name,form_id" },
    });
  } catch {
    raw = await graph(data.leadgenId, { token: channel.accessToken, query: { fields: "created_time,field_data,form_id" } });
  }

  const fields: Record<string, string> = {};
  for (const f of raw.field_data ?? []) fields[f.name] = (f.values ?? []).join(", ");
  if (raw.ad_name) fields.ad_name = raw.ad_name;
  if (raw.campaign_name) fields.campaign_name = raw.campaign_name;

  const name =
    fields.full_name || [fields.first_name, fields.last_name].filter(Boolean).join(" ") || fields.name || null;
  const phone = fields.phone_number || fields.phone || fields.mobile_number || fields.whatsapp_number || null;
  const email = fields.email || fields.work_email || null;

  await createLead(channel.workspaceId, {
    name,
    phone,
    email,
    fields,
    source: "facebook_lead_ad",
    leadgenId: data.leadgenId,
    formId: raw.form_id ?? data.formId,
    adId: raw.ad_id ?? data.adId,
    pageId: data.pageId,
  });
}

/** Creates a contact + lead from any source and runs the workspace's lead automation. */
export async function createLead(workspaceId: string, input: LeadInput) {
  const settings = await getLeadSettings(workspaceId);
  const phone = normalizePhone(input.phone, settings.defaultCountryCode);

  const { contact } = await findOrCreateContact(workspaceId, {
    name: input.name,
    phone,
    email: input.email?.toLowerCase() || null,
    source: input.source,
    tags: settings.tags,
  });

  let lead: Lead;
  try {
    lead = await prisma.lead.create({
      data: {
        workspaceId,
        contactId: contact.id,
        leadgenId: input.leadgenId ?? null,
        formId: input.formId ?? null,
        adId: input.adId ?? null,
        pageId: input.pageId ?? null,
        source: input.source,
        fields: (input.fields ?? {}) as Prisma.InputJsonObject,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return null;
    throw err;
  }

  await logActivity(workspaceId, contact.id, "lead.created", `New lead from ${input.source.replace(/_/g, " ")}`, {
    leadId: lead.id,
    formId: lead.formId,
  });
  emitToWorkspace(workspaceId, "lead:new", { id: lead.id, name: contact.name, phone: contact.phone, source: lead.source });
  await dispatchEvent(workspaceId, "lead.created", {
    lead: { id: lead.id, source: lead.source, formId: lead.formId, adId: lead.adId, pageId: lead.pageId, fields: lead.fields },
    contact: { id: contact.id, name: contact.name, phone: contact.phone, email: contact.email, tags: contact.tags },
  });

  try {
    await runLeadAutomation(workspaceId, settings, contact, lead);
  } catch (err) {
    console.error("[leads] automation failed", err);
    await logActivity(workspaceId, contact.id, "lead.automation_failed", `Lead automation failed: ${(err as Error).message}`);
  }
  return lead;
}

async function runLeadAutomation(workspaceId: string, settings: LeadSettings, contact: Contact, lead: Lead) {
  if (!contact.phone) return;
  const channel = settings.channelId
    ? await prisma.channel.findFirst({ where: { id: settings.channelId, workspaceId, type: "WHATSAPP" } })
    : await prisma.channel.findFirst({ where: { workspaceId, type: "WHATSAPP" }, orderBy: { createdAt: "asc" } });
  if (!channel) return;

  const { conversation } = await getOrCreateConversation(workspaceId, contact.id, channel.id);

  if (settings.assignMode !== "none" && !conversation.assigneeId) {
    const assignee = settings.assignMode === "user" ? settings.assigneeId : await nextRoundRobinAgent(workspaceId);
    if (assignee) await assignConversation(conversation, assignee);
  }

  if (settings.enabled && settings.templateId) {
    const template = await prisma.template.findFirst({ where: { id: settings.templateId, channelId: channel.id } });
    if (template && template.status === "APPROVED") {
      const ctx = { contact, fields: lead.fields as Record<string, unknown> };
      const params = settings.variables.map((v) => renderText(v, ctx));
      const message = await sendMessage({
        conversationId: conversation.id,
        isBot: true,
        message: {
          kind: "template",
          name: template.name,
          language: template.language,
          bodyParams: params,
          preview: renderTemplateBody(template.components, params),
        },
      });
      if (message.status !== "failed") {
        await prisma.lead.update({ where: { id: lead.id }, data: { status: "contacted" } });
        await logActivity(workspaceId, contact.id, "lead.auto_reply", `Instant WhatsApp reply sent (${template.name})`);
      } else {
        await logActivity(workspaceId, contact.id, "lead.auto_reply_failed", `Instant reply failed: ${message.error}`);
      }
    }
  }

  await startTriggeredFlows("lead", {
    workspaceId,
    contactId: contact.id,
    conversationId: conversation.id,
    channelId: channel.id,
    variables: { ...(lead.fields as Record<string, unknown>), lead_source: lead.source },
  });
}
