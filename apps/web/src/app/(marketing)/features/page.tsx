import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { CtaBanner, FEATURES, SectionHeading } from "@/components/marketing/sections";

export const metadata: Metadata = { title: "Features" };

const details: Record<string, string[]> = {
  "lead-ads": [
    "Real-time leadgen webhooks from your Facebook pages",
    "Instant WhatsApp template with the lead's name and form answers",
    "Round-robin or fixed agent assignment",
    "Leads synced to Google Sheets, webhooks and your CRM",
  ],
  inbox: [
    "WhatsApp, Messenger and Instagram DMs in one place",
    "Assign chats, add internal notes and tags",
    "Quick replies with a slash shortcut",
    "24-hour session window indicator with template fallback",
  ],
  chatbot: [
    "Drag-and-drop canvas powered by React Flow",
    "Buttons, list menus, questions and conditions",
    "Delays, webhooks, tags and human handover",
    "Keyword, new-conversation and lead triggers",
  ],
  broadcasts: [
    "Sync and submit WhatsApp message templates",
    "Target contacts by tags and opt-in status",
    "Schedule campaigns for later",
    "Delivered, read, replied and failed stats",
  ],
  crm: [
    "CSV import and export",
    "Custom fields and tags",
    "Opt-in tracking for compliance",
    "Full contact timeline of messages and leads",
  ],
  integrations: [
    "Signed outgoing webhooks for every event",
    "REST API with workspace API keys",
    "Google Sheets lead sync",
    "Works with Zapier, Pabbly and Make",
  ],
  analytics: [
    "Inbound and outbound message trends",
    "Lead volume by source",
    "Average first response time",
    "Campaign performance at a glance",
  ],
  channels: [
    "Official WhatsApp Cloud API",
    "Facebook Messenger via Facebook Login",
    "Instagram Direct for business accounts",
    "Multiple numbers and pages per workspace",
  ],
};

export default function FeaturesPage() {
  return (
    <>
      <section className="hero-glow py-20">
        <SectionHeading
          eyebrow="Features"
          title="Built for teams that sell on Meta"
          text="Every tool you need to capture, qualify and convert leads across WhatsApp, Messenger and Instagram."
        />
      </section>
      <section className="pb-10">
        <div className="container space-y-6">
          {FEATURES.map((f, i) => (
            <div
              key={f.id}
              id={f.id}
              className="grid scroll-mt-24 items-center gap-8 rounded-3xl border border-violet-100 bg-white p-8 shadow-sm md:grid-cols-2"
            >
              <div className={i % 2 ? "md:order-2" : ""}>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-700 to-coral-500">
                  <f.icon className="h-6 w-6 text-white" />
                </div>
                <h2 className="mt-5 text-2xl font-bold text-violet-950">{f.title}</h2>
                <p className="mt-3 text-muted-foreground">{f.text}</p>
              </div>
              <ul className="space-y-3 rounded-2xl bg-violet-50 p-6">
                {details[f.id]?.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-coral-500" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <CtaBanner />
    </>
  );
}
