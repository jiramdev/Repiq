// components/loading-screen.tsx
// The one loading screen: the Repiq mark centred on the lavender of the
// artwork, full-bleed over everything. Used by app/loading.tsx, every Suspense
// fallback and full-screen transitions (sign-in, finishing a workout, logout).
// It matches the iOS startup images, so app start flows straight into it.
import { LOGO_INK, LOGO_PATH, LOGO_VIEWBOX } from "@/lib/logo";
import { THEME_COLOR } from "@/lib/theme";
import { str } from "@/lib/strings";

export function LoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={str.common.loading}
      className="repiq-loading fixed inset-0 z-[100] flex items-center justify-center select-none"
      style={{ backgroundColor: THEME_COLOR }}
    >
      <svg
        viewBox={LOGO_VIEWBOX}
        aria-hidden="true"
        focusable="false"
        className="repiq-loading-mark block h-auto"
      >
        <path fill={LOGO_INK} d={LOGO_PATH} />
      </svg>
    </div>
  );
}
