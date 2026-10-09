// lib/client/use-rest-timer.ts
"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { str } from "@/lib/strings";

const TICK_MS = 250;
const RESCHEDULE_DEBOUNCE_MS = 1000;
const CHANGE_EVENT = "repiq:rest-timer";

function key(workoutId: number) {
  return `repiq:rest:${workoutId}`;
}

function readEnd(workoutId: number): number | null {
  try {
    const raw = localStorage.getItem(key(workoutId));
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeEnd(workoutId: number, endAt: number | null) {
  try {
    if (endAt == null) localStorage.removeItem(key(workoutId));
    else localStorage.setItem(key(workoutId), String(endAt));
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

// --- alarm -----------------------------------------------------------------

let audioCtx: AudioContext | null = null;

/** Must be called from a tap so iOS allows sound later. */
function unlockAudio() {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx ??= new Ctor();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    // no audio
  }
}

function playAlarm() {
  try {
    navigator.vibrate?.([200, 100, 200, 100, 300]);
  } catch {
    // no vibration API (iOS)
  }
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + 0.01;
  [0, 0.25, 0.5].forEach((offset, i) => {
    const osc = audioCtx!.createOscillator();
    const gain = audioCtx!.createGain();
    osc.type = "sine";
    osc.frequency.value = i === 2 ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, t0 + offset);
    gain.gain.exponentialRampToValueAtTime(0.35, t0 + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.18);
    osc.connect(gain).connect(audioCtx!.destination);
    osc.start(t0 + offset);
    osc.stop(t0 + offset + 0.2);
  });
}

// --- server push -------------------------------------------------------------

async function schedulePush(workoutId: number, seconds: number): Promise<string | null> {
  try {
    const res = await fetch("/api/push/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restSeconds: seconds, workoutId }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { scheduled?: boolean; timerId?: string };
    return data.scheduled && data.timerId ? data.timerId : null;
  } catch {
    return null;
  }
}

function cancelPush(timerId: string | null) {
  if (!timerId) return;
  void fetch("/api/push/schedule", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timerId }),
    keepalive: true,
  }).catch(() => {});
}

async function showLocalNotification(url: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker?.ready;
    await reg?.showNotification(str.workout.restNotificationTitle, {
      body: str.workout.restNotificationBody,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: "repiq-rest-timer",
      data: { url },
    });
  } catch {
    // ignore
  }
}

/**
 * Rest timer that counts down to an absolute end time (so it survives the app
 * being backgrounded or reloaded), beeps and vibrates at zero, supports ±15s and
 * skip, and keeps a server-side push notification in sync when enabled.
 */
export function useRestTimer(workoutId: number, pushEnabled: boolean) {
  const endAt = useSyncExternalStore(
    subscribe,
    () => readEnd(workoutId),
    () => null
  );
  const [now, setNow] = useState(() => Date.now());
  const timerId = useRef<string | null>(null);
  const pushScheduled = useRef(false);
  const reschedule = useRef<number | undefined>(undefined);

  const syncPush = useCallback(
    (end: number | null, debounce: boolean) => {
      window.clearTimeout(reschedule.current);
      cancelPush(timerId.current);
      timerId.current = null;
      pushScheduled.current = false;
      if (!pushEnabled || end == null) return;

      const run = async () => {
        const seconds = Math.round((end - Date.now()) / 1000);
        if (seconds < 5) return;
        const id = await schedulePush(workoutId, seconds);
        timerId.current = id;
        pushScheduled.current = id != null;
      };
      if (debounce) reschedule.current = window.setTimeout(() => void run(), RESCHEDULE_DEBOUNCE_MS);
      else void run();
    },
    [pushEnabled, workoutId]
  );

  useEffect(() => {
    if (endAt == null) return;
    const interval = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= endAt) {
        writeEnd(workoutId, null);
        timerId.current = null;
        playAlarm();
        // No server push available: notify locally if the app is in the background.
        if (!pushScheduled.current && document.visibilityState === "hidden") {
          void showLocalNotification(`/workout/${workoutId}`);
        }
      }
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [endAt, workoutId]);

  useEffect(() => () => window.clearTimeout(reschedule.current), []);

  const start = useCallback(
    (seconds: number) => {
      unlockAudio();
      const end = Date.now() + Math.max(1, seconds) * 1000;
      setNow(Date.now());
      writeEnd(workoutId, end);
      syncPush(end, false);
    },
    [workoutId, syncPush]
  );

  const adjust = useCallback(
    (deltaSeconds: number) => {
      const current = readEnd(workoutId);
      if (current == null) return;
      const end = Math.max(Date.now() + 1000, current + deltaSeconds * 1000);
      writeEnd(workoutId, end);
      syncPush(end, true);
    },
    [workoutId, syncPush]
  );

  const stop = useCallback(() => {
    writeEnd(workoutId, null);
    syncPush(null, false);
  }, [workoutId, syncPush]);

  const remaining = endAt == null ? null : Math.max(0, Math.ceil((endAt - now) / 1000));

  return { remaining, start, adjust, stop };
}
