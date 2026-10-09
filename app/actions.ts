// app/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";

const CURRENT_USER_ID = "user_demo_1";

export async function toggleWorkoutCompleted(workoutId: number, currentStatus: boolean) {
  await sql`
    UPDATE workouts
    SET completed = ${!currentStatus}
    WHERE id = ${workoutId} AND user_id = ${CURRENT_USER_ID}
  `;

  revalidatePath("/");
  revalidatePath("/schedule");
}

export async function assignPlanFromDashboard(
  dayLabel: string,
  scheduledDate: string,
  planValue: string,
  workoutId?: number | null
) {
  const isRest = planValue === "rest";
  let planTitle = "Rest";
  let count = 0;

  if (!isRest) {
    const planId = parseInt(planValue, 10);
    if (!isNaN(planId)) {
      const planRows = await sql`
        SELECT title, exercise_count 
        FROM plans 
        WHERE id = ${planId} AND user_id = ${CURRENT_USER_ID}
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
          exercise_count = ${count},
          completed = false
      WHERE id = ${workoutId} AND user_id = ${CURRENT_USER_ID}
    `;
  } else {
    const existing = await sql`
      SELECT id FROM workouts 
      WHERE user_id = ${CURRENT_USER_ID} AND scheduled_date = ${scheduledDate}
      LIMIT 1
    `;

    if (existing.length > 0) {
      await sql`
        UPDATE workouts
        SET name = ${planTitle},
            exercise_count = ${count},
            completed = false
        WHERE id = ${existing[0].id} AND user_id = ${CURRENT_USER_ID}
      `;
    } else {
      await sql`
        INSERT INTO workouts (user_id, name, day_label, scheduled_date, exercise_count, completed)
        VALUES (${CURRENT_USER_ID}, ${planTitle}, ${dayLabel}, ${scheduledDate}, ${count}, false)
      `;
    }
  }

  revalidatePath("/");
  revalidatePath("/schedule");
}