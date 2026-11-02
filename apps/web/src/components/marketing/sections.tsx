import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCheck,
  Facebook,
  Inbox,
  Instagram,
  Megaphone,
  Plug,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const FEATURES = [
  {
    id: "lead-ads",
    icon: Facebook,
    title: "Meta Lead Ads automation",
    text: "Capture leads from Facebook and Instagram instant forms and greet them on WhatsApp within seconds, automatically.",
  },
  {
    id: "inbox",
    icon: Inbox,
    title: "Shared team inbox",
    text: "WhatsApp, Messenger and Instagram DMs in one inbox with assignment, tags, internal notes and quick replies.",
  },
  {
    id: "chatbot",
    icon: Bot,
    title: "No-code chatbot builder",
    text: "Drag-and-drop flows with buttons, list menus, questions, conditions, delays and webhooks.",
  },
  {
    id: "broadcasts",
    icon: Megaphone,
    title: "Broadcast campaigns",
    text: "Send approved WhatsApp templates to segments, schedule them and track delivered, read and replied.",
  },
  {
    id: "crm",
    icon: Users,
    title: "Contacts CRM",
    text: "Import from CSV, add custom fields and tags, track opt-ins and see every contact's full timeline.",
  },
  {
    id: "integrations",
    icon: Plug,
    title: "Integrations & API",
    text: "Webhooks, a REST API, Google Sheets sync and Zapier or Pabbly-compatible events.",
  },
  {
    id: "analytics",
    icon: BarChart3,
    title: "Analytics",
    text: "Messages, leads, response times and campaign performance in one dashboard.",
  },
  {
    id: "channels",
    icon: Instagram,
    title: "Omnichannel",
    text: "Official WhatsApp Cloud API, Facebook Messenger and Instagram Direct, connected in minutes.",
  },
];

export function ChatMockup() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -left-6 top-10 hidden animate-float rounded-xl border bg-white p-3 shadow-xl sm:block">
        <div className="flex items-center gap-2 text-xs">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100">
            <Facebook className="h-4 w-4 text-blue-600" />
          </span>
          <div>
            <p className="font-semibold">New lead</p>
            <p className="text-muted-foreground">Priya S. - Summer Offer form</p>
          </div>
        </div>
      </div>
      <div className="absolute -right-4 bottom-16 hidden animate-float rounded-xl border bg-white p-3 shadow-xl [animation-delay:2s] sm:block">
        <div className="flex items-center gap-2 text-xs">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
            <Zap className="h-4 w-4 text-emerald-600" />
          </span>
          <div>
            <p className="font-semibold">Replied in 4s</p>
            <p className="text-muted-foreground">Auto-assigned to Rahul</p>
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-[2rem] border-8 border-violet-950 bg-white shadow-2xl">
        <div className="flex items-center gap-3 bg-violet-800 px-4 py-3 text-white">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-coral-500 text-sm font-bold">A</div>
          <div>
            <p className="text-sm font-semibold">Acme Realty</p>
            <p className="text-xs text-violet-200">Business account</p>
          </div>
        </div>
        <div className="chat-pattern space-y-3 p-4 text-sm">
          <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm">
            Hi Priya! Thanks for your interest in our 2BHK homes. What is your budget?
            <div className="mt-2 grid gap-1.5">
              {["Under 50 L", "50 L - 1 Cr", "Above 1 Cr"].map((b) => (
                <span key={b} className="rounded-lg border border-violet-200 py-1.5 text-center text-xs font-medium text-violet-700">
                  {b}
                </span>
              ))}
            </div>
          </div>
          <div className="ml-auto max-w-[70%] rounded-2xl rounded-tr-sm bg-violet-100 p-3 shadow-sm">
            50 L - 1 Cr
            <div className="mt-1 flex justify-end">
              <CheckCheck className="h-3.5 w-3.5 text-violet-600" />
            </div>
          </div>
          <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm">
            Great choice! Rahul from our team will call you shortly. Here is our brochure.
          </div>
        </div>
      </div>
    </div>
  );
}

export function CtaBanner() {
  return (
    <section className="py-20">
      <div className="container">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-800 via-violet-700 to-violet-950 px-8 py-14 text-center text-white shadow-xl">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-coral-500/30 blur-3xl" />
          <div className="absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-violet-400/30 blur-3xl" />
          <h2 className="relative text-3xl font-extrabold sm:text-4xl">Stop losing ad leads to slow replies</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-violet-100">
            Connect your WhatsApp number and Facebook page in minutes. Free plan, no credit card required.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup">
              <Button size="lg" variant="accent">
                Start free <ArrowRight />
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">
                Book a demo
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-coral-500">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-violet-950 sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-muted-foreground">{text}</p>}
    </div>
  );
}