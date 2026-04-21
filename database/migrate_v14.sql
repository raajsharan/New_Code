-- Tenable import tracking and IP storage

CREATE TABLE IF NOT EXISTS tenable_imports (
  id             SERIAL PRIMARY KEY,
  filename       VARCHAR(255) NOT NULL,
  imported_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  imported_at    TIMESTAMP DEFAULT NOW(),
  total_ips      INTEGER DEFAULT 0,
  new_ips        INTEGER DEFAULT 0,
  updated_ips    INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tenable_assets (
  id                   SERIAL PRIMARY KEY,
  ip_address           VARCHAR(50) NOT NULL,
  host_name            VARCHAR(255),
  name                 VARCHAR(255),
  display_mac_address  VARCHAR(255),
  ipv4_addresses       TEXT,
  last_observed        VARCHAR(100),
  operating_systems    TEXT,
  import_id            INTEGER REFERENCES tenable_imports(id) ON DELETE SET NULL,
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW(),
  CONSTRAINT tenable_assets_ip_unique UNIQUE (ip_address)
);

CREATE INDEX IF NOT EXISTS idx_tenable_assets_ip ON tenable_assets(ip_address);
