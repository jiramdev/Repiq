// app/auth/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { sql, isUniqueViolation } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import {
  hashPassword,
  normalizePassword,
  validateNewPassword,
  verifyPassword,
} from "@/lib/password";
import { isValidTimeZone, DEFAULT_TIMEZONE, DAY_LABELS } from "@/lib/time";
import {
  EMAIL_PATTERN,
  LIMITS,
  USERNAME_PATTERN,
  cleanText,
  normalizeEmail,
  normalizeUsername,
  toIntInRange,
} from "@/lib/validation";
import { str } from "@/lib/strings";

type Result = { success: boolean; error?: string };

function validateUsername(username: string): string | null {
  if (!username) return str.auth.enterUsername;
  if (username.length < 3) return str.auth.usernameTooShort;
  if (!USERNAME_PATTERN.test(username)) return str.auth.usernameInvalid;
  return null;
}

export async function checkUsernameAvailable(
  rawUsername: string
): Promise<{ available: boolean; error?: string }> {
  const username = normalizeUsername(rawUsername);
  const invalid = validateUsername(username);
  if (invalid) return { available: false, error: invalid };

  try {
    const existing = await sql`
      SELECT 1 FROM user_profiles
      WHERE lower(trim(username)) = ${username}
      LIMIT 1
    `;
    return existing.length === 0
      ? { available: true }
      : { available: false, error: str.auth.usernameTaken };
  } catch (err) {
    console.error("checkUsernameAvailable error:", err);
    // Fail closed: never report "available" when we couldn't check.
    return { available: false, error: str.auth.usernameCheckFailed };
  }
}

export async function loginUser(formData: {
  identifier: string;
  password: string;
  timeZone?: string;
}): Promise<Result> {
  const identifier = normalizeEmail(formData?.identifier).replace(/^@+/, "");
  const password = normalizePassword(formData?.password ?? "");

  if (!identifier || !password) {
    return { success: false, error: str.auth.fillAllFields };
  }

  try {
    const rows = await sql`
      SELECT p.user_id, p.password_hash
      FROM user_profiles p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE lower(trim(p.email)) = ${identifier}
         OR lower(trim(p.username)) = ${identifier}
         OR lower(trim(u.email)) = ${identifier}
      ORDER BY p.user_id
      LIMIT 1
    `;

    const user = rows[0];
    const { ok, needsRehash } = await verifyPassword(password, user?.password_hash ?? null);
    if (!user || !ok) {
      return { success: false, error: str.auth.invalidCredentials };
    }

    const userId = String(user.user_id);

    if (needsRehash) {
      // Legacy plain-text password: replace it with a bcrypt hash now. Only
      // overwrite if it is still the same plain-text value.
      const hashed = await hashPassword(password);
      await sql`
        UPDATE user_profiles
        SET password_hash = ${hashed}, updated_at = now()
        WHERE user_id = ${userId} AND password_hash = ${user.password_hash}
      `;
    }

    if (isValidTimeZone(formData.timeZone)) {
      await sql`
        UPDATE user_profiles SET timezone = ${formData.timeZone}
        WHERE user_id = ${userId} AND timezone IS DISTINCT FROM ${formData.timeZone}
      `;
    }

    await createSession(userId);
  } catch (err) {
    console.error("loginUser error:", err);
    return { success: false, error: str.auth.loginFailed };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function registerAndOnboard(data: {
  name: string;
  username: string;
  email: string;
  password: string;
  age: number;
  notify_workout_reminders: boolean;
  notify_rest_day_alerts: boolean;
  timeZone?: string;
}): Promise<Result> {
  const name = cleanText(data?.name, LIMITS.name);
  const username = normalizeUsername(data?.username);
  const email = normalizeEmail(data?.email);
  const age = toIntInRange(data?.age, LIMITS.age.min, LIMITS.age.max);

  if (!name || !username || !email || !data?.password) {
    return { success: false, error: str.auth.fillAllFields };
  }
  const usernameError = validateUsername(username);
  if (usernameError) return { success: false, error: usernameError };
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return { success: false, error: str.auth.emailInvalid };
  }
  if (age === null) return { success: false, error: str.auth.ageInvalid };
  const passwordError = validateNewPassword(data.password);
  if (passwordError) return { success: false, error: passwordError };

  const timeZone = isValidTimeZone(data.timeZone) ? data.timeZone : DEFAULT_TIMEZONE;
  const userId = `usr_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

  try {
    // Friendly errors for the common case; the unique indexes from migration
    // 0005 (and the catch below) cover the race between two sign-ups.
    const [emailTaken, usernameTaken] = await Promise.all([
      sql`
        SELECT 1 FROM users WHERE lower(trim(email)) = ${email}
        UNION ALL
        SELECT 1 FROM user_profiles WHERE lower(trim(email)) = ${email}
        LIMIT 1
      `,
      sql`SELECT 1 FROM user_profiles WHERE lower(trim(username)) = ${username} LIMIT 1`,
    ]);
    if (emailTaken.length > 0) return { success: false, error: str.auth.emailTaken };
    if (usernameTaken.length > 0) return { success: false, error: str.auth.usernameTaken };

    const passwordHash = await hashPassword(data.password);

    // One transaction: either the user, profile and 7-day schedule all exist, or none do.
    await sql.transaction([
      sql`
        INSERT INTO users (id, email, name)
        VALUES (${userId}, ${email}, ${name})
      `,
      sql`
        INSERT INTO user_profiles (
          user_id, name, username, email, age, password_hash, unit_system,
          timezone, notify_workout_reminders, notify_rest_day_alerts
        ) VALUES (
          ${userId}, ${name}, ${username}, ${email}, ${age}, ${passwordHash}, 'kg',
          ${timeZone}, ${Boolean(data.notify_workout_reminders)}, ${Boolean(data.notify_rest_day_alerts)}
        )
      `,
      sql`
        INSERT INTO workouts (user_id, name, day_label, exercise_count, completed)
        SELECT ${userId}, 'Rest', d, 0, false
        FROM unnest(${[...DAY_LABELS]}::text[]) AS d
      `,
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      const constraint = String((err as { constraint?: string }).constraint ?? "");
      return {
        success: false,
        error: constraint.includes("username") ? str.auth.usernameTaken : str.auth.emailTaken,
      };
    }
    console.error("registerAndOnboard error:", err);
    return { success: false, error: str.auth.registrationFailed };
  }

  try {
    await createSession(userId);
  } catch (err) {
    console.error("registerAndOnboard session error:", err);
    // The account exists; the user can sign in normally.
    return { success: false, error: str.auth.loginFailed };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function logoutUser() {
  await destroySession();
  redirect("/auth");
}
