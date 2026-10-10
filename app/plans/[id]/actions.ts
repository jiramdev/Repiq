// app/plans/[id]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { workoutLockError } from "@/lib/active-workout";
import { str } from "@/lib/strings";
import { LIMITS, cleanText, toId, toIntInRange } from "@/lib/validation";
import {
  normalizeExerciseType,
  parseTargets,
  type ExerciseTargets,
  type ExerciseType,
} from "@/lib/exercise-types";

type Result = { success: boolean; error?: string };
type AddResult = Result & { id?: number };

/**
 * Common checks: signed in, not locked into an active workout, and valid ids.
 * Returns the user id, or a Result to return straight away.
 */
async function guard(...ids: unknown[]): Promise<{ userId: string; ids: number[] } | Result> {
  const userId = await requireUserId();
  const locked = await workoutLockError(userId);
  if (locked) return { success: false, error: locked };
  const parsed = ids.map(toId);
  if (parsed.some((id) => id === null)) return { success: false };
  return { userId, ids: parsed as number[] };
}

function revalidatePlan(planId: number) {
  revalidatePath(`/plans/${planId}`);
  revalidatePath("/schedule");
  revalidatePath("/");
}

async function ownsPlan(userId: string, planId: number): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM plans WHERE id = ${planId} AND user_id = ${userId} LIMIT 1`;
  return rows.length > 0;
}

export type ExerciseInput = {
  name: string;
  type: ExerciseType;
  sets: number;
  /** weighted and bodyweight */
  reps?: number | null;
  /** static: target hold in seconds */
  seconds?: number | null;
  rest: number;
};

type ParsedExercise = ExerciseTargets & { name: string };

function parseExerciseInput(input: unknown): ParsedExercise | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const name = cleanText(raw.name, LIMITS.exerciseName);
  const targets = parseTargets({
    type: raw.type,
    sets: raw.sets,
    reps: raw.reps,
    seconds: raw.seconds,
    rest: raw.rest,
  });
  if (!name || !targets) return null;
  return { name, ...targets };
}

/** plan_exercises.reps is NOT NULL; static exercises keep 1 there (unused). */
const storedReps = (input: ParsedExercise) => input.reps ?? 1;

/**
 * Find the library exercise to link to, without ever modifying a shared one.
 * - The user's own exercise with that name: its type and defaults are updated.
 * - Only a shared exercise (user_id IS NULL): reused as-is when type and values
 *   match, otherwise the user gets a private copy (copy-on-write).
 * - Nothing: a new private exercise is created.
 */
async function resolveExercise(userId: string, input: ParsedExercise): Promise<number> {
  const rows = await sql`
    SELECT id, user_id, exercise_type, default_sets, default_reps, default_seconds, default_rest_seconds
    FROM exercises
    WHERE (user_id = ${userId} OR user_id IS NULL)
      AND lower(trim(name)) = lower(trim(${input.name}))
    ORDER BY user_id NULLS LAST, id
    LIMIT 1
  `;
  const found = rows[0];

  if (found && found.user_id === userId) {
    await sql`
      UPDATE exercises
      SET exercise_type = ${input.type},
          default_sets = ${input.sets},
          default_reps = COALESCE(${input.reps}::int, default_reps),
          default_seconds = COALESCE(${input.seconds}::int, default_seconds),
          default_rest_seconds = ${input.rest}
      WHERE id = ${found.id} AND user_id = ${userId}
    `;
    return Number(found.id);
  }

  if (
    found &&
    normalizeExerciseType(found.exercise_type) === input.type &&
    Number(found.default_sets) === input.sets &&
    Number(found.default_rest_seconds) === input.rest &&
    (input.type === "static"
      ? Number(found.default_seconds) === input.seconds
      : Number(found.default_reps) === input.reps)
  ) {
    return Number(found.id);
  }

  const inserted = await sql`
    INSERT INTO exercises (user_id, name, exercise_type, default_sets, default_reps, default_seconds, default_rest_seconds)
    VALUES (${userId}, ${input.name}, ${input.type}, ${input.sets}, ${storedReps(input)}, ${input.seconds}, ${input.rest})
    RETURNING id
  `;
  return Number(inserted[0].id);
}

async function recountExercises(userId: string, planId: number) {
  await sql`
    UPDATE plans
    SET exercise_count = (SELECT COUNT(*)::int FROM plan_exercises WHERE plan_id = ${planId})
    WHERE id = ${planId} AND user_id = ${userId}
  `;
}

export async function updatePlanTitle(rawPlanId: number, title: string): Promise<Result> {
  const g = await guard(rawPlanId);
  if ("success" in g) return g;
  const { userId, ids: [planId] } = g;
  const cleanTitle = cleanText(title, LIMITS.planTitle);
  if (!cleanTitle) return { success: false };

  await sql`
    UPDATE plans SET title = ${cleanTitle}
    WHERE id = ${planId} AND user_id = ${userId}
  `;
  // Schedule days point at the plan by id, so they follow the rename.
  await sql`
    UPDATE workouts SET name = ${cleanTitle}
    WHERE plan_id = ${planId} AND user_id = ${userId}
  `;

  revalidatePlan(planId);
  return { success: true };
}

async function writeOrder(userId: string, planId: number, ids: number[]) {
  await sql`
    UPDATE plan_exercises pe
    SET position = o.pos
    FROM (
      SELECT id, (ord - 1)::int AS pos
      FROM unnest(${ids}::int[]) WITH ORDINALITY AS t(id, ord)
    ) o, plans p
    WHERE pe.id = o.id AND pe.plan_id = ${planId} AND p.id = pe.plan_id AND p.user_id = ${userId}
  `;
}

/**
 * Add an exercise to the plan: at the end, or at `atIndex` (used by Undo
 * after a removal). Returns the new plan row id.
 */
export async function addExerciseToPlan(
  rawPlanId: number,
  exercise: ExerciseInput,
  atIndex?: number
): Promise<AddResult> {
  const g = await guard(rawPlanId);
  if ("success" in g) return g;
  const { userId, ids: [planId] } = g;
  const input = parseExerciseInput(exercise);
  if (!input) return { success: false, error: str.plan.invalidInput };
  if (!(await ownsPlan(userId, planId))) return { success: false };

  const exerciseId = await resolveExercise(userId, input);

  const inserted = await sql`
    INSERT INTO plan_exercises
      (plan_id, exercise_id, name, exercise_type, sets, reps, target_seconds, rest_seconds, position)
    SELECT ${planId}, ${exerciseId}, ${input.name}, ${input.type}, ${input.sets}, ${storedReps(input)},
           ${input.seconds}, ${input.rest},
           COALESCE((SELECT max(position) + 1 FROM plan_exercises WHERE plan_id = ${planId}), 0)
    FROM plans WHERE id = ${planId} AND user_id = ${userId}
    RETURNING id
  `;
  const newId = inserted[0] ? Number(inserted[0].id) : undefined;
  const index = toIntInRange(atIndex, 0, LIMITS.planExercises);
  if (newId !== undefined && index !== null) {
    const rows = await sql`
      SELECT id FROM plan_exercises WHERE plan_id = ${planId} AND id <> ${newId}
      ORDER BY position ASC NULLS LAST, id ASC
    `;
    const ids = rows.map((r) => Number(r.id));
    ids.splice(Math.min(index, ids.length), 0, newId);
    await writeOrder(userId, planId, ids);
  }
  await recountExercises(userId, planId);

  revalidatePlan(planId);
  return { success: true, id: newId };
}

/** Changes exactly one exercise row in one of the user's plans. */
export async function updatePlanExercise(
  rawPlanId: number,
  rawPlanExerciseId: number,
  exercise: ExerciseInput
): Promise<Result> {
  const g = await guard(rawPlanId, rawPlanExerciseId);
  if ("success" in g) return g;
  const { userId, ids: [planId, planExerciseId] } = g;
  const input = parseExerciseInput(exercise);
  if (!input) return { success: false, error: str.plan.invalidInput };
  if (!(await ownsPlan(userId, planId))) return { success: false };

  const exerciseId = await resolveExercise(userId, input);

  await sql`
    UPDATE plan_exercises pe
    SET name = ${input.name},
        exercise_id = ${exerciseId},
        exercise_type = ${input.type},
        sets = ${input.sets},
        reps = ${storedReps(input)},
        target_seconds = ${input.seconds},
        rest_seconds = ${input.rest}
    FROM plans p
    WHERE pe.id = ${planExerciseId}
      AND pe.plan_id = ${planId}
      AND p.id = pe.plan_id
      AND p.user_id = ${userId}
  `;

  revalidatePlan(planId);
  return { success: true };
}

/**
 * Save a new order. `orderedIds` must be exactly the plan's exercise rows;
 * anything else is refused (e.g. a stale list from another tab).
 */
export async function reorderPlanExercises(rawPlanId: number, orderedIds: unknown): Promise<Result> {
  const g = await guard(rawPlanId);
  if ("success" in g) return g;
  const { userId, ids: [planId] } = g;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0 || orderedIds.length > LIMITS.planExercises) {
    return { success: false };
  }
  const ids = orderedIds.map(toId);
  if (ids.some((id) => id === null) || new Set(ids).size !== ids.length) return { success: false };
  if (!(await ownsPlan(userId, planId))) return { success: false };

  const current = await sql`SELECT id FROM plan_exercises WHERE plan_id = ${planId}`;
  const currentIds = new Set(current.map((r) => Number(r.id)));
  if (currentIds.size !== ids.length || ids.some((id) => !currentIds.has(id as number))) {
    return { success: false, error: str.plan.reorderStale };
  }

  await writeOrder(userId, planId, ids as number[]);

  revalidatePlan(planId);
  return { success: true };
}

export async function deleteExercise(rawPlanId: number, rawPlanExerciseId: number): Promise<Result> {
  const g = await guard(rawPlanId, rawPlanExerciseId);
  if ("success" in g) return g;
  const { userId, ids: [planId, planExerciseId] } = g;

  await sql`
    DELETE FROM plan_exercises pe
    USING plans p
    WHERE pe.id = ${planExerciseId}
      AND pe.plan_id = ${planId}
      AND p.id = pe.plan_id
      AND p.user_id = ${userId}
  `;
  await recountExercises(userId, planId);

  revalidatePlan(planId);
  return { success: true };
}

export async function deletePlan(rawPlanId: number): Promise<Result> {
  const g = await guard(rawPlanId);
  if ("success" in g) return g;
  const { userId, ids: [planId] } = g;

  if (await ownsPlan(userId, planId)) {
    await sql.transaction([
      // Days that used this plan become rest days. Their unfinished sessions
      // are removed only when nothing was logged in them; a session with
      // logged sets is kept (it can still be finished or discarded).
      sql`
        DELETE FROM workout_sessions s
        WHERE s.user_id = ${userId} AND s.completed_at IS NULL
          AND s.workout_id IN (SELECT id FROM workouts WHERE user_id = ${userId} AND plan_id = ${planId})
          AND NOT EXISTS (
            SELECT 1 FROM workout_logs l
            WHERE l.session_id = s.id
              AND (COALESCE(l.completed, false) OR l.actual_weight IS NOT NULL OR l.actual_reps IS NOT NULL
                   OR l.duration_seconds IS NOT NULL)
          )
      `,
      sql`
        UPDATE workouts
        SET plan_id = NULL, name = 'Rest', exercise_count = 0, completed = false
        WHERE user_id = ${userId} AND plan_id = ${planId}
      `,
      sql`DELETE FROM plan_exercises WHERE plan_id = ${planId}`,
      sql`DELETE FROM plans WHERE id = ${planId} AND user_id = ${userId}`,
    ]);
  }

  revalidatePath("/schedule", "page");
  revalidatePath("/");
  redirect("/schedule");
}
