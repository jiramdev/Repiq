// app/workout/[id]/page.tsx
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import { getActiveUserId } from "@/lib/auth";
import { WorkoutView } from "./workout-view";

export interface WorkoutDetail {
  id: number;
  name: string;
  day_label: string;
  completed: boolean;
}

export interface WorkoutLog {
  id: number;
  exercise_name: string;
  set_number: number;
  target_reps: number;
  rest_seconds: number;
  actual_weight: number | null;
  actual_reps: number | null;
  completed: boolean;
  last_weight?: number | null;
  last_reps?: number | null;
}

interface PlanExercise {
  name: string;
  sets: number;
  reps: number;
  rest_seconds: number;
}

async function WorkoutLoader({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await paramsPromise;
  const workoutId = parseInt(id, 10);
  const userId = await getActiveUserId();

  if (isNaN(workoutId)) {
    notFound();
  }

  const [workoutRows, profileRows] = await Promise.all([
    sql`
      SELECT id, name, day_label, completed
      FROM workouts
      WHERE id = ${workoutId} AND user_id = ${userId}
      LIMIT 1
    `,
    sql`
      SELECT notify_rest_day_alerts
      FROM user_profiles
      WHERE user_id = ${userId}
      LIMIT 1
    `,
  ]);

  if (workoutRows.length === 0) {
    notFound();
  }

  const workout = workoutRows[0] as WorkoutDetail;
  const allowRestNotification = profileRows[0]?.notify_rest_day_alerts ?? true;

  const todayDone = await sql`
    SELECT COUNT(*)::int AS count
    FROM completed_sessions
    WHERE user_id = ${userId} AND completed_date = CURRENT_DATE
  `;

  if (!workout.name || workout.name.toLowerCase() === "rest" || (todayDone[0]?.count ?? 0) > 0) {
    redirect("/");
  }

  const existingCount = await sql`
    SELECT COUNT(*)::int AS count
    FROM workout_logs
    WHERE workout_id = ${workoutId}
  `;

  if ((existingCount[0]?.count ?? 0) === 0) {
    const planExercises = (await sql`
      SELECT pe.name, pe.sets, pe.reps, COALESCE(pe.rest_seconds, 90) AS rest_seconds
      FROM plan_exercises pe
      JOIN plans p ON p.id = pe.plan_id
      WHERE p.user_id = ${userId} AND TRIM(LOWER(p.title)) = TRIM(LOWER(${workout.name}))
      ORDER BY pe.id ASC
    `) as PlanExercise[];

    let orderIndex = 0;
    for (const ex of planExercises) {
      for (let s = 1; s <= ex.sets; s++) {
        await sql`
          INSERT INTO workout_logs (workout_id, exercise_name, set_number, target_reps, rest_seconds, actual_weight, actual_reps, order_index)
          VALUES (${workoutId}, ${ex.name}, ${s}, ${ex.reps}, ${ex.rest_seconds}, NULL, NULL, ${orderIndex})
        `;
      }
      orderIndex++;
    }
  }

  const logRows = (await sql`
    SELECT 
      wl.id, 
      wl.exercise_name, 
      wl.set_number, 
      wl.target_reps, 
      wl.rest_seconds, 
      wl.actual_weight::float AS actual_weight, 
      wl.actual_reps::int AS actual_reps, 
      COALESCE(wl.completed, false) AS completed,
      prev.actual_weight::float AS last_weight,
      prev.actual_reps::int AS last_reps
    FROM workout_logs wl
    LEFT JOIN LATERAL (
      SELECT prev_wl.actual_weight, prev_wl.actual_reps
      FROM workout_logs prev_wl
      WHERE prev_wl.workout_id != ${workoutId}
        AND LOWER(TRIM(prev_wl.exercise_name)) = LOWER(TRIM(wl.exercise_name))
        AND (prev_wl.actual_weight IS NOT NULL OR prev_wl.actual_reps IS NOT NULL)
      ORDER BY prev_wl.id DESC
      LIMIT 1
    ) prev ON true
    WHERE wl.workout_id = ${workoutId}
    ORDER BY wl.order_index ASC, wl.set_number ASC
  `) as WorkoutLog[];

  return (
    <WorkoutView
      workout={workout}
      logs={logRows}
      allowRestNotification={allowRestNotification}
    />
  );
}

export default function ActiveWorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#baa3d0] text-white p-4">
          <div className="max-w-sm mx-auto h-48 rounded-2xl bg-white/[0.04] animate-pulse" />
        </div>
      }
    >
      <WorkoutLoader paramsPromise={params} />
    </Suspense>
  );
}