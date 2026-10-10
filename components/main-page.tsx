// components/main-page.tsx
// The one layout for the four main pages (dashboard, schedule, statistics,
// account): same page padding, header placement and size, spacing between
// sections and room for the bottom nav. Change it here, not per page.
import type { ReactNode } from "react";
import { Header, s } from "@/components/ui";

/**
 * Bottom padding clears the floating dock (bottom-6 + its height) plus the
 * home indicator on notched phones.
 */
export const mainPageShell =
  "min-h-[100dvh] bg-[#baa3d0] text-white select-none px-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(8rem+env(safe-area-inset-bottom,0px))]";

export function MainPage({
  title,
  actions,
  children,
}: {
  title: string;
  /** Optional controls on the right of the header. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={mainPageShell}>
      <main className={`max-w-sm mx-auto w-full ${s.stack}`}>
        <Header title={title}>{actions}</Header>
        {children}
      </main>
    </div>
  );
}
