-- Beijing Asset List table
-- Run once on the server: psql -U infra_admin -d infrastructure_inventory -f migrate_beijing.sql

CREATE TABLE IF NOT EXISTS beijing_assets (
  id                        SERIAL PRIMARY KEY,
  ip_address                VARCHAR(50) NOT NULL,
  vm_name                   VARCHAR(200),
  os_hostname               VARCHAR(200),
  asset_type                VARCHAR(100),
  os_type                   VARCHAR(100),
  os_version                VARCHAR(100),
  assigned_user             VARCHAR(200),
  department                VARCHAR(100),
  location                  VARCHAR(100),
  business_purpose          TEXT,
  server_status             VARCHAR(100),
  serial_number             VARCHAR(200),
  eol_status                VARCHAR(50),
  asset_tag                 VARCHAR(50),
  additional_remarks        TEXT,
  -- Asset Inventory parity fields
  idrac_enabled             BOOLEAN DEFAULT FALSE,
  idrac_ip                  VARCHAR(50),
  oem_status                VARCHAR(50),
  hosted_ip                 VARCHAR(50),
  asset_username            VARCHAR(200),
  asset_password            TEXT,
  me_installed_status       BOOLEAN DEFAULT FALSE,
  tenable_installed_status  BOOLEAN DEFAULT FALSE,
  patching_type             VARCHAR(100),
  server_patch_type         VARCHAR(100),
  patching_schedule         VARCHAR(100),
  custom_field_values       JSONB DEFAULT '{}',
  -- Import metadata
  import_source             VARCHAR(500),
  import_batch_id           UUID,
  imported_at               TIMESTAMP DEFAULT NOW(),
  -- Migration tracking
  is_migrated               BOOLEAN DEFAULT FALSE,
  migrated_at               TIMESTAMP,
  migrated_by               VARCHAR(200),
  migration_comment         TEXT,
  migrated_asset_id         INTEGER,
  -- Timestamps
  submitted_by              VARCHAR(200),
  created_at                TIMESTAMP DEFAULT NOW(),
  updated_at                TIMESTAMP DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_beijing_assets_ip      ON beijing_assets (LOWER(ip_address));
CREATE INDEX IF NOT EXISTS idx_beijing_assets_migrated ON beijing_assets (is_migrated);
CREATE INDEX IF NOT EXISTS idx_beijing_assets_batch    ON beijing_assets (import_batch_id);
