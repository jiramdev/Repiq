// lib/auth.ts
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import {
  SESSION_COOKIE,
  LEGACY_SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  SESSION_COOKIE_OPTIONS,
  generateSessionToken,
  hashSessionToken,
  looksLikeSessionToken,
} from "@/lib/session-token";

/**
 * Returns the signed-in user's id, or null. There is deliberately no fallback
 * user: no valid session means not signed in.
 */
export const getSessionUserId = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!looksLikeSessionToken(token)) return null;

  const rows = await sql`
    SELECT user_id
    FROM sessions
    WHERE token_hash = ${hashSessionToken(token)}
      AND expires_at > now()
    LIMIT 1
  `;
  return rows.length > 0 ? String(rows[0].user_id) : null;
});

/** For pages and server actions: the user id, or a redirect to /auth. */
export async function requireUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/auth");
  return userId;
}

export async function createSession(userId: string): Promise<void> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 255) ?? null;

  // Housekeeping: drop expired sessions (indexed, cheap) instead of a cron job.
  await sql`DELETE FROM sessions WHERE expires_at < now()`;
  await sql`
    INSERT INTO sessions (user_id, token_hash, expires_at, user_agent)
    VALUES (${userId}, ${hashSessionToken(token)}, ${expiresAt.toISOString()}, ${userAgent})
  `;

  const cookieStore = await cookies();
  cookieStore.delete(LEGACY_SESSION_COOKIE);
  cookieStore.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (looksLikeSessionToken(token)) {
    await sql`DELETE FROM sessions WHERE token_hash = ${hashSessionToken(token)}`;
  }
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(LEGACY_SESSION_COOKIE);
}

/** Sign out every other device, e.g. after a password change. */
export async function destroyOtherSessions(userId: string): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const keep = looksLikeSessionToken(token) ? hashSessionToken(token) : "";
  await sql`
    DELETE FROM sessions
    WHERE user_id = ${userId} AND token_hash <> ${keep}
  `;
}
