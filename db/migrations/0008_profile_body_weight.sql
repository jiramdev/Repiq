-- 0008_profile_body_weight.sql
-- Body weight is now asked at sign-up and shown in Account details. The
-- profile keeps the latest value (in the unit it was entered in); every change
-- is also logged in metrics, so Statistics shows the history.

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS body_weight numeric;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS body_weight_unit text;

-- Backfill from each user's latest logged weight.
UPDATE user_profiles p
SET body_weight = m.value, body_weight_unit = COALESCE(m.unit, 'kg')
FROM (
  SELECT DISTINCT ON (user_id) user_id, value, unit
  FROM metrics
  WHERE type = 'weight'
  ORDER BY user_id, recorded_at DESC, id DESC
) m
WHERE m.user_id = p.user_id AND p.body_weight IS NULL;
