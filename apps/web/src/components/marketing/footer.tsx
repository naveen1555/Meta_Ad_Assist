import Link from "next/link";
import { Logo } from "./logo";

const cols = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/integrations", label: "Integrations" },
      { href: "/signup", label: "Start free" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { href: "/features#lead-ads", label: "Lead Ads automation" },
      { href: "/features#inbox", label: "Team inbox" },
      { href: "/features#chatbot", label: "Chatbot builder" },
      { href: "/features#broadcasts", label: "Broadcasts" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/contact", label: "Contact sales" },
      { href: "/contact", label: "Support" },
      { href: "/login", label: "Log in" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-violet-950 text-violet-100">
      <div className="container grid gap-10 py-14 md:grid-cols-5">
        <div className="md:col-span-2">
          <Logo dark />
          <p className="mt-4 max-w-sm text-sm text-violet-300">
            ChatNova helps businesses turn Facebook and Instagram ad leads into WhatsApp conversations using the
            official Meta Business APIs.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h4 className="mb-4 text-sm font-semibold text-white">{c.title}</h4>
            <ul className="space-y-2 text-sm">
              {c.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-violet-300 hover:text-coral-300">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-violet-900">
        <div className="container flex flex-col justify-between gap-2 py-6 text-xs text-violet-400 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} ChatNova. All rights reserved.</p>
          <p>WhatsApp, Facebook and Instagram are trademarks of Meta Platforms, Inc.</p>
        </div>
      </div>
    </footer>
  );
}
