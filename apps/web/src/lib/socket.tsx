"use client";

import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL, storage } from "./api";

const SocketContext = React.createContext<Socket | null>(null);

export function SocketProvider({ workspaceId, children }: { workspaceId: string; children: React.ReactNode }) {
  const [socket, setSocket] = React.useState<Socket | null>(null);

  React.useEffect(() => {
    const token = storage.getToken();
    if (!token) return;
    const s = io(API_URL, { auth: { token }, transports: ["websocket", "polling"] });
    s.on("connect", () => s.emit("join", workspaceId));
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [workspaceId]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return React.useContext(SocketContext);
}

/** Subscribes to a socket event for the lifetime of the component. */
export function useSocketEvent<T = any>(event: string, handler: (payload: T) => void) {
  const socket = useSocket();
  const ref = React.useRef(handler);
  ref.current = handler;
  React.useEffect(() => {
    if (!socket) return;
    const fn = (p: T) => ref.current(p);
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
  }, [socket, event]);
}
