-- migrate_v11.sql
-- Backfill missing page_permission rows for all existing users.
-- Any page key not yet present for a user defaults to is_visible = TRUE.
-- This ensures superadmin's toggles in PasswordControlPage work for
-- pages that were added after initial user creation (backup, dashboard-icons,
-- email-notifications, column-config, etc.).

DO $$
DECLARE
  page_keys TEXT[] := ARRAY[
    'dashboard',
    'asset-list', 'asset-list-add', 'asset-list-inventory',
    'ext-asset-list', 'ext-asset-list-add', 'ext-asset-list-inventory',
    'physical-assets', 'physical-server-list',
    'configuration', 'report-builder',
    'custom-fields', 'physical-asset-custom-fields', 'extended-custom-fields',
    'column-config', 'transfer-to-inventory', 'dept-range-management',
    'users', 'password-control', 'branding', 'dashboard-icons',
    'backup', 'email-notifications', 'audit-explorer'
  ];
  pk TEXT;
BEGIN
  FOREACH pk IN ARRAY page_keys LOOP
    INSERT INTO user_page_permissions (user_id, page_key, is_visible)
    SELECT id, pk, TRUE
    FROM users
    WHERE role NOT IN ('superadmin')
    ON CONFLICT (user_id, page_key) DO NOTHING;
  END LOOP;

  -- Backfill password_visibility_settings for any users missing a row
  INSERT INTO password_visibility_settings (user_id, can_view_passwords)
  SELECT id, FALSE
  FROM users
  WHERE role NOT IN ('superadmin')
  ON CONFLICT (user_id) DO NOTHING;
END $$;
