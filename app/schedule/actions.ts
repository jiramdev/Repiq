// app/schedule/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { getActiveUserId } from "@/lib/auth";

export async function assignPlanToWorkout(
  dayLabel: string,
  planValue: string,
  workoutId?: number | null
) {
  const userId = await getActiveUserId();
  const isRest = planValue === "rest";
  let planTitle = "Rest";
  let count = 0;

  if (!isRest) {
    const planId = parseInt(planValue, 10);
    if (!isNaN(planId)) {
      const planRows = await sql`
        SELECT title, exercise_count
        FROM plans
        WHERE id = ${planId} AND user_id = ${userId}
        LIMIT 1
      `;
      if (planRows.length > 0) {
        planTitle = planRows[0].title;
        count = planRows[0].exercise_count;
      }
    }
  }

  if (workoutId) {
    await sql`
      UPDATE workouts
      SET name = ${planTitle},
          exercise_count = ${count}
      WHERE id = ${workoutId} AND user_id = ${userId}
    `;
  } else {
    const existing = await sql`
      SELECT id FROM workouts
      WHERE user_id = ${userId} AND day_label = ${dayLabel}
      LIMIT 1
    `;

    if (existing.length > 0) {
      await sql`
        UPDATE workouts
        SET name = ${planTitle},
            exercise_count = ${count}
        WHERE id = ${existing[0].id} AND user_id = ${userId}
      `;
    } else {
      await sql`
        INSERT INTO workouts (user_id, name, day_label, scheduled_date, exercise_count, completed)
        VALUES (${userId}, ${planTitle}, ${dayLabel}, CURRENT_DATE, ${count}, false)
      `;
    }
  }

  revalidatePath("/schedule", "page");
  revalidatePath("/", "page");
}

export async function createPlan(title: string) {
  const cleanTitle = title.trim();
  if (!cleanTitle) return;

  const userId = await getActiveUserId();

  await sql`
    INSERT INTO plans (user_id, title, exercise_count)
    VALUES (${userId}, ${cleanTitle}, 0)
  `;

  revalidatePath("/schedule", "page");
  revalidatePath("/", "page");
}