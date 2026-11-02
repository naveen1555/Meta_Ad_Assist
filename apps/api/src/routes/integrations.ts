import { Router } from "express";
import { z } from "zod";
import { integrationInputSchema } from "@chatnova/shared";
import { prisma } from "../db";
import { requireManager } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";
import { assertFeature } from "../lib/limits";
import { randomToken, sha256 } from "../lib/utils";
import {
  appendToSheet,
  deliverWebhook,
  googleServiceAccount,
  sampleEventPayload,
} from "../services/integrations";

/** Mounted behind requireAuth + requireWorkspace. */
export const integrationsRouter = Router();

function validateConfig(input: z.infer<typeof integrationInputSchema>) {
  if (input.type === "webhook" && !input.config.url) throw badRequest("Webhook URL is required");
  if (input.type === "google_sheets") {
    if (!input.config.spreadsheetId) throw badRequest("Spreadsheet ID is required");
    if (!googleServiceAccount()) throw badRequest("Google Sheets is not configured on this server");
  }
}

integrationsRouter.get("/integrations", async (req, res) => {
  const items = await prisma.integration.findMany({ where: { workspaceId: req.workspaceId }, orderBy: { createdAt: "desc" } });
  res.json({ items, googleServiceAccountEmail: googleServiceAccount()?.client_email ?? null });
});

integrationsRouter.post("/integrations", requireManager, async (req, res) => {
  await assertFeature(req.workspaceId!, "integrations");
  const input = integrationInputSchema.parse(req.body);
  validateConfig(input);
  const config = { ...input.config, ...(input.type === "webhook" && !input.config.secret ? { secret: randomToken(24) } : {}) };
  const integration = await prisma.integration.create({
    data: { workspaceId: req.workspaceId!, type: input.type, name: input.name, events: input.events, active: input.active, config },
  });
  res.status(201).json(integration);
});

integrationsRouter.put("/integrations/:id", requireManager, async (req, res) => {
  const input = integrationInputSchema.parse(req.body);
  validateConfig(input);
  const existing = await prisma.integration.findFirst({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  if (!existing) throw notFound("Integration");
  const prev = existing.config as { secret?: string };
  res.json(
    await prisma.integration.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        events: input.events,
        active: input.active,
        config: { ...input.config, secret: input.config.secret || prev.secret },
      },
    }),
  );
});

integrationsRouter.delete("/integrations/:id", requireManager, async (req, res) => {
  await prisma.integration.deleteMany({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  res.json({ ok: true });
});

integrationsRouter.post("/integrations/:id/test", requireManager, async (req, res) => {
  const integration = await prisma.integration.findFirst({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  if (!integration) throw notFound("Integration");
  const cfg = integration.config as { url?: string; secret?: string; spreadsheetId?: string; sheetName?: string };
  const event = integration.events[0] ?? "lead.created";
  try {
    if (integration.type === "webhook") {
      await deliverWebhook(cfg.url!, cfg.secret, sampleEventPayload(req.workspaceId!, event), event);
    } else {
      await appendToSheet(cfg.spreadsheetId!, cfg.sheetName ?? "Sheet1", [
        [new Date().toLocaleString("en-IN"), `${event} (test)`, "Test Lead", "+919876543210", "test@example.com", "test", "city: Bengaluru"],
      ]);
    }
    await prisma.integration.update({ where: { id: integration.id }, data: { lastRunAt: new Date(), lastError: null } });
    res.json({ ok: true });
  } catch (err) {
    const message = (err as Error).message;
    await prisma.integration.update({ where: { id: integration.id }, data: { lastRunAt: new Date(), lastError: message } });
    throw badRequest(`Test failed: ${message}`);
  }
});

// ------------------------------------------------------------------ API keys

integrationsRouter.get("/api-keys", requireManager, async (req, res) => {
  res.json(
    await prisma.apiKey.findMany({
      where: { workspaceId: req.workspaceId },
      select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  );
});

integrationsRouter.post("/api-keys", requireManager, async (req, res) => {
  await assertFeature(req.workspaceId!, "api");
  const { name } = z.object({ name: z.string().min(1).max(60) }).parse(req.body);
  const key = `cn_live_${randomToken(24)}`;
  const record = await prisma.apiKey.create({
    data: { workspaceId: req.workspaceId!, name, prefix: key.slice(0, 14), keyHash: sha256(key) },
  });
  res.status(201).json({ id: record.id, name: record.name, prefix: record.prefix, key });
});

integrationsRouter.delete("/api-keys/:id", requireManager, async (req, res) => {
  await prisma.apiKey.deleteMany({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  res.json({ ok: true });
});
