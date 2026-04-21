-- ============================================================
-- Migration v7 — Store Add Asset field group layout in app_settings
-- Run: psql -U infra_admin -h localhost -d infrastructure_inventory -f migrate_v7.sql
-- ============================================================

-- Add physical_servers UNIQUE constraint on hosted_ip if missing
ALTER TABLE physical_servers
  DROP CONSTRAINT IF EXISTS physical_servers_hosted_ip_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename='physical_servers' AND indexname='physical_servers_hosted_ip_key'
  ) THEN
    ALTER TABLE physical_servers ADD CONSTRAINT physical_servers_hosted_ip_key UNIQUE (hosted_ip);
  END IF;
END$$;

-- Store the field → group mapping for Add Asset form
INSERT INTO app_settings (setting_key, setting_value) VALUES (
  'add_asset_field_layout',
  '{
    "vm_name":                {"group":"Basic Information","sort":1},
    "os_hostname":            {"group":"Basic Information","sort":2},
    "ip_address":             {"group":"Basic Information","sort":3},
    "asset_type_id":          {"group":"Basic Information","sort":4},
    "os_type_id":             {"group":"Basic Information","sort":5},
    "os_version_id":          {"group":"Basic Information","sort":6},
    "assigned_user":          {"group":"Ownership","sort":1},
    "department_id":          {"group":"Ownership","sort":2},
    "business_purpose":       {"group":"Ownership","sort":3},
    "asset_tag":              {"group":"Ownership","sort":4},
    "server_status_id":       {"group":"Status & Patching","sort":1},
    "server_patch_type_id":   {"group":"Status & Patching","sort":2},
    "patching_schedule_id":   {"group":"Status & Patching","sort":3},
    "patching_type_id":       {"group":"Status & Patching","sort":4},
    "location_id":            {"group":"Status & Patching","sort":5},
    "eol_status":             {"group":"Status & Patching","sort":6},
    "me_installed_status":    {"group":"Agent Status","sort":1},
    "tenable_installed_status":{"group":"Agent Status","sort":2},
    "serial_number":          {"group":"Host Details","sort":1},
    "idrac_enabled":          {"group":"Host Details","sort":2},
    "idrac_ip":               {"group":"Host Details","sort":3},
    "oem_status":             {"group":"Host Details","sort":4},
    "asset_username":         {"group":"Credentials","sort":1},
    "asset_password":         {"group":"Credentials","sort":2},
    "hosted_ip":              {"group":"Extended Info","sort":1},
    "additional_remarks":     {"group":"Extended Info","sort":2}
  }'
) ON CONFLICT (setting_key) DO UPDATE
  SET setting_value = EXCLUDED.setting_value,
      updated_at    = NOW();

SELECT 'Migration v7 complete' AS status;
