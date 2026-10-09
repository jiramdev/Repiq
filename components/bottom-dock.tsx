// components/bottom-dock.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Calendar, BarChart2, User } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Workouts", icon: LayoutGrid },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/statistics", label: "Statistics", icon: BarChart2 },
  { href: "/account", label: "Account", icon: User },
];

export function BottomDock() {
  const pathname = usePathname();

  // Hide the floating dock on authentication screens
  if (pathname.startsWith("/auth")) {
    return null;
  }

  return (
    <div className="fixed bottom-6 inset-x-0 flex justify-center items-center pointer-events-none z-50 px-5">
      <nav
        aria-label="Bottom Navigation"
        className="pointer-events-auto flex items-center justify-between w-full max-w-[320px] px-7 py-3 rounded-full bg-[#1b1b1e] border border-white/[0.05] shadow-[0_12px_36px_rgba(0,0,0,0.45)]"
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/"
              ? pathname === "/" || pathname.startsWith("/workout")
              : href === "/statistics"
              ? pathname.startsWith("/statistics") || pathname.startsWith("/analytics")
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className="relative p-2 rounded-full transition-transform duration-150 active:scale-90 flex items-center justify-center group"
            >
              <Icon
                strokeWidth={1.8}
                className={`w-[21px] h-[21px] transition-colors duration-200 ${
                  isActive
                    ? "text-white"
                    : "text-[#5e5d66] group-hover:text-white/80"
                }`}
              />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}