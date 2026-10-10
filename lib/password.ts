// lib/password.ts
import bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "crypto";

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

function constantTimeEquals(a: string, b: string): boolean {
  // Hash first so inputs of different lengths still compare in constant time.
  const da = createHash("sha256").update(a, "utf8").digest();
  const db = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(da, db);
}

// A real hash to compare against when the user doesn't exist, so response
// time doesn't reveal which usernames are registered.
const DUMMY_HASH = "$2b$12$o05e0c04WIt8//3vzrvcHuRhCqNyTqUrnUSF4YfXD2nyldwfWKoKG";

export async function verifyPassword(
  raw: string,
  stored: string | null | undefined
): Promise<{ ok: boolean; needsRehash: boolean }> {
  const password = normalizePassword(raw);

  if (!stored) {
    await bcrypt.compare(password, DUMMY_HASH).catch(() => false);
    return { ok: false, needsRehash: false };
  }

  if (isBcryptHash(stored)) {
    const ok = await bcrypt.compare(password, stored);
    return { ok, needsRehash: false };
  }

  // Legacy row: the password was stored as plain text. Accept it once and
  // tell the caller to replace it with a bcrypt hash.
  const ok = password.length > 0 && constantTimeEquals(password, stored);
  return { ok, needsRehash: ok };
}

export async function burnPasswordCheck(raw: string): Promise<void> {
  await verifyPassword(raw, null);
}
