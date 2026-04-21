-- ============================================================
-- Migration v5 — Add all Asset Inventory columns to ext_inv.items
-- Run AFTER migrate_v4.sql
-- psql -U infra_admin -h localhost -d infrastructure_inventory -f migrate_v5.sql
-- ============================================================

ALTER TABLE ext_inv.items
  ADD COLUMN IF NOT EXISTS vm_name                  VARCHAR(200) DEFAULT '',
  ADD COLUMN IF NOT EXISTS os_hostname              VARCHAR(200) DEFAULT '',
  ADD COLUMN IF NOT EXISTS asset_type_id            INTEGER,
  ADD COLUMN IF NOT EXISTS os_type_id               INTEGER,
  ADD COLUMN IF NOT EXISTS os_version_id            INTEGER,
  ADD COLUMN IF NOT EXISTS business_purpose         TEXT         DEFAULT '',
  ADD COLUMN IF NOT EXISTS server_status_id         INTEGER,
  ADD COLUMN IF NOT EXISTS me_installed_status      BOOLEAN      DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tenable_installed_status BOOLEAN      DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS patching_schedule_id     INTEGER,
  ADD COLUMN IF NOT EXISTS patching_type_id         INTEGER,
  ADD COLUMN IF NOT EXISTS server_patch_type_id     INTEGER,
  ADD COLUMN IF NOT EXISTS serial_number            VARCHAR(200) DEFAULT '',
  ADD COLUMN IF NOT EXISTS idrac_enabled            BOOLEAN      DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS idrac_ip                 VARCHAR(50)  DEFAULT '',
  ADD COLUMN IF NOT EXISTS eol_status               VARCHAR(50)  DEFAULT 'InSupport',
  ADD COLUMN IF NOT EXISTS asset_username           VARCHAR(200) DEFAULT '',
  ADD COLUMN IF NOT EXISTS asset_password           TEXT         DEFAULT '',
  ADD COLUMN IF NOT EXISTS hosted_ip                VARCHAR(50)  DEFAULT '',
  ADD COLUMN IF NOT EXISTS asset_tag                VARCHAR(50)  DEFAULT '',
  ADD COLUMN IF NOT EXISTS additional_remarks       TEXT         DEFAULT '';

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ext_inv TO infra_admin;
SELECT 'Migration v5 complete' AS status;
