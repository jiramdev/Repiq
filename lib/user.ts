// lib/user.ts
import { cache } from "react";
import { sql } from "@/lib/db";
import { resolveTimeZone } from "@/lib/time";
import { normalizeUnit, type WeightUnit } from "@/lib/units";

export interface UserProfile {
  name: string;
  username: string;
  email: string;
  age: number | null;
  unit_system: WeightUnit;
  timezone: string;
  notify_workout_reminders: boolean;
  notify_rest_day_alerts: boolean;
}

/**
 * The profile of a signed-in user. Never selects password_hash, so it can be
 * handed to client components safely. Returns null when there's no profile row
 * (no made-up fallback profile).
 */
export const getUserProfile = cache(async (userId: string): Promise<UserProfile | null> => {
  const rows = await sql`
    SELECT name, username, email, age, unit_system, timezone,
           notify_workout_reminders, notify_rest_day_alerts
    FROM user_profiles
    WHERE user_id = ${userId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    name: String(row.name ?? ""),
    username: String(row.username ?? "").replace(/^@+/, ""),
    email: String(row.email ?? ""),
    age: row.age == null ? null : Number(row.age),
    unit_system: normalizeUnit(row.unit_system),
    timezone: resolveTimeZone(row.timezone),
    notify_workout_reminders: Boolean(row.notify_workout_reminders),
    notify_rest_day_alerts: Boolean(row.notify_rest_day_alerts),
  };
});

/** Unit and timezone with safe defaults, for pages that only need those. */
export async function getUserPrefs(userId: string): Promise<{ unit: WeightUnit; timeZone: string }> {
  const profile = await getUserProfile(userId);
  return {
    unit: profile?.unit_system ?? "kg",
    timeZone: profile?.timezone ?? resolveTimeZone(null),
  };
}
