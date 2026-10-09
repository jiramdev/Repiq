// app/schedule/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { isDayLabel } from "@/lib/time";
import { LIMITS, cleanText } from "@/lib/validation";

export async function createPlan(title: string): Promise<number | null> {
  const userId = await requireUserId();
  const cleanTitle = cleanText(title, LIMITS.planTitle);
  if (!cleanTitle) return null;

  const result = await sql`
    INSERT INTO plans (user_id, title, exercise_count)
    VALUES (${userId}, ${cleanTitle}, 0)
    RETURNING id
  `;

  revalidatePath("/schedule", "page");
  revalidatePath("/", "page");
  return Number(result[0]?.id) || null;
}

/** Set a weekday to a plan (by id) or to rest ("rest" / null). */
export async function assignPlanToWorkout(
  dayLabel: string,
  planValue?: number | string | null
): Promise<{ success: boolean }> {
  const userId = await requireUserId();
  if (!isDayLabel(dayLabel)) return { success: false };

  let plan: { id: number; title: string; exercise_count: number } | null = null;
  if (planValue != null && planValue !== "rest") {
    const planId = Number(planValue);
    if (!Number.isInteger(planId)) return { success: false };
    const rows = await sql`
      SELECT id, title, exercise_count FROM plans
      WHERE id = ${planId} AND user_id = ${userId}
      LIMIT 1
    `;
    if (rows.length === 0) return { success: false };
    plan = {
      id: Number(rows[0].id),
      title: String(rows[0].title),
      exercise_count: Number(rows[0].exercise_count) || 0,
    };
  }

  const planId = plan?.id ?? null;
  const name = plan?.title ?? "Rest";
  const count = plan?.exercise_count ?? 0;

  const updated = await sql`
    UPDATE workouts
    SET plan_id = ${planId}, name = ${name}, exercise_count = ${count}, completed = false
    WHERE id = (
      SELECT id FROM workouts
      WHERE user_id = ${userId} AND day_label = ${dayLabel}
      ORDER BY id
      LIMIT 1
    )
    RETURNING id
  `;

  let workoutId: number;
  if (updated.length > 0) {
    workoutId = Number(updated[0].id);
    // The plan changed: an unfinished session for the old plan no longer applies.
    await sql`
      DELETE FROM workout_sessions
      WHERE workout_id = ${workoutId} AND user_id = ${userId} AND completed_at IS NULL
        AND plan_id IS DISTINCT FROM ${planId}
    `;
  } else {
    const inserted = await sql`
      INSERT INTO workouts (user_id, plan_id, name, day_label, exercise_count, completed)
      VALUES (${userId}, ${planId}, ${name}, ${dayLabel}, ${count}, false)
      RETURNING id
    `;
    workoutId = Number(inserted[0].id);
  }

  revalidatePath("/schedule", "page");
  revalidatePath("/", "page");
  revalidatePath(`/workout/${workoutId}`, "page");
  return { success: true };
}
