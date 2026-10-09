// components/bottom-dock.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dock, dockPill } from "@/components/ui";

const HIDDEN_PREFIXES = ["/workout/", "/plans/"];

export function BottomDock() {
  const pathname = usePathname();

  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  const isHome = pathname === "/";
  const isSchedule = pathname.startsWith("/schedule");
  const isStats = pathname.startsWith("/statistics");
  const isAccount = pathname.startsWith("/account");

  return (
    <div className={dock}>
      <div className={dockPill}>
        <Link href="/" aria-label="Dashboard">
          <span
            className={`w-2 h-2 rounded-full block transition-colors ${
              isHome ? "bg-[#baa3d0]" : "bg-[#71717a]"
            }`}
          />
        </Link>
        <Link href="/schedule" aria-label="Schedule">
          <span
            className={`w-2 h-2 rounded-full block transition-colors ${
              isSchedule ? "bg-[#baa3d0]" : "bg-[#71717a]"
            }`}
          />
        </Link>
        <Link href="/statistics" aria-label="Statistics">
          <span
            className={`w-2 h-2 rounded-full block transition-colors ${
              isStats ? "bg-[#baa3d0]" : "bg-[#71717a]"
            }`}
          />
        </Link>
        <Link href="/account" aria-label="Account">
          <span
            className={`w-2 h-2 rounded-full block transition-colors ${
              isAccount ? "bg-[#baa3d0]" : "bg-[#71717a]"
            }`}
          />
        </Link>
      </div>
    </div>
  );
}