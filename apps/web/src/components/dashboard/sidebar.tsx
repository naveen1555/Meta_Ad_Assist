"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  CreditCard,
  FileText,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Plug,
  Radio,
  Settings,
  Shield,
  Target,
  Users,
} from "lucide-react";
import { Logo } from "@/components/marketing/logo";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const groups = [
  {
    title: "Engage",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/dashboard/inbox", label: "Inbox", icon: Inbox },
      { href: "/dashboard/leads", label: "Lead Ads", icon: Target },
      { href: "/dashboard/contacts", label: "Contacts", icon: Users },
    ],
  },
  {
    title: "Automate",
    items: [
      { href: "/dashboard/flows", label: "Chatbot flows", icon: Bot },
      { href: "/dashboard/broadcasts", label: "Broadcasts", icon: Megaphone },
      { href: "/dashboard/templates", label: "Templates", icon: FileText },
      { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    title: "Configure",
    items: [
      { href: "/dashboard/channels", label: "Channels", icon: Radio },
      { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { isSuperAdmin } = useAuth();

  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center px-5">
        <Logo dark href="/dashboard" />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4 scrollbar-thin">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">{g.title}</p>
            <div className="space-y-0.5">
              {g.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive(item.href)
                      ? "bg-violet-700 text-white shadow-sm"
                      : "text-violet-200 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
        {isSuperAdmin && (
          <div>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">Platform</p>
            <Link
              href="/admin"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-coral-300 hover:bg-white/5"
            >
              <Shield className="h-4 w-4" /> Super admin
            </Link>
          </div>
        )}
      </nav>
    </aside>
  );
}
