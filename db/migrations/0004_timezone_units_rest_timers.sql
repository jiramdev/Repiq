-- 0004_timezone_units_rest_timers.sql

-- "Today" is computed in the user's timezone (detected from the browser at
-- sign-in, Europe/Amsterdam by default).
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Amsterdam';

-- Every logged weight remembers the unit it was entered in, so switching
-- kg <-> lbs converts for display without rounding drift.
ALTER TABLE workout_logs
  ADD COLUMN IF NOT EXISTS weight_unit text NOT NULL DEFAULT 'kg';

UPDATE metrics SET unit = 'kg' WHERE type = 'weight' AND unit IS NULL;

-- Scheduled rest-timer push notifications (delivered via Upstash QStash).
CREATE TABLE IF NOT EXISTS rest_timers (
  id                   uuid PRIMARY KEY,
  user_id              text NOT NULL,
  workout_id           integer,
  fire_at              timestamptz NOT NULL,
  provider_message_id  text,
  cancelled_at         timestamptz,
  sent_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rest_timers_pending_idx
  ON rest_timers (user_id) WHERE cancelled_at IS NULL AND sent_at IS NULL;

-- Optional housekeeping:
--   DELETE FROM rest_timers WHERE created_at < now() - interval '7 days';
