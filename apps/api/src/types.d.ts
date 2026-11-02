import type { Role } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
      workspaceId?: string;
      role?: Role;
      rawBody?: Buffer;
    }
  }
}

export {};
