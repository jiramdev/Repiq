-- 0010_workout_logs_nullable.sql
-- Align workout_logs with what the app expects. Databases that existed before
-- 0000_baseline (production) kept their original column definitions, because
-- the baseline only uses CREATE TABLE IF NOT EXISTS. There, target_reps is
-- NOT NULL, which made seeding a workout with a static hold fail, and
-- actual_weight/actual_reps have defaults, so every new set started out
-- "logged" (e.g. 0 kg x 10) instead of empty.
--
-- Safe to run more than once. Logged history is not touched; only unfinished
-- sets in still-open sessions that hold exactly the old default values are
-- cleared.

DO $$
DECLARE
  weight_default text;
  reps_default text;
BEGIN
  SELECT column_default INTO weight_default FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'workout_logs' AND column_name = 'actual_weight';
  SELECT column_default INTO reps_default FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'workout_logs' AND column_name = 'actual_reps';

  -- Open sessions only: unfinished sets still holding both column defaults
  -- were never typed in by anyone.
  IF weight_default IS NOT NULL AND reps_default IS NOT NULL THEN
    EXECUTE format(
      'UPDATE workout_logs l SET actual_weight = NULL, actual_reps = NULL
       FROM workout_sessions s
       WHERE s.id = l.session_id AND s.completed_at IS NULL
         AND NOT COALESCE(l.completed, false)
         AND l.actual_weight = (%s) AND l.actual_reps = (%s)',
      weight_default, reps_default);
  END IF;
END $$;

ALTER TABLE workout_logs ALTER COLUMN target_reps DROP NOT NULL;
ALTER TABLE workout_logs ALTER COLUMN rest_seconds DROP NOT NULL;
ALTER TABLE workout_logs ALTER COLUMN actual_weight DROP NOT NULL;
ALTER TABLE workout_logs ALTER COLUMN actual_reps DROP NOT NULL;
ALTER TABLE workout_logs ALTER COLUMN order_index DROP NOT NULL;
ALTER TABLE workout_logs ALTER COLUMN actual_weight DROP DEFAULT;
ALTER TABLE workout_logs ALTER COLUMN actual_reps DROP DEFAULT;
