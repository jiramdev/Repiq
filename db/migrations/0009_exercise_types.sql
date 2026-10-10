-- 0009_exercise_types.sql
-- Exercise types: 'weighted' (weight + reps, the old behaviour), 'bodyweight'
-- (reps only) and 'static' (a timed hold). Adds the type and duration columns
-- to exercises, plan_exercises and workout_logs, plus plan_exercises.position
-- for reordering. Existing rows become 'weighted', except shared library
-- exercises (user_id IS NULL), which get a type guessed from their name (the
-- same rules as guessExerciseType() in lib/exercise-types.ts).
--
-- Safe to run twice: every step only touches rows that are still NULL, and the
-- constraints are created only when missing. Run it BEFORE deploying the code
-- that uses these columns.

-- exercises -------------------------------------------------------------------
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS exercise_type text;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS default_seconds integer;

UPDATE exercises
SET exercise_type = CASE
  WHEN user_id IS NULL AND name !~* '(weighted|barbell|dumbbell|cable|machine|smith|kettlebell|banded)' AND name ~* '(plank|planche|front lever|back lever|l-sit|l sit|v-sit|hollow (body )?hold|dead hang|wall sit|handstand hold|human flag|isometric|\mhold\M)' THEN 'static'
  WHEN user_id IS NULL AND name !~* '(weighted|barbell|dumbbell|cable|machine|smith|kettlebell|banded)' AND name ~* '(pull[- ]?ups?|chin[- ]?ups?|push[- ]?ups?|press[- ]?ups?|\mdips?\M|muscle[- ]?ups?|hspu|handstand push|pistol squat|inverted rows?|australian pull|burpees?|sit[- ]?ups?|hanging leg raises?|nordic curls?|air squats?|bodyweight|mountain climbers?|jumping jacks?|skin the cat|dragon flags?)' THEN 'bodyweight'
  ELSE 'weighted'
END
WHERE exercise_type IS NULL;

UPDATE exercises SET default_seconds = 20
WHERE exercise_type = 'static' AND default_seconds IS NULL;

ALTER TABLE exercises ALTER COLUMN exercise_type SET DEFAULT 'weighted';
ALTER TABLE exercises ALTER COLUMN exercise_type SET NOT NULL;

-- plan_exercises --------------------------------------------------------------
ALTER TABLE plan_exercises ADD COLUMN IF NOT EXISTS exercise_type text;
ALTER TABLE plan_exercises ADD COLUMN IF NOT EXISTS target_seconds integer;
ALTER TABLE plan_exercises ADD COLUMN IF NOT EXISTS position integer;

UPDATE plan_exercises SET exercise_type = 'weighted' WHERE exercise_type IS NULL;
ALTER TABLE plan_exercises ALTER COLUMN exercise_type SET DEFAULT 'weighted';
ALTER TABLE plan_exercises ALTER COLUMN exercise_type SET NOT NULL;

-- Keep today's order (by id) as the starting position.
UPDATE plan_exercises pe
SET position = o.pos
FROM (
  SELECT id, (row_number() OVER (PARTITION BY plan_id ORDER BY id) - 1)::int AS pos
  FROM plan_exercises
) o
WHERE o.id = pe.id AND pe.position IS NULL;

CREATE INDEX IF NOT EXISTS plan_exercises_plan_position_idx ON plan_exercises (plan_id, position);

-- workout_logs ----------------------------------------------------------------
ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS exercise_type text;
ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS target_seconds integer;
ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS duration_seconds integer;

UPDATE workout_logs SET exercise_type = 'weighted' WHERE exercise_type IS NULL;
ALTER TABLE workout_logs ALTER COLUMN exercise_type SET DEFAULT 'weighted';
ALTER TABLE workout_logs ALTER COLUMN exercise_type SET NOT NULL;

-- Allowed values ----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exercises_exercise_type_check') THEN
    ALTER TABLE exercises ADD CONSTRAINT exercises_exercise_type_check
      CHECK (exercise_type IN ('weighted', 'bodyweight', 'static'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_exercises_exercise_type_check') THEN
    ALTER TABLE plan_exercises ADD CONSTRAINT plan_exercises_exercise_type_check
      CHECK (exercise_type IN ('weighted', 'bodyweight', 'static'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_logs_exercise_type_check') THEN
    ALTER TABLE workout_logs ADD CONSTRAINT workout_logs_exercise_type_check
      CHECK (exercise_type IN ('weighted', 'bodyweight', 'static'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_logs_duration_check') THEN
    ALTER TABLE workout_logs ADD CONSTRAINT workout_logs_duration_check
      CHECK (duration_seconds IS NULL OR duration_seconds >= 0);
  END IF;
END $$;
