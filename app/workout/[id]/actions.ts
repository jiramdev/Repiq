// app/workout/[id]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getUserPrefs } from "@/lib/user";
import { todayIn } from "@/lib/time";
import { str } from "@/lib/strings";
import { getActiveWorkout } from "@/lib/active-workout";
import { startOrResumeSession } from "@/lib/workout-session";
import { finishOpenSession, discardOpenSession } from "@/lib/workout-finish";
import { normalizeUnit } from "@/lib/units";
import { LIMITS, toId, toIntInRange, toNumberInRange } from "@/lib/validation";

export type LogPatch = {
  actual_weight?: number | null;
  actual_reps?: number | null;
  /** Static holds, in seconds. */
  duration_seconds?: number | null;
  completed?: boolean;
  /** Unit the weight was entered in. */
  unit?: string;
};

/**
 * Save one set. Only sets in the caller's own, unfinished sessions can change,
 * and only with the fields of the set's type: a weight only for weighted sets,
 * reps not for static holds, a duration only for static holds. Clearing a
 * field (null) is always allowed.
 * `retry: false` tells the client the change can never succeed (invalid or not
 * theirs) so it should stop retrying.
 */
export async function updateLogSet(
  logId: number,
  patch: LogPatch
): Promise<{ ok: boolean; retry?: boolean }> {
  const userId = await requireUserId();

  const id = toId(logId);
  if (id === null || !patch || typeof patch !== "object") return { ok: false, retry: false };

  const hasWeight = "actual_weight" in patch;
  const hasReps = "actual_reps" in patch;
  const hasDuration = "duration_seconds" in patch;
  const hasCompleted = "completed" in patch;
  if (!hasWeight && !hasReps && !hasDuration && !hasCompleted) return { ok: true };

  const weight =
    patch.actual_weight == null
      ? null
      : toNumberInRange(patch.actual_weight, LIMITS.weight.min, LIMITS.weight.max);
  const reps =
    patch.actual_reps == null
      ? null
      : toIntInRange(patch.actual_reps, LIMITS.loggedReps.min, LIMITS.loggedReps.max);

  if (hasWeight && patch.actual_weight != null && weight === null) return { ok: false, retry: false };
  if (hasReps && patch.actual_reps != null && reps === null) return { ok: false, retry: false };
  const duration =
    patch.duration_seconds == null
      ? null
      : toIntInRange(patch.duration_seconds, LIMITS.loggedSeconds.min, LIMITS.loggedSeconds.max);
  if (hasDuration && patch.duration_seconds != null && duration === null) return { ok: false, retry: false };
  if (hasCompleted && typeof patch.completed !== "boolean") return { ok: false, retry: false };

  const unit = normalizeUnit(patch.unit);

  const rows = await sql`
    UPDATE workout_logs wl
    SET actual_weight = CASE WHEN ${hasWeight}::boolean THEN ${weight}::numeric ELSE wl.actual_weight END,
        weight_unit   = CASE WHEN ${hasWeight}::boolean THEN ${unit} ELSE wl.weight_unit END,
        actual_reps   = CASE WHEN ${hasReps}::boolean THEN ${reps}::int ELSE wl.actual_reps END,
        duration_seconds = CASE WHEN ${hasDuration}::boolean THEN ${duration}::int ELSE wl.duration_seconds END,
        completed     = CASE WHEN ${hasCompleted}::boolean THEN ${Boolean(patch.completed)}::boolean ELSE wl.completed END
    FROM workout_sessions s
    WHERE wl.id = ${id}
      AND s.id = wl.session_id
      AND s.user_id = ${userId}
      AND s.completed_at IS NULL
      AND (${weight}::numeric IS NULL OR wl.exercise_type = 'weighted')
      AND (${reps}::int IS NULL OR wl.exercise_type <> 'static')
      AND (${duration}::int IS NULL OR wl.exercise_type = 'static')
    RETURNING wl.id
  `;

  return rows.length > 0 ? { ok: true } : { ok: false, retry: false };
}

function revalidateWorkout() {
  // Not the workout page itself: re-rendering it is pointless once the
  // session is gone, and the client leaves with a full navigation anyway.
  revalidatePath("/", "page");
  revalidatePath("/statistics", "page");
  revalidatePath("/schedule", "page");
  revalidatePath("/account", "page");
}

export type StartResult =
  | { ok: true; workoutId: number }
  | { ok: false; error: string; planId?: number };

/**
 * Start (or resume) the workout of a schedule day. The only place a session is
 * created: an explicit tap on the dashboard, never a page render.
 */
export async function startWorkout(workoutId: number): Promise<StartResult> {
  const userId = await requireUserId();
  const id = toId(workoutId);
  if (id === null) return { ok: false, error: str.common.genericError };

  // Already in a workout: go there instead.
  const active = await getActiveWorkout(userId);
  if (active) return { ok: true, workoutId: active.workoutId };

  const rows = await sql`
    SELECT w.plan_id, p.title AS plan_title,
           (SELECT count(*)::int FROM plan_exercises pe WHERE pe.plan_id = p.id) AS exercise_count
    FROM workouts w
    LEFT JOIN plans p ON p.id = w.plan_id AND p.user_id = w.user_id
    WHERE w.id = ${id} AND w.user_id = ${userId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || !row.plan_id || !row.plan_title) return { ok: false, error: str.common.genericError };
  const planId = Number(row.plan_id);
  if (Number(row.exercise_count) === 0) return { ok: false, error: str.workout.empty, planId };

  const { unit, timeZone } = await getUserPrefs(userId);
  const session = await startOrResumeSession({
    userId,
    workoutId: id,
    planId,
    planTitle: String(row.plan_title),
    today: todayIn(timeZone).date,
    unit,
  });
  // Null: another (old, unlocked) workout is still open. The dashboard shows it.
  if (!session) return { ok: false, error: str.workout.otherOpen };
  return { ok: true, workoutId: id };
}

/** Finish the open session. Safe to call twice: the second call does nothing. */
export async function completeWorkout(workoutId: number): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  const id = toId(workoutId);
  if (id === null) return { ok: false };
  await finishOpenSession(userId, id);
  revalidateWorkout();
  return { ok: true };
}

/**
 * Throw away the open session and every set logged in it. Only ever called by
 * an explicit, confirmed Discard on the workout screen.
 */
export async function discardWorkout(workoutId: number): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  const id = toId(workoutId);
  if (id === null) return { ok: false };
  await discardOpenSession(userId, id);
  revalidateWorkout();
  return { ok: true };
}
