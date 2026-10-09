// lib/auth.ts
import { cookies } from "next/headers";
import { sql } from "@/lib/db";

const SESSION_COOKIE = "repiq_session_user_id";

export async function getActiveUserId(): Promise<string> {
  const cookieStore = await cookies();
  const rawId = cookieStore.get(SESSION_COOKIE)?.value?.trim();

  if (rawId) {
    return rawId;
  }

  // Fallback to default user if no cookie exists
  const defaultUser = await sql`
    SELECT id FROM users ORDER BY created_at ASC NULLS LAST LIMIT 1
  `;
  if (defaultUser.length > 0) {
    return String(defaultUser[0].id);
  }

  return "user_demo_1";
}

export async function setSessionUser(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, String(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}

export async function clearSessionUser() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}