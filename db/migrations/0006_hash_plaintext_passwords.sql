-- 0006_hash_plaintext_passwords.sql
-- Hash every password that is still stored as plain text, so none remain at
-- rest. Until now they were only re-hashed when each user next signed in.
--
-- RUN THIS BEFORE DEPLOYING the code that ships with it: that code no longer
-- accepts plain-text passwords, so anyone still un-hashed couldn't sign in.
--
-- pgcrypto's bcrypt ($2a$, cost 12) is verified by bcryptjs in the app. The
-- value is trimmed first because the app trims passwords before checking them.
-- Safe to run more than once: rows that already hold a bcrypt hash are skipped.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE user_profiles
SET password_hash = crypt(trim(password_hash), gen_salt('bf', 12)),
    updated_at = now()
WHERE password_hash IS NOT NULL
  AND trim(password_hash) <> ''
  AND password_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$';

-- Blank values could never be used to sign in; make that explicit.
UPDATE user_profiles
SET password_hash = NULL, updated_at = now()
WHERE password_hash IS NOT NULL AND trim(password_hash) = '';
