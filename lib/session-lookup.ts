// lib/session-lookup.ts (server only, used by proxy.ts)
//
// One query per page request: is the session token valid, when does it expire,
// and is the user locked into an active workout?
import { sql } from "@/lib/db";
import { hashSessionToken, SESSION_TTL_SECONDS, SESSION_RENEW_AFTER_SECONDS } from "@/lib/session-token";
import { pickActiveSession, type ActiveWorkout, type OpenSessionRow } from "@/lib/workout-lock";

export interface ProxySession {
  userId: string;
  expiresAt: Date;
  active: ActiveWorkout | null;
}

export async function lookupSession(token: string, now: Date = new Date()): Promise<ProxySession | null> {
  const rows = await sql`
    SELECT
      s.user_id,
      s.expires_at,
      p.timezone,
      COALESCE((
        SELECT json_agg(x ORDER BY x.started_at DESC, x.id DESC)
        FROM (
          SELECT
            ws.id,
            ws.workout_id,
            ws.started_at,
            to_char(ws.started_on, 'YYYY-MM-DD') AS started_on,
            EXISTS (
              SELECT 1 FROM workout_logs l
              WHERE l.session_id = ws.id
                AND (COALESCE(l.completed, false) OR l.actual_weight IS NOT NULL OR l.actual_reps IS NOT NULL OR l.duration_seconds IS NOT NULL)
            ) AS has_data
          FROM workout_sessions ws
          WHERE ws.user_id = s.user_id AND ws.completed_at IS NULL
        ) x
      ), '[]'::json) AS open_sessions
    FROM sessions s
    LEFT JOIN user_profiles p ON p.user_id = s.user_id
    WHERE s.token_hash = ${hashSessionToken(token)} AND s.expires_at > now()
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const open = (typeof row.open_sessions === "string"
    ? JSON.parse(row.open_sessions)
    : row.open_sessions) as OpenSessionRow[];
  return {
    userId: String(row.user_id),
    expiresAt: new Date(row.expires_at as string),
    active: pickActiveSession(open, row.timezone as string | null, now),
  };
}

/** Sliding expiry: true once a day has passed since the expiry was last set. */
export function shouldRenew(expiresAt: Date, now: Date = new Date()): boolean {
  const remaining = (expiresAt.getTime() - now.getTime()) / 1000;
  return remaining < SESSION_TTL_SECONDS - SESSION_RENEW_AFTER_SECONDS;
}

export async function renewSession(token: string, now: Date = new Date()): Promise<Date> {
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  await sql`
    UPDATE sessions SET expires_at = ${expiresAt.toISOString()}
    WHERE token_hash = ${hashSessionToken(token)} AND expires_at > now()
  `;
  return expiresAt;
}
