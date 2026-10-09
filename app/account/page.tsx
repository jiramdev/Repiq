// app/account/page.tsx
import { Suspense } from "react";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import { getActiveUserId } from "@/lib/auth";
import { AccountView, UserProfileData } from "./account-view";
import { Header, page, s, card } from "@/components/ui";

async function AccountContent() {
  await connection();
  const userId = await getActiveUserId();

  const [profileResult, workoutsCount, plansCount, weightResult] = await Promise.all([
    sql`
      SELECT name, username, email, age, password_hash, unit_system,
             notify_workout_reminders, notify_rest_day_alerts
      FROM user_profiles
      WHERE user_id = ${userId}
      LIMIT 1
    `,
    sql`
      SELECT COUNT(*)::int AS count
      FROM completed_sessions
      WHERE user_id = ${userId}
    `,
    sql`
      SELECT COUNT(*)::int AS count
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
  ]);

  const defaultProfile: UserProfileData = {
    name: "Marijn",
    username: "marijn",
    email: "marijn@repiq.app",
    age: 24,
    password_hash: "••••••••••••",
    unit_system: "kg",
    notify_workout_reminders: true,
    notify_rest_day_alerts: false,
  };

  const profile: UserProfileData = (profileResult[0] as UserProfileData) || defaultProfile;

  // Read latest weight recorded
  let latestWeight: number | null =
    weightResult[0]?.value != null ? Number(weightResult[0].value) : null;

  // If user selected lbs but recorded in kg, convert for display
  if (latestWeight != null && profile.unit_system === "lbs") {
    latestWeight = Math.round(latestWeight * 2.20462 * 10) / 10;
  }

  const stats = {
    totalWorkouts: workoutsCount[0]?.count ?? 0,
    totalPlans: plansCount[0]?.count ?? 0,
    latestWeight,
  };

  return <AccountView profile={profile} stats={stats} />;
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className={page()}>
          <main className={`max-w-sm mx-auto ${s.stack} animate-pulse`}>
            <Header title="Account" />
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