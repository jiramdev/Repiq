// app/schedule/page.tsx
import { Suspense } from "react";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { WEEK_ORDER } from "@/lib/time";
import { str } from "@/lib/strings";
import { ScheduleView } from "./schedule-view";
import { Header, page as pageStyle, s, todayWidget, card } from "@/components/ui";

async function ScheduleContent() {
  await connection();
  const userId = await requireUserId();

  const [workoutsResult, plansResult] = await Promise.all([
    sql`
      SELECT DISTINCT ON (w.day_label) w.id, w.day_label, w.plan_id, p.title AS plan_title
      FROM workouts w
      LEFT JOIN plans p ON p.id = w.plan_id AND p.user_id = w.user_id
      WHERE w.user_id = ${userId}
      ORDER BY w.day_label, w.id
    `,
    sql`
      SELECT id, title, exercise_count
      FROM plans
      WHERE user_id = ${userId}
      ORDER BY id ASC
    `,
  ]);

  const byDay = new Map(workoutsResult.map((w) => [String(w.day_label), w]));
  const schedule = WEEK_ORDER.map((day) => {
    const w = byDay.get(day);
    const planId = w?.plan_id != null && w?.plan_title != null ? Number(w.plan_id) : null;
    return {
      day_label: day,
      plan_id: planId,
      plan_title: planId != null ? String(w!.plan_title) : null,
    };
  });

  const plans = plansResult.map((p) => ({
    id: Number(p.id),
    title: String(p.title),
    exercise_count: Number(p.exercise_count) || 0,
  }));

  return <ScheduleView scheduleList={schedule} planList={plans} />;
}

export default function SchedulePage() {
  return (
    <Suspense
      fallback={
        <div className={pageStyle()}>
          <main className={`max-w-sm mx-auto ${s.stack} animate-pulse`}>
            <Header title={str.schedule.title} />
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
