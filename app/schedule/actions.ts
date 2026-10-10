// app/schedule/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { workoutLockError } from "@/lib/active-workout";
import { isDayLabel } from "@/lib/time";
import { LIMITS, cleanText, toId } from "@/lib/validation";

export async function createPlan(title: string): Promise<{ id: number | null; error?: string }> {
  const userId = await requireUserId();
  const locked = await workoutLockError(userId);
  if (locked) return { id: null, error: locked };
  const cleanTitle = cleanText(title, LIMITS.planTitle);
  if (!cleanTitle) return { id: null };

  const result = await sql`
    INSERT INTO plans (user_id, title, exercise_count)
    VALUES (${userId}, ${cleanTitle}, 0)
    RETURNING id
  `;

  revalidatePath("/schedule", "page");
  revalidatePath("/", "page");
  return { id: Number(result[0]?.id) || null };
}

/** Set a weekday to a plan (by id) or to rest ("rest" / null). */
export async function assignPlanToWorkout(
  dayLabel: string,
  planValue?: number | string | null
): Promise<{ success: boolean; error?: string }> {
  const userId = await requireUserId();
  const locked = await workoutLockError(userId);
  if (locked) return { success: false, error: locked };
  if (!isDayLabel(dayLabel)) return { success: false };

  let plan: { id: number; title: string; exercise_count: number } | null = null;
  if (planValue != null && planValue !== "rest") {
    const planId = toId(typeof planValue === "string" ? Number(planValue) : planValue);
    if (planId === null) return { success: false };
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
    // Only empty ones are removed; a session with logged sets is never deleted
    // silently (it stays until the user finishes or discards it).
    await sql`
      DELETE FROM workout_sessions s
      WHERE s.workout_id = ${workoutId} AND s.user_id = ${userId} AND s.completed_at IS NULL
        AND s.plan_id IS DISTINCT FROM ${planId}
        AND NOT EXISTS (
          SELECT 1 FROM workout_logs l
          WHERE l.session_id = s.id
            AND (COALESCE(l.completed, false) OR l.actual_weight IS NOT NULL OR l.actual_reps IS NOT NULL OR l.duration_seconds IS NOT NULL)
        )
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
