-- ============================================================
-- Migration v3 — All new features
-- Run: psql -U infra_admin -h localhost -d infrastructure_inventory -f migrate_v3.sql
-- ============================================================

-- ── 1. Assets table additions ─────────────────────────────────────────────────
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS submitted_by  VARCHAR(200) DEFAULT '',
  ADD COLUMN IF NOT EXISTS hosted_ip     VARCHAR(50)  DEFAULT '',
  ADD COLUMN IF NOT EXISTS asset_tag     VARCHAR(50)  DEFAULT '';

-- Drop old hostname unique index (only IP must be unique now)
DROP INDEX IF EXISTS idx_assets_unique_hostname;

-- Keep IP unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_unique_ip
    ON assets (LOWER(ip_address)) WHERE ip_address IS NOT NULL AND ip_address <> '';

-- ── 2. Custom fields — add radio type support ─────────────────────────────────
ALTER TABLE custom_fields
  ALTER COLUMN field_type TYPE VARCHAR(50);

-- Update check constraint to include radio
ALTER TABLE custom_fields
  DROP CONSTRAINT IF EXISTS custom_fields_field_type_check;
ALTER TABLE custom_fields
  ADD CONSTRAINT custom_fields_field_type_check
    CHECK (field_type IN ('textbox','dropdown','toggle','radio'));

-- ── 3. Physical asset models lookup ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS physical_asset_models (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    manufacturer VARCHAR(100) DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW()
);

-- ── 4. Physical server details table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS physical_servers (
    id SERIAL PRIMARY KEY,
    asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
    hosted_ip VARCHAR(50) UNIQUE,
    model_id INTEGER REFERENCES physical_asset_models(id),
    serial_number VARCHAR(200) DEFAULT '',
    cores INTEGER DEFAULT 0,
    ram_gb INTEGER DEFAULT 0,
    total_disks INTEGER DEFAULT 0,
    oem_support_status BOOLEAN DEFAULT TRUE,
    rack_number VARCHAR(50) DEFAULT '',
    server_position VARCHAR(50) DEFAULT '',
    additional_notes TEXT DEFAULT '',
    custom_field_values JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ── 5. Physical server custom fields ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS physical_server_custom_fields (
    id SERIAL PRIMARY KEY,
    field_label VARCHAR(200) NOT NULL,
    field_key VARCHAR(100) NOT NULL UNIQUE,
    field_type VARCHAR(50) NOT NULL CHECK (field_type IN ('textbox','dropdown','toggle','radio')),
    field_options TEXT,
    field_group VARCHAR(100) DEFAULT 'General',
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ── 6. Asset tag ranges per department ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_tag_ranges (
    id SERIAL PRIMARY KEY,
    department_name VARCHAR(200) NOT NULL,
    range_start INTEGER NOT NULL,
    range_end INTEGER NOT NULL,
    prefix VARCHAR(20) DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Asset tags assignment table
CREATE TABLE IF NOT EXISTS asset_tags (
    id SERIAL PRIMARY KEY,
    tag_value VARCHAR(50) NOT NULL UNIQUE,
    department_name VARCHAR(200),
    asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
    is_used BOOLEAN DEFAULT FALSE,
    assigned_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ── 7. Extended inventory custom fields ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS extended_inventory_custom_fields (
    id SERIAL PRIMARY KEY,
    field_label VARCHAR(200) NOT NULL,
    field_key VARCHAR(100) NOT NULL UNIQUE,
    field_type VARCHAR(50) NOT NULL CHECK (field_type IN ('textbox','dropdown','toggle','radio')),
    field_options TEXT,
    field_group VARCHAR(100) DEFAULT 'General',
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ── 8. Extended inventory table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS extended_inventory (
    id SERIAL PRIMARY KEY,
    asset_name VARCHAR(200),
    ip_address VARCHAR(50),
    mac_address VARCHAR(50),
    asset_type VARCHAR(100),
    department_id INTEGER REFERENCES departments(id),
    assigned_user VARCHAR(200),
    location_id INTEGER REFERENCES locations(id),
    status VARCHAR(100) DEFAULT 'Active',
    description TEXT,
    submitted_by VARCHAR(200) DEFAULT '',
    custom_field_values JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- IP unique for extended inventory
CREATE UNIQUE INDEX IF NOT EXISTS idx_ext_inv_unique_ip
    ON extended_inventory (LOWER(ip_address))
    WHERE ip_address IS NOT NULL AND ip_address <> '';

-- ── 9. Seed physical asset models ────────────────────────────────────────────
INSERT INTO physical_asset_models (name, manufacturer) VALUES
  ('PowerEdge R640', 'Dell'),
  ('PowerEdge R740', 'Dell'),
  ('PowerEdge R750', 'Dell'),
  ('PowerEdge R840', 'Dell'),
  ('PowerEdge R940', 'Dell'),
  ('ProLiant DL360 Gen10', 'HPE'),
  ('ProLiant DL380 Gen10', 'HPE'),
  ('ProLiant DL360 Gen11', 'HPE'),
  ('ProLiant DL380 Gen11', 'HPE'),
  ('ThinkSystem SR650', 'Lenovo'),
  ('ThinkSystem SR630', 'Lenovo'),
  ('PowerEdge MX740c', 'Dell'),
  ('Cisco UCS C220', 'Cisco'),
  ('Cisco UCS C240', 'Cisco'),
  ('Custom Build', '')
ON CONFLICT DO NOTHING;

-- ── 10. Seed asset tag ranges ─────────────────────────────────────────────────
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

-- ── 11. Update departments to match tag ranges ────────────────────────────────
INSERT INTO departments (name) VALUES
  ('Platform Team'),
  ('Boston QA Team'),
  ('Toronto QA Team'),
  ('Bomgar Team'),
  ('Lab Team'),
  ('Architecture Team'),
  ('PM / Support / NEA / Other'),
  ('POC Team')
ON CONFLICT DO NOTHING;

-- ── 12. Page permissions — add new pages ─────────────────────────────────────
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

-- Verify
SELECT 'Migration v3 complete' AS status;
SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;
