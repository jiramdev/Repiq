// app/plans/[id]/types.ts
import type { ExerciseType } from "@/lib/exercise-types";

export interface Plan {
  id: number;
  title: string;
  exercise_count: number;
}

/** One exercise row of a plan, in plan order. */
export interface PlanExercise {
  id: number;
  exercise_id: number | null;
  name: string;
  exercise_type: ExerciseType;
  sets: number;
  /** Unused for static exercises. */
  reps: number;
  /** Static only: target hold in seconds. */
  target_seconds: number | null;
  rest_seconds: number;
}
