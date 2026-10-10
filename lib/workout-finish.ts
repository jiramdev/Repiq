// lib/workout-finish.ts (server only)
//
// Finishing and discarding the open session of a schedule day. Shared by the
// server actions (the normal path) and the plain POST routes under
// /api/workout/[id]/ (the escape hatch the client falls back to when a server
// action fails, e.g. after a deploy changed the action ids). Both only touch
// workout_sessions and completed_sessions, so they keep working even when a
// later migration hasn't run.
import { sql } from "@/lib/db";
import { getUserPrefs } from "@/lib/user";
import { todayIn } from "@/lib/time";

/** Finish the open session. Safe to call twice: the second call does nothing. */
export async function finishOpenSession(userId: string, workoutId: number): Promise<void> {
  const { timeZone } = await getUserPrefs(userId);
  const today = todayIn(timeZone).date;
  await sql`
    WITH done AS (
      UPDATE workout_sessions
      SET completed_at = now(), completed_on = ${today}::date
      WHERE workout_id = ${workoutId} AND user_id = ${userId} AND completed_at IS NULL
      RETURNING id, user_id, workout_id, plan_name, completed_on
    )
    INSERT INTO completed_sessions (user_id, workout_id, plan_name, completed_date, session_id)
    SELECT user_id, workout_id, plan_name, completed_on, id FROM done
    ON CONFLICT (session_id) DO NOTHING
  `;
}

/** Throw away the open session and every set logged in it (ON DELETE CASCADE). */
export async function discardOpenSession(userId: string, workoutId: number): Promise<void> {
  await sql`
    DELETE FROM workout_sessions
    WHERE workout_id = ${workoutId} AND user_id = ${userId} AND completed_at IS NULL
  `;
}
