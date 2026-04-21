const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpeg|jpg|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

const PAGES = ['dashboard','add-asset','asset-list','configuration','users','password-control','branding','custom-fields','database-setup','profile','dashboard-compliance-config','software-deployment'];

const sign = (user) =>
  jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

// ── Login ────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const r = await pool.query(
      'SELECT * FROM users WHERE (username=$1 OR email=$1) AND is_active=TRUE', [username]
    );
    if (!r.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = r.rows[0];
    if (!await bcrypt.compare(password, user.password_hash))
      return res.status(401).json({ error: 'Invalid credentials' });
    const [perms, pv] = await Promise.all([
      pool.query('SELECT page_key,is_visible FROM user_page_permissions WHERE user_id=$1', [user.id]),
      pool.query('SELECT can_view_passwords FROM password_visibility_settings WHERE user_id=$1', [user.id]),
    ]);
    res.json({
      token: sign(user),
      user: {
        id: user.id, username: user.username, email: user.email,
        full_name: user.full_name, role: user.role,
        first_name: user.first_name || '', last_name: user.last_name || '',
        job_role: user.job_role || '', profile_pic: user.profile_pic || '',
        page_permissions: perms.rows,
        can_view_passwords: user.role === 'superadmin'
          ? true
          : (pv.rows[0]?.can_view_passwords || false),
      }
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── Register ─────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, full_name } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: 'Username, email and password required' });
    const exists = await pool.query('SELECT id FROM users WHERE username=$1 OR email=$2', [username, email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Username or email already exists' });
    const hash = await bcrypt.hash(password, 10);
    const firstName = (full_name || username).split(' ')[0];
    const lastName  = (full_name || '').includes(' ') ? full_name.substring(full_name.indexOf(' ') + 1) : '';
    const r = await pool.query(
      `INSERT INTO users (username,email,password_hash,full_name,first_name,last_name,role)
       VALUES ($1,$2,$3,$4,$5,$6,'readonly')
       RETURNING id,username,email,full_name,first_name,last_name,role`,
      [username, email, hash, full_name || username, firstName, lastName]
    );
    const newUser = r.rows[0];
    for (const p of PAGES)
      await pool.query(
        'INSERT INTO user_page_permissions (user_id,page_key,is_visible) VALUES ($1,$2,TRUE) ON CONFLICT DO NOTHING',
        [newUser.id, p]
      );
    await pool.query(
      'INSERT INTO password_visibility_settings (user_id,can_view_passwords) VALUES ($1,FALSE) ON CONFLICT DO NOTHING',
      [newUser.id]
    );
    res.status(201).json({ token: sign(newUser), user: newUser });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── Get current user ─────────────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id,username,email,full_name,first_name,last_name,job_role,profile_pic,role,created_at
       FROM users WHERE id=$1`, [req.user.id]
    );
    const perms = await pool.query(
      'SELECT page_key,is_visible FROM user_page_permissions WHERE user_id=$1', [req.user.id]
    );
    const pv = await pool.query(
      'SELECT can_view_passwords FROM password_visibility_settings WHERE user_id=$1', [req.user.id]
    );
    const user = r.rows[0];
    res.json({
      ...user,
      first_name: user.first_name || '',
      last_name:  user.last_name  || '',
      job_role:   user.job_role   || '',
      profile_pic: user.profile_pic || '',
      page_permissions: perms.rows,
      can_view_passwords: user.role === 'superadmin'
        ? true
        : (pv.rows[0]?.can_view_passwords || false),
    });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── Update profile (name, job role) ──────────────────────────────────────────
router.put('/profile', auth, async (req, res) => {
  try {
    const { first_name, last_name, job_role } = req.body;
    const full_name = [first_name, last_name].filter(Boolean).join(' ') || req.user.username;
    await pool.query(
      `UPDATE users
       SET first_name=$1, last_name=$2, full_name=$3, job_role=$4, updated_at=NOW()
       WHERE id=$5`,
      [first_name || '', last_name || '', full_name, job_role || '', req.user.id]
    );
    const r = await pool.query(
      'SELECT id,username,email,full_name,first_name,last_name,job_role,profile_pic,role FROM users WHERE id=$1',
      [req.user.id]
    );
    res.json({ message: 'Profile updated', user: r.rows[0] });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── Upload profile picture ────────────────────────────────────────────────────
router.post('/profile/avatar', auth, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    await pool.query(
      'UPDATE users SET profile_pic=$1, updated_at=NOW() WHERE id=$2',
      [dataUrl, req.user.id]
    );
    res.json({ message: 'Avatar updated', profile_pic: dataUrl });
  } catch (e) { res.status(500).json({ error: e.message || 'Upload failed' }); }
});

// ── Remove profile picture ────────────────────────────────────────────────────
router.delete('/profile/avatar', auth, async (req, res) => {
  try {
    await pool.query("UPDATE users SET profile_pic='', updated_at=NOW() WHERE id=$1", [req.user.id]);
    res.json({ message: 'Avatar removed' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── Verify password (used for delete confirmations) ───────────────────────────
router.post('/verify-password', auth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });
    const r = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
    const valid = await bcrypt.compare(password, r.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });
    res.json({ valid: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── Change password ───────────────────────────────────────────────────────────
router.put('/change-password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
      return res.status(400).json({ error: 'Both current and new password required' });
    if (new_password.length < 6)
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    const r = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!await bcrypt.compare(current_password, r.rows[0].password_hash))
      return res.status(400).json({ error: 'Current password is incorrect' });
    const newHash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2', [newHash, req.user.id]);
    res.json({ message: 'Password changed successfully' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;

