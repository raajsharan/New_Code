const router = require('express').Router();
const bcrypt = require('bcrypt');
const pool   = require('../config/database');
const { auth, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit');

const PAGES = [
  // Main navigation
  'dashboard', 'asset-list', 'asset-list-add', 'asset-list-inventory',
  'ext-asset-list', 'ext-asset-list-add', 'ext-asset-list-inventory',
  'physical-assets', 'physical-server-list', 'configuration', 'report-builder',
  'software-deployment',
  // Asset config (admin)
  'custom-fields', 'physical-asset-custom-fields', 'extended-custom-fields',
  'column-config', 'transfer-to-inventory', 'dept-range-management',
  // Administration (admin)
  'users', 'password-control', 'branding', 'dashboard-icons', 'dashboard-compliance-config',
  'backup', 'email-notifications', 'audit-explorer', 'new-asset-import', 'excel-smart-import', 'import-audit-report',
];

// ── Helper: is the requester a superadmin? ────────────────────────────────────
const isSuperAdmin = (req) => req.user?.role === 'superadmin';

async function getUserSnapshot(userId) {
  const r = await pool.query(
    `SELECT id,username,email,full_name,role,is_active,created_at,updated_at
     FROM users WHERE id=$1`,
    [userId]
  );
  return r.rows[0] || null;
}

// ── GET /api/users — list users ───────────────────────────────────────────────
// Normal admins: exclude superadmin accounts
// Superadmin: sees everyone EXCEPT other superadmins (there's only one)
router.get('/', auth, requireAdmin, async (req, res) => {
  try {
    const q = isSuperAdmin(req)
      // Superadmin sees all users including admins (but not other superadmins)
      ? `SELECT id,username,email,full_name,role,is_active,created_at
         FROM users WHERE role != 'superadmin' ORDER BY created_at`
      // Regular admin sees only non-superadmin, non-admin users
      : `SELECT id,username,email,full_name,role,is_active,created_at
         FROM users WHERE role NOT IN ('superadmin') ORDER BY created_at`;
    res.json((await pool.query(q)).rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── POST /api/users/create ────────────────────────────────────────────────────
// Superadmin can create any role including admin
// Admin can only create readwrite/readonly
router.post('/create', auth, requireAdmin, async (req, res) => {
  try {
    const { username, email, password, full_name, role } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'username, email and password required' });
    // Validate role permissions
    if (role === 'superadmin') return res.status(403).json({ error: 'Cannot create superadmin accounts' });
    if (role === 'admin' && !isSuperAdmin(req)) return res.status(403).json({ error: 'Only superadmin can create admin accounts' });
    const ex = await pool.query('SELECT id FROM users WHERE username=$1 OR email=$2', [username, email]);
    if (ex.rows.length) return res.status(409).json({ error: 'User already exists' });
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      `INSERT INTO users (username,email,password_hash,full_name,role) VALUES ($1,$2,$3,$4,$5) RETURNING id,username,email,full_name,role,is_active`,
      [username, email, hash, full_name || username, role || 'readonly']
    );
    const u = r.rows[0];
    for (const p of PAGES) await pool.query('INSERT INTO user_page_permissions (user_id,page_key,is_visible) VALUES ($1,$2,TRUE) ON CONFLICT DO NOTHING', [u.id, p]);
    await pool.query('INSERT INTO password_visibility_settings (user_id,can_view_passwords) VALUES ($1,FALSE) ON CONFLICT DO NOTHING', [u.id]);

    try {
      await writeAuditLog({
        entityType: 'user',
        entityId: u.id,
        action: 'create',
        beforeState: null,
        afterState: u,
        user: req.user,
        req,
      });
    } catch (auditErr) {
      console.warn('Audit log write failed (user create):', auditErr.message);
    }

    res.status(201).json(u);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── PUT /api/users/:id — update role/status ───────────────────────────────────
// Superadmin: can change any user's role (except to superadmin)
// Admin: can change readwrite/readonly users only
router.put('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { role, is_active, full_name } = req.body;
    const beforeState = await getUserSnapshot(req.params.id);
    if (!beforeState) return res.status(404).json({ error: 'Not found' });
    // Block promoting/demoting to superadmin
    if (role === 'superadmin') return res.status(403).json({ error: 'Cannot set superadmin role' });
    // Check that target user is not superadmin (non-superadmin admins cannot touch admin users either)
    if (beforeState.role === 'superadmin') return res.status(403).json({ error: 'Cannot modify superadmin' });
    if (beforeState.role === 'admin' && !isSuperAdmin(req)) return res.status(403).json({ error: 'Only superadmin can modify admin users' });
    if (role === 'admin' && !isSuperAdmin(req)) return res.status(403).json({ error: 'Only superadmin can assign admin role' });
    const r = await pool.query(
      'UPDATE users SET role=$1,is_active=$2,full_name=$3,updated_at=NOW() WHERE id=$4 RETURNING id,username,email,full_name,role,is_active',
      [role, is_active, full_name, req.params.id]
    );

    try {
      await writeAuditLog({
        entityType: 'user',
        entityId: req.params.id,
        action: 'update',
        beforeState,
        afterState: r.rows[0] || null,
        user: req.user,
        req,
      });
    } catch (auditErr) {
      console.warn('Audit log write failed (user update):', auditErr.message);
    }

    res.json(r.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── DELETE /api/users/:id ──────────────────────────────────────────────────────
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
    const beforeState = await getUserSnapshot(req.params.id);
    if (!beforeState) return res.status(404).json({ error: 'Not found' });
    if (beforeState.role === 'superadmin') return res.status(403).json({ error: 'Cannot delete superadmin' });
    if (beforeState.role === 'admin' && !isSuperAdmin(req)) return res.status(403).json({ error: 'Only superadmin can delete admin users' });
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);

    try {
      await writeAuditLog({
        entityType: 'user',
        entityId: req.params.id,
        action: 'delete',
        beforeState,
        afterState: null,
        user: req.user,
        req,
      });
    } catch (auditErr) {
      console.warn('Audit log write failed (user delete):', auditErr.message);
    }

    res.json({ message: 'User deleted' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});


// ── PUT /api/users/:id/reset-password — admin resets any user's password ────
// Admin can reset readwrite/readonly users; superadmin can reset admin users too
router.put('/:id/reset-password', auth, requireAdmin, async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const beforeState = await getUserSnapshot(req.params.id);
    if (!beforeState) return res.status(404).json({ error: 'User not found' });
    if (beforeState.role === 'superadmin') return res.status(403).json({ error: 'Cannot reset superadmin password' });
    if (beforeState.role === 'admin' && !isSuperAdmin(req)) return res.status(403).json({ error: 'Only superadmin can reset admin passwords' });
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.params.id]);

    try {
      await writeAuditLog({
        entityType: 'user',
        entityId: req.params.id,
        action: 'reset-password',
        beforeState,
        afterState: { id: req.params.id, password_reset: true },
        user: req.user,
        req,
      });
    } catch (auditErr) {
      console.warn('Audit log write failed (user reset-password):', auditErr.message);
    }

    res.json({ message: 'Password reset successfully' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id/page-permissions', auth, requireAdmin, async (req, res) => {
  try {
    for (const [page_key, is_visible] of Object.entries(req.body.permissions || {})) {
      await pool.query(`INSERT INTO user_page_permissions (user_id,page_key,is_visible) VALUES ($1,$2,$3) ON CONFLICT (user_id,page_key) DO UPDATE SET is_visible=$3`, [req.params.id, page_key, is_visible]);
    }
    res.json({ message: 'Permissions updated' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id/password-visibility', auth, requireAdmin, async (req, res) => {
  try {
    await pool.query(`INSERT INTO password_visibility_settings (user_id,can_view_passwords) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET can_view_passwords=$2,updated_at=NOW()`, [req.params.id, req.body.can_view_passwords]);
    res.json({ message: 'Updated' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── GET /api/users/permissions/all ────────────────────────────────────────────
// Superadmin sees all users (excl. other superadmins); admins see non-superadmin/non-admin
router.get('/permissions/all', auth, requireAdmin, async (req, res) => {
  try {
    const q = isSuperAdmin(req)
      ? `SELECT id,username,email,full_name,role FROM users WHERE role != 'superadmin' ORDER BY id`
      : `SELECT id,username,email,full_name,role FROM users WHERE role NOT IN ('superadmin') ORDER BY id`;
    const users = (await pool.query(q)).rows;
    const result = [];
    for (const u of users) {
      const perms = (await pool.query('SELECT page_key,is_visible FROM user_page_permissions WHERE user_id=$1', [u.id])).rows;
      const pv    = (await pool.query('SELECT can_view_passwords FROM password_visibility_settings WHERE user_id=$1', [u.id])).rows;
      result.push({ ...u, page_permissions: perms, can_view_passwords: pv[0]?.can_view_passwords || false });
    }
    res.json(result);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;

