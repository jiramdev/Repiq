// app/workout/[id]/page.tsx
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getUserProfile } from "@/lib/user";
import { todayIn, resolveTimeZone } from "@/lib/time";
import { getSessionLogs, startOrResumeSession } from "@/lib/workout-session";
import { WorkoutView } from "./workout-view";
import type { WorkoutDetail } from "./types";

async function WorkoutLoader({ paramsPromise }: { paramsPromise: Promise<{ id: string }> }) {
  await connection();
  const { id } = await paramsPromise;
  const workoutId = Number(id);
  if (!Number.isInteger(workoutId) || workoutId <= 0) notFound();

  const userId = await requireUserId();
  const profile = await getUserProfile(userId);
  const unit = profile?.unit_system ?? "kg";
  const today = todayIn(resolveTimeZone(profile?.timezone)).date;

  const workoutRows = await sql`
    SELECT w.id, w.day_label, w.plan_id, p.title AS plan_title
    FROM workouts w
    LEFT JOIN plans p ON p.id = w.plan_id AND p.user_id = w.user_id
    WHERE w.id = ${workoutId} AND w.user_id = ${userId}
    LIMIT 1
  `;
  const row = workoutRows[0];
  if (!row) notFound();
  if (!row.plan_id || !row.plan_title) redirect("/");

  const session = await startOrResumeSession({
    userId,
    workoutId,
    planId: Number(row.plan_id),
    planTitle: String(row.plan_title),
    today,
    unit,
  });
  if (!session) redirect("/");

  const logs = await getSessionLogs({ userId, sessionId: session.id, unit });

  const workout: WorkoutDetail = {
    id: workoutId,
    sessionId: session.id,
    planId: Number(row.plan_id),
    name: session.plan_name,
    day_label: String(row.day_label ?? ""),
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
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-[#baa3d0] text-white p-4">
          <div className="max-w-sm mx-auto h-48 rounded-2xl bg-white/[0.04] animate-pulse" />
        </div>
      }
    >
      <WorkoutLoader paramsPromise={params} />
    </Suspense>
  );
}
