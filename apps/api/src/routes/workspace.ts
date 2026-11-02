import { Router } from "express";
import { z } from "zod";
import { DEFAULT_LEAD_SETTINGS, leadSettingsSchema } from "@chatnova/shared";
import { prisma } from "../db";
import { config } from "../config";
import { requireAuth, requireManager, requireRole } from "../lib/auth";
import { HttpError, badRequest, forbidden, notFound } from "../lib/errors";
import { assertLimit } from "../lib/limits";
import { randomToken } from "../lib/utils";

/** Mounted behind requireAuth + requireWorkspace. */
export const workspaceRouter = Router();

workspaceRouter.get("/workspace", async (req, res) => {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: req.workspaceId } });
  res.json({ ...ws, leadSettings: { ...DEFAULT_LEAD_SETTINGS, ...((ws.leadSettings as object) ?? {}) } });
});

workspaceRouter.patch("/workspace", requireManager, async (req, res) => {
  const input = z
    .object({ name: z.string().min(2).max(80).optional(), timezone: z.string().max(60).optional() })
    .parse(req.body);
  res.json(await prisma.workspace.update({ where: { id: req.workspaceId }, data: input }));
});

workspaceRouter.delete("/workspace", requireRole("OWNER"), async (req, res) => {
  await prisma.workspace.delete({ where: { id: req.workspaceId } });
  res.json({ ok: true });
});

workspaceRouter.get("/workspace/members", async (req, res) => {
  const [members, invites] = await Promise.all([
    prisma.member.findMany({
      where: { workspaceId: req.workspaceId },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invite.findMany({ where: { workspaceId: req.workspaceId, acceptedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  res.json({
    members,
    invites: invites.map((i) => ({ ...i, link: `${config.webUrl}/invite/${i.token}` })),
  });
});

workspaceRouter.post("/workspace/invites", requireManager, async (req, res) => {
  const input = z.object({ email: z.string().email(), role: z.enum(["ADMIN", "AGENT"]) }).parse(req.body);
  const email = input.email.toLowerCase();
  await assertLimit(req.workspaceId!, "agents");

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const already = await prisma.member.findUnique({
      where: { userId_workspaceId: { userId: existingUser.id, workspaceId: req.workspaceId! } },
    });
    if (already) throw badRequest("This person is already a member");
    await prisma.member.create({ data: { userId: existingUser.id, workspaceId: req.workspaceId!, role: input.role } });
    res.status(201).json({ added: true });
    return;
  }
  const invite = await prisma.invite.create({
    data: { workspaceId: req.workspaceId!, email, role: input.role, token: randomToken() },
  });
  res.status(201).json({ added: false, invite, link: `${config.webUrl}/invite/${invite.token}` });
});

workspaceRouter.delete("/workspace/invites/:id", requireManager, async (req, res) => {
  await prisma.invite.deleteMany({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  res.json({ ok: true });
});

workspaceRouter.patch("/workspace/members/:id", requireManager, async (req, res) => {
  const { role } = z.object({ role: z.enum(["ADMIN", "AGENT"]) }).parse(req.body);
  const member = await prisma.member.findFirst({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  if (!member) throw notFound("Member");
  if (member.role === "OWNER") throw forbidden("The owner's role cannot be changed");
  res.json(await prisma.member.update({ where: { id: member.id }, data: { role } }));
});

workspaceRouter.delete("/workspace/members/:id", requireManager, async (req, res) => {
  const member = await prisma.member.findFirst({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  if (!member) throw notFound("Member");
  if (member.role === "OWNER") throw forbidden("The owner cannot be removed");
  await prisma.member.delete({ where: { id: member.id } });
  await prisma.conversation.updateMany({
    where: { workspaceId: req.workspaceId, assigneeId: member.userId },
    data: { assigneeId: null },
  });
  res.json({ ok: true });
});

workspaceRouter.get("/workspace/lead-settings", async (req, res) => {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: req.workspaceId } });
  res.json({ ...DEFAULT_LEAD_SETTINGS, ...((ws.leadSettings as object) ?? {}) });
});

workspaceRouter.put("/workspace/lead-settings", requireManager, async (req, res) => {
  const settings = leadSettingsSchema.parse(req.body);
  if (settings.enabled && (!settings.channelId || !settings.templateId)) {
    throw badRequest("Choose a WhatsApp channel and a template to enable the instant reply");
  }
  await prisma.workspace.update({ where: { id: req.workspaceId }, data: { leadSettings: settings } });
  res.json(settings);
});

workspaceRouter.get("/quick-replies", async (req, res) => {
  res.json(await prisma.quickReply.findMany({ where: { workspaceId: req.workspaceId }, orderBy: { shortcut: "asc" } }));
});

workspaceRouter.post("/quick-replies", requireManager, async (req, res) => {
  const input = z
    .object({ shortcut: z.string().min(1).max(30).regex(/^[\w-]+$/, "Use letters, numbers and dashes"), content: z.string().min(1).max(2000) })
    .parse(req.body);
  res.status(201).json(await prisma.quickReply.create({ data: { ...input, workspaceId: req.workspaceId! } }));
});

workspaceRouter.delete("/quick-replies/:id", requireManager, async (req, res) => {
  await prisma.quickReply.deleteMany({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  res.json({ ok: true });
});

workspaceRouter.get("/custom-fields", async (req, res) => {
  res.json(await prisma.customField.findMany({ where: { workspaceId: req.workspaceId }, orderBy: { createdAt: "asc" } }));
});

workspaceRouter.post("/custom-fields", requireManager, async (req, res) => {
  const input = z
    .object({
      key: z.string().min(1).max(40).regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers and underscores"),
      label: z.string().min(1).max(60),
      type: z.enum(["text", "number", "date"]).default("text"),
    })
    .parse(req.body);
  res.status(201).json(await prisma.customField.create({ data: { ...input, workspaceId: req.workspaceId! } }));
});

workspaceRouter.delete("/custom-fields/:id", requireManager, async (req, res) => {
  await prisma.customField.deleteMany({ where: { id: req.params.id, workspaceId: req.workspaceId } });
  res.json({ ok: true });
});

/** Public invite lookup + accept (auth only, no workspace header). */
export const inviteRouter = Router();

inviteRouter.get("/:token", async (req, res) => {
  const invite = await prisma.invite.findUnique({ where: { token: req.params.token }, include: { workspace: true } });
  if (!invite || invite.acceptedAt) throw notFound("Invite");
  res.json({ email: invite.email, role: invite.role, workspaceName: invite.workspace.name });
});

inviteRouter.post("/:token/accept", requireAuth, async (req, res) => {
  const invite = await prisma.invite.findUnique({ where: { token: req.params.token } });
  if (!invite || invite.acceptedAt) throw notFound("Invite");
  if (invite.email !== req.user!.email.toLowerCase()) {
    throw new HttpError(403, `This invite was sent to ${invite.email}. Log in with that email to accept it.`);
  }
  await prisma.$transaction([
    prisma.member.upsert({
      where: { userId_workspaceId: { userId: req.user!.id, workspaceId: invite.workspaceId } },
      create: { userId: req.user!.id, workspaceId: invite.workspaceId, role: invite.role },
      update: {},
    }),
    prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);
  res.json({ workspaceId: invite.workspaceId });
});
