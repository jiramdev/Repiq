-- 0000_baseline.sql
-- Baseline schema for Repiq, reconstructed from the queries in the app code
-- (the production schema was created by hand in Neon and was never committed).
--
-- Every statement uses IF NOT EXISTS, so running this against the existing
-- production database is a no-op. On a fresh database it creates the tables
-- the later migrations build on. Compare with your Neon schema before relying
-- on it: column types here are best guesses where the code doesn't pin them.

CREATE TABLE IF NOT EXISTS users (
  id          text PRIMARY KEY,
  email       text,
  name        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id                   text PRIMARY KEY,
  name                      text,
  username                  text,
  email                     text,
  age                       integer,
  password_hash             text,
  unit_system               text NOT NULL DEFAULT 'kg',
  notify_workout_reminders  boolean NOT NULL DEFAULT false,
  notify_rest_day_alerts    boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plans (
  id              serial PRIMARY KEY,
  user_id         text NOT NULL,
  title           text NOT NULL,
  exercise_count  integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- user_id IS NULL means a shared library exercise visible to everyone.
CREATE TABLE IF NOT EXISTS exercises (
  id                    serial PRIMARY KEY,
  user_id               text,
  name                  text NOT NULL,
  default_sets          integer NOT NULL DEFAULT 3,
  default_reps          integer NOT NULL DEFAULT 10,
  default_rest_seconds  integer NOT NULL DEFAULT 90
);

CREATE TABLE IF NOT EXISTS plan_exercises (
  id            serial PRIMARY KEY,
  plan_id       integer NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  exercise_id   integer REFERENCES exercises(id) ON DELETE SET NULL,
  name          text NOT NULL,
  sets          integer NOT NULL DEFAULT 3,
  reps          integer NOT NULL DEFAULT 10,
  rest_seconds  integer DEFAULT 90
);

-- One row per user per weekday (day_label MON..SUN).
CREATE TABLE IF NOT EXISTS workouts (
  id              serial PRIMARY KEY,
  user_id         text NOT NULL,
  name            text,
  day_label       text,
  scheduled_date  date,
  exercise_count  integer NOT NULL DEFAULT 0,
  completed       boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS workout_logs (
  id             serial PRIMARY KEY,
  workout_id     integer NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_name  text NOT NULL,
  set_number     integer NOT NULL,
  target_reps    integer,
  rest_seconds   integer,
  actual_weight  numeric,
  actual_reps    integer,
  completed      boolean NOT NULL DEFAULT false,
  order_index    integer
);

CREATE TABLE IF NOT EXISTS completed_sessions (
  id              serial PRIMARY KEY,
  user_id         text NOT NULL,
  workout_id      integer,
  plan_name       text,
  completed_date  date NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS metrics (
  id           serial PRIMARY KEY,
  user_id      text NOT NULL,
  type         text NOT NULL,
  value        numeric NOT NULL,
  unit         text,
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          serial PRIMARY KEY,
  user_id     text NOT NULL,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
