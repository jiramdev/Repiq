// app/statistics/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { workoutLockError } from "@/lib/active-workout";
import { getUserPrefs } from "@/lib/user";
import { LIMITS, toNumberInRange } from "@/lib/validation";

/** Log body weight in the user's current unit (stored with that unit). */
export async function logWeight(weightValue: number): Promise<{ success: boolean; error?: string }> {
  const userId = await requireUserId();
  const locked = await workoutLockError(userId);
  if (locked) return { success: false, error: locked };
  const { unit } = await getUserPrefs(userId);

  const max = unit === "lbs" ? LIMITS.bodyWeight.max * 2.2 : LIMITS.bodyWeight.max;
  const min = unit === "lbs" ? LIMITS.bodyWeight.min * 2.2 : LIMITS.bodyWeight.min;
  const weight = toNumberInRange(weightValue, min, max);
  if (weight === null) return { success: false };

  await sql`
    INSERT INTO metrics (user_id, type, value, unit, recorded_at)
    VALUES (${userId}, 'weight', ${Math.round(weight * 10) / 10}, ${unit}, now())
  `;

  revalidatePath("/", "page");
  revalidatePath("/statistics", "page");
  revalidatePath("/account", "page");
  return { success: true };
}
