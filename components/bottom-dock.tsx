// components/bottom-dock.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Dumbbell,
  CalendarDays,
  Layers,
  BarChart2,
  User,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  matches: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Workout",
    href: "/",
    icon: Dumbbell,
    matches: (pathname) => pathname === "/" || pathname.startsWith("/workout"),
  },
  {
    label: "Schedule",
    href: "/schedule",
    icon: CalendarDays,
    matches: (pathname) => pathname.startsWith("/schedule"),
  },
  {
    label: "Plans",
    href: "/plans",
    icon: Layers,
    matches: (pathname) => pathname.startsWith("/plans"),
  },
  {
    label: "Stats",
    href: "/statistics",
    icon: BarChart2,
    matches: (pathname) => pathname.startsWith("/statistics"),
  },
  {
    label: "Account",
    href: "/account",
    icon: User,
    matches: (pathname) => pathname.startsWith("/account"),
  },
];

export function BottomDock() {
  const pathname = usePathname();

  // Hide the dock on auth / onboarding screens or when inside an active workout session
  if (pathname.startsWith("/auth") || /^\/workout\/\d+$/.test(pathname)) {
    return null;
  }

  return (
    <nav
      aria-label="Main Navigation"
      className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-50 flex justify-center items-center pointer-events-none px-4"
    >
      <div className="pointer-events-auto flex items-center gap-1.5 p-1.5 rounded-full bg-[#141416]/85 backdrop-blur-xl border border-white/[0.08] shadow-[0_12px_40px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.03)] transition-all duration-300">
        {NAV_ITEMS.map((item) => {
          const isActive = item.matches(pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={`group relative flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200 apple-press ${
                isActive
                  ? "bg-[#baa3d0] text-[#141416] shadow-md shadow-[#baa3d0]/20"
                  : "text-[#71717a] hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 ${
                  isActive ? "stroke-[2.2]" : "stroke-[1.8]"
                }`}
              />

              {/* Hover indicator dot for inactive tabs */}
              {!isActive && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#baa3d0] opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}