// lib/exercise-search.ts
// Search and ordering for the add-exercise picker. Pure, so it runs on the
// client as you type and is easy to test.
import type { ExerciseType } from "@/lib/exercise-types";

export interface PickerExercise {
  id: number;
  name: string;
  exercise_type: ExerciseType;
  default_sets: number;
  default_reps: number;
  default_seconds: number | null;
  default_rest_seconds: number;
  /** The user's own exercise (not the shared library). */
  own: boolean;
  /** Workouts in which the user logged it. */
  sessions: number;
  /** Plan rows of the user that use it. */
  plans: number;
  /** Last time it was logged (epoch ms), or null. */
  last_used: number | null;
}

/** "Pull-Up" → "pull up"; punctuation and case don't matter. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const compact = (s: string) => s.replace(/ /g, "");

function usageBoost(e: PickerExercise): number {
  return Math.min(e.sessions, 50) * 2 + Math.min(e.plans, 10) * 5 + (e.own ? 3 : 0);
}

/** Match score of a name for a query (0 = no match). */
export function matchScore(name: string, query: string): number {
  const n = normalizeName(name);
  const q = normalizeName(query);
  if (!q) return 1;
  if (!n) return 0;
  const nc = compact(n);
  const qc = compact(q);
  if (nc === qc) return 1000;
  if (n.startsWith(q) || nc.startsWith(qc)) return 600;
  const words = n.split(" ");
  const tokens = q.split(" ");
  // Every typed word starts a word of the name: "inc ben" → "Incline Bench Press".
  if (tokens.every((tok) => words.some((w) => w.startsWith(tok)))) return 400;
  if (nc.includes(qc)) return 200;
  return 0;
}

/** Results while typing: best match first, then the ones used most, then A–Z. */
export function searchExercises(items: PickerExercise[], query: string, limit = 30): PickerExercise[] {
  return items
    .map((e) => ({ e, score: matchScore(e.name, query) }))
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score + usageBoost(b.e) - (a.score + usageBoost(a.e)) || a.e.name.localeCompare(b.e.name)
    )
    .slice(0, limit)
    .map((x) => x.e);
}

/** Shown before typing: recently logged first, then the most used. */
export function recentExercises(items: PickerExercise[], limit = 6): PickerExercise[] {
  return items
    .filter((e) => e.sessions > 0 || e.plans > 0)
    .sort(
      (a, b) =>
        (b.last_used ?? 0) - (a.last_used ?? 0) ||
        b.sessions - a.sessions ||
        b.plans - a.plans ||
        a.name.localeCompare(b.name)
    )
    .slice(0, limit);
}

/** True when the query already names an exercise, so "Create" isn't offered. */
export function hasExactMatch(items: PickerExercise[], query: string): boolean {
  const q = compact(normalizeName(query));
  return q !== "" && items.some((e) => compact(normalizeName(e.name)) === q);
}
