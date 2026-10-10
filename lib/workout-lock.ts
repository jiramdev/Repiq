// lib/workout-lock.ts
// Pure lock-in rules, shared by the proxy (lib/session-lookup.ts) and the
// server-side guards (lib/active-workout.ts). No Next.js imports here.
import { todayIn, resolveTimeZone } from "@/lib/time";

export interface OpenSessionRow {
  id: number | string;
  workout_id: number | string;
  started_on: string;
  has_data: boolean;
}

export interface ActiveWorkout {
  sessionId: number;
  workoutId: number;
  startedOn: string;
  /** Started on an earlier day than today. */
  stale: boolean;
}

/** Pure: pick the session that locks the user in (newest first in `rows`). */
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
    if (!stale || row.has_data) {
      return { sessionId: Number(row.id), workoutId: Number(row.workout_id), startedOn, stale };
    }
  }
  return null;
}
