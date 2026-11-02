import type { Contact, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { dispatchEvent, logActivity } from "./events";

export interface ContactIdentity {
  phone?: string | null;
  email?: string | null;
  messengerId?: string | null;
  instagramId?: string | null;
}

export interface ContactDetails extends ContactIdentity {
  name?: string | null;
  source?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  optIn?: boolean;
}

export function serializeContact(c: Contact) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    tags: c.tags,
    customFields: c.customFields,
    optIn: c.optIn,
    source: c.source,
    createdAt: c.createdAt,
  };
}

/** Finds a contact by any identity (phone, messenger id, instagram id, email) or creates one. */
export async function findOrCreateContact(
  workspaceId: string,
  details: ContactDetails,
): Promise<{ contact: Contact; created: boolean }> {
  const or: Prisma.ContactWhereInput[] = [];
  if (details.phone) or.push({ phone: details.phone });
  if (details.messengerId) or.push({ messengerId: details.messengerId });
  if (details.instagramId) or.push({ instagramId: details.instagramId });
  if (details.email) or.push({ email: details.email });

  const existing = or.length
    ? await prisma.contact.findFirst({ where: { workspaceId, OR: or }, orderBy: { createdAt: "asc" } })
    : null;

  if (existing) {
    const data: Prisma.ContactUpdateInput = {};
    if (!existing.name && details.name) data.name = details.name;
    if (!existing.phone && details.phone) data.phone = details.phone;
    if (!existing.email && details.email) data.email = details.email;
    if (!existing.messengerId && details.messengerId) data.messengerId = details.messengerId;
    if (!existing.instagramId && details.instagramId) data.instagramId = details.instagramId;
    if (details.tags?.length) data.tags = Array.from(new Set([...existing.tags, ...details.tags]));
    if (details.customFields) {
      data.customFields = { ...((existing.customFields as object) ?? {}), ...details.customFields } as Prisma.InputJsonObject;
    }
    if (details.optIn && !existing.optIn) {
      data.optIn = true;
      data.optInAt = new Date();
    }
    if (Object.keys(data).length === 0) return { contact: existing, created: false };
    try {
      return { contact: await prisma.contact.update({ where: { id: existing.id }, data }), created: false };
    } catch {
      return { contact: existing, created: false };
    }
  }

  const contact = await prisma.contact.create({
    data: {
      workspaceId,
      name: details.name ?? null,
      phone: details.phone ?? null,
      email: details.email ?? null,
      messengerId: details.messengerId ?? null,
      instagramId: details.instagramId ?? null,
      source: details.source,
      tags: details.tags ?? [],
      customFields: (details.customFields ?? {}) as Prisma.InputJsonObject,
      optIn: details.optIn ?? false,
      optInAt: details.optIn ? new Date() : null,
    },
  });
  await logActivity(workspaceId, contact.id, "contact.created", `Contact created from ${details.source ?? "manual entry"}`);
  await dispatchEvent(workspaceId, "contact.created", serializeContact(contact));
  return { contact, created: true };
}

export async function addTags(contactId: string, tags: string[]) {
  const c = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
  return prisma.contact.update({
    where: { id: contactId },
    data: { tags: Array.from(new Set([...c.tags, ...tags.map((t) => t.trim()).filter(Boolean)])) },
  });
}
