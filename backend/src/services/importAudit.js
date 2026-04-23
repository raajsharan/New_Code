const pool = require('../config/database');

let tableReady = false;

async function ensureImportAuditTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_audit_reports (
      id BIGSERIAL PRIMARY KEY,
      source_page VARCHAR(100) NOT NULL,
      target_scope VARCHAR(100) NOT NULL,
      import_mode VARCHAR(100) NOT NULL,
      total_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      mapped_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      unmapped_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
      reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by_user_id INTEGER,
      created_by_username VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_import_audit_reports_created_at
      ON import_audit_reports (created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_import_audit_reports_source_target
      ON import_audit_reports (source_page, target_scope)
  `);
  tableReady = true;
}

async function writeImportAuditReport({
  sourcePage,
  targetScope,
  importMode,
  totalCount = 0,
  successCount = 0,
  failedCount = 0,
  skippedCount = 0,
  mappedFields = [],
  unmappedColumns = [],
  reasons = [],
  user = null,
}) {
  await ensureImportAuditTable();
  const safeReasons = Array.isArray(reasons) ? reasons.slice(0, 200) : [];
  await pool.query(
    `INSERT INTO import_audit_reports (
      source_page, target_scope, import_mode, total_count,
      success_count, failed_count, skipped_count,
      mapped_fields, unmapped_columns, reasons,
      created_by_user_id, created_by_username
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      sourcePage || 'unknown',
      targetScope || 'unknown',
      importMode || 'unknown',
      parseInt(totalCount, 10) || 0,
      parseInt(successCount, 10) || 0,
      parseInt(failedCount, 10) || 0,
      parseInt(skippedCount, 10) || 0,
      JSON.stringify(Array.isArray(mappedFields) ? mappedFields : []),
      JSON.stringify(Array.isArray(unmappedColumns) ? unmappedColumns : []),
      JSON.stringify(safeReasons),
      user?.id || null,
      user?.username || null,
    ]
  );
}

module.exports = {
  ensureImportAuditTable,
  writeImportAuditReport,
};