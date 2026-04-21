-- ============================================================
-- InfraInventory — Master Migration File
-- Applies all schema changes from v2 through v13
-- Safe to run on a fresh install (uses IF NOT EXISTS / IF EXISTS guards)
-- Safe to re-run on an existing install (idempotent)
--
-- Usage:
--   psql -U infra_admin -h localhost -d infrastructure_inventory -f migrate_all.sql
--
-- Run AFTER schema.sql has been applied.
-- ============================================================

\echo '>>> Starting InfraInventory master migration...'

-- ============================================================
-- [v2] Add field_group to custom_fields
-- ============================================================
\echo '--- v2: field_group on custom_fields'

ALTER TABLE custom_fields
  ADD COLUMN IF NOT EXISTS field_group VARCHAR(100) DEFAULT 'General';

UPDATE custom_fields
  SET field_group = 'General'
  WHERE field_group IS NULL OR field_group = '';

-- ============================================================
-- [v3] Physical servers, asset tags, extended inventory, radio fields
-- ============================================================
\echo '--- v3: physical servers, asset tags, extended inventory tables'

-- Radio type support on custom_fields
ALTER TABLE custom_fields
  ALTER COLUMN field_type TYPE VARCHAR(50);

ALTER TABLE custom_fields
  DROP CONSTRAINT IF EXISTS custom_fields_field_type_check;
ALTER TABLE custom_fields
  ADD CONSTRAINT custom_fields_field_type_check
    CHECK (field_type IN ('textbox','dropdown','toggle','radio'));

-- Assets table additions
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS submitted_by  VARCHAR(200) DEFAULT '',
  ADD COLUMN IF NOT EXISTS hosted_ip     VARCHAR(50)  DEFAULT '',
  ADD COLUMN IF NOT EXISTS asset_tag     VARCHAR(50)  DEFAULT '';

DROP INDEX IF EXISTS idx_assets_unique_hostname;
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_unique_ip
    ON assets (LOWER(ip_address))
    WHERE ip_address IS NOT NULL AND ip_address <> '';

-- Physical asset models lookup
CREATE TABLE IF NOT EXISTS physical_asset_models (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(200) NOT NULL UNIQUE,
    manufacturer VARCHAR(100) DEFAULT '',
    created_at   TIMESTAMP DEFAULT NOW()
);

-- Physical server details
CREATE TABLE IF NOT EXISTS physical_servers (
    id                 SERIAL PRIMARY KEY,
    asset_id           INTEGER REFERENCES assets(id) ON DELETE CASCADE,
    hosted_ip          VARCHAR(50) UNIQUE,
    model_id           INTEGER REFERENCES physical_asset_models(id),
    serial_number      VARCHAR(200) DEFAULT '',
    cores              INTEGER DEFAULT 0,
    ram_gb             INTEGER DEFAULT 0,
    total_disks        INTEGER DEFAULT 0,
    oem_support_status BOOLEAN DEFAULT TRUE,
    rack_number        VARCHAR(50) DEFAULT '',
    server_position    VARCHAR(50) DEFAULT '',
    additional_notes   TEXT DEFAULT '',
    custom_field_values JSONB DEFAULT '{}',
    created_at         TIMESTAMP DEFAULT NOW(),
    updated_at         TIMESTAMP DEFAULT NOW()
);

-- Physical server custom fields
CREATE TABLE IF NOT EXISTS physical_server_custom_fields (
    id           SERIAL PRIMARY KEY,
    field_label  VARCHAR(200) NOT NULL,
    field_key    VARCHAR(100) NOT NULL UNIQUE,
    field_type   VARCHAR(50)  NOT NULL CHECK (field_type IN ('textbox','dropdown','toggle','radio')),
    field_options TEXT,
    field_group  VARCHAR(100) DEFAULT 'General',
    is_active    BOOLEAN DEFAULT TRUE,
    sort_order   INTEGER DEFAULT 0,
    created_at   TIMESTAMP DEFAULT NOW(),
    updated_at   TIMESTAMP DEFAULT NOW()
);

