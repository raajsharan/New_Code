const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const r = await pool.query('SELECT id,username,email,full_name,role,is_active FROM users WHERE id=$1', [decoded.id]);
    if (!r.rows.length || !r.rows[0].is_active) return res.status(401).json({ error: 'Invalid session' });
    req.user = r.rows[0];
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
};

// Superadmin or admin access
const requireAdmin = (req, res, next) =>
  (req.user?.role === 'admin' || req.user?.role === 'superadmin')
    ? next()
    : res.status(403).json({ error: 'Admin access required' });

// Superadmin-only operations (managing admin users)
const requireSuperAdmin = (req, res, next) =>
  req.user?.role === 'superadmin'
    ? next()
    : res.status(403).json({ error: 'Super admin access required' });

const requireWrite = (req, res, next) =>
  req.user?.role === 'readonly' ? res.status(403).json({ error: 'Write access required' }) : next();

module.exports = { auth, requireAdmin, requireSuperAdmin, requireWrite };