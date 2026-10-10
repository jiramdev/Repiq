// lib/client/use-set-saver.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { updateLogSet, type LogPatch } from "@/app/workout/[id]/actions";

export type SaveStatus = "idle" | "saving" | "saved" | "offline" | "error";

const DEBOUNCE_MS = 700;
const MAX_BACKOFF_MS = 30_000;

type PendingMap = Record<number, LogPatch>;

function storageKey(sessionId: number) {
  return `repiq:pending:${sessionId}`;
}

function readPending(sessionId: number): PendingMap {
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    return raw ? (JSON.parse(raw) as PendingMap) : {};
  } catch {
    return {};
  }
}

function writePending(sessionId: number, pending: PendingMap) {
  try {
    if (Object.keys(pending).length === 0) localStorage.removeItem(storageKey(sessionId));
    else localStorage.setItem(storageKey(sessionId), JSON.stringify(pending));
  } catch {
    // Storage full or disabled: we still retry in memory.
  }
}

/**
 * Debounced, retrying saver for logged sets.
 *
 * - Edits to the same set are merged and sent after a short pause (ticks go
 *   out immediately).
 * - Unsent edits are mirrored to localStorage, so closing the app or losing
 *   signal between sets doesn't lose them; they're re-sent on the next visit.
 * - Failures retry with exponential backoff, and immediately when the device
 *   comes back online.
 */
export function useSetSaver(sessionId: number) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const pending = useRef<PendingMap>({});
  const inflight = useRef<Promise<void> | null>(null);
  const debounce = useRef<number | undefined>(undefined);
  const retry = useRef<number | undefined>(undefined);
  const attempts = useRef(0);
  // Lets timers call the latest flush without flush referencing itself.
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const later = (ms: number) => window.setTimeout(() => void flushRef.current(), ms);

  const persist = useCallback(() => writePending(sessionId, pending.current), [sessionId]);

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(debounce.current);
    window.clearTimeout(retry.current);
    if (inflight.current) {
      await inflight.current;
      if (Object.keys(pending.current).length === 0) return;
    }

    const batch = pending.current;
    const ids = Object.keys(batch).map(Number);
    if (ids.length === 0) return;
    pending.current = {};

    const run = (async () => {
      setStatus("saving");
      const failed: PendingMap = {};
      for (const id of ids) {
        try {
          await updateLogSet(id, batch[id]);
          // ok, or a permanent refusal (retry: false): either way, stop sending it.
        } catch {
          failed[id] = batch[id];
        }
      }

      // Newer edits made while we were sending win over the failed ones.
      for (const [id, patch] of Object.entries(failed)) {
        pending.current[Number(id)] = { ...patch, ...pending.current[Number(id)] };
      }
      persist();

      if (Object.keys(failed).length > 0) {
        attempts.current += 1;
        setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts.current);
        retry.current = later(delay);
      } else {
        attempts.current = 0;
        setStatus(Object.keys(pending.current).length > 0 ? "saving" : "saved");
        if (Object.keys(pending.current).length > 0) {
          debounce.current = later(DEBOUNCE_MS);
        }
      }
    })();

    inflight.current = run;
    try {
      await run;
    } finally {
      inflight.current = null;
    }
  }, [persist]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const queue = useCallback(
    (logId: number, patch: LogPatch, immediate = false) => {
      pending.current[logId] = { ...pending.current[logId], ...patch };
      persist();
      setStatus("saving");
      window.clearTimeout(debounce.current);
      if (immediate) void flush();
      else debounce.current = window.setTimeout(() => void flush(), DEBOUNCE_MS);
    },
    [flush, persist]
  );

  /** Send everything now. Resolves true when nothing is left unsaved. */
  const flushNow = useCallback(async (): Promise<boolean> => {
    await flush();
    return Object.keys(pending.current).length === 0;
  }, [flush]);

  const forget = useCallback(() => {
    window.clearTimeout(debounce.current);
    window.clearTimeout(retry.current);
    pending.current = {};
    persist();
  }, [persist]);

  /** Edits saved on this device but not yet on the server (e.g. from a previous visit). */
  const restore = useCallback((): PendingMap => {
    const stored = readPending(sessionId);
    pending.current = { ...stored, ...pending.current };
    if (Object.keys(stored).length > 0) void flush();
    return stored;
  }, [sessionId, flush]);

  useEffect(() => {
    const onOnline = () => void flush();
    const onHidden = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onHidden);
      window.clearTimeout(debounce.current);
      window.clearTimeout(retry.current);
    };
  }, [flush]);

  return { status, queue, flushNow, forget, restore, retryNow: flush };
}
