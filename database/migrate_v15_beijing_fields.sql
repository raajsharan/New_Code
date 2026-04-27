-- migrate_v15_beijing_fields.sql
-- Add parity fields to beijing_assets matching the main Asset List schema
-- Safe to re-run (all statements use ADD COLUMN IF NOT EXISTS)

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

-- Ensure beijing_custom_fields exists and has field_options column
-- (handles tables created manually before migrate_beijing.sql was updated)
CREATE TABLE IF NOT EXISTS beijing_custom_fields (
  id            SERIAL PRIMARY KEY,
  field_key     VARCHAR(100) NOT NULL UNIQUE,
  field_label   VARCHAR(200) NOT NULL,
  field_type    VARCHAR(50)  NOT NULL DEFAULT 'text',
  field_options JSONB,
  is_active     BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

ALTER TABLE beijing_custom_fields
  ADD COLUMN IF NOT EXISTS field_options JSONB;
