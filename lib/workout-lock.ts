// lib/workout-lock.ts
// Pure lock-in rules, shared by the proxy (lib/session-lookup.ts) and the
// server-side guards (lib/active-workout.ts). No Next.js imports here.
import { todayIn, resolveTimeZone } from "@/lib/time";

/**
 * Escape hatch: a workout that was started this long ago never locks anyone
 * in, whatever state it is in. It stays open (nothing logged is lost) and the
 * dashboard offers to resume it, but the app is usable again.
 */
export const LOCK_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface OpenSessionRow {
  id: number | string;
  workout_id: number | string;
  started_on: string;
  /** When the session was created. Missing on old rows: then only the day counts. */
  started_at?: string | Date | null;
  has_data: boolean;
}

export interface ActiveWorkout {
  sessionId: number;
  workoutId: number;
  startedOn: string;
  /** Started on an earlier day than today. */
  stale: boolean;
}

function startedAtMs(value: OpenSessionRow["started_at"]): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Pure: pick the session that locks the user in (newest first in `rows`).
 * A session locks when it is younger than LOCK_MAX_AGE_MS and was either
 * started today or already has something logged.
 */
export function pickActiveSession(
  rows: OpenSessionRow[] | null | undefined,
  timeZone: string | null | undefined,
  now: Date = new Date()
): ActiveWorkout | null {
  if (!rows || rows.length === 0) return null;
  const today = todayIn(resolveTimeZone(timeZone), now).date;
  for (const row of rows) {
    const startedOn = String(row.started_on).slice(0, 10);
    const stale = startedOn < today;
    const at = startedAtMs(row.started_at);
    if (at !== null && now.getTime() - at >= LOCK_MAX_AGE_MS) continue;
    if (!stale || row.has_data) {
      return { sessionId: Number(row.id), workoutId: Number(row.workout_id), startedOn, stale };
    }
  }
  return null;
}
