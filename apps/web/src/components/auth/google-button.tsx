"use client";

import * as React from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";

declare global {
  interface Window {
    google?: any;
  }
}

export function GoogleButton({ onToken }: { onToken: (token: string, workspaceId?: string) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = React.useState<string | null>(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || null);

  React.useEffect(() => {
    if (clientId) return;
    api<{ googleClientId: string | null }>("/api/auth/config")
      .then((c) => setClientId(c.googleClientId))
      .catch(() => undefined);
  }, [clientId]);

  React.useEffect(() => {
    if (!clientId || !ref.current) return;
    const init = () => {
      window.google?.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp: { credential: string }) => {
          try {
            const r = await api<{ token: string; workspaceId?: string }>("/api/auth/google", {
              body: { credential: resp.credential },
            });
            onToken(r.token, r.workspaceId);
          } catch (err) {
            toast.error(errorMessage(err));
          }
        },
      });
      window.google?.accounts.id.renderButton(ref.current, {
        theme: "outline",
        size: "large",
        width: 360,
        text: "continue_with",
        shape: "pill",
      });
    };
    if (window.google?.accounts) return init();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = init;
    document.body.appendChild(script);
  }, [clientId, onToken]);

  if (!clientId) return null;
  return (
    <>
      <div className="flex justify-center" ref={ref} />
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
