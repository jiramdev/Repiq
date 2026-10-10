// lib/session-token.ts
import { createHash, randomBytes } from "crypto";

export const SESSION_COOKIE = "repiq_session";
/** The pre-fix cookie that held a raw user id. Cleared on sight. */
export const LEGACY_SESSION_COOKIE = "repiq_session_user_id";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 180; // 180 days

/** 256 bits of randomness, URL-safe. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is stored in the database. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function looksLikeSessionToken(value: string | undefined | null): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
