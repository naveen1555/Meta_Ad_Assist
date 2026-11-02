import { Facebook, Instagram, MessageCircle } from "lucide-react";
import type { ChannelType } from "@chatnova/shared";
import { cn } from "@/lib/utils";

const styles: Record<ChannelType, { icon: typeof MessageCircle; className: string }> = {
  WHATSAPP: { icon: MessageCircle, className: "bg-emerald-100 text-emerald-600" },
  MESSENGER: { icon: Facebook, className: "bg-blue-100 text-blue-600" },
  INSTAGRAM: { icon: Instagram, className: "bg-pink-100 text-pink-600" },
};

export function ChannelIcon({ type, className, size = "md" }: { type: ChannelType; className?: string; size?: "sm" | "md" }) {
  const s = styles[type] ?? styles.WHATSAPP;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        size === "sm" ? "h-5 w-5" : "h-10 w-10",
        s.className,
        className,
      )}
    >
      <s.icon className={size === "sm" ? "h-3 w-3" : "h-5 w-5"} />
    </span>
  );
}
