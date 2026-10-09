// app/schedule/page.tsx
import { Suspense } from "react";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import { getActiveUserId } from "@/lib/auth";
import { ScheduleView } from "./schedule-view";
import { Header, page as pageStyle, s, todayWidget, card } from "@/components/ui";

interface WorkoutRow {
  id: number;
  name: string;
  day_label: string;
}

interface PlanRow {
  id: number;
  title: string;
  exercise_count: number;
}

const DAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

async function ScheduleContent() {
  await connection();
  const userId = await getActiveUserId();

  const [workoutsResult, plansResult] = await Promise.all([
    sql`
      SELECT id, name, day_label
      FROM workouts
      WHERE user_id = ${userId}
    `,
    sql`
      SELECT id, title, exercise_count
      FROM plans
      WHERE user_id = ${userId}
      ORDER BY id ASC
    `,
  ]);

  const existingWorkouts = workoutsResult as WorkoutRow[];
  const plans = plansResult as PlanRow[];

  // Ensure all 7 days of the week exist in memory
  const workoutMap = new Map(existingWorkouts.map((w) => [w.day_label, w]));
  const fullSchedule = DAY_ORDER.map((day) => {
    const found = workoutMap.get(day);
    return {
      id: found?.id ?? null,
      name: found?.name ?? "Rest",
      day_label: day,
    };
  });

  return <ScheduleView scheduleList={fullSchedule} planList={plans} />;
}

export default function SchedulePage() {
  return (
    <Suspense
      fallback={
        <div className={pageStyle()}>
          <main className={`max-w-sm mx-auto ${s.stack} animate-pulse`}>
            <Header title="Schedule" />
            <div className={`${todayWidget} opacity-60 h-44`} />
            <div className={`${card} opacity-60 h-36`} />
          </main>
        </div>
      }
    >
      <ScheduleContent />
    </Suspense>
  );
}