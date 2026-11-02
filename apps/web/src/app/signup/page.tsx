"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton } from "@/components/auth/google-button";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const { setSession } = useAuth();
  const [form, setForm] = React.useState({ name: "", email: "", password: "", workspaceName: "" });
  const [loading, setLoading] = React.useState(false);

  const done = React.useCallback(
    async (token: string, workspaceId?: string) => {
      await setSession(token, workspaceId);
      router.push(next);
    },
    [next, router, setSession],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api<{ token: string; workspaceId: string }>("/api/auth/register", { body: form });
      await done(r.token, r.workspaceId);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <AuthShell title="Create your account" subtitle="Free plan, no credit card required">
      <GoogleButton onToken={done} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Your name">
          <Input required value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Work email">
          <Input type="email" required value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input type="password" required minLength={8} value={form.password} onChange={set("password")} />
        </Field>
        <Field label="Business name">
          <Input required value={form.workspaceName} onChange={set("workspaceName")} placeholder="Acme Realty" />
        </Field>
        <Button type="submit" variant="accent" className="w-full" loading={loading}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={`/login${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-primary">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <React.Suspense>
      <SignupForm />
    </React.Suspense>
  );
}
