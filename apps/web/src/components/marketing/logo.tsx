import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ dark = false, href = "/" }: { dark?: boolean; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-700 to-coral-500 shadow-md">
        <MessageCircle className="h-5 w-5 text-white" />
      </span>
      <span className={cn("text-lg font-extrabold tracking-tight", dark ? "text-white" : "text-violet-950")}>
        Chat<span className="text-coral-500">Nova</span>
      </span>
    </Link>
  );
}
