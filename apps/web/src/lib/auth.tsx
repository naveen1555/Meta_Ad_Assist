"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PlanId, Role } from "@chatnova/shared";
import { api, storage } from "./api";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

export interface SessionWorkspace {
  id: string;
  name: string;
  plan: PlanId;
  role: Role;
}

interface AuthState {
  loading: boolean;
  user: SessionUser | null;
  workspaces: SessionWorkspace[];
  workspace: SessionWorkspace | null;
  isSuperAdmin: boolean;
  setSession: (token: string, workspaceId?: string) => Promise<void>;
  switchWorkspace: (id: string) => void;
  refresh: () => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [loading, setLoading] = React.useState(true);
  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [workspaces, setWorkspaces] = React.useState<SessionWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [isSuperAdmin, setSuperAdmin] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!storage.getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api<{ user: SessionUser; workspaces: SessionWorkspace[]; isSuperAdmin: boolean }>(
        "/api/auth/me",
      );
      setUser(me.user);
      setWorkspaces(me.workspaces);
      setSuperAdmin(me.isSuperAdmin);
      const stored = storage.getWorkspace();
      const current = me.workspaces.find((w) => w.id === stored) ?? me.workspaces[0] ?? null;
      storage.setWorkspace(current?.id ?? null);
      setWorkspaceId(current?.id ?? null);
    } catch {
      storage.setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const value: AuthState = {
    loading,
    user,
    workspaces,
    workspace: workspaces.find((w) => w.id === workspaceId) ?? null,
    isSuperAdmin,
    setSession: async (token, wsId) => {
      storage.setToken(token);
      if (wsId) storage.setWorkspace(wsId);
      await refresh();
    },
    switchWorkspace: (id) => {
      storage.setWorkspace(id);
      setWorkspaceId(id);
      qc.clear();
    },
    refresh,
    logout: () => {
      storage.setToken(null);
      storage.setWorkspace(null);
      setUser(null);
      qc.clear();
      window.location.href = "/login";
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function canManage(role?: Role | null) {
  return role === "OWNER" || role === "ADMIN";
}
