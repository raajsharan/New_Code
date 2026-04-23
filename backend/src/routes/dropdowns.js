const router = require('express').Router();
const pool = require('../config/database');
const { auth, requireWrite } = require('../middleware/auth');

const TABLES = {
  asset_types:'asset_types', os_types:'os_types', departments:'departments',
  server_status:'server_status', patching_schedules:'patching_schedules',
  patching_types:'patching_types', server_patch_types:'server_patch_types', locations:'locations'
};

router.get('/all', auth, async (req, res) => {
  try {
    const result = {};
    for (const [k, t] of Object.entries(TABLES)) result[k] = (await pool.query(`SELECT * FROM ${t} ORDER BY name`)).rows;
    result.os_versions = (await pool.query('SELECT * FROM os_versions ORDER BY os_type_id,name')).rows;
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/:table', auth, async (req, res) => {
  const t = TABLES[req.params.table];
  if (!t) return res.status(404).json({ error: 'Unknown table' });
  try { res.json((await pool.query(`SELECT * FROM ${t} ORDER BY name`)).rows); }
  catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/:table', auth, requireWrite, async (req, res) => {
  const t = TABLES[req.params.table];
  if (!t) return res.status(404).json({ error: 'Unknown table' });
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const r = await pool.query(`INSERT INTO ${t} (name) VALUES ($1) RETURNING *`, [name]);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:table/:id', auth, requireWrite, async (req, res) => {
  const t = TABLES[req.params.table];
  if (!t) return res.status(404).json({ error: 'Unknown table' });
  try {
    const r = await pool.query(`UPDATE ${t} SET name=$1 WHERE id=$2 RETURNING *`, [req.body.name, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:table/:id', auth, requireWrite, async (req, res) => {
  const t = TABLES[req.params.table];
  if (!t) return res.status(404).json({ error: 'Unknown table' });
  try {
    const r = await pool.query(`DELETE FROM ${t} WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (e) {
    if (e.code === '23503') return res.status(409).json({ error: 'Cannot delete: in use by assets' });
    res.status(500).json({ error: 'Server error' });
  }
});

// OS Versions
router.post('/os_versions/add', auth, requireWrite, async (req, res) => {
  try {
    const { os_type_id, name } = req.body;
    if (!os_type_id || !name) return res.status(400).json({ error: 'os_type_id and name required' });
    const r = await pool.query('INSERT INTO os_versions (os_type_id,name) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *', [os_type_id, name]);
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.put('/os_versions/:id', auth, requireWrite, async (req, res) => {
  try {
    const r = await pool.query('UPDATE os_versions SET name=$1,os_type_id=$2 WHERE id=$3 RETURNING *', [req.body.name, req.body.os_type_id, req.params.id]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/os_versions/:id', auth, requireWrite, async (req, res) => {
  try { await pool.query('DELETE FROM os_versions WHERE id=$1', [req.params.id]); res.json({ message: 'Deleted' }); }
  catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;