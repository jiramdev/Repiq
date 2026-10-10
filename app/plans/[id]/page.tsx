// app/plans/[id]/page.tsx
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import { requireIdleUserId } from "@/lib/active-workout";
import { PlanEditor } from "./plan-editor";

interface Plan {
  id: number;
  title: string;
  exercise_count: number;
}

interface Exercise {
  id: number;
  exercise_id: number | null;
  name: string;
  sets: number;
  reps: number;
  rest_seconds: number;
}

interface LibraryExercise {
  id: number;
  name: string;
  default_sets: number;
  default_reps: number;
  default_rest_seconds: number;
}

async function PlanLoader({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await paramsPromise;
  const planId = parseInt(id, 10);

  if (isNaN(planId)) {
    notFound();
  }

  const userId = await requireIdleUserId();

  const [planResult, exercisesResult, libraryResult] = await Promise.all([
    sql`
      SELECT id, title, exercise_count
      FROM plans
      WHERE id = ${planId} AND user_id = ${userId}
      LIMIT 1
    `,
    sql`
      SELECT pe.id, pe.exercise_id, pe.name, pe.sets, pe.reps, COALESCE(pe.rest_seconds, 90) AS rest_seconds
      FROM plan_exercises pe
      JOIN plans p ON p.id = pe.plan_id AND p.user_id = ${userId}
      WHERE pe.plan_id = ${planId}
      ORDER BY pe.id ASC
    `,
    sql`
      -- The user's own copy of an exercise hides the shared one with the same name.
      SELECT * FROM (
        SELECT DISTINCT ON (lower(trim(name)))
          id, name, default_sets, default_reps, default_rest_seconds
        FROM exercises
        WHERE user_id = ${userId} OR user_id IS NULL
        ORDER BY lower(trim(name)), user_id NULLS LAST, id
      ) lib
      ORDER BY name ASC
    `,
  ]);

  if (planResult.length === 0) {
    notFound();
  }

  return (
    <PlanEditor
      plan={planResult[0] as Plan}
      exercises={exercisesResult as Exercise[]}
      library={libraryResult as LibraryExercise[]}
    />
  );
}

export default function PlanEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-[#baa3d0] text-white p-4">
          <div className="max-w-sm mx-auto h-48 rounded-2xl bg-white/[0.04] animate-pulse" />
        </div>
      }
    >
      <PlanLoader paramsPromise={params} />
    </Suspense>
  );
}