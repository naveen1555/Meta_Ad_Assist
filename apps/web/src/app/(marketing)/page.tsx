import Link from "next/link";
import { ArrowRight, CheckCircle2, Facebook, MessageCircle, Sparkles, Star, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMockup, CtaBanner, FEATURES, SectionHeading } from "@/components/marketing/sections";

const steps = [
  {
    icon: Facebook,
    title: "Connect Meta",
    text: "Link your Facebook page, Instagram account and WhatsApp Business number using official Meta APIs.",
  },
  {
    icon: Sparkles,
    title: "Build your automation",
    text: "Pick a welcome template, design a chatbot flow and choose how leads are assigned to your team.",
  },
  {
    icon: Zap,
    title: "Reply in seconds",
    text: "Every new lead gets a WhatsApp message instantly, and your agents take over in the shared inbox.",
  },
];

const stats = [
  { value: "4s", label: "average first reply to new leads" },
  { value: "3x", label: "more qualified conversations" },
  { value: "98%", label: "WhatsApp open rate" },
  { value: "24/7", label: "chatbot coverage" },
];

const testimonials = [
  {
    name: "Ananya Rao",
    role: "Marketing Head, UrbanNest Realty",
    text: "Our lead-to-site-visit rate doubled. Leads get a WhatsApp message before they even close the Facebook form.",
  },
  {
    name: "Karthik Menon",
    role: "Founder, FitFuel",
    text: "The flow builder replaced three tools for us. Our team now handles Instagram and WhatsApp from one inbox.",
  },
  {
    name: "Sneha Kapoor",
    role: "Growth Lead, EduSpark",
    text: "Broadcasts with real read and reply stats made our webinar reminders far more effective.",
  },
];

const faqs = [
  {
    q: "Is ChatNova using the official WhatsApp API?",
    a: "Yes. ChatNova connects to the official WhatsApp Business Cloud API from Meta, so your number stays compliant and safe from bans.",
  },
  {
    q: "How do lead ads reach WhatsApp?",
    a: "We subscribe to your Facebook page's leadgen events. The moment a lead submits a form, we save the contact and send your approved WhatsApp template.",
  },
  {
    q: "Do I need a developer?",
    a: "No. Channels, chatbots, broadcasts and integrations are all configured from the dashboard. Developers can still use our REST API and webhooks.",
  },
  {
    q: "Can my whole team use one number?",
    a: "Yes. The shared inbox supports multiple agents with assignment, notes and roles on a single WhatsApp number.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="hero-glow relative overflow-hidden">
        <div className="container grid items-center gap-14 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-700">
              <MessageCircle className="h-3.5 w-3.5 text-coral-500" /> Official WhatsApp Business API partner-ready
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-violet-950 sm:text-5xl lg:text-6xl">
              Turn Meta ads into <span className="gradient-text">WhatsApp conversations</span> that convert
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              ChatNova replies to Facebook and Instagram leads on WhatsApp in seconds, qualifies them with no-code
              chatbots and hands hot leads to your team in a shared inbox.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup">
                <Button size="lg" variant="accent">
                  Start free <ArrowRight />
                </Button>
              </Link>
              <Link href="/features">
                <Button size="lg" variant="outline">
                  Explore features
                </Button>
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {["Free forever plan", "No credit card", "Setup in 10 minutes"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <ChatMockup />
        </div>
      </section>

      <section className="border-y border-violet-100 bg-violet-50/50">
        <div className="container grid grid-cols-2 gap-6 py-10 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-extrabold text-violet-800">{s.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-20">
        <div className="container">
          <SectionHeading
            eyebrow="Everything in one place"
            title="One platform for every Meta conversation"
            text="From the first ad click to the closed deal, ChatNova automates the busy work so your team can focus on selling."
          />
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <Link
                key={f.id}
                href={`/features#${f.id}`}
                className="group rounded-2xl border border-violet-100 bg-white p-6 transition-all hover:-translate-y-1 hover:border-violet-300 hover:shadow-lg"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light transition-colors group-hover:bg-primary">
                  <f.icon className="h-5 w-5 text-primary group-hover:text-white" />
                </div>
                <h3 className="mt-4 font-semibold text-violet-950">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-violet-950 py-20 text-white">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-coral-300">How it works</p>
            <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Live in three steps</h2>
          </div>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-violet-800 bg-violet-900/40 p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-coral-500 font-bold">
                    {i + 1}
                  </span>
                  <s.icon className="h-5 w-5 text-violet-300" />
                </div>
                <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-violet-200">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container">
          <SectionHeading eyebrow="Loved by growing teams" title="Results our customers see" />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <div key={t.name} className="rounded-2xl border border-violet-100 bg-white p-6 shadow-sm">
                <div className="flex gap-0.5 text-coral-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed">&ldquo;{t.text}&rdquo;</p>
                <p className="mt-5 text-sm font-semibold text-violet-950">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-violet-50/60 py-20">
        <div className="container max-w-3xl">
          <SectionHeading eyebrow="FAQ" title="Questions, answered" />
          <div className="mt-10 space-y-3">
            {faqs.map((f) => (
              <details key={f.q} className="group rounded-xl border border-violet-100 bg-white p-5">
                <summary className="cursor-pointer list-none font-semibold text-violet-950">
                  <span className="flex items-center justify-between">
                    {f.q}
                    <span className="text-coral-500 transition-transform group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <CtaBanner />
    </>
  );
}
