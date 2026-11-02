import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { config } from "../config";
import { requireManager, signState, verifyState } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";
import { assertLimit, getEffectivePlan } from "../lib/limits";
import { graph, GraphError } from "../meta/graph";

const channelSelect = {
  id: true,
  type: true,
  name: true,
  externalId: true,
  wabaId: true,
  pageId: true,
  phoneNumber: true,
  status: true,
  createdAt: true,
} as const;

const OAUTH_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "pages_read_engagement",
  "pages_manage_ads",
  "leads_retrieval",
  "instagram_basic",
  "instagram_manage_messages",
  "business_management",
].join(",");

const redirectUri = () => `${config.apiUrl}/api/meta/callback`;

/** Mounted behind requireAuth + requireWorkspace. */
export const channelsRouter = Router();

channelsRouter.get("/channels", async (req, res) => {
  const channels = await prisma.channel.findMany({
    where: { workspaceId: req.workspaceId },
    select: channelSelect,
    orderBy: { createdAt: "asc" },
  });
  res.json(channels);
});

channelsRouter.post("/channels/whatsapp", requireManager, async (req, res) => {
  const input = z
    .object({
      name: z.string().min(1).max(80).optional(),
      phoneNumberId: z.string().min(5),
      wabaId: z.string().min(5),
      accessToken: z.string().min(20),
    })
    .parse(req.body);

  const existing = await prisma.channel.findUnique({
    where: { type_externalId: { type: "WHATSAPP", externalId: input.phoneNumberId } },
  });
  if (existing && existing.workspaceId !== req.workspaceId) {
    throw badRequest("This WhatsApp number is already connected to another workspace");
  }
  if (!existing) await assertLimit(req.workspaceId!, "channels");

  let info: { display_phone_number?: string; verified_name?: string };
  try {
    info = await graph(input.phoneNumberId, {
      token: input.accessToken,
      query: { fields: "display_phone_number,verified_name" },
    });
    await graph(`${input.wabaId}/subscribed_apps`, { method: "POST", token: input.accessToken, body: {} });
  } catch (err) {
    throw badRequest(`Meta rejected these credentials: ${err instanceof GraphError ? err.message : "unknown error"}`);
  }

  const data = {
    workspaceId: req.workspaceId!,
    type: "WHATSAPP" as const,
    name: input.name || info.verified_name || "WhatsApp",
    externalId: input.phoneNumberId,
    wabaId: input.wabaId,
    phoneNumber: info.display_phone_number ?? null,
    accessToken: input.accessToken,
    status: "active",
  };
  const channel = await prisma.channel.upsert({
    where: { type_externalId: { type: "WHATSAPP", externalId: input.phoneNumberId } },
    create: data,
    update: data,
    select: channelSelect,
  });
  res.status(201).json(channel);
});

channelsRouter.get("/channels/meta/connect-url", requireManager, (req, res) => {
  if (!config.meta.appId || !config.meta.appSecret) {
    throw badRequest("META_APP_ID and META_APP_SECRET must be configured on the API");
  }
  const state = signState({ workspaceId: req.workspaceId!, userId: req.user!.id });
  const url = new URL(`https://www.facebook.com/${config.meta.graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", config.meta.appId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("scope", OAUTH_SCOPES);
  url.searchParams.set("response_type", "code");
  res.json({ url: url.toString() });
});

channelsRouter.patch("/channels/:id", requireManager, async (req, res) => {
  const { name } = z.object({ name: z.string().min(1).max(80) }).parse(req.body);
  const ch = await prisma.channel.findFirst({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  if (!ch) throw notFound("Channel");
  res.json(await prisma.channel.update({ where: { id: ch.id }, data: { name }, select: channelSelect }));
});

channelsRouter.delete("/channels/:id", requireManager, async (req, res) => {
  const ch = await prisma.channel.findFirst({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  if (!ch) throw notFound("Channel");
  await prisma.channel.delete({ where: { id: ch.id } });
  res.json({ ok: true });
});

/** Public: Facebook Login redirect target. */
export const metaOAuthRouter = Router();

metaOAuthRouter.get("/callback", async (req, res) => {
  const back = (params: Record<string, string>) =>
    res.redirect(`${config.webUrl}/dashboard/channels?${new URLSearchParams(params).toString()}`);

  const { code, state, error_description } = req.query as Record<string, string | undefined>;
  if (!code || !state) return back({ error: error_description || "Facebook login was cancelled" });

  let ctx: { workspaceId: string; userId: string };
  try {
    ctx = verifyState(state);
  } catch {
    return back({ error: "The connection link expired, please try again" });
  }

  try {
    const short = await graph<{ access_token: string }>("oauth/access_token", {
      query: {
        client_id: config.meta.appId,
        client_secret: config.meta.appSecret,
        redirect_uri: redirectUri(),
        code,
      },
    });
    const long = await graph<{ access_token: string }>("oauth/access_token", {
      query: {
        grant_type: "fb_exchange_token",
        client_id: config.meta.appId,
        client_secret: config.meta.appSecret,
        fb_exchange_token: short.access_token,
      },
    });
    const pages = await graph<{
      data: { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }[];
    }>("me/accounts", {
      token: long.access_token,
      query: { fields: "id,name,access_token,instagram_business_account{id,username}", limit: 100 },
    });

    const plan = await getEffectivePlan(ctx.workspaceId);
    let count = await prisma.channel.count({ where: { workspaceId: ctx.workspaceId } });
    const canAdd = () => plan.limits.channels < 0 || count < plan.limits.channels;
    let connected = 0;
    let skipped = 0;

    const upsert = async (type: "MESSENGER" | "INSTAGRAM", externalId: string, name: string, pageId: string, token: string) => {
      const existing = await prisma.channel.findUnique({ where: { type_externalId: { type, externalId } } });
      if (existing && existing.workspaceId !== ctx.workspaceId) return skipped++;
      if (!existing && !canAdd()) return skipped++;
      await prisma.channel.upsert({
        where: { type_externalId: { type, externalId } },
        create: { workspaceId: ctx.workspaceId, type, externalId, name, pageId, accessToken: token },
        update: { name, pageId, accessToken: token, status: "active" },
      });
      if (!existing) count++;
      connected++;
    };

    for (const page of pages.data) {
      try {
        await graph(`${page.id}/subscribed_apps`, {
          method: "POST",
          token: page.access_token,
          query: { subscribed_fields: "messages,messaging_postbacks,message_deliveries,message_reads,leadgen" },
        });
      } catch (err) {
        console.error(`[meta] could not subscribe page ${page.id}`, err);
      }
      await upsert("MESSENGER", page.id, page.name, page.id, page.access_token);
      const ig = page.instagram_business_account;
      if (ig) await upsert("INSTAGRAM", ig.id, ig.username ? `@${ig.username}` : `${page.name} Instagram`, page.id, page.access_token);
    }
    return back({ connected: String(connected), ...(skipped ? { skipped: String(skipped) } : {}) });
  } catch (err) {
    console.error("[meta] oauth callback failed", err);
    return back({ error: err instanceof Error ? err.message : "Could not connect to Meta" });
  }
});
