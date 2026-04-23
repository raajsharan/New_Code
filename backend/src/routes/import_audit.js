const router = require('express').Router();
const pool = require('../config/database');
const { auth, requireAdmin } = require('../middleware/auth');
const { ensureImportAuditTable } = require('../services/importAudit');

router.get('/', auth, requireAdmin, async (req, res) => {
  try {
    await ensureImportAuditTable();
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;
    const sourcePage = String(req.query.source_page || '').trim();
    const targetScope = String(req.query.target_scope || '').trim();

    const where = [];
    const params = [];
    let i = 1;

    if (sourcePage) {
      where.push(`source_page = $${i++}`);
      params.push(sourcePage);
    }
    if (targetScope) {
      where.push(`target_scope = $${i++}`);
      params.push(targetScope);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countQ = await pool.query(
      `SELECT COUNT(*)::int AS count FROM import_audit_reports ${whereSql}`,
      params
    );
    const dataQ = await pool.query(
      `SELECT id, source_page, target_scope, import_mode, total_count, success_count, failed_count, skipped_count,
              mapped_fields, unmapped_columns, reasons, created_by_user_id, created_by_username, created_at
       FROM import_audit_reports
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    );

    res.json({
      reports: dataQ.rows,
      total: countQ.rows[0]?.count || 0,
      page,
      limit,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load import audit report' });
  }
});

module.exports = router;