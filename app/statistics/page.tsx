// app/statistics/page.tsx
import { Suspense } from "react";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import { getActiveUserId } from "@/lib/auth";
import { StatisticsView } from "./statistics-view";
import { Header, page, s, card } from "@/components/ui";

interface CompletedDateEntry {
  date_str: string;
}

async function StatisticsContent() {
  await connection();
  const userId = await getActiveUserId();

  const [countResult, weightResult, datesResult] = await Promise.all([
    // Total lifetime completed workouts
    sql`
      SELECT COUNT(*)::int AS count
      FROM completed_sessions
      WHERE user_id = ${userId}
    `,
    // Latest weight entry for THIS active user
    sql`
      SELECT value::float AS value
      FROM metrics
      WHERE user_id = ${userId} AND type = 'weight'
      ORDER BY recorded_at DESC, id DESC
      LIMIT 1
    `,
    // Distinct completed session dates
    sql`
      SELECT DISTINCT TO_CHAR(completed_date, 'YYYY-MM-DD') AS date_str
      FROM completed_sessions
      WHERE user_id = ${userId}
    `,
  ]);

  const totalWorkouts = countResult[0]?.count ?? 0;
  const currentWeight =
    weightResult[0]?.value != null ? Number(weightResult[0].value) : null;
  const completedDates = datesResult as CompletedDateEntry[];

  return (
    <StatisticsView
      totalWorkouts={totalWorkouts}
      currentWeight={currentWeight}
      completedDates={completedDates}
    />
  );
}

export default function StatisticsPage() {
  return (
    <Suspense
      fallback={
        <div className={page()}>
          <main className={`max-w-sm mx-auto ${s.stack} animate-pulse`}>
            <Header title="Statistics" />
            <div className="grid grid-cols-2 gap-3.5">
              <div className="aspect-square rounded-[30px] bg-[#141416]/50" />
              <div className="aspect-square rounded-[30px] bg-[#141416]/50" />
            </div>
            <div className={`h-48 rounded-[30px] bg-[#141416]/50`} />
          </main>
        </div>
      }
    >
      <StatisticsContent />
    </Suspense>
  );
}