-- 0005_unique_identities.sql
-- Case-insensitive unique usernames and emails, so two sign-ups racing each
-- other can't both succeed. Skipped with a NOTICE if duplicates already exist.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM user_profiles WHERE username IS NOT NULL
    GROUP BY lower(trim(username)) HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Duplicate usernames found; unique index not created. Inspect with: SELECT lower(trim(username)), array_agg(user_id) FROM user_profiles GROUP BY 1 HAVING count(*) > 1;';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_key
      ON user_profiles (lower(trim(username)));
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_profiles WHERE email IS NOT NULL
    GROUP BY lower(trim(email)) HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Duplicate emails found; unique index not created. Inspect with: SELECT lower(trim(email)), array_agg(user_id) FROM user_profiles GROUP BY 1 HAVING count(*) > 1;';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_email_key
      ON user_profiles (lower(trim(email)));
  END IF;
END $$;
