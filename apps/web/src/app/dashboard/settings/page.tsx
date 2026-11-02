"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Avatar, PageHeader, PageLoader, Tabs } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { canManage, useAuth } from "@/lib/auth";

type Tab = "general" | "team" | "quick" | "fields";

export default function SettingsPage() {
  const [tab, setTab] = React.useState<Tab>("general");
  return (
    <div className="p-6">
      <PageHeader title="Settings" description="Manage your workspace, team and inbox preferences" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "general", label: "General" },
          { value: "team", label: "Team" },
          { value: "quick", label: "Quick replies" },
          { value: "fields", label: "Custom fields" },
        ]}
      />
      <div className="mt-6 max-w-3xl">
        {tab === "general" && <GeneralTab />}
        {tab === "team" && <TeamTab />}
        {tab === "quick" && <QuickRepliesTab />}
        {tab === "fields" && <CustomFieldsTab />}
      </div>
    </div>
  );
}

function GeneralTab() {
  const { workspace, user, refresh } = useAuth();
  const manager = canManage(workspace?.role);
  const ws = useQuery({ queryKey: ["workspace"], queryFn: () => api("/api/workspace") });
  const [name, setName] = React.useState("");
  const [timezone, setTimezone] = React.useState("Asia/Kolkata");
  const [profileName, setProfileName] = React.useState(user?.name ?? "");
  const [password, setPassword] = React.useState("");

  React.useEffect(() => {
    if (ws.data) {
      setName(ws.data.name);
      setTimezone(ws.data.timezone);
    }
  }, [ws.data]);

  const saveWs = useMutation({
    mutationFn: () => api("/api/workspace", { method: "PATCH", body: { name, timezone } }),
    onSuccess: async () => {
      toast.success("Workspace updated");
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const saveProfile = useMutation({
    mutationFn: () =>
      api("/api/auth/me", { method: "PATCH", body: { name: profileName, ...(password ? { password } : {}) } }),
    onSuccess: async () => {
      toast.success("Profile updated");
      setPassword("");
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (ws.isLoading) return <PageLoader />;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Workspace ID: {workspace?.id}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!manager} />
          </Field>
          <Field label="Timezone">
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!manager}>
              {["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          {manager && (
            <Button onClick={() => saveWs.mutate()} loading={saveWs.isPending}>
              Save workspace
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>{user?.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Name">
            <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} />
          </Field>
          <Field label="New password" hint="Leave empty to keep your current password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button onClick={() => saveProfile.mutate()} loading={saveProfile.isPending}>
            Save profile
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function TeamTab() {
  const qc = useQueryClient();
  const { workspace } = useAuth();
  const manager = canManage(workspace?.role);
  const data = useQuery({ queryKey: ["members"], queryFn: () => api("/api/workspace/members") });
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("AGENT");

  const invite = useMutation({
    mutationFn: () => api("/api/workspace/invites", { body: { email, role } }),
    onSuccess: (r: any) => {
      setEmail("");
      qc.invalidateQueries({ queryKey: ["members"] });
      if (r.added) toast.success("Member added to the workspace");
      else {
        navigator.clipboard?.writeText(r.link).catch(() => undefined);
        toast.success("Invite created - link copied to clipboard");
      }
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const action = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (data.isLoading) return <PageLoader />;
  return (
    <div className="space-y-6">
      {manager && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
            <CardDescription>Agents can chat; admins can also manage channels, flows and settings.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                invite.mutate();
              }}
            >
              <Input type="email" required placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Select value={role} onChange={(e) => setRole(e.target.value)} className="sm:w-36">
                <option value="AGENT">Agent</option>
                <option value="ADMIN">Admin</option>
              </Select>
              <Button type="submit" loading={invite.isPending}>
                <UserPlus /> Invite
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {data.data?.members.map((m: any) => (
            <div key={m.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={m.user.name} />
                <div>
                  <p className="text-sm font-medium">{m.user.name}</p>
                  <p className="text-xs text-muted-foreground">{m.user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {manager && m.role !== "OWNER" ? (
                  <>
                    <Select
                      className="h-8 w-28 text-xs"
                      value={m.role}
                      onChange={(e) =>
                        action.mutate(() =>
                          api(`/api/workspace/members/${m.id}`, { method: "PATCH", body: { role: e.target.value } }),
                        )
                      }
                    >
                      <option value="AGENT">Agent</option>
                      <option value="ADMIN">Admin</option>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        confirm(`Remove ${m.user.name}?`) &&
                        action.mutate(() => api(`/api/workspace/members/${m.id}`, { method: "DELETE" }))
                      }
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </>
                ) : (
                  <Badge tone={m.role === "OWNER" ? "coral" : "default"}>{m.role.toLowerCase()}</Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      {data.data?.invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {data.data.invites.map((i: any) => (
              <div key={i.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{i.email}</p>
                  <p className="text-xs text-muted-foreground">{i.role.toLowerCase()}</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard?.writeText(i.link);
                      toast.success("Invite link copied");
                    }}
                  >
                    <Copy /> Copy link
                  </Button>
                  {manager && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => action.mutate(() => api(`/api/workspace/invites/${i.id}`, { method: "DELETE" }))}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QuickRepliesTab() {
  const qc = useQueryClient();
  const { workspace } = useAuth();
  const manager = canManage(workspace?.role);
  const list = useQuery({ queryKey: ["quick-replies"], queryFn: () => api<any[]>("/api/quick-replies") });
  const [shortcut, setShortcut] = React.useState("");
  const [content, setContent] = React.useState("");

  const create = useMutation({
    mutationFn: () => api("/api/quick-replies", { body: { shortcut, content } }),
    onSuccess: () => {
      setShortcut("");
      setContent("");
      qc.invalidateQueries({ queryKey: ["quick-replies"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/quick-replies/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quick-replies"] }),
  });

  return (
    <div className="space-y-6">
      {manager && (
        <Card>
          <CardHeader>
            <CardTitle>New quick reply</CardTitle>
            <CardDescription>
              Type <code>/shortcut</code> in the inbox composer to insert it. Supports {"{{name}}"} placeholders.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <Field label="Shortcut">
                <Input required placeholder="pricing" value={shortcut} onChange={(e) => setShortcut(e.target.value)} />
              </Field>
              <Field label="Message">
                <Textarea required value={content} onChange={(e) => setContent(e.target.value)} />
              </Field>
              <Button type="submit" loading={create.isPending}>
                Add quick reply
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="divide-y pt-5">
          {list.data?.length === 0 && <p className="py-4 text-sm text-muted-foreground">No quick replies yet.</p>}
          {list.data?.map((q) => (
            <div key={q.id} className="flex items-start justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-semibold text-primary">/{q.shortcut}</p>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{q.content}</p>
              </div>
              {manager && (
                <Button size="icon" variant="ghost" onClick={() => remove.mutate(q.id)}>
                  <Trash2 className="text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function CustomFieldsTab() {
  const qc = useQueryClient();
  const { workspace } = useAuth();
  const manager = canManage(workspace?.role);
  const list = useQuery({ queryKey: ["custom-fields"], queryFn: () => api<any[]>("/api/custom-fields") });
  const [form, setForm] = React.useState({ key: "", label: "", type: "text" });

  const create = useMutation({
    mutationFn: () => api("/api/custom-fields", { body: form }),
    onSuccess: () => {
      setForm({ key: "", label: "", type: "text" });
      qc.invalidateQueries({ queryKey: ["custom-fields"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/custom-fields/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-fields"] }),
  });

  return (
    <div className="space-y-6">
      {manager && (
        <Card>
          <CardHeader>
            <CardTitle>New custom field</CardTitle>
            <CardDescription>
              Use in messages as <code>{"{{field.key}}"}</code> and save chatbot answers into it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <Input required placeholder="Label (e.g. City)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value, key: form.key || "" })} />
              <Input
                required
                placeholder="key (e.g. city)"
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
              />
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
              </Select>
              <Button type="submit" loading={create.isPending}>
                Add field
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="divide-y pt-5">
          {list.data?.length === 0 && <p className="py-4 text-sm text-muted-foreground">No custom fields yet.</p>}
          {list.data?.map((f) => (
            <div key={f.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-xs text-muted-foreground">
                  {"{{field."}
                  {f.key}
                  {"}}"} - {f.type}
                </p>
              </div>
              {manager && (
                <Button size="icon" variant="ghost" onClick={() => remove.mutate(f.id)}>
                  <Trash2 className="text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
