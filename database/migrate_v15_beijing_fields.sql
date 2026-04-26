-- migrate_v15_beijing_fields.sql
-- Add parity fields to beijing_assets matching the main Asset List schema

ALTER TABLE beijing_assets
  ADD COLUMN IF NOT EXISTS idrac_enabled            BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS idrac_ip                 VARCHAR(50),
  ADD COLUMN IF NOT EXISTS oem_status               VARCHAR(50),
  ADD COLUMN IF NOT EXISTS hosted_ip                VARCHAR(50),
  ADD COLUMN IF NOT EXISTS asset_username           VARCHAR(200),
  ADD COLUMN IF NOT EXISTS asset_password           TEXT,
  ADD COLUMN IF NOT EXISTS me_installed_status      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tenable_installed_status BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS patching_type            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS server_patch_type        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS patching_schedule        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS custom_field_values      JSONB DEFAULT '{}';
