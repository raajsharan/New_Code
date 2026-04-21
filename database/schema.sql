-- ============================================================
-- InfraInventory v2 — PostgreSQL Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- LOOKUP TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS asset_types (
    id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS os_types (
    id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS os_versions (
    id SERIAL PRIMARY KEY, os_type_id INTEGER NOT NULL REFERENCES os_types(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(os_type_id, name)
);
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS server_status (
    id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS patching_schedules (
    id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS patching_types (
    id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS server_patch_types (
    id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(200),
    role VARCHAR(20) NOT NULL DEFAULT 'readonly' CHECK (role IN ('admin','readwrite','readonly')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_page_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    page_key VARCHAR(100) NOT NULL,
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, page_key)
);
CREATE TABLE IF NOT EXISTS password_visibility_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    can_view_passwords BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- CUSTOM FIELDS & SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS custom_fields (
    id SERIAL PRIMARY KEY,
    field_label VARCHAR(200) NOT NULL,
    field_key VARCHAR(100) NOT NULL UNIQUE,
    field_type VARCHAR(50) NOT NULL CHECK (field_type IN ('textbox','dropdown','toggle')),
    field_options TEXT,
    field_group VARCHAR(100) DEFAULT 'General',
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS app_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- ASSETS (main table)
-- ============================================================
CREATE TABLE IF NOT EXISTS assets (
    id SERIAL PRIMARY KEY,
    vm_name VARCHAR(200),
    os_hostname VARCHAR(200),
    ip_address VARCHAR(50),
    asset_type_id INTEGER REFERENCES asset_types(id),
    os_type_id INTEGER REFERENCES os_types(id),
    os_version_id INTEGER REFERENCES os_versions(id),
    assigned_user VARCHAR(200),
    department_id INTEGER REFERENCES departments(id),
    business_purpose TEXT,
    server_status_id INTEGER REFERENCES server_status(id),
    me_installed_status BOOLEAN DEFAULT FALSE,
    tenable_installed_status BOOLEAN DEFAULT FALSE,
    patching_schedule_id INTEGER REFERENCES patching_schedules(id),
    patching_type_id INTEGER REFERENCES patching_types(id),
    server_patch_type_id INTEGER REFERENCES server_patch_types(id),
    location_id INTEGER REFERENCES locations(id),
    additional_remarks TEXT,
    serial_number VARCHAR(200),
    idrac_enabled BOOLEAN DEFAULT FALSE,
    idrac_ip VARCHAR(50),
    eol_status VARCHAR(50) DEFAULT 'InSupport' CHECK (eol_status IN ('InSupport','EOL','Decom')),
    asset_username VARCHAR(200),
    asset_password TEXT,
    custom_field_values JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Unique constraints to prevent duplicate IP / hostname
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_unique_ip
    ON assets (LOWER(ip_address)) WHERE ip_address IS NOT NULL AND ip_address <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_unique_hostname
    ON assets (LOWER(os_hostname)) WHERE os_hostname IS NOT NULL AND os_hostname <> '';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_assets_location   ON assets(location_id);
CREATE INDEX IF NOT EXISTS idx_assets_department ON assets(department_id);
CREATE INDEX IF NOT EXISTS idx_assets_status     ON assets(server_status_id);
CREATE INDEX IF NOT EXISTS idx_assets_patch_type ON assets(patching_type_id);

-- ============================================================
-- SEED DATA
-- ============================================================
INSERT INTO asset_types (name) VALUES ('VM'),('Physical Server') ON CONFLICT DO NOTHING;

INSERT INTO os_types (name) VALUES ('Linux'),('Windows'),('ESXi') ON CONFLICT DO NOTHING;

-- Linux versions
INSERT INTO os_versions (os_type_id, name)
SELECT id, v FROM os_types, (VALUES
  ('Ubuntu 20.04 LTS'),('Ubuntu 22.04 LTS'),('Ubuntu 24.04 LTS'),
  ('CentOS 7'),('CentOS 8 Stream'),('CentOS 9 Stream'),
  ('RHEL 7'),('RHEL 8'),('RHEL 9'),
  ('Debian 10'),('Debian 11'),('Debian 12'),
  ('AlmaLinux 8'),('AlmaLinux 9'),('Rocky Linux 8'),('Rocky Linux 9'),
  ('Oracle Linux 7'),('Oracle Linux 8'),('Oracle Linux 9'),
  ('SUSE Linux Enterprise 15'),('Amazon Linux 2'),('Amazon Linux 2023')
) AS v(v) WHERE os_types.name = 'Linux' ON CONFLICT DO NOTHING;

-- Windows versions
INSERT INTO os_versions (os_type_id, name)
SELECT id, v FROM os_types, (VALUES
  ('Windows Server 2008'),('Windows Server 2008 R2'),
  ('Windows Server 2012'),('Windows Server 2012 R2'),
  ('Windows Server 2016'),('Windows Server 2019'),
  ('Windows Server 2022'),('Windows Server 2025'),
  ('Windows 10 (21H2)'),('Windows 10 (22H2)'),
  ('Windows 11 (22H2)'),('Windows 11 (23H2)'),('Windows 11 (24H2)')
) AS v(v) WHERE os_types.name = 'Windows' ON CONFLICT DO NOTHING;

-- ESXi versions
INSERT INTO os_versions (os_type_id, name)
SELECT id, v FROM os_types, (VALUES
  ('ESXi 6.5'),('ESXi 6.7'),('ESXi 7.0'),('ESXi 7.0 U3'),
  ('ESXi 8.0'),('ESXi 8.0 U1'),('ESXi 8.0 U2')
) AS v(v) WHERE os_types.name = 'ESXi' ON CONFLICT DO NOTHING;

INSERT INTO departments (name) VALUES
  ('IT'),('DevOps'),('Security'),('Application Team'),
  ('Finance'),('HR'),('Operations'),('Beijing IT Team') ON CONFLICT DO NOTHING;

INSERT INTO server_status (name) VALUES
  ('Alive'),('Powered Off'),('Not Alive') ON CONFLICT DO NOTHING;

INSERT INTO patching_schedules (name) VALUES
  ('Weekly'),('Monthly'),('Quarterly'),('Ad-Hoc') ON CONFLICT DO NOTHING;

-- Extended patching types including all dashboard categories
INSERT INTO patching_types (name) VALUES
  ('Auto'),('Manual'),('Exception'),
  ('Beijing IT Team'),('EOL - No Patches'),
  ('Onboard Pending'),('On Hold') ON CONFLICT DO NOTHING;

INSERT INTO server_patch_types (name) VALUES
  ('Critical'),('Non-Critical'),('Test') ON CONFLICT DO NOTHING;

INSERT INTO locations (name) VALUES
  ('DC1'),('DC2'),('Azure'),('AWS'),('Branch Office'),('Beijing') ON CONFLICT DO NOTHING;

-- Default admin (password: admin123)
INSERT INTO users (username, email, password_hash, full_name, role)
VALUES ('admin','admin@infra.local',
  '$2b$10$placeholder_will_be_reset', 'System Administrator','admin')
ON CONFLICT (username) DO NOTHING;

-- App settings
INSERT INTO app_settings (setting_key, setting_value) VALUES
  ('app_name','InfraInventory'),
  ('company_name','Your Company'),
  ('logo_data',''),
  ('logo_filename',''),
  ('theme_color','#1e40af')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================
-- SAMPLE ASSETS (4 demo assets)
-- ============================================================
INSERT INTO assets (vm_name,os_hostname,ip_address,asset_type_id,os_type_id,os_version_id,
  assigned_user,department_id,business_purpose,server_status_id,
  me_installed_status,tenable_installed_status,patching_schedule_id,
  patching_type_id,server_patch_type_id,location_id,additional_remarks,
  serial_number,idrac_enabled,idrac_ip,eol_status,asset_username,asset_password)
SELECT 'PROD-WEB-01','prod-web-01.local','10.0.1.10',
  (SELECT id FROM asset_types WHERE name='VM'),
  (SELECT id FROM os_types WHERE name='Linux'),
  (SELECT id FROM os_versions WHERE name='Ubuntu 22.04 LTS'),
  'john.doe',(SELECT id FROM departments WHERE name='DevOps'),
  'Production Web Server','alive_id',
  TRUE,TRUE,
  (SELECT id FROM patching_schedules WHERE name='Monthly'),
  (SELECT id FROM patching_types WHERE name='Auto'),
  (SELECT id FROM server_patch_types WHERE name='Critical'),
  (SELECT id FROM locations WHERE name='DC1'),
  'Primary load-balanced web server','SRV-001-2023',FALSE,NULL,'InSupport','admin','SecurePass@123'
FROM (SELECT id AS alive_id FROM server_status WHERE name='Alive') t
WHERE NOT EXISTS (SELECT 1 FROM assets WHERE os_hostname='prod-web-01.local');

INSERT INTO assets (vm_name,os_hostname,ip_address,asset_type_id,os_type_id,os_version_id,
  assigned_user,department_id,business_purpose,server_status_id,
  me_installed_status,tenable_installed_status,patching_schedule_id,
  patching_type_id,server_patch_type_id,location_id,additional_remarks,
  serial_number,idrac_enabled,idrac_ip,eol_status,asset_username,asset_password)
SELECT 'DB-SERVER-01','db-01.local','10.0.1.20',
  (SELECT id FROM asset_types WHERE name='Physical Server'),
  (SELECT id FROM os_types WHERE name='Linux'),
  (SELECT id FROM os_versions WHERE name='RHEL 8'),
  'jane.smith',(SELECT id FROM departments WHERE name='IT'),
  'Primary PostgreSQL Database Server',t.alive_id,
  TRUE,TRUE,
  (SELECT id FROM patching_schedules WHERE name='Monthly'),
  (SELECT id FROM patching_types WHERE name='Manual'),
  (SELECT id FROM server_patch_types WHERE name='Critical'),
  (SELECT id FROM locations WHERE name='DC1'),
  'Hosts primary production database','SRV-002-2022',TRUE,'10.0.1.21','InSupport','dbadmin','DBAdmin@456'
FROM (SELECT id AS alive_id FROM server_status WHERE name='Alive') t
WHERE NOT EXISTS (SELECT 1 FROM assets WHERE os_hostname='db-01.local');

INSERT INTO assets (vm_name,os_hostname,ip_address,asset_type_id,os_type_id,os_version_id,
  assigned_user,department_id,business_purpose,server_status_id,
  me_installed_status,tenable_installed_status,patching_schedule_id,
  patching_type_id,server_patch_type_id,location_id,additional_remarks,
  eol_status,asset_username,asset_password)
SELECT 'WIN-APP-02','win-app-02.local','10.0.2.15',
  (SELECT id FROM asset_types WHERE name='VM'),
  (SELECT id FROM os_types WHERE name='Windows'),
  (SELECT id FROM os_versions WHERE name='Windows Server 2019'),
  'mike.wilson',(SELECT id FROM departments WHERE name='Application Team'),
  'Windows Application Server for ERP',t.alive_id,
  TRUE,FALSE,
  (SELECT id FROM patching_schedules WHERE name='Monthly'),
  (SELECT id FROM patching_types WHERE name='Exception'),
  (SELECT id FROM server_patch_types WHERE name='Non-Critical'),
  (SELECT id FROM locations WHERE name='DC2'),
  'Hosts legacy ERP - patching exception approved',
  'InSupport','administrator','WinApp#789'
FROM (SELECT id AS alive_id FROM server_status WHERE name='Alive') t
WHERE NOT EXISTS (SELECT 1 FROM assets WHERE os_hostname='win-app-02.local');

INSERT INTO assets (vm_name,os_hostname,ip_address,asset_type_id,os_type_id,os_version_id,
  assigned_user,department_id,business_purpose,server_status_id,
  me_installed_status,tenable_installed_status,patching_schedule_id,
  patching_type_id,server_patch_type_id,location_id,additional_remarks,
  eol_status,asset_username,asset_password)
SELECT 'AZ-DEV-TEST-01','az-dev-test-01','172.16.0.5',
  (SELECT id FROM asset_types WHERE name='VM'),
  (SELECT id FROM os_types WHERE name='Linux'),
  (SELECT id FROM os_versions WHERE name='Ubuntu 20.04 LTS'),
  'sara.dev',(SELECT id FROM departments WHERE name='DevOps'),
  'Development and Testing Environment',t.off_id,
  FALSE,FALSE,
  (SELECT id FROM patching_schedules WHERE name='Weekly'),
  (SELECT id FROM patching_types WHERE name='Onboard Pending'),
  (SELECT id FROM server_patch_types WHERE name='Test'),
  (SELECT id FROM locations WHERE name='Azure'),
  'Non-production test environment - onboarding in progress',
  'EOL','devuser','DevTest@2024'
FROM (SELECT id AS off_id FROM server_status WHERE name='Powered Off') t
WHERE NOT EXISTS (SELECT 1 FROM assets WHERE os_hostname='az-dev-test-01');
