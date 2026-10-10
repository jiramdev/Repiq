// lib/session-token.ts
import { createHash, randomBytes } from "crypto";

export const SESSION_COOKIE = "repiq_session";
/** The pre-fix cookie that held a raw user id. Cleared on sight. */
export const LEGACY_SESSION_COOKIE = "repiq_session_user_id";
/**
 * Sessions expire after 60 days without use. Each day the app is used, the
 * proxy pushes the expiry out again (sliding expiry).
 */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 60;
export const SESSION_RENEW_AFTER_SECONDS = 60 * 60 * 24;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};

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
