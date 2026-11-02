import type { Metadata } from "next";
import { Code2, Facebook, FileSpreadsheet, Instagram, MessageCircle, Send, Webhook, Workflow, Zap } from "lucide-react";
import { CtaBanner, SectionHeading } from "@/components/marketing/sections";

export const metadata: Metadata = { title: "Integrations" };

const items = [
  { icon: MessageCircle, name: "WhatsApp Cloud API", group: "Channels", text: "Official Meta WhatsApp Business API." },
  { icon: Facebook, name: "Facebook Messenger", group: "Channels", text: "Reply to page messages from the inbox." },
  { icon: Instagram, name: "Instagram Direct", group: "Channels", text: "Handle DMs from your business account." },
  { icon: Facebook, name: "Facebook Lead Ads", group: "Lead sources", text: "Instant leadgen webhooks from your pages." },
  { icon: FileSpreadsheet, name: "Google Sheets", group: "Productivity", text: "Append every new lead as a row." },
  { icon: Zap, name: "Zapier", group: "Automation", text: "Trigger Zaps from leads and messages." },
  { icon: Workflow, name: "Pabbly Connect", group: "Automation", text: "Use our webhooks as Pabbly triggers." },
  { icon: Webhook, name: "Webhooks", group: "Developers", text: "Signed HTTP callbacks for every event." },
  { icon: Code2, name: "REST API", group: "Developers", text: "Send messages and manage contacts via API keys." },
  { icon: Send, name: "Any CRM", group: "Developers", text: "Push leads in with the /v1/leads endpoint." },
];

export default function IntegrationsPage() {
  return (
    <>
      <section className="hero-glow py-20">
        <SectionHeading
          eyebrow="Integrations"
          title="Connect ChatNova to your stack"
          text="Bring leads in from anywhere and push conversations out to the tools your team already uses."
        />
        <div className="container mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <div key={i.name} className="flex gap-4 rounded-2xl border border-violet-100 bg-white p-5 shadow-sm">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light">
                <i.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-coral-500">{i.group}</p>
                <h3 className="font-semibold text-violet-950">{i.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{i.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <CtaBanner />
    </>
  );
}
