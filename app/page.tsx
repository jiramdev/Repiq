// app/page.tsx
import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import Link from "next/link";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import { requireIdleUserId } from "@/lib/active-workout";
import { getUserProfile } from "@/lib/user";
import { todayIn, resolveTimeZone } from "@/lib/time";
import { convertWeight } from "@/lib/units";
import { str } from "@/lib/strings";
import { Header, todayWidget, card, label, metric, bodyMuted, meta, s } from "@/components/ui";
import { MorningWorkoutNotifier } from "./morning-notifier";

async function DashboardContent() {
  await connection();
  const userId = await requireIdleUserId();
  const profile = await getUserProfile(userId);
  const unit = profile?.unit_system ?? "kg";
  const today = todayIn(resolveTimeZone(profile?.timezone));

  const [workoutsResult, latestWeight, allCompletedCount] = await Promise.all([
    sql`
      SELECT
        w.id,
        p.title,
        p.exercise_count,
        EXISTS (
          SELECT 1 FROM completed_sessions c
          WHERE c.user_id = ${userId} AND c.workout_id = w.id AND c.completed_date = ${today.date}::date
        ) AS done_today
      FROM workouts w
      LEFT JOIN plans p ON p.id = w.plan_id AND p.user_id = w.user_id
      WHERE w.user_id = ${userId} AND w.day_label = ${today.dayLabel}
      ORDER BY w.id
      LIMIT 1
    `,
    sql`
      SELECT value::float AS value, unit
      FROM metrics
      WHERE user_id = ${userId} AND type = 'weight'
      ORDER BY recorded_at DESC, id DESC
      LIMIT 1
    `,
    sql`SELECT COUNT(*)::int AS count FROM completed_sessions WHERE user_id = ${userId}`,
  ]);

  const row = workoutsResult[0];
  const todayWorkout =
    row && row.title
      ? {
          id: Number(row.id),
          name: String(row.title),
          exercise_count: Number(row.exercise_count) || 0,
          doneToday: Boolean(row.done_today),
        }
      : null;

  const weight = latestWeight[0]
    ? convertWeight(Number(latestWeight[0].value), latestWeight[0].unit, unit)
    : null;
  const totalCompleted = allCompletedCount[0]?.count ?? 0;

  return (
    <>
      {todayWorkout && !todayWorkout.doneToday && (
        <MorningWorkoutNotifier
          enabled={profile?.notify_workout_reminders ?? false}
          todayDate={today.date}
          workoutName={todayWorkout.name}
          exerciseCount={todayWorkout.exercise_count}
        />
      )}

      {todayWorkout ? (
        todayWorkout.doneToday ? (
          <div className={todayWidget}>
            <p className={label}>{str.dashboard.today(today.dayLabel)}</p>
            <p className={`${metric} tracking-tight`}>{str.dashboard.finished}</p>
            <p className={bodyMuted}>{str.dashboard.finishedHint}</p>
            <Link
              href={`/workout/${todayWorkout.id}`}
              prefetch={false}
              className={`${meta} inline-flex min-h-11 items-center justify-center px-4 text-[#baa3d0]`}
            >
              {str.dashboard.startAnother}
            </Link>
          </div>
        ) : (
          <Link href={`/workout/${todayWorkout.id}`} prefetch={false} className={todayWidget}>
            <p className={label}>{str.dashboard.today(today.dayLabel)}</p>
            <p className={`${metric} tracking-tight`}>{todayWorkout.name}</p>
            <p className={bodyMuted}>{str.dashboard.exercisesScheduled(todayWorkout.exercise_count)}</p>
          </Link>
        )
      ) : (
        <div className={todayWidget}>
          <p className={label}>{str.dashboard.today(today.dayLabel)}</p>
          <p className={`${metric} tracking-tight`}>{str.dashboard.restDay}</p>
          <p className={bodyMuted}>{str.dashboard.nothingScheduled}</p>
        </div>
      )}

      <div className={`grid grid-cols-2 ${s.gap}`}>
        <div className={`${card} text-center flex flex-col justify-between items-center aspect-square`}>
          <span className={label}>{str.dashboard.weight}</span>
          <span className={metric}>{weight ?? "—"}</span>
          <span className={bodyMuted}>{unit}</span>
        </div>
        <div className={`${card} text-center flex flex-col justify-between items-center aspect-square`}>
          <span className={label}>{str.dashboard.completed}</span>
          <span className={metric}>{totalCompleted}</span>
          <span className={bodyMuted}>{str.dashboard.workouts}</span>
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <div className="min-h-[100dvh] max-w-sm mx-auto p-4 flex flex-col justify-start select-none pb-28">
      <main className={`w-full ${s.stack} pt-2`}>
        <Header title={str.dashboard.title} />

        <Suspense fallback={<LoadingScreen />}>
          <DashboardContent />
        </Suspense>
      </main>
    </div>
  );
}
