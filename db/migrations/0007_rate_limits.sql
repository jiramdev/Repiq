-- 0007_rate_limits.sql
-- Fixed-window counters for rate limiting sign-in, sign-up and other
-- abuse-prone endpoints. Postgres-backed, so no extra service is needed.
-- Keys are hashed (no raw IPs or usernames are stored).

CREATE TABLE IF NOT EXISTS rate_limits (
  key           text        NOT NULL,
  window_start  timestamptz NOT NULL,
  count         integer     NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limits_expires_at_idx ON rate_limits (expires_at);

-- Old sessions are now cleaned up by the app; clear the backlog once.
DELETE FROM sessions WHERE expires_at < now();

-- Lock-in: fast lookup of a user's open (unfinished) workout session.
CREATE INDEX IF NOT EXISTS workout_sessions_open_user_idx
  ON workout_sessions (user_id) WHERE completed_at IS NULL;
