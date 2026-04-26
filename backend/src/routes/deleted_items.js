const router  = require('express').Router();
const pool    = require('../config/database');
const extPool = require('../config/database').extPool;
const { auth, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { ensureTable } = require('../services/deletedItems');

// Ensure the table exists on first use
ensureTable().catch(e => console.warn('deleted_items init:', e.message));

// GET /api/deleted-items
router.get('/', auth, requireAdmin, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const source = (req.query.source || '').trim();
    const search = (req.query.search || '').trim();

    const params = [];
    const where  = [];
    let idx = 1;

    if (source) { where.push(`source = $${idx++}`); params.push(source); }
    if (search) {
      where.push(`(original_data::text ILIKE $${idx} OR deleted_by ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRes, dataRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM deleted_items ${clause}`, params),
      pool.query(
        `SELECT * FROM deleted_items ${clause} ORDER BY deleted_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
    ]);

    res.json({ items: dataRes.rows, total: parseInt(countRes.rows[0].count), page, limit });
  } catch (e) {
    if (e.code === '42P01') return res.json({ items: [], total: 0, page: 1, limit: 20 });
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/deleted-items/:id  (superadmin only — permanent erase)
router.delete('/:id', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM deleted_items WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) {
    if (e.code === '42P01') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: e.message });
  }
});

// POST /api/deleted-items/restore/:id  (admin+ — re-insert into original table)
router.post('/restore/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM deleted_items WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const item = rows[0];
    const data = item.original_data;

    const TABLE_MAP = {
      assets:             { pool,    table: 'assets' },
      beijing_assets:     { pool,    table: 'beijing_assets' },
      extended_inventory: { pool: extPool, table: 'items' },
      physical_assets:    { pool,    table: 'physical_servers' },
    };

    const mapping = TABLE_MAP[item.source];
    if (!mapping) return res.status(400).json({ error: `Unknown source: ${item.source}` });

    const SKIP = new Set(['id', 'created_at', 'updated_at']);
    const cols = Object.keys(data).filter(k => !SKIP.has(k) && data[k] !== null);
    if (!cols.length) return res.status(400).json({ error: 'No restorable data found' });

    const vals        = cols.map(k => data[k]);
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const { rows: ins } = await mapping.pool.query(
      `INSERT INTO ${mapping.table} (${cols.join(',')}) VALUES (${placeholders.join(',')}) RETURNING id`,
      vals
    );

    await pool.query('DELETE FROM deleted_items WHERE id=$1', [item.id]);
    res.json({ success: true, new_id: ins[0].id });
  } catch (e) {
    if (e.code === '42P01') return res.status(404).json({ error: 'Table not found' });
    if (e.code === '23505') return res.status(409).json({ error: 'Cannot restore — a record with the same key already exists' });
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
