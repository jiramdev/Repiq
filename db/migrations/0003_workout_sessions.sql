-- 0003_workout_sessions.sql
-- A workout (schedule day) can now be trained many times: each run is a
-- workout_session with its own logged sets. This allows more than one session
-- per day, keeps last week's sets as history instead of reusing them, and gives
-- the "Prev" hint a per-user source.

CREATE TABLE IF NOT EXISTS workout_sessions (
  id            bigserial PRIMARY KEY,
  user_id       text NOT NULL,
  workout_id    integer NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  plan_id       integer REFERENCES plans(id) ON DELETE SET NULL,
  plan_name     text NOT NULL,
  started_on    date NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  completed_on  date
);

-- At most one open (unfinished) session per schedule day.
CREATE UNIQUE INDEX IF NOT EXISTS workout_sessions_open_key
  ON workout_sessions (workout_id) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS workout_sessions_user_idx
  ON workout_sessions (user_id, completed_at DESC);

ALTER TABLE workout_logs
  ADD COLUMN IF NOT EXISTS session_id bigint REFERENCES workout_sessions(id) ON DELETE CASCADE;

-- Backfill: wrap the existing logs of every workout in one session.
INSERT INTO workout_sessions (user_id, workout_id, plan_id, plan_name, started_on, completed_at, completed_on)
SELECT
  w.user_id,
  w.id,
  w.plan_id,
  COALESCE(NULLIF(trim(w.name), ''), 'Workout'),
  COALESCE(cs.last_date, CURRENT_DATE),
  CASE WHEN w.completed THEN COALESCE(cs.last_date::timestamptz, now()) END,
  CASE WHEN w.completed THEN COALESCE(cs.last_date, CURRENT_DATE) END
FROM workouts w
LEFT JOIN LATERAL (
  SELECT max(c.completed_date) AS last_date
  FROM completed_sessions c
  WHERE c.workout_id = w.id
) cs ON true
WHERE EXISTS (
  SELECT 1 FROM workout_logs l WHERE l.workout_id = w.id AND l.session_id IS NULL
);

UPDATE workout_logs l
SET session_id = s.id
FROM workout_sessions s
WHERE l.session_id IS NULL
  AND s.workout_id = l.workout_id;

CREATE INDEX IF NOT EXISTS workout_logs_session_idx ON workout_logs (session_id);
CREATE INDEX IF NOT EXISTS workout_logs_exercise_idx ON workout_logs (lower(trim(exercise_name)));

-- The old page seeded sets with one INSERT per set and no guard, so a double
-- render could create duplicate rows. Remove duplicates that hold no data...
DELETE FROM workout_logs a
USING workout_logs b
WHERE a.session_id = b.session_id
  AND a.order_index IS NOT DISTINCT FROM b.order_index
  AND a.set_number = b.set_number
  AND a.id > b.id
  AND a.actual_weight IS NULL
  AND a.actual_reps IS NULL
  AND NOT COALESCE(a.completed, false);

-- ...then enforce one row per (session, exercise slot, set number).
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS workout_logs_session_slot_key
    ON workout_logs (session_id, order_index, set_number);
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'workout_logs still has duplicate (session_id, order_index, set_number) rows with data in them; unique index not created. Inspect with: SELECT session_id, order_index, set_number, array_agg(id) FROM workout_logs GROUP BY 1,2,3 HAVING count(*) > 1;';
END $$;

-- completed_sessions: allow several per day, but only one per workout_session.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'completed_sessions'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE completed_sessions DROP CONSTRAINT %I', r.conname);
  END LOOP;
  FOR r IN
    SELECT i.relname AS indexname
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    WHERE x.indrelid = 'completed_sessions'::regclass
      AND x.indisunique AND NOT x.indisprimary
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
  END LOOP;
END $$;

ALTER TABLE completed_sessions ADD COLUMN IF NOT EXISTS session_id bigint;
CREATE UNIQUE INDEX IF NOT EXISTS completed_sessions_session_key
  ON completed_sessions (session_id);
CREATE INDEX IF NOT EXISTS completed_sessions_user_date_idx
  ON completed_sessions (user_id, completed_date);
