"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Menu, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { PLANS } from "@chatnova/shared";
import { Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function useClickOutside(ref: React.RefObject<HTMLElement>, onOutside: () => void) {
  React.useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [ref, onOutside]);
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const { user, workspace, workspaces, switchWorkspace, refresh, logout } = useAuth();
  const [wsOpen, setWsOpen] = React.useState(false);
  const [userOpen, setUserOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const wsRef = React.useRef<HTMLDivElement>(null);
  const userRef = React.useRef<HTMLDivElement>(null);
  useClickOutside(wsRef, React.useCallback(() => setWsOpen(false), []));
  useClickOutside(userRef, React.useCallback(() => setUserOpen(false), []));

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const ws = await api<{ id: string }>("/api/auth/workspaces", { body: { name: newName } });
      switchWorkspace(ws.id);
      await refresh();
      setCreateOpen(false);
      setNewName("");
      router.push("/dashboard");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-white px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button className="lg:hidden" onClick={onMenu} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <div className="relative" ref={wsRef}>
          <button
            onClick={() => setWsOpen(!wsOpen)}
            className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            <span className="max-w-[160px] truncate">{workspace?.name}</span>
            {workspace && <Badge tone="coral">{PLANS[workspace.plan]?.name ?? workspace.plan}</Badge>}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
          {wsOpen && (
            <div className="absolute left-0 top-11 z-30 w-64 rounded-xl border bg-white p-1.5 shadow-xl">
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  onClick={() => {
                    switchWorkspace(w.id);
                    setWsOpen(false);
                    router.push("/dashboard");
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="truncate">{w.name}</span>
                  {w.id === workspace?.id && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
              <button
                onClick={() => {
                  setWsOpen(false);
                  setCreateOpen(true);
                }}
                className="mt-1 flex w-full items-center gap-2 rounded-lg border-t px-3 py-2 text-left text-sm text-primary hover:bg-muted"
              >
                <Plus className="h-4 w-4" /> New workspace
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="relative" ref={userRef}>
        <button onClick={() => setUserOpen(!userOpen)} className="flex items-center gap-2">
          <Avatar name={user?.name} />
          <span className="hidden text-sm font-medium sm:block">{user?.name}</span>
        </button>
        {userOpen && (
          <div className="absolute right-0 top-11 z-30 w-56 rounded-xl border bg-white p-1.5 shadow-xl">
            <div className="px-3 py-2">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">Role: {workspace?.role.toLowerCase()}</p>
            </div>
            <button
              onClick={logout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-muted"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        )}
      </div>
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create workspace">
        <form onSubmit={createWorkspace} className="space-y-4">
          <Field label="Workspace name">
            <Input required value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" loading={creating}>
            Create
          </Button>
        </form>
      </Dialog>
    </header>
  );
}
