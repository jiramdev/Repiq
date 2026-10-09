// app/workout/[id]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { getActiveUserId } from "@/lib/auth";

export async function updateLogSet(
  logId: number,
  data: {
    actual_weight?: number | null;
    actual_reps?: number | null;
    completed?: boolean;
  }
) {
  if (data.actual_weight !== undefined) {
    await sql`
      UPDATE workout_logs
      SET actual_weight = ${data.actual_weight}
      WHERE id = ${logId}
    `;
  }
  if (data.actual_reps !== undefined) {
    await sql`
      UPDATE workout_logs
      SET actual_reps = ${data.actual_reps}
      WHERE id = ${logId}
    `;
  }
  if (data.completed !== undefined) {
    await sql`
      UPDATE workout_logs
      SET completed = ${data.completed}
      WHERE id = ${logId}
    `;
  }
}

export async function completeWorkout(workoutId: number) {
  const userId = await getActiveUserId();

  // 1. Fetch the workout name to satisfy the NOT NULL constraint on plan_name
  const workoutRows = await sql`
    SELECT name 
    FROM workouts 
    WHERE id = ${workoutId} AND user_id = ${userId}
    LIMIT 1
  `;

  const planName = workoutRows[0]?.name || "Workout";

  // 2. Mark workout completed
  await sql`
    UPDATE workouts
    SET completed = true
    WHERE id = ${workoutId} AND user_id = ${userId}
  `;

  // 3. Insert into completed_sessions with plan_name supplied
  await sql`
    INSERT INTO completed_sessions (user_id, workout_id, plan_name, completed_date)
    VALUES (${userId}, ${workoutId}, ${planName}, CURRENT_DATE)
    ON CONFLICT DO NOTHING
  `;

  revalidatePath("/", "page");
  revalidatePath("/statistics", "page");
  revalidatePath("/schedule", "page");
  revalidatePath("/account", "page");
}

export async function discardWorkout(workoutId: number) {
  const userId = await getActiveUserId();

  await sql`
    DELETE FROM workout_logs
    WHERE workout_id = ${workoutId}
  `;

  await sql`
    UPDATE workouts
    SET completed = false
    WHERE id = ${workoutId} AND user_id = ${userId}
  `;

  revalidatePath("/", "page");
}