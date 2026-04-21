const router = require('express').Router();
const pool = require('../config/database');
const { auth, requireAdmin } = require('../middleware/auth');

const ENTITY_TYPES = new Set([
  'asset',
  'ext_item',
  'user',
  'transfer',
]);

const ENTITY_PAGE_KEYS = {
  asset: ['asset-list', 'asset-list-inventory'],
  ext_item: ['ext-asset-list', 'ext-asset-list-inventory', 'extended-inventory'],
  user: ['users'],
  transfer: ['transfer-to-inventory', 'ext-asset-list', 'extended-inventory'],
};

async function canAccessEntityAudit(req, entityType) {
  const role = req.user?.role;
  if (role === 'superadmin') return true;

  // User account audit trails are admin-only.
  if (entityType === 'user' && role !== 'admin') return false;

  const allowedPageKeys = ENTITY_PAGE_KEYS[entityType] || [];
  if (!allowedPageKeys.length) return false;

  // If no per-page row exists yet, keep legacy behavior (visible by default).
  const r = await pool.query(
    `SELECT page_key, is_visible
     FROM user_page_permissions
     WHERE user_id=$1 AND page_key = ANY($2)`,
    [req.user.id, allowedPageKeys]
  );
  // Strict deny-by-default: explicit page visibility row is required.
  if (!r.rows.length) return false;
  return r.rows.some((row) => row.is_visible);
}

async function canAccessAuditExplorer(req) {
  if (req.user?.role === 'superadmin') return true;
  if (req.user?.role !== 'admin') return false;
  const r = await pool.query(
    `SELECT is_visible
     FROM user_page_permissions
     WHERE user_id=$1 AND page_key='audit-explorer'
     LIMIT 1`,
    [req.user.id]
  );
  if (!r.rows.length) return false;
  return !!r.rows[0].is_visible;
}

router.get('/', auth, requireAdmin, async (req, res) => {
  try {
    const allowed = await canAccessAuditExplorer(req);
    if (!allowed) return res.status(403).json({ error: 'Access denied for audit explorer' });

    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '25', 10), 1), 200);
    const offset = (page - 1) * limit;
    const order = String(req.query.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const conds = [];
    const params = [];
    let i = 1;

    const entityType = req.query.entity_type;
    const action = req.query.action;
    const actor = req.query.actor;
    const q = req.query.q;
    const from = req.query.from;
    const to = req.query.to;

    if (entityType) { conds.push(`entity_type = $${i++}`); params.push(entityType); }
    if (action) { conds.push(`action = $${i++}`); params.push(action); }
    if (actor) { conds.push(`actor_username ILIKE $${i++}`); params.push(`%${actor}%`); }
    if (q) {
      conds.push(`(
        entity_id ILIKE $${i} OR
        actor_username ILIKE $${i} OR
        action ILIKE $${i} OR
        entity_type ILIKE $${i}
      )`);
      params.push(`%${q}%`);
      i++;
    }
    if (from) { conds.push(`created_at >= $${i++}`); params.push(from); }
    if (to) { conds.push(`created_at < ($${i++}::timestamp + interval '1 day')`); params.push(to); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [countR, rowsR] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM audit_logs
         ${where}`,
        params
      ),
      pool.query(
        `SELECT
          id, entity_type, entity_id, action,
          before_json, after_json,
          actor_user_id, actor_username, ip_address, created_at
         FROM audit_logs
         ${where}
         ORDER BY created_at ${order}
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset]
      ),
    ]);

    res.json({
      total: countR.rows[0]?.count || 0,
      page,
      limit,
      logs: rowsR.rows,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:entityType/:entityId', auth, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;

    if (!ENTITY_TYPES.has(entityType)) {
      return res.status(400).json({ error: 'Unsupported entity type' });
    }
    const allowed = await canAccessEntityAudit(req, entityType);
    if (!allowed) return res.status(403).json({ error: 'Access denied for this audit entity' });

    const [countR, dataR] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM audit_logs
         WHERE entity_type=$1 AND entity_id=$2`,
        [entityType, String(entityId)]
      ),
      pool.query(
        `SELECT
          id, entity_type, entity_id, action,
          before_json, after_json,
          actor_user_id, actor_username, ip_address, created_at
         FROM audit_logs
         WHERE entity_type=$1 AND entity_id=$2
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [entityType, String(entityId), limit, offset]
      ),
    ]);

    res.json({
      entity_type: entityType,
      entity_id: String(entityId),
      total: countR.rows[0]?.count || 0,
      page,
      limit,
      logs: dataR.rows,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
