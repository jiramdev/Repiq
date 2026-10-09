// app/account/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { sql, isUniqueViolation } from "@/lib/db";
import { requireUserId, destroyOtherSessions } from "@/lib/auth";
import { hashPassword, validateNewPassword, verifyPassword } from "@/lib/password";
import {
  EMAIL_PATTERN,
  LIMITS,
  USERNAME_PATTERN,
  cleanText,
  normalizeEmail,
  normalizeUsername,
  toIntInRange,
} from "@/lib/validation";
import { normalizeUnit, type WeightUnit } from "@/lib/units";
import { str } from "@/lib/strings";

type Result = { success: boolean; error?: string };

function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function setUnitSystem(unit: WeightUnit): Promise<Result> {
  const userId = await requireUserId();
  const next = normalizeUnit(unit);
  await sql`
    UPDATE user_profiles
    SET unit_system = ${next}, updated_at = now()
    WHERE user_id = ${userId}
  `;
  revalidateAll();
  return { success: true };
}

export async function updateAccountDetails(formData: {
  name: string;
  age: number;
  email: string;
  username: string;
}): Promise<Result> {
  const userId = await requireUserId();
  const name = cleanText(formData?.name, LIMITS.name);
  const username = normalizeUsername(formData?.username);
  const email = normalizeEmail(formData?.email);
  const age = toIntInRange(formData?.age, LIMITS.age.min, LIMITS.age.max);

  if (!name) return { success: false, error: str.auth.enterNameAndUsername };
  if (!USERNAME_PATTERN.test(username)) return { success: false, error: str.auth.usernameInvalid };
  if (!EMAIL_PATTERN.test(email)) return { success: false, error: str.auth.emailInvalid };
  if (age === null) return { success: false, error: str.auth.ageInvalid };

  try {
    const [usernameTaken, emailTaken] = await Promise.all([
      sql`
        SELECT 1 FROM user_profiles
        WHERE lower(trim(username)) = ${username} AND user_id <> ${userId}
        LIMIT 1
      `,
      sql`
        SELECT 1 FROM user_profiles
        WHERE lower(trim(email)) = ${email} AND user_id <> ${userId}
        LIMIT 1
      `,
    ]);
    if (usernameTaken.length > 0) return { success: false, error: str.auth.usernameTaken };
    if (emailTaken.length > 0) return { success: false, error: str.auth.emailTaken };

    await sql.transaction([
      sql`
        UPDATE user_profiles
        SET name = ${name}, age = ${age}, email = ${email}, username = ${username}, updated_at = now()
        WHERE user_id = ${userId}
      `,
      sql`UPDATE users SET email = ${email}, name = ${name} WHERE id = ${userId}`,
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      const constraint = String((err as { constraint?: string }).constraint ?? "");
      return {
        success: false,
        error: constraint.includes("username") ? str.auth.usernameTaken : str.auth.emailTaken,
      };
    }
    console.error("updateAccountDetails error:", err);
    return { success: false, error: str.common.genericError };
  }

  revalidatePath("/account", "page");
  return { success: true };
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<Result> {
  const userId = await requireUserId();

  if (!input?.currentPassword?.trim()) {
    return { success: false, error: str.account.enterCurrentPassword };
  }
  const invalid = validateNewPassword(input?.newPassword ?? "");
  if (invalid) return { success: false, error: invalid };

  const rows = await sql`
    SELECT password_hash FROM user_profiles WHERE user_id = ${userId} LIMIT 1
  `;
  const { ok } = await verifyPassword(input.currentPassword, rows[0]?.password_hash ?? null);
  if (!ok) return { success: false, error: str.auth.passwordMismatch };

  const hashed = await hashPassword(input.newPassword);
  await sql`
    UPDATE user_profiles
    SET password_hash = ${hashed}, updated_at = now()
    WHERE user_id = ${userId}
  `;
  await destroyOtherSessions(userId);

  return { success: true };
}

export async function setNotification(
  key: "notify_workout_reminders" | "notify_rest_day_alerts",
  enabled: boolean
): Promise<Result> {
  const userId = await requireUserId();
  const next = Boolean(enabled);

  if (key === "notify_workout_reminders") {
    await sql`
      UPDATE user_profiles
      SET notify_workout_reminders = ${next}, updated_at = now()
      WHERE user_id = ${userId}
    `;
  } else if (key === "notify_rest_day_alerts") {
    await sql`
      UPDATE user_profiles
      SET notify_rest_day_alerts = ${next}, updated_at = now()
      WHERE user_id = ${userId}
    `;
  } else {
    return { success: false, error: str.common.genericError };
  }

  revalidateAll();
  return { success: true };
}

export async function resetWorkoutHistory(): Promise<Result> {
  const userId = await requireUserId();

  await sql.transaction([
    sql`DELETE FROM completed_sessions WHERE user_id = ${userId}`,
    // Deleting sessions cascades to their logged sets.
    sql`DELETE FROM workout_sessions WHERE user_id = ${userId}`,
    // Pre-migration logs that never got a session.
    sql`
      DELETE FROM workout_logs
      WHERE session_id IS NULL
        AND workout_id IN (SELECT id FROM workouts WHERE user_id = ${userId})
    `,
    sql`UPDATE workouts SET completed = false WHERE user_id = ${userId}`,
  ]);

  revalidateAll();
  return { success: true };
}
