import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/marketing/logo";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo />
          <h1 className="mt-10 text-2xl font-bold text-violet-950">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-violet-800 via-violet-900 to-violet-950 p-12 text-white lg:flex lg:flex-col lg:justify-center">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-coral-500/30 blur-3xl" />
        <div className="relative max-w-md">
          <h2 className="text-3xl font-extrabold leading-tight">Every Meta lead, answered on WhatsApp in seconds.</h2>
          <ul className="mt-8 space-y-4 text-violet-100">
            {[
              "Instant replies to Facebook & Instagram lead ads",
              "Shared inbox for WhatsApp, Messenger and Instagram",
              "No-code chatbots and broadcast campaigns",
              "Webhooks, REST API and Google Sheets",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-coral-300" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
