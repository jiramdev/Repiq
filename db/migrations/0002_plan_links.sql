-- 0002_plan_links.sql
-- Link schedule days to plans by id instead of by title, so renaming a plan no
-- longer breaks the schedule. Backfills plan_id from the existing title match.

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS plan_id integer REFERENCES plans(id) ON DELETE SET NULL;

-- Backfill: match by (user, trimmed lower-case title). If a user has two plans
-- with the same title, the oldest one wins.
UPDATE workouts w
SET plan_id = m.plan_id
FROM (
  SELECT DISTINCT ON (w2.id) w2.id AS workout_id, p.id AS plan_id
  FROM workouts w2
  JOIN plans p
    ON p.user_id = w2.user_id
   AND lower(trim(p.title)) = lower(trim(w2.name))
  WHERE w2.plan_id IS NULL
    AND w2.name IS NOT NULL
    AND lower(trim(w2.name)) <> 'rest'
  ORDER BY w2.id, p.id
) m
WHERE w.id = m.workout_id;

CREATE INDEX IF NOT EXISTS workouts_user_day_idx ON workouts (user_id, day_label);
CREATE INDEX IF NOT EXISTS workouts_plan_id_idx ON workouts (plan_id);
CREATE INDEX IF NOT EXISTS plans_user_id_idx ON plans (user_id);
CREATE INDEX IF NOT EXISTS plan_exercises_plan_id_idx ON plan_exercises (plan_id);
CREATE INDEX IF NOT EXISTS exercises_user_name_idx ON exercises (user_id, lower(trim(name)));

-- One schedule row per user per weekday. Only added when the data is already
-- clean; otherwise a NOTICE lists what to fix and the app keeps working
-- (it always picks the lowest id for a day).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM workouts GROUP BY user_id, day_label HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'workouts has duplicate (user_id, day_label) rows; unique index not created. Inspect with: SELECT user_id, day_label, array_agg(id) FROM workouts GROUP BY 1,2 HAVING count(*) > 1;';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS workouts_user_day_key ON workouts (user_id, day_label);
  END IF;
END $$;