-- Asset tag ranges per department
CREATE TABLE IF NOT EXISTS asset_tag_ranges (
    id              SERIAL PRIMARY KEY,
    department_name VARCHAR(200) NOT NULL,
    range_start     INTEGER NOT NULL,
    range_end       INTEGER NOT NULL,
    prefix          VARCHAR(20) DEFAULT '',
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Asset tags assignment
CREATE TABLE IF NOT EXISTS asset_tags (
    id              SERIAL PRIMARY KEY,
    tag_value       VARCHAR(50) NOT NULL UNIQUE,
    department_name VARCHAR(200),
    asset_id        INTEGER REFERENCES assets(id) ON DELETE SET NULL,
    is_used         BOOLEAN DEFAULT FALSE,
    assigned_at     TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Extended inventory custom fields (public schema — will be superseded by ext_inv.custom_fields in v4)
CREATE TABLE IF NOT EXISTS extended_inventory_custom_fields (
    id           SERIAL PRIMARY KEY,
    field_label  VARCHAR(200) NOT NULL,
    field_key    VARCHAR(100) NOT NULL UNIQUE,
    field_type   VARCHAR(50)  NOT NULL CHECK (field_type IN ('textbox','dropdown','toggle','radio')),
    field_options TEXT,
    field_group  VARCHAR(100) DEFAULT 'General',
    is_active    BOOLEAN DEFAULT TRUE,
    sort_order   INTEGER DEFAULT 0,
    created_at   TIMESTAMP DEFAULT NOW(),
    updated_at   TIMESTAMP DEFAULT NOW()
);

-- Extended inventory (public schema — will be migrated to ext_inv.items in v4)
CREATE TABLE IF NOT EXISTS extended_inventory (
    id                  SERIAL PRIMARY KEY,
    asset_name          VARCHAR(200),
    ip_address          VARCHAR(50),
    asset_type          VARCHAR(100),
    department_id       INTEGER REFERENCES departments(id),
    assigned_user       VARCHAR(200),
    location_id         INTEGER REFERENCES locations(id),
    status              VARCHAR(100) DEFAULT 'Active',
    description         TEXT,
    submitted_by        VARCHAR(200) DEFAULT '',
    custom_field_values JSONB DEFAULT '{}',
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ext_inv_unique_ip
    ON extended_inventory (LOWER(ip_address))
    WHERE ip_address IS NOT NULL AND ip_address <> '';

-- Seed physical asset models
INSERT INTO physical_asset_models (name, manufacturer) VALUES
  ('PowerEdge R640',       'Dell'),
  ('PowerEdge R740',       'Dell'),
  ('PowerEdge R750',       'Dell'),
  ('PowerEdge R840',       'Dell'),
  ('PowerEdge R940',       'Dell'),
  ('ProLiant DL360 Gen10', 'HPE'),
  ('ProLiant DL380 Gen10', 'HPE'),
  ('ProLiant DL360 Gen11', 'HPE'),
  ('ProLiant DL380 Gen11', 'HPE'),
  ('ThinkSystem SR650',    'Lenovo'),
  ('ThinkSystem SR630',    'Lenovo'),
  ('PowerEdge MX740c',     'Dell'),
  ('Cisco UCS C220',       'Cisco'),
  ('Cisco UCS C240',       'Cisco'),
  ('Custom Build',         '')
ON CONFLICT DO NOTHING;

-- Seed asset tag ranges
INSERT INTO asset_tag_ranges (department_name, range_start, range_end) VALUES
  ('IT Team',                        1,    1000),
  ('Platform Team',               1000,    2000),
  ('Boston QA Team',              2000,    4000),
  ('Toronto QA Team',             2000,    4000),
  ('Bomgar Team',                 2000,    4000),
  ('Support & Service',           4000,    5000),
  ('Lab Team',                    5000,    6000),
  ('Dev Team',                    6000,    7000),
  ('Architecture Team',           7000,    8000),
  ('PM / Support / NEA / Other',  8000,    8500),
  ('Security Team',               8501,    9000),
  ('POC Team',                    9000,    9500)
ON CONFLICT DO NOTHING;

-- Seed departments to match tag ranges
INSERT INTO departments (name) VALUES
  ('Platform Team'), ('Boston QA Team'), ('Toronto QA Team'),
  ('Bomgar Team'),   ('Lab Team'),       ('Architecture Team'),
  ('PM / Support / NEA / Other'), ('POC Team')
ON CONFLICT DO NOTHING;

-- Page permissions for new pages
INSERT INTO user_page_permissions (user_id, page_key, is_visible)
SELECT u.id, p.page_key, TRUE
FROM users u
CROSS JOIN (VALUES
  ('physical-assets'),
  ('physical-asset-custom-fields'),
  ('add-extended-inventory'),
  ('extended-inventory'),
  ('extended-custom-fields')
) AS p(page_key)
ON CONFLICT DO NOTHING;

-- ============================================================
-- [v4] Move ext inventory to its own schema, add transfer tracking
-- ============================================================
\echo '--- v4: ext_inv schema, transfer tracking'

CREATE SCHEMA IF NOT EXISTS ext_inv;

-- Items table in its own schema (no mac_address — removed in v10)
CREATE TABLE IF NOT EXISTS ext_inv.items (
    id                    SERIAL PRIMARY KEY,
    asset_name            VARCHAR(200),
    vm_name               VARCHAR(200) DEFAULT '',
    os_hostname           VARCHAR(200) DEFAULT '',
    ip_address            VARCHAR(50),
    asset_type            VARCHAR(100),
    asset_type_id         INTEGER,
    os_type_id            INTEGER,
    os_version_id         INTEGER,
    department_id         INTEGER,
    assigned_user         VARCHAR(200),
    location_id           INTEGER,
    business_purpose      TEXT         DEFAULT '',
    server_status_id      INTEGER,
    me_installed_status   BOOLEAN      DEFAULT FALSE,
    tenable_installed_status BOOLEAN   DEFAULT FALSE,
    patching_schedule_id  INTEGER,
    patching_type_id      INTEGER,
    server_patch_type_id  INTEGER,
    serial_number         VARCHAR(200) DEFAULT '',
    idrac_enabled         BOOLEAN      DEFAULT FALSE,
    idrac_ip              VARCHAR(50)  DEFAULT '',
    eol_status            VARCHAR(50)  DEFAULT 'InSupport',
    asset_username        VARCHAR(200) DEFAULT '',
    asset_password        TEXT         DEFAULT '',
    hosted_ip             VARCHAR(50)  DEFAULT '',
    asset_tag             VARCHAR(50)  DEFAULT '',
    oem_status            VARCHAR(10)  DEFAULT '',
    status                VARCHAR(100) DEFAULT 'Active',
    description           TEXT,
    additional_remarks    TEXT         DEFAULT '',
    submitted_by          VARCHAR(200) DEFAULT '',
    custom_field_values   JSONB        DEFAULT '{}',
    transferred           BOOLEAN      DEFAULT FALSE,
    transferred_at        TIMESTAMP,
    transferred_by        VARCHAR(200),
    main_asset_id         INTEGER,
    transfer_notes        TEXT,
    created_at            TIMESTAMP    DEFAULT NOW(),
    updated_at            TIMESTAMP    DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ext_inv_unique_ip
    ON ext_inv.items (LOWER(ip_address))
    WHERE ip_address IS NOT NULL AND ip_address <> '';

CREATE TABLE IF NOT EXISTS ext_inv.custom_fields (
    id            SERIAL PRIMARY KEY,
    field_label   VARCHAR(200) NOT NULL,
    field_key     VARCHAR(100) NOT NULL UNIQUE,
    field_type    VARCHAR(50)  NOT NULL CHECK (field_type IN ('textbox','dropdown','toggle','radio')),
    field_options TEXT,
    field_group   VARCHAR(100) DEFAULT 'General',
    is_active     BOOLEAN DEFAULT TRUE,
    sort_order    INTEGER DEFAULT 0,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ext_inv.transfer_log (
    id              SERIAL PRIMARY KEY,
    ext_item_id     INTEGER NOT NULL,
    ext_asset_name  VARCHAR(200),
    ext_ip_address  VARCHAR(50),
    main_asset_id   INTEGER,
    transferred_by  VARCHAR(200),
    transfer_notes  TEXT,
    transferred_at  TIMESTAMP DEFAULT NOW()
);

-- Migrate any existing data from old public schema tables
INSERT INTO ext_inv.items (
    id, asset_name, ip_address, asset_type,
    department_id, assigned_user, location_id, status,
    description, submitted_by, custom_field_values, created_at, updated_at
)
SELECT
    id, asset_name, ip_address, asset_type,
    department_id, assigned_user, location_id, status,
    description, submitted_by,
    COALESCE(custom_field_values, '{}'),
    created_at, updated_at
FROM public.extended_inventory
ON CONFLICT DO NOTHING;

SELECT setval('ext_inv.items_id_seq', COALESCE((SELECT MAX(id) FROM ext_inv.items), 1));

INSERT INTO ext_inv.custom_fields (
    id, field_label, field_key, field_type, field_options,
    field_group, is_active, sort_order, created_at, updated_at
)
SELECT
    id, field_label, field_key, field_type, field_options,
    COALESCE(field_group,'General'), is_active, sort_order, created_at, updated_at
FROM public.extended_inventory_custom_fields
ON CONFLICT DO NOTHING;

SELECT setval('ext_inv.custom_fields_id_seq', COALESCE((SELECT MAX(id) FROM ext_inv.custom_fields), 1));

-- Grant permissions
GRANT USAGE ON SCHEMA ext_inv TO infra_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ext_inv TO infra_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ext_inv TO infra_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA ext_inv GRANT ALL ON TABLES TO infra_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA ext_inv GRANT ALL ON SEQUENCES TO infra_admin;

-- Agent icon settings
INSERT INTO public.app_settings (setting_key, setting_value) VALUES
  ('me_agent_icon_url',     ''),
  ('tenable_agent_icon_url','')
ON CONFLICT (setting_key) DO NOTHING;

-- Transfer page permission
INSERT INTO public.user_page_permissions (user_id, page_key, is_visible)
SELECT u.id, 'transfer-to-inventory', TRUE
FROM public.users u
ON CONFLICT DO NOTHING;

-- ============================================================
-- [v5] Add full asset columns to ext_inv.items
-- (included above in v4 table definition — no-op on fresh install)
-- ============================================================
\echo '--- v5: asset columns on ext_inv.items (ALTER for existing installs)'

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

-- ============================================================
-- [v6] Add oem_status to assets and ext_inv.items
-- ============================================================
\echo '--- v6: oem_status column'

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS oem_status VARCHAR(10) DEFAULT ''
    CHECK (oem_status IN ('','YES','NO','NA'));

ALTER TABLE ext_inv.items
  ADD COLUMN IF NOT EXISTS oem_status VARCHAR(10) DEFAULT '';

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ext_inv TO infra_admin;

-- ============================================================
-- [v7] Store Add Asset field group layout in app_settings
-- ============================================================
\echo '--- v7: Add Asset field layout setting'

-- Fix physical_servers unique constraint
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

INSERT INTO app_settings (setting_key, setting_value) VALUES (
  'add_asset_field_layout',
  '{
    "vm_name":                  {"group":"Basic Information","sort":1},
    "os_hostname":              {"group":"Basic Information","sort":2},
    "ip_address":               {"group":"Basic Information","sort":3},
    "asset_type_id":            {"group":"Basic Information","sort":4},
    "os_type_id":               {"group":"Basic Information","sort":5},
    "os_version_id":            {"group":"Basic Information","sort":6},
    "assigned_user":            {"group":"Ownership","sort":1},
    "department_id":            {"group":"Ownership","sort":2},
    "business_purpose":         {"group":"Ownership","sort":3},
    "asset_tag":                {"group":"Ownership","sort":4},
    "server_status_id":         {"group":"Status & Patching","sort":1},
    "server_patch_type_id":     {"group":"Status & Patching","sort":2},
    "patching_schedule_id":     {"group":"Status & Patching","sort":3},
    "patching_type_id":         {"group":"Status & Patching","sort":4},
    "location_id":              {"group":"Status & Patching","sort":5},
    "eol_status":               {"group":"Status & Patching","sort":6},
    "me_installed_status":      {"group":"Agent Status","sort":1},
    "tenable_installed_status": {"group":"Agent Status","sort":2},
    "serial_number":            {"group":"Host Details","sort":1},
    "idrac_enabled":            {"group":"Host Details","sort":2},
    "idrac_ip":                 {"group":"Host Details","sort":3},
    "oem_status":               {"group":"Host Details","sort":4},
    "asset_username":           {"group":"Credentials","sort":1},
    "asset_password":           {"group":"Credentials","sort":2},
    "hosted_ip":                {"group":"Extended Info","sort":1},
    "additional_remarks":       {"group":"Extended Info","sort":2}
  }'
) ON CONFLICT (setting_key) DO UPDATE
    SET setting_value = EXCLUDED.setting_value, updated_at = NOW();

-- ============================================================
-- [v8] Add vm_name, department_id, location_id to physical_servers
-- ============================================================
\echo '--- v8: physical_servers location and department'

ALTER TABLE physical_servers
  ADD COLUMN IF NOT EXISTS vm_name       VARCHAR(300) DEFAULT '',
  ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS location_id   INTEGER REFERENCES locations(id);

-- ============================================================
-- [v9] Add superadmin role constraint (hidden system feature)
-- ============================================================
\echo '--- v9: superadmin role support'

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('superadmin','admin','readwrite','readonly'));

-- ============================================================
-- [v10] Remove mac_address from ext_inv.items
-- ============================================================
\echo '--- v10: remove mac_address from ext_inv.items'

ALTER TABLE ext_inv.items DROP COLUMN IF EXISTS mac_address;

-- ============================================================
-- v11: Backfill missing page_permission rows for all users
-- ============================================================
\echo '--- v11: backfill page permissions for all existing users'

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

  INSERT INTO password_visibility_settings (user_id, can_view_passwords)
  SELECT id, FALSE
  FROM users
  WHERE role NOT IN ('superadmin')
  ON CONFLICT (user_id) DO NOTHING;
END $$;

-- ============================================================
-- [v12] Audit logs for entity lifecycle tracking
-- ============================================================
\echo '--- v12: audit log table'

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(32) NOT NULL,
    before_json JSONB,
    after_json JSONB,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_username VARCHAR(200),
    ip_address VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_time
    ON audit_logs (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_time
    ON audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_time
    ON audit_logs (action, created_at DESC);

-- ============================================================
-- [v13] Add audit-explorer page permission
-- ============================================================
\echo '--- v13: audit explorer page permission'

INSERT INTO user_page_permissions (user_id, page_key, is_visible)
SELECT id, 'audit-explorer', TRUE
FROM users
WHERE role NOT IN ('superadmin')
ON CONFLICT (user_id, page_key) DO NOTHING;

-- ============================================================
-- Final grants and verification
-- ============================================================
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ext_inv TO infra_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ext_inv TO infra_admin;

\echo ''
\echo '>>> Migration complete. Summary of tables:'
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname IN ('public','ext_inv')
ORDER BY schemaname, tablename;
