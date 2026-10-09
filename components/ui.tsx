// components/ui.tsx
// Enige bron voor de repiq-stijl. Vier kleuren, vijf teksten, twee hoeken.
// Zie /branding voor de levende referentie.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, X } from "lucide-react";

/** De vier kleuren */
export const c = {
  lavender: "#baa3d0", // canvas en accent
  ink: "#141416", // kaarten, tekst op lavender
  white: "#ffffff", // primaire tekst, iconen
  muted: "#71717a", // secundaire tekst, uitgeschakeld
} as const;

/** Typografie: vijf stappen, meer nooit. */
export const t = {
  metric: "text-[48px]", // de ene grote waarde
  display: "text-[30px]", // naam van een plan of oefening
  body: "text-[15px]", // lichaam en knoptekst
  hint: "text-[12px]", // hint en fout
  label: "text-[11px]", // label en kolomkop
} as const;

/**
- Twee hoeken, meer niet.
- hoek = vierkant, voor alles dat iets BEVAT
- rond = pill, voor alles waar je op tikt
 */
export const hoek = "rounded-[30px]";
export const rond = "rounded-full";

/** Oppervlakken */
export const card = `bg-[#141416] border border-white/[0.08] ${hoek} p-5 space-y-3 shadow-[0_12px_28px_rgba(0,0,0,0.2)]`;
export const hero = `bg-[#141416] border border-white/[0.08] ${hoek} px-6 py-8 text-center space-y-3 shadow-[0_12px_28px_rgba(0,0,0,0.2)]`;
/** Rij op een kaart: zelfde inkt, alleen de rand scheidt hem. */
export const row = `bg-[#141416] border border-white/[0.08] ${hoek}`;
export const rowDone = `bg-[#141416] border border-[#baa3d0] shadow-[0_0_0_1px_#baa3d0] ${hoek}`;

/**
- Tekst. Twee families (editorial Anton, body Inter), drie kleuren.
- Een variant = één regel hieronder. Niet meer.
 */
export const label = `${t.label} font-semibold tracking-[0.18em] text-[#baa3d0] uppercase`;
export const meta = `${t.label} font-semibold tracking-[0.18em] text-[#71717a] uppercase`;
export const bodyText = `${t.body} text-white`;
/** Tekst op een lavendel-vlak. De enige plek waar ink als tekstkleur dient. */
export const onLavender = `${t.body} font-semibold text-[#141416]`;
export const bodyMuted = `${t.body} text-[#71717a]`;
export const hint = `${t.hint} text-[#71717a]`;
export const error = `${t.hint} text-white`;
/** Rechts in een rij: de waarde. Altijd lavendel, altijd dik. */
export const value = `font-editorial ${t.body} font-bold text-[#baa3d0]`;
export const display = `font-editorial ${t.display} tracking-tight text-white leading-none`;
export const metric = `font-editorial ${t.metric} text-white leading-none`;
export const buttonText = `font-editorial ${t.body} tracking-wider uppercase leading-none`;

/** Ruimte. Vijf stappen, meer niet. */
export const s = {
  page: "px-4 pt-4 pb-32", // buitenrand van de pagina
  stack: "space-y-3.5", // tussen blokken
  card: "p-5", // in een kaart
  tight: "space-y-1.5", // tussen label en waarde
  gap: "gap-3.5", // tussen naast elkaar
} as const;

/** De grote widget van vandaag. */
export const todayWidget = `block ${hero} relative overflow-hidden transition apple-press`;

/** Invoer */
export const input = `w-full bg-[#141416] border border-white/[0.08] ${hoek} px-4 py-3 ${t.body} text-white outline-none placeholder:text-[#71717a] focus:border-[#baa3d0]`;

/**
- Zelfde veld als input, maar zo breed als de tekst erin en in de waarde-stijl.
- field-sizing: content is de native maat, geen JS.
 */
export const growInput = `w-auto min-w-[8ch] [field-sizing:content] bg-[#141416] border border-white/[0.08] ${hoek} px-4 py-3 ${value} outline-none focus:border-[#baa3d0]`;
export const numberInput = `w-full bg-[#141416] border border-white/[0.08] ${hoek} px-4 py-2.5 ${t.body} font-semibold text-white text-center outline-none placeholder:text-[#71717a] focus:border-[#baa3d0] disabled:opacity-40`;
export const segment = `${rond} px-4 py-3 ${t.label} uppercase tracking-wider font-semibold transition apple-press`;

/** Knoppen */
export const primary = `w-full bg-[#baa3d0] ${rond} py-3.5 px-4 text-center transition apple-press disabled:opacity-50`;
export const secondary = `w-full bg-[#141416] border border-white/[0.08] ${rond} py-3.5 px-4 text-center transition apple-press disabled:opacity-50`;

/** Pagina-wikkelaar */
export const page = (bottom = "pb-32") =>
  `min-h-screen bg-[#baa3d0] text-white ${bottom} pt-4 px-4 select-none`;
export const pageCentered = "min-h-screen bg-[#baa3d0] px-4 py-10 flex items-center justify-center select-none";

/** Chrome */
export const pill = `h-10 bg-[#141416] border border-white/[0.08] ${rond} flex items-center gap-2 px-4`;
export const pillText = `${buttonText} text-white`;
export const circleButton = `w-10 h-10 shrink-0 bg-[#141416] border border-white/[0.08] ${rond} flex items-center justify-center text-white apple-press disabled:opacity-50`;
export const dock = "fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none";
export const dockPill = `pointer-events-auto bg-[#141416]/90 backdrop-blur-2xl border border-white/[0.1] ${rond} px-6 py-3 flex items-center gap-8`;

/** Kop voor elke pagina: altijd links de pill met stip, rechts optionele acties */
export function Header({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
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

/** Sectie: label links, metadata rechts */
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

/** Knop: primaire of secundaire variant, altijd over de volle breedte. */
export function Action({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  return (
    <button
      {...props}
      className={`${variant === "primary" ? primary : secondary} ${className}`}
    >
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

/** Sluitknop. Hoort bij de kop: zelfde cirkel, icoon zo groot als de koptekst. */
export function CloseButton({
  label = "Sluiten",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return (
    <button {...props} aria-label={label} className={`${circleButton} ${className}`}>
      <X className={`${t.body} stroke-[1.8]`} />
    </button>
  );
}

/** Terugknop. Zelfde maat als de sluitknop. */
export function BackButton({
  href,
  className = "",
}: {
  href: string;
  className?: string;
}) {
  return (
    <Link href={href} aria-label="Terug" className={`${circleButton} ${className}`}>
      <ChevronLeft className={`${t.body} stroke-[1.8]`} />
    </Link>
  );
}