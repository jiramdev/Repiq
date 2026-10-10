// lib/validation.ts

/** An integer within [min, max], or null. Accepts numeric strings. */
export function toIntInRange(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/** A finite number within [min, max] (decimals allowed), or null. */
export function toNumberInRange(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Largest value of a Postgres `integer` (serial ids). */
export const MAX_INT4 = 2_147_483_647;

/** A positive database id, or null (rejects strings, floats and out-of-range values). */
export function toId(value: unknown): number | null {
  return toIntInRange(value, 1, MAX_INT4);
}

export const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeUsername(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/^@+/, "").trim().toLowerCase() : "";
}

export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export const LIMITS = {
  sets: { min: 1, max: 20 },
  reps: { min: 1, max: 100 },
  restSeconds: { min: 0, max: 900 },
  timerSeconds: { min: 5, max: 1800 },
  weight: { min: 0, max: 2000 },
  loggedReps: { min: 0, max: 1000 },
  bodyWeight: { min: 20, max: 700 },
  age: { min: 13, max: 120 },
  planTitle: 60,
  exerciseName: 80,
  name: 80,
} as const;
