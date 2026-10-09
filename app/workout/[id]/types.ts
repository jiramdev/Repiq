// app/workout/[id]/types.ts
export interface WorkoutDetail {
  id: number;
  sessionId: number;
  planId: number;
  name: string;
  day_label: string;
}

/** A set, with weights already converted to the user's unit. */
export interface WorkoutLog {
  id: number;
  exercise_name: string;
  set_number: number;
  target_reps: number | null;
  rest_seconds: number;
  actual_weight: number | null;
  actual_reps: number | null;
  completed: boolean;
  last_weight: number | null;
  last_reps: number | null;
}
