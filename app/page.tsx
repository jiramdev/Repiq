// app/page.tsx
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import { getActiveUserId } from "@/lib/auth";
import {
  Header,
  todayWidget,
  card,
  label,
  metric,
  bodyMuted,
  s,
} from "@/components/ui";
import { MorningWorkoutNotifier } from "./morning-notifier";

interface Workout {
  id: number;
  name: string;
  day_label: string;
  exercise_count: number;
}

interface Plan {
  id: number;
  title: string;
  exercise_count: number;
}

const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

async function DashboardContent() {
  await connection();
  const userId = await getActiveUserId();

  const now = new Date();
  const currentDayLabel = DAY_LABELS[now.getDay()];

  const [
    workoutsResult,
    plansResult,
    latestWeight,
    completedTodayCount,
    allCompletedCount,
    profileResult,
  ] = await Promise.all([
    sql`
      SELECT id, name, day_label, exercise_count
      FROM workouts 
      WHERE user_id = ${userId} AND day_label = ${currentDayLabel}
      LIMIT 1
    `,
    sql`
      SELECT id, title, exercise_count 
      FROM plans 
      WHERE user_id = ${userId}
    `,
    sql`
      SELECT value::float AS value, unit 
      FROM metrics 
      WHERE user_id = ${userId} AND type = 'weight' 
      ORDER BY recorded_at DESC, id DESC 
      LIMIT 1
    `,
    sql`
      SELECT COUNT(*)::int AS count
      FROM completed_sessions
      WHERE user_id = ${userId} AND completed_date = CURRENT_DATE
    `,
    sql`
      SELECT COUNT(*)::int AS count 
      FROM completed_sessions
      WHERE user_id = ${userId}
    `,
    sql`
      SELECT notify_workout_reminders
      FROM user_profiles
      WHERE user_id = ${userId}
      LIMIT 1
    `,
  ]);

  const rawToday = (workoutsResult[0] as Workout) || null;
  const activePlans = plansResult as Plan[];
  const currentWeight = latestWeight[0]
    ? {
        value: Number(latestWeight[0].value),
        unit: String(latestWeight[0].unit || "kg"),
      }
    : null;
  const isDoneToday = (completedTodayCount[0]?.count ?? 0) > 0;
  const totalCompleted = allCompletedCount[0]?.count ?? 0;
  const notifyMorning = profileResult[0]?.notify_workout_reminders ?? true;

  let todayWorkout: { id: number; name: string; exercise_count: number } | null = null;

  if (rawToday && rawToday.name) {
    const cleanName = rawToday.name.trim();
    const matchedPlan = activePlans.find(
      (p) => p.title.trim().toLowerCase() === cleanName.toLowerCase()
    );

    if (cleanName.toLowerCase() !== "rest" && matchedPlan) {
      todayWorkout = {
        id: rawToday.id,
        name: matchedPlan.title,
        exercise_count: matchedPlan.exercise_count,
      };
    }
  }

  return (
    <>
      {!isDoneToday && (
        <MorningWorkoutNotifier
          enabled={notifyMorning}
          workoutName={todayWorkout?.name ?? null}
          exerciseCount={todayWorkout?.exercise_count ?? 0}
        />
      )}

      {/* Today hero widget */}
      {todayWorkout ? (
        isDoneToday ? (
          <div className={todayWidget}>
            <p className={label}>Today · {currentDayLabel}</p>
            <p className={`${metric} tracking-tight`}>Finished</p>
            <p className={bodyMuted}>Workout completed today</p>
          </div>
        ) : (
          <Link href={`/workout/${todayWorkout.id}`} className={todayWidget}>
            <p className={label}>Today · {currentDayLabel}</p>
            <p className={`${metric} tracking-tight`}>{todayWorkout.name}</p>
            <p className={bodyMuted}>{todayWorkout.exercise_count} exercises scheduled</p>
          </Link>
        )
      ) : (
        <div className={todayWidget}>
          <p className={label}>Today · {currentDayLabel}</p>
          <p className={`${metric} tracking-tight`}>Rest Day</p>
          <p className={bodyMuted}>Nothing scheduled</p>
        </div>
      )}

      {/* Metric cards */}
      <div className={`grid grid-cols-2 ${s.gap}`}>
        <div className={`${card} text-center flex flex-col justify-between items-center aspect-square`}>
          <span className={label}>Weight</span>
          <span className={metric}>{currentWeight != null ? currentWeight.value : "—"}</span>
          <span className={bodyMuted}>{currentWeight?.unit || "kg"}</span>
        </div>
        <div className={`${card} text-center flex flex-col justify-between items-center aspect-square`}>
          <span className={label}>Completed</span>
          <span className={metric}>{totalCompleted}</span>
          <span className={bodyMuted}>workouts</span>
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <div className="h-[100dvh] max-w-sm mx-auto p-4 flex flex-col justify-start select-none overflow-hidden pb-24">
      <main className={`w-full ${s.stack} pt-2`}>
        <Header title="Dashboard" />

        <Suspense
          fallback={
            <div className={`${s.stack} animate-pulse`}>
              <div className={`${todayWidget} opacity-60 h-28`}></div>
              <div className={`grid grid-cols-2 ${s.gap}`}>
                <div className={`${card} aspect-square opacity-60`} />
                <div className={`${card} aspect-square opacity-60`} />
              </div>
            </div>
          }
        >
          <DashboardContent />
        </Suspense>
      </main>
    </div>
  );
}