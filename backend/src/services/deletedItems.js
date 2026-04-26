const pool = require('../config/database');

let initialized = false;

async function ensureTable() {
  if (initialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deleted_items (
      id           SERIAL PRIMARY KEY,
      source       VARCHAR(50)  NOT NULL,
      original_id  INTEGER      NOT NULL,
      original_data JSONB       NOT NULL,
      deleted_by   VARCHAR(200),
      deleted_at   TIMESTAMP    DEFAULT NOW()
    )
  `);
  initialized = true;
}

async function saveToDeletedItems(source, originalId, originalData, deletedBy) {
  try {
    await ensureTable();
    await pool.query(
      'INSERT INTO deleted_items (source, original_id, original_data, deleted_by) VALUES ($1,$2,$3,$4)',
      [source, originalId, JSON.stringify(originalData), deletedBy || null]
    );
  } catch (e) {
    console.warn('Failed to archive to deleted_items:', e.message);
  }
}

module.exports = { saveToDeletedItems, ensureTable };
