-- ============================================================
-- Migration v8 — Add vm_name, department_id, location_id to physical_servers
-- Run: psql -U infra_admin -h localhost -d infrastructure_inventory -f migrate_v8.sql
-- ============================================================

ALTER TABLE physical_servers
  ADD COLUMN IF NOT EXISTS vm_name       VARCHAR(300) DEFAULT '',
  ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS location_id   INTEGER REFERENCES locations(id);

SELECT 'Migration v8 complete — vm_name, department_id, location_id added to physical_servers' AS status;
