-- ============================================================
-- Migration v4
-- 1. Move extended_inventory to its own PostgreSQL schema
-- 2. Add transfer tracking (ext → main inventory)
-- 3. Add agent icon url storage
-- ============================================================

-- ── 1. Create separate schema ─────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS ext_inv;

-- ── 2. Move tables into the new schema ───────────────────────────────────────
-- We recreate them in ext_inv schema with identical structure
-- then migrate data and create cross-schema relationships

CREATE TABLE IF NOT EXISTS ext_inv.items (
    id                  SERIAL PRIMARY KEY,
    asset_name          VARCHAR(200),
    ip_address          VARCHAR(50),
    mac_address         VARCHAR(50),
    asset_type          VARCHAR(100),
    department_id       INTEGER,   -- references public.departments(id) at app layer
    assigned_user       VARCHAR(200),
    location_id         INTEGER,   -- references public.locations(id) at app layer
    status              VARCHAR(100) DEFAULT 'Active',
    description         TEXT,
    submitted_by        VARCHAR(200) DEFAULT '',
    custom_field_values JSONB DEFAULT '{}',
    -- Transfer tracking
    transferred         BOOLEAN DEFAULT FALSE,
    transferred_at      TIMESTAMP,
    transferred_by      VARCHAR(200),
    main_asset_id       INTEGER,   -- references public.assets(id) once moved
    transfer_notes      TEXT,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
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

-- Transfer audit log
CREATE TABLE IF NOT EXISTS ext_inv.transfer_log (
    id                SERIAL PRIMARY KEY,
    ext_item_id       INTEGER NOT NULL,
    ext_asset_name    VARCHAR(200),
    ext_ip_address    VARCHAR(50),
    main_asset_id     INTEGER,
    transferred_by    VARCHAR(200),
    transfer_notes    TEXT,
    transferred_at    TIMESTAMP DEFAULT NOW()
);

-- ── 3. Migrate existing data from public.extended_inventory → ext_inv.items ──
INSERT INTO ext_inv.items (
    id, asset_name, ip_address, mac_address, asset_type,
    department_id, assigned_user, location_id, status,
    description, submitted_by, custom_field_values, created_at, updated_at
)
SELECT
    id, asset_name, ip_address, mac_address, asset_type,
    department_id, assigned_user, location_id, status,
    description, submitted_by,
    COALESCE(custom_field_values, '{}'),
    created_at, updated_at
FROM public.extended_inventory
ON CONFLICT DO NOTHING;

-- Sync the sequence
SELECT setval('ext_inv.items_id_seq', COALESCE((SELECT MAX(id) FROM ext_inv.items), 1));

-- Migrate custom fields
INSERT INTO ext_inv.custom_fields (
    id, field_label, field_key, field_type, field_options,
    field_group, is_active, sort_order, created_at, updated_at
)
SELECT
    id, field_label, field_key, field_type, field_options,
    COALESCE(field_group, 'General'), is_active, sort_order, created_at, updated_at
FROM public.extended_inventory_custom_fields
ON CONFLICT DO NOTHING;

SELECT setval('ext_inv.custom_fields_id_seq', COALESCE((SELECT MAX(id) FROM ext_inv.custom_fields), 1));

-- ── 4. Grant permissions to infra_admin on the new schema ────────────────────
GRANT USAGE ON SCHEMA ext_inv TO infra_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ext_inv TO infra_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ext_inv TO infra_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA ext_inv GRANT ALL ON TABLES TO infra_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA ext_inv GRANT ALL ON SEQUENCES TO infra_admin;

-- ── 5. Agent icon settings ────────────────────────────────────────────────────
INSERT INTO public.app_settings (setting_key, setting_value) VALUES
  ('me_agent_icon_url',     'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT3AFe-a8aK77Zql2otAeGAnPv14qXxHAkhzP6Ui1IrgA&s'),
  ('tenable_agent_icon_url','https://www.capterra.com/assets-bx-capterra/_next/image?url=https%3A%2F%2Fgdm-catalog-fmapi-prod.imgix.net%2FProductLogo%2F5c5a52bf-7df5-4ea3-98ef-6d51f8d80c6d.png&w=128&q=75')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW();

-- ── 6. Page permission for new transfer page ──────────────────────────────────
INSERT INTO public.user_page_permissions (user_id, page_key, is_visible)
SELECT u.id, 'transfer-to-inventory', TRUE
FROM public.users u
ON CONFLICT DO NOTHING;

-- ── Verification ──────────────────────────────────────────────────────────────
SELECT 'Migration v4 complete' AS status;
SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'ext_inv' ORDER BY tablename;
SELECT COUNT(*) AS migrated_items FROM ext_inv.items;
SELECT setting_key, LEFT(setting_value, 60) AS value_preview FROM public.app_settings WHERE setting_key LIKE '%agent%';
