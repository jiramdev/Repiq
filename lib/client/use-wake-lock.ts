// lib/client/use-wake-lock.ts
"use client";

import { useEffect } from "react";

/** Keep the screen on while mounted (where the Screen Wake Lock API exists). */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
        sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) await sentinel.release();
      } catch {
        // Denied (e.g. battery saver). Not critical.
      }
    };

    const onVisibility = () => void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
