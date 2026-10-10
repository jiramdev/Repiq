// components/pwa.tsx
"use client";

import { useEffect, useState } from "react";
import { str } from "@/lib/strings";

/**
 * Registers the service worker once for the whole app (root layout) and shows
 * a small "update available" bar when a new worker is waiting. The new worker
 * only takes over when the user taps Reload, so an update never interrupts a
 * workout.
 */
export function PwaManager() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    // Only reload when an existing worker is replaced (an update the user
    // accepted). The very first install also fires controllerchange (via
    // clients.claim), and reloading then would only interrupt the first visit.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing || !hadController) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const trackInstalling = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          setWaiting(worker);
        }
      });
    };

    let interval: number | undefined;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => trackInstalling(reg.installing));
        // Check for a new version every hour while the app stays open.
        interval = window.setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      })
      .catch((err) => console.error("Service worker registration failed:", err));

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (interval) window.clearInterval(interval);
    };
  }, []);

  if (!waiting) return null;

  return (
    <div
      role="status"
      className="fixed top-[calc(env(safe-area-inset-top,0px)+0.75rem)] inset-x-0 z-[60] flex justify-center px-4"
    >
      <div className="flex items-center gap-3 rounded-full bg-[#141416] border border-white/[0.1] pl-5 pr-1.5 py-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.45)]">
        <span className="text-[13px] text-white">{str.pwa.updateAvailable}</span>
        <button
          type="button"
          onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}
          className="min-h-11 rounded-full bg-[#baa3d0] px-4 text-[13px] font-semibold text-[#141416]"
        >
          {str.pwa.reload}
        </button>
      </div>
    </div>
  );
}

/**
 * Wipe cached pages (they contain the signed-in user's data). Runs whenever the
 * sign-in page loads, so an expired session never leaves the previous user's
 * pages behind for the next one. Unsent workout sets are kept: if a session
 * expired mid-workout, they're re-sent after signing back in.
 */
export async function clearPageCaches(): Promise<void> {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_CACHES" });
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("repiq-pages-") || k.startsWith("repiq-meta"))
          .map((k) => caches.delete(k))
      );
    }
  } catch {
    // Best effort only.
  }
}

/** Everything this app stored on the device, e.g. on an explicit sign-out. */
export async function clearAppCaches(): Promise<void> {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_CACHES" });
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("repiq-")).map((k) => caches.delete(k)));
    }
    Object.keys(localStorage)
      .filter((k) => k.startsWith("repiq:"))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // Best effort only.
  }
}
