"use client";

import * as React from "react";
import { Mail, MapPin, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SectionHeading } from "@/components/marketing/sections";
import { api, errorMessage } from "@/lib/api";

export default function ContactPage() {
  const [form, setForm] = React.useState({ name: "", email: "", phone: "", company: "", message: "" });
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/public/contact", { body: form });
      setSent(true);
      toast.success("Thanks! We will get back to you within one business day.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="hero-glow py-20">
      <SectionHeading
        eyebrow="Contact"
        title="Talk to our team"
        text="Questions about the WhatsApp API, pricing or a custom setup? Send us a message."
      />
      <div className="container mt-12 grid max-w-5xl gap-8 md:grid-cols-5">
        <div className="space-y-4 md:col-span-2">
          {[
            { icon: Mail, title: "Email", text: "hello@chatnova.app" },
            { icon: MessageCircle, title: "WhatsApp", text: "+91 90000 00000" },
            { icon: MapPin, title: "Office", text: "Bengaluru, India" },
          ].map((c) => (
            <div key={c.title} className="flex gap-4 rounded-2xl border border-violet-100 bg-white p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light">
                <c.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-violet-950">{c.title}</p>
                <p className="text-sm text-muted-foreground">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-violet-100 bg-white p-7 shadow-sm md:col-span-3">
          {sent ? (
            <div className="py-16 text-center">
              <h3 className="text-xl font-bold text-violet-950">Message received</h3>
              <p className="mt-2 text-muted-foreground">Our team will reach out shortly.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">
                  <Input required value={form.name} onChange={set("name")} />
                </Field>
                <Field label="Work email">
                  <Input required type="email" value={form.email} onChange={set("email")} />
                </Field>
                <Field label="Phone">
                  <Input value={form.phone} onChange={set("phone")} />
                </Field>
                <Field label="Company">
                  <Input value={form.company} onChange={set("company")} />
                </Field>
              </div>
              <Field label="How can we help?">
                <Textarea required rows={5} value={form.message} onChange={set("message")} />
              </Field>
              <Button type="submit" variant="accent" className="w-full" loading={loading}>
                Send message
              </Button>
            </>
          )}
        </form>
      </div>
    </section>
  );
}
