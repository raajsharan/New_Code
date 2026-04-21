-- ============================================================
-- Migration: Add profile fields to users table
-- Run on existing installations
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name   VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name    VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS job_role     VARCHAR(200) DEFAULT '',
  ADD COLUMN IF NOT EXISTS profile_pic  TEXT         DEFAULT '';

-- Populate first_name from full_name for existing users (split on first space)
UPDATE users
SET
  first_name = SPLIT_PART(COALESCE(full_name,''), ' ', 1),
  last_name  = CASE
    WHEN POSITION(' ' IN COALESCE(full_name,'')) > 0
    THEN SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1)
    ELSE ''
  END
WHERE first_name = '' OR first_name IS NULL;

-- Verify
SELECT id, username, first_name, last_name, job_role, full_name
FROM users ORDER BY id;
