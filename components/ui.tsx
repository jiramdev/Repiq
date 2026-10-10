// components/ui.tsx
// Single source of the repiq style: four colours, five text sizes, two corner radii.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, X } from "lucide-react";
import { str } from "@/lib/strings";

/** The four colours */
export const c = {
  lavender: "#baa3d0", // canvas and accent (also the theme colour)
  ink: "#141416", // cards, text on lavender
  white: "#ffffff", // primary text, icons
  muted: "#71717a", // secondary text, disabled
} as const;

/** Typography: five steps, never more. */
export const t = {
  metric: "text-[48px]", // the one big value
  display: "text-[30px]", // plan or exercise name
  body: "text-[15px]", // body and button text
  input: "text-[16px]", // form fields: 16px stops iOS from zooming on focus
  hint: "text-[12px]", // hints and errors
  label: "text-[11px]", // labels and column headers
} as const;

/**
 * Two corners, no more.
 * - hoek = square-ish, for everything that CONTAINS something
 * - rond = pill, for everything you tap
 */
export const hoek = "rounded-[30px]";
export const rond = "rounded-full";

/** Minimum touch target (Apple HIG / WCAG 2.5.5): 44 × 44 px. */
export const tapTarget = "min-w-11 min-h-11";

/** Surfaces */
export const card = `bg-[#141416] border border-white/[0.08] ${hoek} p-5 space-y-3 shadow-[0_12px_28px_rgba(0,0,0,0.2)]`;
export const hero = `bg-[#141416] border border-white/[0.08] ${hoek} px-6 py-8 text-center space-y-3 shadow-[0_12px_28px_rgba(0,0,0,0.2)]`;
/** A row on a card: same ink, only the border separates it. */
export const row = `bg-[#141416] border border-white/[0.08] ${hoek}`;
export const rowDone = `bg-[#141416] border border-[#baa3d0] shadow-[0_0_0_1px_#baa3d0] ${hoek}`;

/** Text. Two families (editorial Anton, body Inter), three colours. */
export const label = `${t.label} font-semibold tracking-[0.18em] text-[#baa3d0] uppercase`;
export const meta = `${t.label} font-semibold tracking-[0.18em] text-[#71717a] uppercase`;
export const bodyText = `${t.body} text-white`;
/** Text on a lavender surface. The only place ink is used as a text colour. */
export const onLavender = `${t.body} font-semibold text-[#141416]`;
export const bodyMuted = `${t.body} text-[#71717a]`;
export const hint = `${t.hint} text-[#71717a]`;
export const error = `${t.hint} text-white`;
/** Right-hand value in a row. Always lavender, always bold. */
export const value = `font-editorial ${t.body} font-bold text-[#baa3d0]`;
export const display = `font-editorial ${t.display} tracking-tight text-white leading-none`;
export const metric = `font-editorial ${t.metric} text-white leading-none`;
export const buttonText = `font-editorial ${t.body} tracking-wider uppercase leading-none`;

/** Spacing. Five steps, no more. */
export const s = {
  page: "px-4 pt-4 pb-32", // page padding
  stack: "space-y-3.5", // between blocks
  card: "p-5", // inside a card
  tight: "space-y-1.5", // between label and value
  gap: "gap-3.5", // side by side
} as const;

/** Today's big widget. */
export const todayWidget = `block ${hero} relative overflow-hidden transition apple-press`;

/** Inputs */
export const input = `w-full min-h-11 bg-[#141416] border border-white/[0.08] ${hoek} px-4 py-3 ${t.input} text-white outline-none placeholder:text-[#71717a] focus:border-[#baa3d0] select-text`;
/** Inline input inside a row (account details). */
export const inlineInput = `bg-transparent text-right font-medium text-white outline-none min-h-11 ${t.input} select-text`;

/**
 * Same field as input, but as wide as its text and in the value style.
 * field-sizing: content is the native sizing, no JS.
 */
export const growInput = `w-auto min-w-[8ch] [field-sizing:content] bg-[#141416] border border-white/[0.08] ${hoek} px-4 py-3 ${value} ${t.input} outline-none focus:border-[#baa3d0]`;
export const numberInput = `w-full min-h-11 bg-[#141416] border border-white/[0.08] ${hoek} px-2 py-2.5 ${t.input} font-semibold text-white text-center outline-none placeholder:text-[#71717a] focus:border-[#baa3d0] disabled:opacity-40 select-text`;
export const segment = `${rond} min-h-11 px-4 py-3 ${t.label} uppercase tracking-wider font-semibold transition apple-press`;

/** Buttons */
export const primary = `w-full min-h-11 bg-[#baa3d0] ${rond} py-3.5 px-4 text-center transition apple-press disabled:opacity-50`;
export const secondary = `w-full min-h-11 bg-[#141416] border border-white/[0.08] ${rond} py-3.5 px-4 text-center transition apple-press disabled:opacity-50`;

/** ON/OFF badge on toggle rows. */
export const toggleBadge = (on: boolean) =>
  `text-xs font-semibold px-2.5 py-1 rounded-full uppercase ${
    on ? "bg-[#baa3d0] text-[#141416]" : "bg-white/[0.08] text-white/50"
  }`;

/** Page wrapper */
export const page = (bottom = "pb-32") =>
  `min-h-[100dvh] bg-[#baa3d0] text-white ${bottom} pt-4 px-4 select-none`;
export const pageCentered = "min-h-[100dvh] bg-[#baa3d0] px-4 py-10 flex items-center justify-center select-none";

/** Chrome */
export const pill = `h-11 bg-[#141416] border border-white/[0.08] ${rond} flex items-center gap-2 px-4`;
export const pillText = `${buttonText} text-white`;
export const circleButton = `w-11 h-11 shrink-0 bg-[#141416] border border-white/[0.08] ${rond} flex items-center justify-center text-white apple-press disabled:opacity-50`;

/** Page header: the pill with a dot on the left, optional actions on the right. */
export function Header({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex items-center justify-between px-1 py-1">
      <div className={pill}>
        <span className="w-2 h-2 rounded-full bg-[#baa3d0]" />
        <span className={pillText}>{title}</span>
      </div>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </header>
  );
}

/** Section: label left, metadata right */
export function Section({
  label: heading,
  meta: trailing,
  className = card,
  children,
}: {
  label: ReactNode;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className}>
      <div className="flex items-center justify-between px-1">
        <span className={label}>{heading}</span>
        {trailing ? (
          typeof trailing === "string" ? (
            <span className={meta}>{trailing}</span>
          ) : (
            <div>{trailing}</div>
          )
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Button: primary or secondary, always full width. */
export function Action({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  return (
    <button {...props} className={`${variant === "primary" ? primary : secondary} ${className}`}>
      <span
        className={`${buttonText} block truncate ${
          variant === "primary" ? "text-[#141416]" : "text-[#baa3d0]"
        }`}
      >
        {children}
      </span>
    </button>
  );
}

/** Close button. Belongs to the header: same circle, icon as large as the header text. */
export function CloseButton({
  label = str.common.close,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return (
    <button type="button" {...props} aria-label={label} className={`${circleButton} ${className}`}>
      <X className={`${t.body} stroke-[1.8]`} />
    </button>
  );
}

/** Back button. Same size as the close button. */
export function BackButton({ href, className = "" }: { href: string; className?: string }) {
  return (
    <Link href={href} aria-label={str.common.back} className={`${circleButton} ${className}`}>
      <ChevronLeft className={`${t.body} stroke-[1.8]`} />
    </Link>
  );
}
