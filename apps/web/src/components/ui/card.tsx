import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

const badgeStyles = {
  default: "bg-primary-light text-primary",
  coral: "bg-coral-100 text-coral-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  muted: "bg-muted text-muted-foreground",
} as const;

export type BadgeTone = keyof typeof badgeStyles;

export function Badge({
  tone = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        badgeStyles[tone],
        className,
      )}
      {...props}
    />
  );
}

export function statusTone(status: string): BadgeTone {
  switch (status.toLowerCase()) {
    case "approved":
    case "active":
    case "completed":
    case "delivered":
    case "read":
    case "replied":
    case "won":
      return "success";
    case "pending":
    case "scheduled":
    case "sending":
    case "queued":
    case "contacted":
      return "warning";
    case "rejected":
    case "failed":
    case "lost":
    case "cancelled":
      return "danger";
    case "new":
    case "sent":
      return "default";
    default:
      return "muted";
  }
}
