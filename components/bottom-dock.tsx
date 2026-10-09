// components/bottom-dock.tsx
"use client";

import { useEffect, useState } from "react";
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
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    // 1. Listen to visualViewport resize (triggers when virtual keyboard opens on iOS/Android)
    if (typeof window !== "undefined" && window.visualViewport) {
      const handleResize = () => {
        if (!window.visualViewport) return;
        // If the visual viewport height is noticeably smaller than window.innerHeight, keyboard is open
        const isShrunk = window.visualViewport.height < window.innerHeight * 0.82;
        setIsKeyboardOpen(isShrunk);
      };

      window.visualViewport.addEventListener("resize", handleResize);
      return () => {
        window.visualViewport?.removeEventListener("resize", handleResize);
      };
    } else {
      // 2. Fallback for older browsers: track focus on text fields
      const handleFocusIn = (e: FocusEvent) => {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea") {
          setIsKeyboardOpen(true);
        }
      };

      const handleFocusOut = () => {
        setIsKeyboardOpen(false);
      };

      window.addEventListener("focusin", handleFocusIn);
      window.addEventListener("focusout", handleFocusOut);
      return () => {
        window.removeEventListener("focusin", handleFocusIn);
        window.removeEventListener("focusout", handleFocusOut);
      };
    }
  }, []);

  // Hide the floating dock on authentication screens or when typing
  if (pathname.startsWith("/auth") || isKeyboardOpen) {
    return null;
  }

  return (
    <div className="fixed bottom-6 inset-x-0 flex justify-center items-center pointer-events-none z-50 px-5 transition-opacity duration-200">
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