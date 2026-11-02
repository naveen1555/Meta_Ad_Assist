import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { config } from "../config";
import { prisma } from "../db";
import { HttpError, forbidden } from "./errors";

interface TokenPayload {
  sub: string;
  email: string;
}

export function signToken(user: { id: string; email: string }) {
  return jwt.sign({ sub: user.id, email: user.email } satisfies TokenPayload, config.jwtSecret, {
    expiresIn: "30d",
  });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
}

export function signState(data: Record<string, string>, expiresIn: jwt.SignOptions["expiresIn"] = "15m") {
  return jwt.sign(data, config.jwtSecret, { expiresIn });
}

export function verifyState<T>(token: string): T {
  return jwt.verify(token, config.jwtSecret) as T;
}

export const requireAuth: RequestHandler<any, any, any, any> = (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, "Not authenticated"));
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    next(new HttpError(401, "Session expired, please log in again"));
  }
};

/** Requires X-Workspace-Id header and membership; sets req.workspaceId and req.role. */
export const requireWorkspace: RequestHandler = async (req, _res, next) => {
  const workspaceId = req.header("x-workspace-id");
  if (!workspaceId) return next(new HttpError(400, "Missing X-Workspace-Id header"));
  const member = await prisma.member.findUnique({
    where: { userId_workspaceId: { userId: req.user!.id, workspaceId } },
  });
  if (!member) return next(forbidden("You are not a member of this workspace"));
  req.workspaceId = workspaceId;
  req.role = member.role;
  next();
};

/** Typed with `any` params so it doesn't override the route-path param inference of the handlers after it. */
export function requireRole(...roles: Role[]): RequestHandler<any, any, any, any> {
  return (req, _res, next) => {
    if (!req.role || !roles.includes(req.role)) return next(forbidden());
    next();
  };
}

export const requireManager = requireRole("OWNER", "ADMIN");

export function isSuperAdmin(email: string) {
  return config.superAdmins.includes(email.toLowerCase());
}

export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user || !isSuperAdmin(req.user.email)) return next(forbidden("Super admin only"));
  next();
};
