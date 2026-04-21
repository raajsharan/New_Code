const router = require('express').Router();
const pool = require('../config/database');
const { auth, requireWrite } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit');

const VALID_SCOPES = new Set(['asset', 'ext', 'report']);

function normalizeBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

async function canUseSavedViews(req) {
  if (req.user?.role === 'superadmin') return true;
  const r = await pool.query(
    `SELECT is_visible
     FROM user_page_permissions
     WHERE user_id=$1 AND page_key='saved-views'
     LIMIT 1`,
    [req.user.id]
  );
  if (!r.rows.length) return false;
  return !!r.rows[0].is_visible;
}

async function isAdminLike(req) {
  return req.user?.role === 'admin' || req.user?.role === 'superadmin';
}

// GET /api/saved-views?scope=asset
router.get('/', auth, async (req, res) => {
  try {
    const allowed = await canUseSavedViews(req);
    if (!allowed) return res.status(403).json({ error: 'Access denied for saved views' });

    const scope = String(req.query.scope || '').trim();
    if (!VALID_SCOPES.has(scope)) {
      return res.status(400).json({ error: 'Valid scope is required (asset|ext|report)' });
    }

    const r = await pool.query(
      `SELECT sv.id, sv.scope, sv.name, sv.owner_user_id, sv.is_shared, sv.config_json,
              sv.created_at, sv.updated_at, u.username AS owner_username
       FROM saved_views sv
       LEFT JOIN users u ON u.id = sv.owner_user_id
       WHERE sv.scope=$1 AND (sv.owner_user_id=$2 OR sv.is_shared=TRUE)
       ORDER BY sv.is_shared DESC, sv.updated_at DESC`,
      [scope, req.user.id]
    );
    res.json({ views: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/saved-views
router.post('/', auth, requireWrite, async (req, res) => {
  try {
    const allowed = await canUseSavedViews(req);
    if (!allowed) return res.status(403).json({ error: 'Access denied for saved views' });

    const { scope, name, is_shared, config_json } = req.body || {};
    if (!VALID_SCOPES.has(String(scope || ''))) {
      return res.status(400).json({ error: 'Valid scope is required (asset|ext|report)' });
    }
    if (!String(name || '').trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const shared = normalizeBool(is_shared);
    if (shared && !(await isAdminLike(req))) {
      return res.status(403).json({ error: 'Only admin can create shared views' });
    }

    const r = await pool.query(
      `INSERT INTO saved_views (scope, name, owner_user_id, is_shared, config_json)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [
        String(scope),
        String(name).trim(),
        req.user.id,
        shared,
        JSON.stringify(config_json || {}),
      ]
    );

    try {
      await writeAuditLog({
        entityType: 'saved_view',
        entityId: r.rows[0].id,
        action: 'create',
        beforeState: null,
        afterState: r.rows[0],
        user: req.user,
        req,
      });
    } catch (auditErr) {
      console.warn('Audit log write failed (saved view create):', auditErr.message);
    }

    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'View name already exists for this scope and owner' });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/saved-views/:id
router.put('/:id', auth, requireWrite, async (req, res) => {
  try {
    const allowed = await canUseSavedViews(req);
    if (!allowed) return res.status(403).json({ error: 'Access denied for saved views' });

    const before = await pool.query('SELECT * FROM saved_views WHERE id=$1', [req.params.id]);
    if (!before.rows.length) return res.status(404).json({ error: 'Saved view not found' });
    const row = before.rows[0];

    const admin = await isAdminLike(req);
    const owner = row.owner_user_id === req.user.id;
    if (!owner && !admin) return res.status(403).json({ error: 'Access denied' });

    // Shared views can only be edited by admin-like users.
    if (row.is_shared && !admin) return res.status(403).json({ error: 'Only admin can edit shared views' });

    const nextName = req.body.name !== undefined ? String(req.body.name || '').trim() : row.name;
    if (!nextName) return res.status(400).json({ error: 'name cannot be empty' });

    const nextShared = req.body.is_shared !== undefined ? normalizeBool(req.body.is_shared) : row.is_shared;
    if (nextShared && !admin) return res.status(403).json({ error: 'Only admin can set shared views' });

    const nextConfig = req.body.config_json !== undefined ? req.body.config_json : row.config_json;

    const updated = await pool.query(
      `UPDATE saved_views
       SET name=$1, is_shared=$2, config_json=$3, updated_at=NOW()
       WHERE id=$4
       RETURNING *`,
      [nextName, nextShared, JSON.stringify(nextConfig || {}), req.params.id]
    );

    try {
      await writeAuditLog({
        entityType: 'saved_view',
        entityId: req.params.id,
        action: 'update',
        beforeState: row,
        afterState: updated.rows[0] || null,
        user: req.user,
        req,
      });
    } catch (auditErr) {
      console.warn('Audit log write failed (saved view update):', auditErr.message);
    }

    res.json(updated.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'View name already exists for this scope and owner' });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/saved-views/:id
router.delete('/:id', auth, requireWrite, async (req, res) => {
  try {
    const allowed = await canUseSavedViews(req);
    if (!allowed) return res.status(403).json({ error: 'Access denied for saved views' });

    const before = await pool.query('SELECT * FROM saved_views WHERE id=$1', [req.params.id]);
    if (!before.rows.length) return res.status(404).json({ error: 'Saved view not found' });
    const row = before.rows[0];

    const admin = await isAdminLike(req);
    const owner = row.owner_user_id === req.user.id;
    if (!owner && !admin) return res.status(403).json({ error: 'Access denied' });
    if (row.is_shared && !admin) return res.status(403).json({ error: 'Only admin can delete shared views' });

    await pool.query('DELETE FROM saved_views WHERE id=$1', [req.params.id]);

    try {
      await writeAuditLog({
        entityType: 'saved_view',
        entityId: req.params.id,
        action: 'delete',
        beforeState: row,
        afterState: null,
        user: req.user,
        req,
      });
    } catch (auditErr) {
      console.warn('Audit log write failed (saved view delete):', auditErr.message);
    }

    res.json({ message: 'Deleted', id: req.params.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
