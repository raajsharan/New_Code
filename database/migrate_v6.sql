-- ============================================================
-- Migration v6 — Add oem_status to assets table
-- Run: psql -U infra_admin -h localhost -d infrastructure_inventory -f migrate_v6.sql
-- ============================================================

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS oem_status VARCHAR(10) DEFAULT '' CHECK (oem_status IN ('','YES','NO','NA'));

-- Also add to ext_inv.items
ALTER TABLE ext_inv.items
  ADD COLUMN IF NOT EXISTS oem_status VARCHAR(10) DEFAULT '';

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ext_inv TO infra_admin;

SELECT 'Migration v6 complete — oem_status added to assets and ext_inv.items' AS status;
