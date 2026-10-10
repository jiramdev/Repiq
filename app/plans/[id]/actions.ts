// app/plans/[id]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { LIMITS, cleanText, toIntInRange } from "@/lib/validation";

type Result = { success: boolean; error?: string };

function revalidatePlan(planId: number) {
  revalidatePath(`/plans/${planId}`);
  revalidatePath("/schedule");
  revalidatePath("/");
}

async function ownsPlan(userId: string, planId: number): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM plans WHERE id = ${planId} AND user_id = ${userId} LIMIT 1`;
  return rows.length > 0;
}

function parseExerciseInput(name: unknown, sets: unknown, reps: unknown, rest: unknown) {
  const cleanName = cleanText(name, LIMITS.exerciseName);
  const s = toIntInRange(sets, LIMITS.sets.min, LIMITS.sets.max);
  const r = toIntInRange(reps, LIMITS.reps.min, LIMITS.reps.max);
  const restSeconds = toIntInRange(rest, LIMITS.restSeconds.min, LIMITS.restSeconds.max);
  if (!cleanName || s === null || r === null || restSeconds === null) return null;
  return { name: cleanName, sets: s, reps: r, restSeconds };
}

/**
 * Find the library exercise to link to, without ever modifying a shared one.
 * - The user's own exercise with that name: its defaults are updated.
 * - Only a shared exercise (user_id IS NULL): reused as-is when the values
 *   match, otherwise the user gets a private copy (copy-on-write).
 * - Nothing: a new private exercise is created.
 */
async function resolveExercise(
  userId: string,
  input: { name: string; sets: number; reps: number; restSeconds: number }
): Promise<number> {
  const rows = await sql`
    SELECT id, user_id, default_sets, default_reps, default_rest_seconds
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
      SET default_sets = ${input.sets},
          default_reps = ${input.reps},
          default_rest_seconds = ${input.restSeconds}
      WHERE id = ${found.id} AND user_id = ${userId}
    `;
    return Number(found.id);
  }

  if (
    found &&
    Number(found.default_sets) === input.sets &&
    Number(found.default_reps) === input.reps &&
    Number(found.default_rest_seconds) === input.restSeconds
  ) {
    return Number(found.id);
  }

  const inserted = await sql`
    INSERT INTO exercises (user_id, name, default_sets, default_reps, default_rest_seconds)
    VALUES (${userId}, ${input.name}, ${input.sets}, ${input.reps}, ${input.restSeconds})
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

export async function updatePlanTitle(planId: number, title: string): Promise<Result> {
  const userId = await requireUserId();
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

export async function addExerciseToPlan(
  planId: number,
  exerciseName: string,
  sets: number,
  reps: number,
  restSeconds: number
): Promise<Result> {
  const userId = await requireUserId();
  const input = parseExerciseInput(exerciseName, sets, reps, restSeconds);
  if (!input) return { success: false };
  if (!(await ownsPlan(userId, planId))) return { success: false };

  const exerciseId = await resolveExercise(userId, input);

  await sql`
    INSERT INTO plan_exercises (plan_id, exercise_id, name, sets, reps, rest_seconds)
    SELECT ${planId}, ${exerciseId}, ${input.name}, ${input.sets}, ${input.reps}, ${input.restSeconds}
    FROM plans WHERE id = ${planId} AND user_id = ${userId}
  `;
  await recountExercises(userId, planId);

  revalidatePlan(planId);
  return { success: true };
}

/** Changes exactly one exercise row in one of the user's plans. */
export async function updatePlanExercise(
  planId: number,
  planExerciseId: number,
  exerciseName: string,
  sets: number,
  reps: number,
  restSeconds: number
): Promise<Result> {
  const userId = await requireUserId();
  const input = parseExerciseInput(exerciseName, sets, reps, restSeconds);
  if (!input) return { success: false };
  if (!(await ownsPlan(userId, planId))) return { success: false };

  const exerciseId = await resolveExercise(userId, input);

  await sql`
    UPDATE plan_exercises pe
    SET name = ${input.name},
        exercise_id = ${exerciseId},
        sets = ${input.sets},
        reps = ${input.reps},
        rest_seconds = ${input.restSeconds}
    FROM plans p
    WHERE pe.id = ${planExerciseId}
      AND pe.plan_id = ${planId}
      AND p.id = pe.plan_id
      AND p.user_id = ${userId}
  `;

  revalidatePlan(planId);
  return { success: true };
}

export async function deleteExercise(planId: number, planExerciseId: number): Promise<Result> {
  const userId = await requireUserId();

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

export async function deletePlan(planId: number) {
  const userId = await requireUserId();

  if (await ownsPlan(userId, planId)) {
    await sql.transaction([
      // Days that used this plan become rest days; open sessions for them end.
      sql`
        DELETE FROM workout_sessions
        WHERE user_id = ${userId} AND completed_at IS NULL
          AND workout_id IN (SELECT id FROM workouts WHERE user_id = ${userId} AND plan_id = ${planId})
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
