-- migrate_v13.sql
-- Add audit explorer page permission for non-superadmin users.

INSERT INTO user_page_permissions (user_id, page_key, is_visible)
SELECT id, 'audit-explorer', TRUE
FROM users
WHERE role NOT IN ('superadmin')
ON CONFLICT (user_id, page_key) DO NOTHING;
