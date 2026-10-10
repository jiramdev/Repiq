// app/statistics/page.tsx
import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import { requireIdleUserId } from "@/lib/active-workout";
import { getUserPrefs } from "@/lib/user";
import { todayIn } from "@/lib/time";
import { convertWeight } from "@/lib/units";
import { StatisticsView } from "./statistics-view";

async function StatisticsContent() {
  await connection();
  const userId = await requireIdleUserId();
  const { unit, timeZone } = await getUserPrefs(userId);
  const today = todayIn(timeZone);

  const [countResult, weightResult, datesResult] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM completed_sessions WHERE user_id = ${userId}`,
    sql`
      SELECT value::float AS value, unit
      FROM metrics
      WHERE user_id = ${userId} AND type = 'weight'
      ORDER BY recorded_at DESC, id DESC
      LIMIT 1
    `,
    sql`
      SELECT DISTINCT TO_CHAR(completed_date, 'YYYY-MM-DD') AS date_str
      FROM completed_sessions
      WHERE user_id = ${userId}
        AND completed_date >= date_trunc('month', ${today.date}::date)
        AND completed_date < date_trunc('month', ${today.date}::date) + interval '1 month'
    `,
  ]);

  const currentWeight = weightResult[0]
    ? convertWeight(Number(weightResult[0].value), weightResult[0].unit, unit)
    : null;

  return (
    <StatisticsView
      key={`${currentWeight ?? "none"}-${unit}`}
      totalWorkouts={countResult[0]?.count ?? 0}
      currentWeight={currentWeight}
      unit={unit}
      today={{ date: today.date, year: today.year, month: today.month }}
      completedDates={datesResult.map((d) => String(d.date_str))}
    />
  );
}

export default function StatisticsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <StatisticsContent />
    </Suspense>
  );
}
