// app/schedule/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { getActiveUserId } from "@/lib/auth";

export async function createPlan(title: string) {
  const userId = await getActiveUserId();
  const cleanTitle = title.trim();
  if (!cleanTitle) return null;

  const result = await sql`
    INSERT INTO plans (user_id, title, exercise_count)
    VALUES (${userId}, ${cleanTitle}, 0)
    RETURNING id
  `;

  revalidatePath("/schedule", "page");
  revalidatePath("/", "page");
  return result[0]?.id as number;
}

export async function assignPlanToWorkout(
  dayLabel: string,
  planId?: number | string | null,
  customName?: number | string | null
) {
  const userId = await getActiveUserId();

  const workoutRows = await sql`
    SELECT id FROM workouts
    WHERE user_id = ${userId} AND day_label = ${dayLabel}
    LIMIT 1
  `;

  let workoutId = workoutRows[0]?.id;

  const planIdNum =
    planId !== null && planId !== undefined && planId !== "rest"
      ? typeof planId === "number"
        ? planId
        : parseInt(String(planId), 10)
      : null;

  const resolvedCustomName =
    customName !== null && customName !== undefined
      ? String(customName).trim()
      : null;

  if (planIdNum !== null && !isNaN(planIdNum)) {
    const planRows = await sql`
      SELECT title, exercise_count FROM plans
      WHERE id = ${planIdNum} AND user_id = ${userId}
      LIMIT 1
    `;
    const plan = planRows[0];
    const planName = resolvedCustomName || plan?.title || "Workout";
    const count = plan?.exercise_count || 0;

    if (workoutId) {
      await sql`
        DELETE FROM workout_logs
        WHERE workout_id = ${workoutId}
      `;

      await sql`
        UPDATE workouts
        SET name = ${planName},
            exercise_count = ${count},
            completed = false
        WHERE id = ${workoutId} AND user_id = ${userId}
      `;
    }
  } else {
    const fallbackName = resolvedCustomName || "Rest";
    if (workoutId) {
      await sql`
        DELETE FROM workout_logs
        WHERE workout_id = ${workoutId}
      `;

      await sql`
        UPDATE workouts
        SET name = ${fallbackName},
            exercise_count = 0,
            completed = false
        WHERE id = ${workoutId} AND user_id = ${userId}
      `;
    }
  }

  revalidatePath("/schedule", "page");
  revalidatePath("/", "page");
  if (workoutId) {
    revalidatePath(`/workout/${workoutId}`, "page");
  }
}