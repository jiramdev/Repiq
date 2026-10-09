// lib/auth.ts
import { sql } from "@/lib/db";

/**
 * Returns the active user ID.
 * If you have a session/cookie auth system, resolve it here.
 * Defaults to the unified profile entry in the database.
 */
export async function getActiveUserId(): Promise<string> {
  const profileRow = await sql`
    SELECT user_id 
    FROM user_profiles 
    ORDER BY updated_at DESC 
    LIMIT 1
  `;

  if (profileRow.length > 0 && profileRow[0].user_id) {
    return profileRow[0].user_id as string;
  }

  // Fallback to core users table if user_profiles is not yet populated
  const userRow = await sql`
    SELECT id::text AS user_id 
    FROM users 
    LIMIT 1
  `.catch(() => []);

  if (userRow.length > 0 && userRow[0].user_id) {
    return userRow[0].user_id as string;
  }

  return "user_demo_1";
}