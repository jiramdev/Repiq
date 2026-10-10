// lib/active-workout.ts (server only)
//
// Lock-in: while a user has an active workout, the workout screen is the only
// screen. "Active" means an unfinished session that either was started today
// (in the user's timezone) or already has something logged. Older sessions
// with nothing logged are stale leftovers: they never lock anyone in and are
// cleaned up when the next workout starts.
import { cache } from "react";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { pickActiveSession, type ActiveWorkout, type OpenSessionRow } from "@/lib/workout-lock";
import { str } from "@/lib/strings";

export type { ActiveWorkout };

export const getActiveWorkout = cache(async (userId: string): Promise<ActiveWorkout | null> => {
  const rows = await sql`
    SELECT
      ws.id,
      ws.workout_id,
      ws.started_at,
      to_char(ws.started_on, 'YYYY-MM-DD') AS started_on,
      EXISTS (
        SELECT 1 FROM workout_logs l
        WHERE l.session_id = ws.id
          -- to_jsonb: still works when migration 0009 (duration_seconds) hasn't run.
          AND (COALESCE(l.completed, false) OR l.actual_weight IS NOT NULL OR l.actual_reps IS NOT NULL OR to_jsonb(l) ->> 'duration_seconds' IS NOT NULL)
      ) AS has_data,
      p.timezone
    FROM workout_sessions ws
    LEFT JOIN user_profiles p ON p.user_id = ws.user_id
    WHERE ws.user_id = ${userId} AND ws.completed_at IS NULL
    ORDER BY ws.started_at DESC, ws.id DESC
  `;
  if (rows.length === 0) return null;
  return pickActiveSession(rows as unknown as OpenSessionRow[], rows[0].timezone as string | null);
});

/** For every page except the workout screen: signed in and not locked in a workout. */
export async function requireIdleUserId(): Promise<string> {
  const userId = await requireUserId();
  const active = await getActiveWorkout(userId);
  if (active) redirect(`/workout/${active.workoutId}`);
  return userId;
}

/** Defense in depth for server actions: an error message while a workout is active. */
export async function workoutLockError(userId: string): Promise<string | null> {
  return (await getActiveWorkout(userId)) ? str.workout.locked : null;
}
