// lib/exercise-types.ts
// Exercise types and their plan targets. Shared by the server (validation,
// seeding) and the client (plan editor, workout screen).
import { LIMITS, toIntInRange } from "@/lib/validation";

export const EXERCISE_TYPES = ["weighted", "bodyweight", "static"] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export function isExerciseType(value: unknown): value is ExerciseType {
  return typeof value === "string" && (EXERCISE_TYPES as readonly string[]).includes(value);
}

/** Unknown or missing types (old rows, old clients) behave as weighted. */
export function normalizeExerciseType(value: unknown): ExerciseType {
  return isExerciseType(value) ? value : "weighted";
}

/** Targets for one exercise in a plan. `reps` is unused for static, `seconds` only for static. */
export interface ExerciseTargets {
  type: ExerciseType;
  sets: number;
  reps: number | null;
  seconds: number | null;
  rest: number;
}

/** What a new exercise of each type starts with, so adding one is a single tap. */
export const TYPE_DEFAULTS: Record<ExerciseType, Omit<ExerciseTargets, "type">> = {
  weighted: { sets: 3, reps: 10, seconds: null, rest: 90 },
  bodyweight: { sets: 3, reps: 8, seconds: null, rest: 90 },
  static: { sets: 3, reps: null, seconds: 20, rest: 90 },
};

/**
 * A best guess of the type from a name, used to pre-select the type when a
 * custom exercise is created. Migration 0009 applies the same rules to the
 * shared library (a test keeps the two in sync).
 */
export const STATIC_NAME_PATTERN =
  "(plank|planche|front lever|back lever|l-sit|l sit|v-sit|hollow (body )?hold|dead hang|wall sit|handstand hold|human flag|isometric|\\mhold\\M)";
export const BODYWEIGHT_NAME_PATTERN =
  "(pull[- ]?ups?|chin[- ]?ups?|push[- ]?ups?|press[- ]?ups?|\\mdips?\\M|muscle[- ]?ups?|hspu|handstand push|pistol squat|inverted rows?|australian pull|burpees?|sit[- ]?ups?|hanging leg raises?|nordic curls?|air squats?|bodyweight|mountain climbers?|jumping jacks?|skin the cat|dragon flags?)";
export const LOADED_NAME_PATTERN = "(weighted|barbell|dumbbell|cable|machine|smith|kettlebell|banded)";

// The SQL patterns use Postgres word boundaries (\m, \M); JS uses \b.
const toJs = (pattern: string) => new RegExp(pattern.replace(/\\m|\\M/g, "\\b"), "i");
const STATIC_RE = toJs(STATIC_NAME_PATTERN);
const BODYWEIGHT_RE = toJs(BODYWEIGHT_NAME_PATTERN);
const LOADED_RE = toJs(LOADED_NAME_PATTERN);

export function guessExerciseType(name: string): ExerciseType {
  const n = name.toLowerCase().trim();
  if (!n || LOADED_RE.test(n)) return "weighted";
  if (STATIC_RE.test(n)) return "static";
  if (BODYWEIGHT_RE.test(n)) return "bodyweight";
  return "weighted";
}

/**
 * Validate plan targets for a type. Returns the cleaned targets (reps cleared
 * for static, seconds cleared for the others) or null.
 */
export function parseTargets(input: {
  type: unknown;
  sets: unknown;
  reps?: unknown;
  seconds?: unknown;
  rest: unknown;
}): ExerciseTargets | null {
  if (!isExerciseType(input.type)) return null;
  const type = input.type;
  const sets = toIntInRange(input.sets, LIMITS.sets.min, LIMITS.sets.max);
  const rest = toIntInRange(input.rest, LIMITS.restSeconds.min, LIMITS.restSeconds.max);
  if (sets === null || rest === null) return null;
  if (type === "static") {
    const seconds = toIntInRange(input.seconds, LIMITS.holdSeconds.min, LIMITS.holdSeconds.max);
    if (seconds === null) return null;
    return { type, sets, reps: null, seconds, rest };
  }
  const reps = toIntInRange(input.reps, LIMITS.reps.min, LIMITS.reps.max);
  if (reps === null) return null;
  return { type, sets, reps, seconds: null, rest };
}

/** "45s", "1:30" — compact duration for summaries and Prev hints. */
export function formatDuration(totalSeconds: number): string {
  const secs = Math.max(0, Math.round(totalSeconds));
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const r = secs % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}

/** Value for a time input: "45" below a minute, "1:30" above. */
export function durationInputValue(totalSeconds: number): string {
  const secs = Math.max(0, Math.round(totalSeconds));
  return secs < 60 ? String(secs) : formatDuration(secs);
}

/**
 * Parse a typed duration: seconds ("45") or minutes:seconds ("1:30").
 * Returns null for empty, undefined while it isn't a valid time (yet).
 */
export function parseDuration(raw: string): number | null | undefined {
  const cleaned = raw.trim().replace(".", ":");
  if (cleaned === "") return null;
  if (/^\d{1,4}$/.test(cleaned)) return Number(cleaned);
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(cleaned);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return undefined;
}
