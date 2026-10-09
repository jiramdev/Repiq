-- 0001_auth_sessions.sql
-- Server-side sessions. The cookie only carries a random token; the database
-- stores its SHA-256 hash, so a leaked database dump can't be replayed as cookies.
-- Passwords keep living in user_profiles.password_hash: existing plain-text
-- values are re-hashed with bcrypt automatically the next time each user logs in.

CREATE TABLE IF NOT EXISTS sessions (
  id          bigserial PRIMARY KEY,
  user_id     text NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  user_agent  text
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

-- Optional housekeeping you can run any time:
--   DELETE FROM sessions WHERE expires_at < now();
