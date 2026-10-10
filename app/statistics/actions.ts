// app/statistics/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { workoutLockError } from "@/lib/active-workout";
import { getUserPrefs } from "@/lib/user";
import { parseBodyWeight } from "@/lib/units";
import { bodyWeightQueries } from "@/lib/body-weight";

/** Log body weight in the user's current unit (stored with that unit). */
export async function logWeight(weightValue: number): Promise<{ success: boolean; error?: string }> {
  const userId = await requireUserId();
  const locked = await workoutLockError(userId);
  if (locked) return { success: false, error: locked };
  const { unit } = await getUserPrefs(userId);

  const weight = parseBodyWeight(weightValue, unit);
  if (weight === null) return { success: false };

  // Logged in metrics and mirrored on the profile (Account details).
  await sql.transaction(bodyWeightQueries(userId, weight, unit));

  revalidatePath("/", "page");
  revalidatePath("/statistics", "page");
  revalidatePath("/account", "page");
  return { success: true };
}
