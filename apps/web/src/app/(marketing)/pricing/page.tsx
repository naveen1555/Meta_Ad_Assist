"use client";

import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { PLAN_LIST } from "@chatnova/shared";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/misc";
import { CtaBanner, SectionHeading } from "@/components/marketing/sections";
import { cn } from "@/lib/utils";

export default function PricingPage() {
  const [currency, setCurrency] = React.useState<"inr" | "usd">("inr");

  return (
    <>
      <section className="hero-glow py-20">
        <SectionHeading
          eyebrow="Pricing"
          title="Simple plans that grow with you"
          text="Start free. Upgrade when your team and lead volume grow. Meta's WhatsApp conversation charges are billed by Meta directly."
        />
        <div className="mt-8 flex justify-center">
          <Tabs
            value={currency}
            onChange={setCurrency}
            tabs={[
              { value: "inr", label: "INR" },
              { value: "usd", label: "USD" },
            ]}
          />
        </div>
        <div className="container mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {PLAN_LIST.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-3xl border bg-white p-7 shadow-sm",
                plan.popular && "border-2 border-violet-700 shadow-xl",
              )}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-coral-500 px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-bold text-violet-950">{plan.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
              <p className="mt-6">
                <span className="text-4xl font-extrabold text-violet-950">
                  {currency === "inr" ? `₹${plan.priceInr.toLocaleString("en-IN")}` : `$${plan.priceUsd}`}
                </span>
                <span className="text-sm text-muted-foreground"> / month</span>
              </p>
              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" /> {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-8">
                <Button className="w-full" variant={plan.popular ? "accent" : "outline"}>
                  {plan.priceInr === 0 ? "Start free" : `Choose ${plan.name}`}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>
      <CtaBanner />
    </>
  );
}
