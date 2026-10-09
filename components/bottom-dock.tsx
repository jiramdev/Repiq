"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Calendar, BarChart2, User } from "lucide-react";
import { str } from "@/lib/strings";

const NAV_ITEMS = [
  { href: "/", label: str.nav.dashboard, icon: LayoutGrid },
  { href: "/schedule", label: str.nav.schedule, icon: Calendar },
  { href: "/statistics", label: str.nav.statistics, icon: BarChart2 },
  { href: "/account", label: str.nav.account, icon: User },
];

const ALLOWED_ROUTES = new Set(NAV_ITEMS.map((item) => item.href));

export function BottomDock() {
  const pathname = usePathname();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (viewport) {
      const handleResize = () => {
        setIsKeyboardOpen(viewport.height < window.innerHeight * 0.82);
      };
      viewport.addEventListener("resize", handleResize);
      return () => viewport.removeEventListener("resize", handleResize);
    }

    const handleFocusIn = (e: FocusEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") setIsKeyboardOpen(true);
    };
    const handleFocusOut = () => setIsKeyboardOpen(false);

    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);
    return () => {
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  if (!ALLOWED_ROUTES.has(pathname) || isKeyboardOpen) {
    return null;
  }

  return (
    <div className="fixed bottom-6 inset-x-0 flex justify-center items-center pointer-events-none z-50 px-5 transition-opacity duration-200">
      <nav
        aria-label={str.nav.label}
        className="pointer-events-auto flex items-center justify-between w-full max-w-[320px] px-5 py-1.5 rounded-full bg-[#1b1b1e] border border-white/[0.05] shadow-[0_12px_36px_rgba(0,0,0,0.45)]"
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className="relative min-w-11 min-h-11 rounded-full transition-transform duration-150 active:scale-90 flex items-center justify-center group"
            >
              <Icon
                strokeWidth={1.8}
                className={`w-[21px] h-[21px] transition-colors duration-200 ${
                  isActive ? "text-white" : "text-[#5e5d66] group-hover:text-white/80"
                }`}
              />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
