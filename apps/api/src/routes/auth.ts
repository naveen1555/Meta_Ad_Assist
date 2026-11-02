import { Router } from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { loginSchema, registerSchema } from "@chatnova/shared";
import { prisma } from "../db";
import { config } from "../config";
import { isSuperAdmin, requireAuth, signToken } from "../lib/auth";
import { HttpError, badRequest } from "../lib/errors";

export const authRouter = Router();

const googleClient = new OAuth2Client();

export async function listWorkspaces(userId: string) {
  const members = await prisma.member.findMany({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({ id: m.workspace.id, name: m.workspace.name, plan: m.workspace.plan, role: m.role }));
}

async function createWorkspaceFor(userId: string, name: string) {
  return prisma.workspace.create({
    data: { name, members: { create: { userId, role: "OWNER" } } },
  });
}

function publicUser(u: { id: string; name: string; email: string; avatarUrl: string | null }) {
  return { id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl };
}

authRouter.post("/register", async (req, res) => {
  const input = registerSchema.parse(req.body);
  const email = input.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new HttpError(409, "An account with this email already exists");
  }
  const user = await prisma.user.create({
    data: { email, name: input.name, passwordHash: await bcrypt.hash(input.password, 10) },
  });
  const workspace = await createWorkspaceFor(user.id, input.workspaceName);
  res.status(201).json({
    token: signToken(user),
    user: publicUser(user),
    workspaceId: workspace.id,
  });
});

authRouter.post("/login", async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user?.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password");
  }
  const workspaces = await listWorkspaces(user.id);
  res.json({ token: signToken(user), user: publicUser(user), workspaceId: workspaces[0]?.id });
});

authRouter.post("/google", async (req, res) => {
  const { credential } = z.object({ credential: z.string() }).parse(req.body);
  if (!config.google.clientId) throw badRequest("Google login is not configured");
  const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: config.google.clientId });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.email_verified) throw badRequest("Google account email is not verified");

  const email = payload.email.toLowerCase();
  let user = await prisma.user.findFirst({ where: { OR: [{ googleId: payload.sub }, { email }] } });
  let workspaceId: string | undefined;
  if (!user) {
    user = await prisma.user.create({
      data: { email, name: payload.name || email.split("@")[0]!, googleId: payload.sub, avatarUrl: payload.picture },
    });
    workspaceId = (await createWorkspaceFor(user.id, `${user.name.split(" ")[0]}'s workspace`)).id;
  } else if (!user.googleId) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { googleId: payload.sub, avatarUrl: user.avatarUrl ?? payload.picture },
    });
  }
  workspaceId ??= (await listWorkspaces(user.id))[0]?.id;
  res.json({ token: signToken(user), user: publicUser(user), workspaceId });
});

authRouter.get("/config", (_req, res) => {
  res.json({ googleClientId: config.google.clientId || null });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new HttpError(401, "Account not found");
  res.json({
    user: publicUser(user),
    workspaces: await listWorkspaces(user.id),
    isSuperAdmin: isSuperAdmin(user.email),
  });
});

authRouter.patch("/me", requireAuth, async (req, res) => {
  const input = z
    .object({ name: z.string().min(2).max(80).optional(), password: z.string().min(8).max(128).optional() })
    .parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      name: input.name,
      passwordHash: input.password ? await bcrypt.hash(input.password, 10) : undefined,
    },
  });
  res.json({ user: publicUser(user) });
});

authRouter.post("/workspaces", requireAuth, async (req, res) => {
  const { name } = z.object({ name: z.string().min(2).max(80) }).parse(req.body);
  const workspace = await createWorkspaceFor(req.user!.id, name);
  res.status(201).json({ id: workspace.id, name: workspace.name, plan: workspace.plan, role: "OWNER" });
});
