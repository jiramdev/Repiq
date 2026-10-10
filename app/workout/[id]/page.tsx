// app/workout/[id]/page.tsx
import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getActiveWorkout } from "@/lib/active-workout";
import { getUserProfile } from "@/lib/user";
import { todayIn, resolveTimeZone } from "@/lib/time";
import { toId } from "@/lib/validation";
import {
  getOpenSession,
  getSessionLogs,
  startOrResumeSession,
  type OpenSession,
} from "@/lib/workout-session";
import { WorkoutView, EmptyPlanView } from "./workout-view";
import type { WorkoutDetail } from "./types";

async function WorkoutLoader({ paramsPromise }: { paramsPromise: Promise<{ id: string }> }) {
  await connection();
  const { id } = await paramsPromise;
  const workoutId = toId(/^\d+$/.test(id) ? Number(id) : NaN);
  if (workoutId === null) notFound();

  const userId = await requireUserId();

  // Lock-in: an active workout elsewhere always wins.
  const active = await getActiveWorkout(userId);
  if (active && active.workoutId !== workoutId) redirect(`/workout/${active.workoutId}`);

  const profile = await getUserProfile(userId);
  const unit = profile?.unit_system ?? "kg";
  const today = todayIn(resolveTimeZone(profile?.timezone)).date;

  const workoutRows = await sql`
    SELECT w.id, w.day_label, w.plan_id, p.title AS plan_title,
           (SELECT count(*)::int FROM plan_exercises pe WHERE pe.plan_id = p.id) AS exercise_count
    FROM workouts w
    LEFT JOIN plans p ON p.id = w.plan_id AND p.user_id = w.user_id
    WHERE w.id = ${workoutId} AND w.user_id = ${userId}
    LIMIT 1
  `;
  const row = workoutRows[0];
  if (!row) notFound();

  let session: (OpenSession & { plan_id: number | null }) | null = null;
  if (active) {
    // Resume exactly the active session, even if the schedule or plan changed since.
    session = await getOpenSession(userId, active.sessionId);
  } else {
    if (!row.plan_id || !row.plan_title) redirect("/");
    const started = await startOrResumeSession({
      userId,
      workoutId,
      planId: Number(row.plan_id),
      planTitle: String(row.plan_title),
      today,
      unit,
    });
    session = started ? { ...started, plan_id: Number(row.plan_id) } : null;
  }

  if (!session) {
    // Nothing started: either the plan has no exercises yet (show how to fix
    // that), or another workout became active in the meantime.
    if (row.plan_id && Number(row.exercise_count) === 0) {
      return <EmptyPlanView name={String(row.plan_title)} planId={Number(row.plan_id)} />;
    }
    redirect("/");
  }

  const logs = await getSessionLogs({ userId, sessionId: session.id, unit });

  const workout: WorkoutDetail = {
    id: workoutId,
    sessionId: session.id,
    planId: session.plan_id,
    name: session.plan_name,
    day_label: String(row.day_label ?? ""),
    startedOn: session.started_on,
    stale: session.started_on < today,
  };

  return (
    <WorkoutView
      key={session.id}
      workout={workout}
      logs={logs}
      unit={unit}
      allowRestNotification={profile?.notify_rest_day_alerts ?? false}
    />
  );
}

export default function ActiveWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <WorkoutLoader paramsPromise={params} />
    </Suspense>
  );
}
