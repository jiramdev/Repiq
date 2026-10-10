// app/auth/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { sql, isUniqueViolation } from "@/lib/db";
import { createSession, destroySession, getSessionUserId } from "@/lib/auth";
import { getActiveWorkout } from "@/lib/active-workout";
import { RATE_LIMITS, clientIp, rateLimit, retryMessage } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { hashPassword, normalizePassword, validateNewPassword, verifyPassword } from "@/lib/password";
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
import { bodyWeightRange, normalizeUnit, parseBodyWeight } from "@/lib/units";

type Result = { success: boolean; error?: string };

async function requestIp(): Promise<string> {
  return clientIp(await headers());
}

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

  const limited = await rateLimit(RATE_LIMITS.usernameCheckIp, await requestIp());
  if (!limited.ok) return { available: false, error: retryMessage(limited.retryAfterSeconds) };

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

  // Checked before the (deliberately slow) password hash comparison.
  const [byIp, byAccount] = await Promise.all([
    rateLimit(RATE_LIMITS.loginIp, await requestIp()),
    rateLimit(RATE_LIMITS.loginAccount, identifier),
  ]);
  if (!byIp.ok || !byAccount.ok) {
    return {
      success: false,
      error: retryMessage(Math.max(byIp.retryAfterSeconds, byAccount.retryAfterSeconds)),
    };
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
    const ok = await verifyPassword(password, (user?.password_hash as string | null) ?? null);
    if (!user || !ok) {
      return { success: false, error: str.auth.invalidCredentials };
    }

    const userId = String(user.user_id);

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
  /** Optional. In `weight_unit`, which also becomes the account's unit. */
  body_weight?: number | string | null;
  weight_unit?: string;
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

  const unit = normalizeUnit(data?.weight_unit);
  const weightGiven = data?.body_weight != null && String(data.body_weight).trim() !== "";
  const bodyWeight = weightGiven ? parseBodyWeight(data.body_weight, unit) : null;
  if (weightGiven && bodyWeight === null) {
    const { min, max } = bodyWeightRange(unit);
    return { success: false, error: str.auth.weightInvalid(min, max, unit) };
  }

  const passwordError = validateNewPassword(data.password);
  if (passwordError) return { success: false, error: passwordError };

  const limited = await rateLimit(RATE_LIMITS.registerIp, await requestIp());
  if (!limited.ok) return { success: false, error: retryMessage(limited.retryAfterSeconds) };

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

    // One transaction: either the user, profile, 7-day schedule and first
    // weight entry all exist, or none do.
    await sql.transaction([
      sql`
        INSERT INTO users (id, email, name)
        VALUES (${userId}, ${email}, ${name})
      `,
      sql`
        INSERT INTO user_profiles (
          user_id, name, username, email, age, password_hash, unit_system,
          timezone, notify_workout_reminders, notify_rest_day_alerts,
          body_weight, body_weight_unit
        ) VALUES (
          ${userId}, ${name}, ${username}, ${email}, ${age}, ${passwordHash}, ${unit},
          ${timeZone}, ${Boolean(data.notify_workout_reminders)}, ${Boolean(data.notify_rest_day_alerts)},
          ${bodyWeight}, ${bodyWeight === null ? null : unit}
        )
      `,
      sql`
        INSERT INTO workouts (user_id, name, day_label, exercise_count, completed)
        SELECT ${userId}, 'Rest', d, 0, false
        FROM unnest(${[...DAY_LABELS]}::text[]) AS d
      `,
      ...(bodyWeight === null
        ? []
        : [
            sql`
              INSERT INTO metrics (user_id, type, value, unit, recorded_at)
              VALUES (${userId}, 'weight', ${bodyWeight}, ${unit}, now())
            `,
          ]),
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

/**
 * Sign out. Blocked while a workout is active (finish or discard it first).
 * Also forgets this device's push subscription, so it stops receiving the
 * signed-out user's notifications. The client then clears its caches and goes
 * to /auth itself.
 */
export async function logoutUser(options?: { pushEndpoint?: string | null }): Promise<Result> {
  const userId = await getSessionUserId();
  if (userId && (await getActiveWorkout(userId))) {
    return { success: false, error: str.workout.locked };
  }
  const endpoint = typeof options?.pushEndpoint === "string" ? options.pushEndpoint.slice(0, 1024) : "";
  if (userId && endpoint) {
    await sql`DELETE FROM push_subscriptions WHERE user_id = ${userId} AND endpoint = ${endpoint}`;
  }
  await destroySession();
  return { success: true };
}
