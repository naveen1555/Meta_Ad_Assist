"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/misc";
import { AuthShell } from "@/components/auth/auth-shell";
import { api, errorMessage, storage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const [accepting, setAccepting] = React.useState(false);
  const invite = useQuery({
    queryKey: ["invite", token],
    queryFn: () => api<{ email: string; role: string; workspaceName: string }>(`/api/invites/${token}`),
  });

  async function accept() {
    setAccepting(true);
    try {
      const r = await api<{ workspaceId: string }>(`/api/invites/${token}/accept`, { method: "POST" });
      storage.setWorkspace(r.workspaceId);
      await refresh();
      router.push("/dashboard/inbox");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setAccepting(false);
    }
  }

  if (invite.isLoading || loading) return <PageLoader />;
  if (invite.error || !invite.data) {
    return (
      <AuthShell title="Invite not found" subtitle="This invite link is invalid or has already been used.">
        <Link href="/login">
          <Button className="w-full">Go to login</Button>
        </Link>
      </AuthShell>
    );
  }

  const next = `/invite/${token}`;
  return (
    <AuthShell
      title={`Join ${invite.data.workspaceName}`}
      subtitle={`You were invited as ${invite.data.role.toLowerCase()} (${invite.data.email}).`}
    >
      {user ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Logged in as {user.email}</p>
          <Button className="w-full" onClick={accept} loading={accepting}>
            Accept invite
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          <Link href={`/signup?next=${encodeURIComponent(next)}`}>
            <Button variant="accent" className="w-full">
              Create an account
            </Button>
          </Link>
          <Link href={`/login?next=${encodeURIComponent(next)}`}>
            <Button variant="outline" className="w-full">
              I already have an account
            </Button>
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
