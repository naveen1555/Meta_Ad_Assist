"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Facebook, MessageCircle, Radio, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CHANNEL_LABELS } from "@chatnova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { EmptyState, PageHeader, PageLoader } from "@/components/ui/misc";
import { ChannelIcon } from "@/components/dashboard/channel-icon";
import { API_URL, api, errorMessage } from "@/lib/api";
import { canManage, useAuth } from "@/lib/auth";
import { useChannels } from "@/lib/hooks";
import { formatDate } from "@/lib/utils";

function ChannelsContent() {
  const qc = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const { workspace } = useAuth();
  const manager = canManage(workspace?.role);
  const channels = useChannels();
  const [waOpen, setWaOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", phoneNumberId: "", wabaId: "", accessToken: "" });

  React.useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) toast.success(`Connected ${connected} Facebook/Instagram channel(s)`);
    if (params.get("skipped")) toast.warning(`${params.get("skipped")} channel(s) skipped (plan limit or used elsewhere)`);
    if (error) toast.error(error);
    if (connected || error) router.replace("/dashboard/channels");
  }, [params, router]);

  const connectWa = useMutation({
    mutationFn: () => api("/api/channels/whatsapp", { body: form }),
    onSuccess: () => {
      toast.success("WhatsApp number connected");
      setWaOpen(false);
      setForm({ name: "", phoneNumberId: "", wabaId: "", accessToken: "" });
      qc.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const connectMeta = useMutation({
    mutationFn: () => api<{ url: string }>("/api/channels/meta/connect-url"),
    onSuccess: (r) => (window.location.href = r.url),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/channels/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const webhookUrl = `${API_URL}/webhooks/meta`;

  return (
    <div className="p-6">
      <PageHeader
        title="Channels"
        description="Connect WhatsApp numbers, Facebook pages and Instagram accounts"
        actions={
          manager && (
            <>
              <Button variant="outline" onClick={() => connectMeta.mutate()} loading={connectMeta.isPending}>
                <Facebook /> Connect Facebook & Instagram
              </Button>
              <Button onClick={() => setWaOpen(true)}>
                <MessageCircle /> Connect WhatsApp
              </Button>
            </>
          )
        }
      />

      {channels.isLoading ? (
        <PageLoader />
      ) : !channels.data?.length ? (
        <EmptyState
          icon={Radio}
          title="No channels connected"
          description="Connect a WhatsApp Business number to start sending messages, or a Facebook page to receive Lead Ads."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {channels.data.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-start gap-4 pt-5">
                <ChannelIcon type={c.type} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{c.name}</p>
                    <Badge tone={c.status === "active" ? "success" : "warning"}>{c.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {CHANNEL_LABELS[c.type]} {c.phoneNumber ? `- ${c.phoneNumber}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    ID {c.externalId} - added {formatDate(c.createdAt, false)}
                  </p>
                </div>
                {manager && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => confirm(`Disconnect ${c.name}? Conversations on it will be deleted.`) && remove.mutate(c.id)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Meta webhook setup</CardTitle>
          <CardDescription>
            In your Meta app, add this callback URL for the WhatsApp Business Account, Page and Instagram products, using
            the verify token from your API&apos;s <code>META_VERIFY_TOKEN</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input readOnly value={webhookUrl} />
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard?.writeText(webhookUrl);
                toast.success("Copied");
              }}
            >
              <Copy />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Subscribe to fields: WhatsApp <code>messages</code>, <code>message_template_status_update</code>; Page{" "}
            <code>messages</code>, <code>messaging_postbacks</code>, <code>message_deliveries</code>,{" "}
            <code>message_reads</code>, <code>leadgen</code>; Instagram <code>messages</code>.
          </p>
        </CardContent>
      </Card>

      <Dialog
        open={waOpen}
        onClose={() => setWaOpen(false)}
        title="Connect WhatsApp Cloud API"
        description="Find these values in Meta Business Manager > WhatsApp Manager and your app's WhatsApp > API Setup page. Use a permanent System User token."
        footer={
          <>
            <Button variant="outline" onClick={() => setWaOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => connectWa.mutate()} loading={connectWa.isPending}>
              Connect
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Display name (optional)">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sales WhatsApp" />
          </Field>
          <Field label="Phone number ID">
            <Input value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value.trim() })} />
          </Field>
          <Field label="WhatsApp Business Account ID">
            <Input value={form.wabaId} onChange={(e) => setForm({ ...form, wabaId: e.target.value.trim() })} />
          </Field>
          <Field label="Permanent access token" hint="Needs whatsapp_business_messaging and whatsapp_business_management permissions">
            <Input
              type="password"
              value={form.accessToken}
              onChange={(e) => setForm({ ...form, accessToken: e.target.value.trim() })}
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

export default function ChannelsPage() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <ChannelsContent />
    </React.Suspense>
  );
}
