// lib/password.ts
import bcrypt from "bcryptjs";

import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/password-rules";

export { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH };
const BCRYPT_COST = 12;

const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/** Passwords are trimmed everywhere, matching how existing accounts were stored. */
export function normalizePassword(raw: string): string {
  return (raw ?? "").trim();
}

export function validateNewPassword(raw: string): string | null {
  const password = normalizePassword(raw);
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function isBcryptHash(stored: string | null | undefined): boolean {
  return typeof stored === "string" && BCRYPT_PATTERN.test(stored);
}

export async function hashPassword(raw: string): Promise<string> {
  return bcrypt.hash(normalizePassword(raw), BCRYPT_COST);
}

// A real hash to compare against when there is nothing valid to check, so
// response time doesn't reveal which usernames are registered.
const DUMMY_HASH = "$2b$12$o05e0c04WIt8//3vzrvcHuRhCqNyTqUrnUSF4YfXD2nyldwfWKoKG";

/**
 * Checks a password against a stored bcrypt hash. Anything that isn't a bcrypt
 * hash (a missing value, or a leftover plain-text password that migration 0006
 * didn't convert) never matches.
 */
export async function verifyPassword(raw: string, stored: string | null | undefined): Promise<boolean> {
  const password = normalizePassword(raw);
  if (!isBcryptHash(stored)) {
    await bcrypt.compare(password, DUMMY_HASH).catch(() => false);
    return false;
  }
  if (!password) return false;
  return bcrypt.compare(password, stored as string);
}
