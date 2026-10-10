"use client";

// Turns a failed server action (or fetch) into something the user can act on.
// Before this, every failure read "Couldn't reach the server", even when the
// server was reachable and simply returned an error.
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { str } from "@/lib/strings";

export type ActionErrorKind = "network" | "stale" | "server";

const STALE_RELOAD_FLAG = "repiq:stale-reload";

function messageOf(err: unknown): string {
  if (err instanceof Error) return `${err.name} ${err.message}`;
  return String(err ?? "");
}

/** Pure classification (exported for tests). */
export function classifyActionError(err: unknown, online = true): ActionErrorKind {
  try {
    if (unstable_isUnrecognizedActionError(err)) return "stale";
  } catch {
    // older Next: fall through
  }
  const text = messageOf(err);
  // A deploy replaced the code this page was built with.
  if (
    /ChunkLoadError|Loading (CSS )?chunk|Failed to fetch dynamically imported module|Importing a module script failed|Server Action .* was not found|UnrecognizedActionError/i.test(
      text
    )
  ) {
    return "stale";
  }
  if (!online) return "network";
  // What browsers throw when a request never got a response.
  if (
    err instanceof TypeError &&
    /fetch|network|load failed|connection|timeout/i.test(text)
  ) {
    return "network";
  }
  if (/^Error timeout$|NetworkError|ERR_INTERNET|ERR_NETWORK/i.test(text)) return "network";
  // Anything else came back from the server as an error (500, digest).
  return "server";
}

export function actionErrorMessage(kind: ActionErrorKind): string {
  if (kind === "network") return str.workout.actionFailed;
  if (kind === "stale") return str.errors.staleApp;
  return str.errors.server;
}

/**
 * The app on this device is older than the server. Drop cached pages (so the
 * service worker can't serve the old HTML again) and reload once. Returns
 * false when we already reloaded for this, so the caller shows a message
 * instead of looping.
 */
export function recoverFromStaleApp(): boolean {
  try {
    const last = Number(sessionStorage.getItem(STALE_RELOAD_FLAG) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(STALE_RELOAD_FLAG, String(Date.now()));
  } catch {
    // no sessionStorage: still reload once
  }
  void (async () => {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith("repiq-pages-")).map((k) => caches.delete(k)));
      }
      await navigator.serviceWorker?.getRegistration().then((r) => r?.update());
    } catch {
      // best effort
    }
    window.location.reload();
  })();
  return true;
}

/** Classify, recover from a stale app if possible, and return the message to show. */
export function handleActionError(err: unknown): { kind: ActionErrorKind; message: string } {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const kind = classifyActionError(err, online);
  if (kind === "stale" && recoverFromStaleApp()) return { kind, message: str.errors.reloading };
  return { kind, message: actionErrorMessage(kind) };
}
