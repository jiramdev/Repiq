// lib/workout-session.ts
import { sql } from "@/lib/db";
import { convertWeight, type WeightUnit } from "@/lib/units";
import type { WorkoutLog } from "@/app/workout/[id]/types";

/** Namespace for pg_advisory_xact_lock(namespace, workout_id). */
const SESSION_LOCK_NAMESPACE = 7301;

export interface OpenSession {
  id: number;
  plan_name: string;
}

/**
 * Returns the open session for a schedule day, creating it and its sets from
 * the plan if needed. Everything runs in one transaction behind an advisory
 * lock on the workout, so two tabs (or a double render) can't seed twice.
 * Unfinished sessions from earlier days with nothing logged are dropped.
 */
export async function startOrResumeSession(params: {
  userId: string;
  workoutId: number;
  planId: number;
  planTitle: string;
  today: string;
  unit: WeightUnit;
}): Promise<OpenSession | null> {
  const { userId, workoutId, planId, planTitle, today, unit } = params;

  const results = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(${SESSION_LOCK_NAMESPACE}::int, ${workoutId}::int)`,
    sql`
      DELETE FROM workout_sessions s
      WHERE s.workout_id = ${workoutId}
        AND s.user_id = ${userId}
        AND s.completed_at IS NULL
        AND s.started_on < ${today}::date
        AND NOT EXISTS (
          SELECT 1 FROM workout_logs l
          WHERE l.session_id = s.id
            AND (COALESCE(l.completed, false) OR l.actual_weight IS NOT NULL OR l.actual_reps IS NOT NULL)
        )
    `,
    sql`
      INSERT INTO workout_sessions (user_id, workout_id, plan_id, plan_name, started_on)
      SELECT ${userId}, ${workoutId}, ${planId}, ${planTitle}, ${today}::date
      WHERE NOT EXISTS (
        SELECT 1 FROM workout_sessions
        WHERE workout_id = ${workoutId} AND completed_at IS NULL
      )
    `,
    sql`
      INSERT INTO workout_logs
        (workout_id, session_id, exercise_name, set_number, target_reps, rest_seconds, order_index, weight_unit)
      SELECT
        ${workoutId},
        s.id,
        pe.name,
        gs.n,
        pe.reps,
        COALESCE(pe.rest_seconds, 90),
        (dense_rank() OVER (ORDER BY pe.id))::int - 1,
        ${unit}
      FROM workout_sessions s
      JOIN plans p ON p.id = s.plan_id AND p.user_id = ${userId}
      JOIN plan_exercises pe ON pe.plan_id = p.id
      CROSS JOIN LATERAL generate_series(1, GREATEST(LEAST(COALESCE(pe.sets, 1), 20), 1)) AS gs(n)
      WHERE s.workout_id = ${workoutId}
        AND s.user_id = ${userId}
        AND s.completed_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM workout_logs l WHERE l.session_id = s.id)
    `,
    sql`
      SELECT id, plan_name
      FROM workout_sessions
      WHERE workout_id = ${workoutId} AND user_id = ${userId} AND completed_at IS NULL
      LIMIT 1
    `,
  ]);

  const row = (results[results.length - 1] as Record<string, unknown>[])[0];
  return row ? { id: Number(row.id), plan_name: String(row.plan_name) } : null;
}

/**
 * The sets of one session, with the "Prev" hint: the same set of the same
 * exercise from this user's most recent other session. Weights come back in
 * the user's unit.
 */
export async function getSessionLogs(params: {
  userId: string;
  sessionId: number;
  unit: WeightUnit;
}): Promise<WorkoutLog[]> {
  const { userId, sessionId, unit } = params;
  const rows = await sql`
    SELECT
      wl.id,
      wl.exercise_name,
      wl.set_number,
      wl.target_reps,
      COALESCE(wl.rest_seconds, 90) AS rest_seconds,
      wl.actual_weight::float AS actual_weight,
      wl.weight_unit,
      wl.actual_reps::int AS actual_reps,
      COALESCE(wl.completed, false) AS completed,
      prev.actual_weight::float AS last_weight,
      prev.weight_unit AS last_unit,
      prev.actual_reps::int AS last_reps
    FROM workout_logs wl
    JOIN workout_sessions s ON s.id = wl.session_id AND s.user_id = ${userId}
    LEFT JOIN LATERAL (
      SELECT pl.actual_weight, pl.weight_unit, pl.actual_reps
      FROM workout_logs pl
      JOIN workout_sessions ps ON ps.id = pl.session_id
      WHERE ps.user_id = ${userId}
        AND ps.id <> ${sessionId}
        AND lower(trim(pl.exercise_name)) = lower(trim(wl.exercise_name))
        AND pl.set_number = wl.set_number
        AND (pl.actual_weight IS NOT NULL OR pl.actual_reps IS NOT NULL)
      ORDER BY COALESCE(ps.completed_at, ps.started_at) DESC, pl.id DESC
      LIMIT 1
    ) prev ON true
    WHERE wl.session_id = ${sessionId}
    ORDER BY wl.order_index ASC NULLS LAST, wl.set_number ASC, wl.id ASC
  `;

  return rows.map((l) => ({
    id: Number(l.id),
    exercise_name: String(l.exercise_name),
    set_number: Number(l.set_number),
    target_reps: l.target_reps == null ? null : Number(l.target_reps),
    rest_seconds: Number(l.rest_seconds),
    actual_weight: convertWeight(l.actual_weight, l.weight_unit, unit),
    actual_reps: l.actual_reps == null ? null : Number(l.actual_reps),
    completed: Boolean(l.completed),
    last_weight: convertWeight(l.last_weight, l.last_unit, unit),
    last_reps: l.last_reps == null ? null : Number(l.last_reps),
  }));
}
