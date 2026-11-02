import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { config } from "../config";
import { prisma } from "../db";
import { verifyToken } from "./auth";

let io: Server | null = null;

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: config.corsOrigins, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("unauthorized"));
    try {
      socket.data.userId = verifyToken(token).sub;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("join", async (workspaceId: string) => {
      const member = await prisma.member.findUnique({
        where: { userId_workspaceId: { userId: socket.data.userId, workspaceId } },
      });
      if (!member) return;
      for (const room of socket.rooms) if (room.startsWith("ws:")) socket.leave(room);
      socket.join(`ws:${workspaceId}`);
      socket.join(`user:${socket.data.userId}`);
    });
  });

  return io;
}

export function emitToWorkspace(workspaceId: string, event: string, payload: unknown) {
  io?.to(`ws:${workspaceId}`).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}
