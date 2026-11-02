import type { IntegrationEvent } from "@chatnova/shared";
import { prisma } from "../db";
import { enqueue } from "../queue";

/** Fans an event out to every active integration subscribed to it. */
export async function dispatchEvent(workspaceId: string, event: IntegrationEvent, payload: Record<string, unknown>) {
  const integrations = await prisma.integration.findMany({
    where: { workspaceId, active: true, events: { has: event } },
    select: { id: true },
  });
  for (const i of integrations) {
    await enqueue("integration.deliver", {
      integrationId: i.id,
      event,
      payload: { event, workspaceId, timestamp: new Date().toISOString(), data: payload },
    });
  }
}

export async function logActivity(
  workspaceId: string,
  contactId: string,
  type: string,
  description: string,
  data?: Record<string, unknown>,
) {
  await prisma.activity.create({ data: { workspaceId, contactId, type, description, data: data as any } });
}
