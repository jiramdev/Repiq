// app/plans/[id]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";

const CURRENT_USER_ID = "user_demo_1";

export async function updatePlanTitle(planId: number, title: string) {
  const cleanTitle = title.trim();
  if (!cleanTitle) return;

  await sql`
    UPDATE plans
    SET title = ${cleanTitle}
    WHERE id = ${planId} AND user_id = ${CURRENT_USER_ID}
  `;

  revalidatePath(`/plans/${planId}`);
  revalidatePath("/schedule");
  revalidatePath("/");
}

export async function addExerciseToPlan(
  planId: number,
  exerciseName: string,
  sets: number,
  reps: number,
  restSeconds: number
) {
  const cleanName = exerciseName.trim();
  if (!cleanName) return;

  let exerciseRows = await sql`
    SELECT id FROM exercises
    WHERE (user_id = ${CURRENT_USER_ID} OR user_id IS NULL)
      AND TRIM(LOWER(name)) = TRIM(LOWER(${cleanName}))
    ORDER BY user_id NULLS LAST
    LIMIT 1
  `;

  let exerciseId: number;

  if (exerciseRows.length > 0) {
    exerciseId = exerciseRows[0].id;
    await sql`
      UPDATE exercises
      SET default_sets = ${sets},
          default_reps = ${reps},
          default_rest_seconds = ${restSeconds}
      WHERE id = ${exerciseId}
    `;
  } else {
    const inserted = await sql`
      INSERT INTO exercises (user_id, name, default_sets, default_reps, default_rest_seconds)
      VALUES (${CURRENT_USER_ID}, ${cleanName}, ${sets}, ${reps}, ${restSeconds})
      RETURNING id
    `;
    exerciseId = inserted[0].id;
  }

  await sql`
    INSERT INTO plan_exercises (plan_id, exercise_id, name, sets, reps, rest_seconds)
    VALUES (${planId}, ${exerciseId}, ${cleanName}, ${sets}, ${reps}, ${restSeconds})
  `;

  await sql`
    UPDATE plan_exercises
    SET sets = ${sets},
        reps = ${reps},
        rest_seconds = ${restSeconds}
    WHERE exercise_id = ${exerciseId}
  `;

  await sql`
    UPDATE plans
    SET exercise_count = (
      SELECT COUNT(*)::int FROM plan_exercises WHERE plan_id = ${planId}
    )
    WHERE id = ${planId} AND user_id = ${CURRENT_USER_ID}
  `;

  revalidatePath(`/plans/${planId}`);
  revalidatePath("/schedule");
  revalidatePath("/");
}

export async function updatePlanExercise(
  planId: number,
  planExerciseId: number,
  exerciseName: string,
  sets: number,
  reps: number,
  restSeconds: number
) {
  const cleanName = exerciseName.trim();
  if (!cleanName) return;

  await sql`
    UPDATE plan_exercises
    SET name = ${cleanName},
        sets = ${sets},
        reps = ${reps},
        rest_seconds = ${restSeconds}
    WHERE id = ${planExerciseId} AND plan_id = ${planId}
  `;

  const exerciseRows = await sql`
    SELECT exercise_id FROM plan_exercises
    WHERE id = ${planExerciseId} AND plan_id = ${planId}
    LIMIT 1
  `;

  const exerciseId = exerciseRows[0]?.exercise_id;
  if (exerciseId) {
    await sql`
      UPDATE exercises
      SET name = ${cleanName},
          default_sets = ${sets},
          default_reps = ${reps},
          default_rest_seconds = ${restSeconds}
      WHERE id = ${exerciseId}
    `;

    await sql`
      UPDATE plan_exercises
      SET name = ${cleanName},
          sets = ${sets},
          reps = ${reps},
          rest_seconds = ${restSeconds}
      WHERE exercise_id = ${exerciseId}
    `;
  }

  revalidatePath(`/plans/${planId}`);
  revalidatePath("/schedule");
  revalidatePath("/");
}

export async function deleteExercise(planId: number, exerciseId: number) {
  await sql`
    DELETE FROM plan_exercises
    WHERE id = ${exerciseId} AND plan_id = ${planId}
  `;

  await sql`
    UPDATE plans
    SET exercise_count = (
      SELECT COUNT(*)::int FROM plan_exercises WHERE plan_id = ${planId}
    )
    WHERE id = ${planId} AND user_id = ${CURRENT_USER_ID}
  `;

  revalidatePath(`/plans/${planId}`);
  revalidatePath("/schedule");
  revalidatePath("/");
}

export async function deletePlan(planId: number) {
  const planRows = await sql`
    SELECT title FROM plans
    WHERE id = ${planId} AND user_id = ${CURRENT_USER_ID}
    LIMIT 1
  `;

  if (planRows.length > 0) {
    const planTitle = planRows[0].title.trim();
    await sql`
      UPDATE workouts
      SET name = 'Rest',
          exercise_count = 0,
          completed = false
      WHERE user_id = ${CURRENT_USER_ID}
        AND TRIM(LOWER(name)) = TRIM(LOWER(${planTitle}))
    `;
  }

  await sql`
    DELETE FROM plans
    WHERE id = ${planId} AND user_id = ${CURRENT_USER_ID}
  `;

  revalidatePath("/schedule", "page");
  revalidatePath("/", "page");
  redirect("/schedule");
}