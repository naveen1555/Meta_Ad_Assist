"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageLoader } from "@/components/ui/misc";
import { useAuth } from "@/lib/auth";
import { SocketProvider, useSocketEvent } from "@/lib/socket";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

function GlobalNotifications() {
  const qc = useQueryClient();
  const router = useRouter();
  useSocketEvent<{ name?: string; phone?: string }>("lead:new", (lead) => {
    qc.invalidateQueries({ queryKey: ["leads"] });
    toast.success(`New lead: ${lead.name || lead.phone || "Unknown"}`, {
      action: { label: "View", onClick: () => router.push("/dashboard/leads") },
    });
  });
  useSocketEvent<{ contactName?: string; conversationId: string }>("conversation:assigned-to-you", (p) => {
    toast(`Chat with ${p.contactName || "a contact"} was assigned to you`, {
      action: { label: "Open", onClick: () => router.push(`/dashboard/inbox?c=${p.conversationId}`) },
    });
  });
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, user, workspace } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  if (loading || !user) return <PageLoader />;
  if (!workspace) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        You are not a member of any workspace yet.
      </div>
    );
  }

  return (
    <SocketProvider workspaceId={workspace.id}>
      <GlobalNotifications />
      <div className="flex h-screen overflow-hidden bg-background">
        <div className="hidden lg:block">
          <Sidebar />
        </div>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <div className="relative h-full w-64">
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenu={() => setMobileOpen(true)} />
          <main key={workspace.id} className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </SocketProvider>
  );
}
