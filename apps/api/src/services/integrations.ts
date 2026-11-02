import { JWT } from "google-auth-library";
import { config } from "../config";
import { prisma } from "../db";
import { hmacSha256 } from "../lib/utils";

interface DeliverJob {
  integrationId: string;
  event: string;
  payload: { event: string; workspaceId: string; timestamp: string; data: Record<string, any> };
}

let sheetsClient: JWT | null = null;

export function googleServiceAccount(): { client_email: string; private_key: string } | null {
  const raw = config.google.serviceAccountJson;
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    console.error("[integrations] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON or base64 JSON");
    return null;
  }
}

function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const sa = googleServiceAccount();
  if (!sa) throw new Error("Google Sheets is not configured on the server (GOOGLE_SERVICE_ACCOUNT_JSON)");
  sheetsClient = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return sheetsClient;
}

export async function deliverWebhook(url: string, secret: string | undefined, payload: unknown, event: string) {
  const body = JSON.stringify(payload);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "ChatNova-Webhooks/1.0",
      "X-ChatNova-Event": event,
      ...(secret ? { "X-ChatNova-Signature": `sha256=${hmacSha256(secret, body)}` } : {}),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Webhook responded with HTTP ${res.status}`);
}

function sheetRow(event: string, timestamp: string, data: Record<string, any>) {
  const contact = data.contact ?? data;
  const extra =
    event === "lead.created"
      ? Object.entries((data.lead?.fields as Record<string, unknown>) ?? {})
          .map(([k, v]) => `${k}: ${v}`)
          .join("; ")
      : event === "message.received"
        ? data.message?.body ?? `[${data.message?.type}]`
        : (contact.tags ?? []).join(", ");
  return [
    new Date(timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    event,
    contact.name ?? "",
    contact.phone ? `+${contact.phone}` : "",
    contact.email ?? "",
    data.lead?.source ?? data.channel ?? "",
    extra,
  ];
}

export async function appendToSheet(spreadsheetId: string, sheetName: string, values: unknown[][]) {
  const range = encodeURIComponent(`${sheetName || "Sheet1"}!A1`);
  await getSheetsClient().request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    method: "POST",
    data: { values },
  });
}

/** Job handler for "integration.deliver". Throws on failure so BullMQ retries. */
export async function deliverIntegration(job: DeliverJob) {
  const integration = await prisma.integration.findUnique({ where: { id: job.integrationId } });
  if (!integration || !integration.active) return;
  const cfg = integration.config as { url?: string; secret?: string; spreadsheetId?: string; sheetName?: string };
  try {
    if (integration.type === "webhook") {
      if (!cfg.url) throw new Error("Webhook URL missing");
      await deliverWebhook(cfg.url, cfg.secret, job.payload, job.event);
    } else if (integration.type === "google_sheets") {
      if (!cfg.spreadsheetId) throw new Error("Spreadsheet ID missing");
      await appendToSheet(cfg.spreadsheetId, cfg.sheetName ?? "Sheet1", [sheetRow(job.event, job.payload.timestamp, job.payload.data)]);
    }
    await prisma.integration.update({ where: { id: integration.id }, data: { lastRunAt: new Date(), lastError: null } });
  } catch (err) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastRunAt: new Date(), lastError: (err as Error).message.slice(0, 500) },
    });
    throw err;
  }
}

export function sampleEventPayload(workspaceId: string, event: string) {
  return {
    event,
    workspaceId,
    timestamp: new Date().toISOString(),
    test: true,
    data: {
      lead: { id: "lead_test", source: "facebook_lead_ad", formId: "123", fields: { full_name: "Test Lead", city: "Bengaluru" } },
      contact: { id: "contact_test", name: "Test Lead", phone: "919876543210", email: "test@example.com", tags: ["lead"] },
    },
  };
}
