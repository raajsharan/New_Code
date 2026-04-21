-- ============================================================
-- Migration v9 — Super Admin role + initial super admin account
-- Run: psql -U infra_admin -h localhost -d infrastructure_inventory -f migrate_v9.sql
-- ============================================================

-- Extend the role check constraint to include 'superadmin'
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('superadmin','admin','readwrite','readonly'));

-- Create the super admin account (password: SuperAdmin@2024 — change after first login)
-- bcrypt hash for 'SuperAdmin@2024'
DO $$
DECLARE
  hashed TEXT := '$2b$10$YourHashHere'; -- Will be set by the script below
BEGIN
  -- Insert placeholder; actual hash must be set via the reset script
  INSERT INTO users (username, email, password_hash, full_name, role, is_active)
  VALUES ('superadmin', 'superadmin@infra.local', '$2b$10$placeholder', 'Super Administrator', 'superadmin', TRUE)
  ON CONFLICT (username) DO UPDATE
    SET role = 'superadmin', is_active = TRUE;
END $$;

SELECT 'Migration v9 complete — superadmin role added. Run the password reset script to set the password.' AS status;
