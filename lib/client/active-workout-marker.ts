"use client";

// The device's memory of the active workout ("/workout/123"), so the app can
// return to it even when the server can't be asked (offline, back button
// restoring a cached page). The server stays the source of truth.
export const ACTIVE_WORKOUT_KEY = "repiq:active-workout";

function tellServiceWorker(url: string | null) {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "ACTIVE_WORKOUT", url });
  } catch {
    // no service worker
  }
}

export function getActiveWorkoutMarker(): string | null {
  try {
    return localStorage.getItem(ACTIVE_WORKOUT_KEY);
  } catch {
    return null;
  }
}

export function setActiveWorkoutMarker(url: string | null) {
  try {
    if (url) localStorage.setItem(ACTIVE_WORKOUT_KEY, url);
    else localStorage.removeItem(ACTIVE_WORKOUT_KEY);
  } catch {
    // storage disabled
  }
  tellServiceWorker(url);
}
