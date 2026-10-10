// app/plans/[id]/page.tsx
import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import { requireIdleUserId } from "@/lib/active-workout";
import { normalizeExerciseType } from "@/lib/exercise-types";
import type { Plan, PlanExercise } from "./types";
import type { PickerExercise } from "@/lib/exercise-search";
import { PlanEditor } from "./plan-editor";

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
      SELECT pe.id, pe.exercise_id, pe.name, pe.exercise_type, pe.sets, pe.reps, pe.target_seconds,
             COALESCE(pe.rest_seconds, 90) AS rest_seconds
      FROM plan_exercises pe
      JOIN plans p ON p.id = pe.plan_id AND p.user_id = ${userId}
      WHERE pe.plan_id = ${planId}
      ORDER BY pe.position ASC NULLS LAST, pe.id ASC
    `,
    sql`
      -- The user's own copy of an exercise hides the shared one with the same
      -- name. Usage (logged workouts, plan rows, last logged) ranks the picker.
      WITH lib AS (
        SELECT DISTINCT ON (lower(trim(name)))
          id, name, exercise_type, default_sets, default_reps, default_seconds, default_rest_seconds,
          (user_id IS NOT NULL) AS own
        FROM exercises
        WHERE user_id = ${userId} OR user_id IS NULL
        ORDER BY lower(trim(name)), user_id NULLS LAST, id
      ),
      used AS (
        SELECT lower(trim(l.exercise_name)) AS key,
               count(DISTINCT l.session_id)::int AS sessions,
               max(COALESCE(s.completed_at, s.started_at)) AS last_used
        FROM workout_logs l
        JOIN workout_sessions s ON s.id = l.session_id AND s.user_id = ${userId}
        WHERE COALESCE(l.completed, false) OR l.actual_weight IS NOT NULL OR l.actual_reps IS NOT NULL
              OR l.duration_seconds IS NOT NULL
        GROUP BY 1
      ),
      planned AS (
        SELECT lower(trim(pe.name)) AS key, count(*)::int AS plans
        FROM plan_exercises pe
        JOIN plans p ON p.id = pe.plan_id AND p.user_id = ${userId}
        GROUP BY 1
      )
      SELECT lib.*,
             COALESCE(used.sessions, 0) AS sessions,
             COALESCE(planned.plans, 0) AS plans,
             (extract(epoch FROM used.last_used) * 1000)::float AS last_used
      FROM lib
      LEFT JOIN used ON used.key = lower(trim(lib.name))
      LEFT JOIN planned ON planned.key = lower(trim(lib.name))
      ORDER BY lib.name ASC
    `,
  ]);

  if (planResult.length === 0) {
    notFound();
  }

  const exercises: PlanExercise[] = exercisesResult.map((e) => ({
    id: Number(e.id),
    exercise_id: e.exercise_id == null ? null : Number(e.exercise_id),
    name: String(e.name),
    exercise_type: normalizeExerciseType(e.exercise_type),
    sets: Number(e.sets),
    reps: Number(e.reps),
    target_seconds: e.target_seconds == null ? null : Number(e.target_seconds),
    rest_seconds: Number(e.rest_seconds),
  }));
  const library: PickerExercise[] = libraryResult.map((e) => ({
    id: Number(e.id),
    name: String(e.name),
    exercise_type: normalizeExerciseType(e.exercise_type),
    default_sets: Number(e.default_sets),
    default_reps: Number(e.default_reps),
    default_seconds: e.default_seconds == null ? null : Number(e.default_seconds),
    default_rest_seconds: Number(e.default_rest_seconds),
    own: Boolean(e.own),
    sessions: Number(e.sessions),
    plans: Number(e.plans),
    last_used: e.last_used == null ? null : Number(e.last_used),
  }));

  return <PlanEditor plan={planResult[0] as Plan} exercises={exercises} library={library} />;
}

export default function PlanEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <PlanLoader paramsPromise={params} />
    </Suspense>
  );
}