// lib/rest-timers.ts (server only)
//
// Rest-timer notifications are delivered by Upstash QStash: we publish a
// message with a delay, QStash calls /api/push/deliver when the rest is over,
// and that route sends the Web Push. This works for any rest length (the old
// approach slept inside a function capped at 120 s) and costs nothing while
// waiting. Without QSTASH_TOKEN the feature turns itself off and the in-app
// timer (sound, vibration, local notification) still works.
import { Client, Receiver } from "@upstash/qstash";
import { randomUUID } from "crypto";
import { sql } from "@/lib/db";
import { isPushConfigured } from "@/lib/push";
import { UUID_PATTERN } from "@/lib/validation";

let client: Client | null = null;

export function isRestPushAvailable(): boolean {
  return Boolean(process.env.QSTASH_TOKEN) && isPushConfigured();
}

function qstash(): Client {
  client ??= new Client({
    token: process.env.QSTASH_TOKEN!,
    ...(process.env.QSTASH_URL ? { baseUrl: process.env.QSTASH_URL } : {}),
  });
  return client;
}

export function getReceiver(): Receiver | null {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next) return null;
  return new Receiver({ currentSigningKey: current, nextSigningKey: next });
}

export const DELIVER_PATH = "/api/push/deliver";

/** Public base URL QStash should call back. */
export function appBaseUrl(requestUrl: string): string {
  const configuredUrl = process.env.APP_URL?.replace(/\/+$/, "");
  if (configuredUrl) return configuredUrl;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return new URL(requestUrl).origin;
}

/** Cancel a user's pending timers (all, or one). Best effort at QStash too. */
export async function cancelRestTimers(userId: string, timerId?: string): Promise<number> {
  if (timerId !== undefined && !UUID_PATTERN.test(timerId)) return 0;
  const rows = timerId
    ? await sql`
        UPDATE rest_timers SET cancelled_at = now()
        WHERE user_id = ${userId} AND id = ${timerId}::uuid
          AND cancelled_at IS NULL AND sent_at IS NULL
        RETURNING provider_message_id
      `
    : await sql`
        UPDATE rest_timers SET cancelled_at = now()
        WHERE user_id = ${userId} AND cancelled_at IS NULL AND sent_at IS NULL
        RETURNING provider_message_id
      `;

  if (process.env.QSTASH_TOKEN) {
    await Promise.all(
      rows
        .map((r) => r.provider_message_id as string | null)
        .filter((id): id is string => Boolean(id))
        .map((id) => qstash().messages.delete(id).catch(() => undefined))
    );
  }
  return rows.length;
}

export async function scheduleRestTimer(params: {
  userId: string;
  workoutId: number;
  seconds: number;
  baseUrl: string;
}): Promise<string> {
  const { userId, workoutId, seconds, baseUrl } = params;
  // Only one rest timer per user at a time.
  await cancelRestTimers(userId);

  const id = randomUUID();
  const fireAt = new Date(Date.now() + seconds * 1000).toISOString();
  await sql`
    INSERT INTO rest_timers (id, user_id, workout_id, fire_at)
    VALUES (${id}::uuid, ${userId}, ${workoutId}, ${fireAt})
  `;

  try {
    const res = await qstash().publishJSON({
      url: `${baseUrl}${DELIVER_PATH}`,
      body: { timerId: id },
      delay: seconds,
      retries: 2,
    });
    await sql`
      UPDATE rest_timers SET provider_message_id = ${res.messageId} WHERE id = ${id}::uuid
    `;
  } catch (err) {
    await sql`UPDATE rest_timers SET cancelled_at = now() WHERE id = ${id}::uuid`;
    throw err;
  }
  return id;
}

/** Claim a due timer exactly once. Returns null if cancelled, already sent or unknown. */
export async function claimRestTimer(
  timerId: string
): Promise<{ userId: string; workoutId: number | null } | null> {
  if (!UUID_PATTERN.test(timerId)) return null;
  const rows = await sql`
    UPDATE rest_timers SET sent_at = now()
    WHERE id = ${timerId}::uuid AND cancelled_at IS NULL AND sent_at IS NULL
    RETURNING user_id, workout_id
  `;
  const row = rows[0];
  return row
    ? { userId: String(row.user_id), workoutId: row.workout_id == null ? null : Number(row.workout_id) }
    : null;
}

/** Give a claimed timer back (the push failed), so QStash's retry can send it. */
export async function releaseRestTimer(timerId: string): Promise<void> {
  if (!UUID_PATTERN.test(timerId)) return;
  await sql`UPDATE rest_timers SET sent_at = NULL WHERE id = ${timerId}::uuid AND cancelled_at IS NULL`;
}
