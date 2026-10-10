// app/workout/[id]/types.ts
import type { ExerciseType } from "@/lib/exercise-types";
export interface WorkoutDetail {
  id: number;
  sessionId: number;
  /** null when the plan was deleted after the session started. */
  planId: number | null;
  name: string;
  day_label: string;
  /** "YYYY-MM-DD" the session was started (user's timezone). */
  startedOn: string;
  /** Started on an earlier day and still unfinished. */
  stale: boolean;
}

/** A set, with weights already converted to the user's unit. */
export interface WorkoutLog {
  id: number;
  exercise_name: string;
  /** Position of the exercise in the plan; groups sets even when names repeat. */
  order_index: number;
  set_number: number;
  target_reps: number | null;
  rest_seconds: number;
  actual_weight: number | null;
  actual_reps: number | null;
  /** weighted: weight + reps; bodyweight: reps; static: duration_seconds. */
  exercise_type: ExerciseType;
  /** static: target hold in seconds. */
  target_seconds: number | null;
  duration_seconds: number | null;
  completed: boolean;
  last_weight: number | null;
  last_reps: number | null;
  last_seconds: number | null;
}
