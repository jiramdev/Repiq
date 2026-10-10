// app/account/page.tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import { requireIdleUserId } from "@/lib/active-workout";
import { getUserProfile } from "@/lib/user";
import { convertWeight } from "@/lib/units";
import { str } from "@/lib/strings";
import { AccountView } from "./account-view";
import { Header, s, card } from "@/components/ui";

async function AccountContent() {
  await connection();
  const userId = await requireIdleUserId();

  const [profile, workoutsCount, plansCount, weightResult] = await Promise.all([
    getUserProfile(userId),
    sql`SELECT COUNT(*)::int AS count FROM completed_sessions WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*)::int AS count FROM plans WHERE user_id = ${userId}`,
    sql`
      SELECT value::float AS value, unit
      FROM metrics
      WHERE user_id = ${userId} AND type = 'weight'
      ORDER BY recorded_at DESC, id DESC
      LIMIT 1
    `,
  ]);

  // No profile row means a broken account; don't invent one.
  if (!profile) redirect("/auth");

  const latestWeight = weightResult[0]
    ? convertWeight(Number(weightResult[0].value), weightResult[0].unit, profile.unit_system)
    : null;

  return (
    <AccountView
      profile={profile}
      stats={{
        totalWorkouts: workoutsCount[0]?.count ?? 0,
        totalPlans: plansCount[0]?.count ?? 0,
        latestWeight,
      }}
    />
  );
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] max-w-sm mx-auto p-4 flex flex-col justify-start select-none overflow-hidden pb-24">
          <main className={`w-full ${s.stack} pt-2 animate-pulse`}>
            <Header title={str.account.title} />
            <div className={`${card} opacity-60 h-28`} />
            <div className={`${card} opacity-60 h-44`} />
            <div className={`${card} opacity-60 h-32`} />
          </main>
        </div>
      }
    >
      <AccountContent />
    </Suspense>
  );
}
