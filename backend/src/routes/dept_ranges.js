/**
 * /api/dept-ranges — Department + Asset-Tag Range Management
 */
const router = require('express').Router();
const pool   = require('../config/database');
const { auth, requireAdmin } = require('../middleware/auth');

// ── Helpers ───────────────────────────────────────────────────────────────────

// All used asset tags globally (from assets table)
async function getUsedTagsByDept() {
  const rows = await pool.query(`
    SELECT a.asset_tag, d.name AS dept_name
    FROM assets a
    JOIN departments d ON a.department_id = d.id
    WHERE a.asset_tag IS NOT NULL AND a.asset_tag != ''
  `);
  // Map: dept_name -> Set of used tag numbers
  const map = {};
  for (const r of rows.rows) {
    const n = parseInt(r.asset_tag);
    if (!isNaN(n)) {
      if (!map[r.dept_name]) map[r.dept_name] = new Set();
      map[r.dept_name].add(n);
    }
  }
  return map;
}

// Count assets per department
async function getDeptAssetCounts() {
  const rows = await pool.query(`
    SELECT d.id, d.name, COUNT(a.id)::int AS asset_count
    FROM departments d
    LEFT JOIN assets a ON a.department_id = d.id
    GROUP BY d.id, d.name
    ORDER BY d.name
  `);
  return rows.rows;
}

// Detect overlaps between ranges (excluding a specific range id)
function findOverlaps(ranges, excludeId = null) {
  const active = excludeId ? ranges.filter(r => r.id !== excludeId) : ranges;
  const overlaps = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      if (a.range_start < b.range_end && b.range_start < a.range_end) {
        overlaps.push({ a: a.department_name, b: b.department_name, range: `${Math.max(a.range_start,b.range_start)}–${Math.min(a.range_end,b.range_end)-1}` });
      }
    }
  }
  return overlaps;
}

// ── GET /api/dept-ranges — full list with stats ───────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const [rangesR, deptCountsR] = await Promise.all([
      pool.query('SELECT * FROM asset_tag_ranges ORDER BY range_start, department_name'),
      getDeptAssetCounts(),
    ]);
    const ranges      = rangesR.rows;
    const deptCounts  = Object.fromEntries(deptCountsR.map(d => [d.name.toLowerCase(), d.asset_count]));
    const usedByDept  = await getUsedTagsByDept();
    const overlaps    = findOverlaps(ranges);

    const enriched = ranges.map(r => {
      const total     = r.range_end - r.range_start;
      const usedSet   = usedByDept[r.department_name] || new Set();
      const usedCount = [...usedSet].filter(n => n >= r.range_start && n < r.range_end).length;
      return {
        ...r,
        total_slots:     total,
        used_count:      usedCount,
        available_count: total - usedCount,
        asset_count:     deptCounts[r.department_name.toLowerCase()] || 0,
        has_overlap:     overlaps.some(o => o.a === r.department_name || o.b === r.department_name),
      };
    });

    res.json({ ranges: enriched, overlaps });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── GET /api/dept-ranges/departments — all departments with range info ─────────
router.get('/departments', auth, async (req, res) => {
  try {
    const [deptsR, rangesR] = await Promise.all([
      getDeptAssetCounts(),
      pool.query('SELECT * FROM asset_tag_ranges ORDER BY range_start'),
    ]);
    const rangeByDept = {};
    for (const r of rangesR.rows) rangeByDept[r.department_name.toLowerCase()] = r;

    const result = deptsR.map(d => ({
      ...d,
      range: rangeByDept[d.name.toLowerCase()] || null,
    }));
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── GET /api/dept-ranges/tag-usage/:dept — show all tags used/available ───────
router.get('/tag-usage/:dept', auth, async (req, res) => {
  try {
    const deptName = decodeURIComponent(req.params.dept);
    const rangeR = await pool.query(
      'SELECT * FROM asset_tag_ranges WHERE LOWER(department_name)=LOWER($1) LIMIT 1',
      [deptName]
    );
    if (!rangeR.rows.length) return res.json({ found: false, tags: [] });
    const range = rangeR.rows[0];

    // Get all used tags in this range
    const usedR = await pool.query(`
      SELECT a.asset_tag, a.vm_name, a.os_hostname, a.id AS asset_id
      FROM assets a
      WHERE a.asset_tag IS NOT NULL AND a.asset_tag != ''
        AND CAST(a.asset_tag AS INTEGER) >= $1
        AND CAST(a.asset_tag AS INTEGER) < $2
    `, [range.range_start, range.range_end]).catch(() => ({ rows: [] }));

    const usedMap = {};
    for (const r of usedR.rows) {
      const n = parseInt(r.asset_tag);
      usedMap[n] = { asset_id: r.asset_id, vm_name: r.vm_name, os_hostname: r.os_hostname };
    }

    const tags = [];
    for (let n = range.range_start; n < range.range_end; n++) {
      const tag = String(n).padStart(4, '0');
      if (usedMap[n]) {
        tags.push({ tag, status: 'used', ...usedMap[n] });
      } else {
        tags.push({ tag, status: 'available' });
      }
    }

    res.json({
      found: true,
      range: { start: range.range_start, end: range.range_end },
      department_name: range.department_name,
      total: tags.length,
      used_count: usedR.rows.length,
      available_count: tags.length - usedR.rows.length,
      tags, // full list — frontend can paginate/filter
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── POST /api/dept-ranges — create or update range for a department ───────────
router.post('/', auth, requireAdmin, async (req, res) => {
  try {
    const { department_name, range_start, range_end } = req.body;
    if (!department_name) return res.status(400).json({ error: 'department_name required' });
    if (range_start === undefined || range_end === undefined) return res.status(400).json({ error: 'range_start and range_end required' });
    const s = parseInt(range_start), e = parseInt(range_end);
    if (isNaN(s) || isNaN(e)) return res.status(400).json({ error: 'Range values must be numeric' });
    if (s < 0 || e < 0) return res.status(400).json({ error: 'Range values must be non-negative' });
    if (s >= e) return res.status(400).json({ error: 'range_start must be less than range_end' });

    // Check existing range for this dept
    const existing = await pool.query(
      'SELECT * FROM asset_tag_ranges WHERE LOWER(department_name)=LOWER($1) LIMIT 1', [department_name]
    );

    if (existing.rows.length) {
      // Validate existing tags still fall within new range
      const conflictsR = await pool.query(`
        SELECT a.asset_tag, a.vm_name FROM assets a
        JOIN departments d ON a.department_id = d.id
        WHERE LOWER(d.name) = LOWER($1)
          AND a.asset_tag IS NOT NULL AND a.asset_tag != ''
          AND (CAST(a.asset_tag AS INTEGER) < $2 OR CAST(a.asset_tag AS INTEGER) >= $3)
      `, [department_name, s, e]).catch(() => ({ rows: [] }));

      if (conflictsR.rows.length > 0) {
        return res.status(409).json({
          error: `${conflictsR.rows.length} existing asset(s) have tags outside the new range`,
          conflicts: conflictsR.rows.slice(0, 10),
          conflict_count: conflictsR.rows.length,
        });
      }

      // Update
      const r = await pool.query(
        'UPDATE asset_tag_ranges SET range_start=$1, range_end=$2 WHERE id=$3 RETURNING *',
        [s, e, existing.rows[0].id]
      );
      return res.json({ ...r.rows[0], action: 'updated' });
    }

    // Insert new
    const r = await pool.query(
      'INSERT INTO asset_tag_ranges (department_name, range_start, range_end) VALUES ($1,$2,$3) RETURNING *',
      [department_name, s, e]
    );
    res.status(201).json({ ...r.rows[0], action: 'created' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── PUT /api/dept-ranges/:id — update by id ───────────────────────────────────
router.put('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { department_name, range_start, range_end, force } = req.body;
    const s = parseInt(range_start), e = parseInt(range_end);
    if (isNaN(s) || isNaN(e)) return res.status(400).json({ error: 'Range values must be numeric' });
    if (s < 0 || e < 0) return res.status(400).json({ error: 'Range values must be non-negative' });
    if (s >= e) return res.status(400).json({ error: 'range_start must be less than range_end' });

    // Check for asset conflicts (only if not force-overriding)
    if (!force) {
      const conflictsR = await pool.query(`
        SELECT a.asset_tag, a.vm_name FROM assets a
        JOIN departments d ON a.department_id = d.id
        WHERE LOWER(d.name) = LOWER($1)
          AND a.asset_tag IS NOT NULL AND a.asset_tag != ''
          AND (CAST(a.asset_tag AS INTEGER) < $2 OR CAST(a.asset_tag AS INTEGER) >= $3)
      `, [department_name, s, e]).catch(() => ({ rows: [] }));

      if (conflictsR.rows.length > 0) {
        return res.status(409).json({
          error: `${conflictsR.rows.length} existing asset(s) have tags outside the new range`,
          conflicts: conflictsR.rows.slice(0, 10),
          conflict_count: conflictsR.rows.length,
          can_force: true,
        });
      }
    }

    const r = await pool.query(
      'UPDATE asset_tag_ranges SET department_name=$1, range_start=$2, range_end=$3 WHERE id=$4 RETURNING *',
      [department_name, s, e, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Range not found' });
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── DELETE /api/dept-ranges/:id ───────────────────────────────────────────────
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const rangeR = await pool.query('SELECT * FROM asset_tag_ranges WHERE id=$1', [req.params.id]);
    if (!rangeR.rows.length) return res.status(404).json({ error: 'Not found' });
    const range = rangeR.rows[0];

    // Check assets using this dept
    const assetCount = await pool.query(`
      SELECT COUNT(*)::int AS cnt FROM assets a
      JOIN departments d ON a.department_id = d.id
      WHERE LOWER(d.name)=LOWER($1) AND a.asset_tag IS NOT NULL AND a.asset_tag != ''
    `, [range.department_name]);

    const cnt = assetCount.rows[0].cnt;
    if (cnt > 0 && !req.query.force) {
      return res.status(409).json({
        error: `${cnt} asset(s) are using tags in this range. Pass ?force=1 to delete anyway.`,
        asset_count: cnt,
        can_force: true,
      });
    }

    await pool.query('DELETE FROM asset_tag_ranges WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted', department_name: range.department_name });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── POST /api/dept-ranges/validate — check a proposed range before saving ─────
router.post('/validate', auth, async (req, res) => {
  try {
    const { department_name, range_start, range_end, exclude_id } = req.body;
    const s = parseInt(range_start), e = parseInt(range_end);
    const errors = [], warnings = [];

    if (isNaN(s) || isNaN(e))    errors.push('Range values must be numeric');
    else if (s < 0 || e < 0)     errors.push('Range values must be non-negative');
    else if (s >= e)              errors.push('Start must be less than End');

    if (errors.length) return res.json({ valid: false, errors, warnings });

    // Overlap check
    const all = await pool.query('SELECT * FROM asset_tag_ranges');
    const others = exclude_id
      ? all.rows.filter(r => r.id !== parseInt(exclude_id))
      : all.rows;

    for (const r of others) {
      if (r.range_start < e && s < r.range_end) {
        warnings.push(`Overlaps with ${r.department_name} (${r.range_start}–${r.range_end - 1})`);
      }
    }

    // Asset conflict check
    if (department_name) {
      const conflictsR = await pool.query(`
        SELECT COUNT(*)::int AS cnt FROM assets a
        JOIN departments d ON a.department_id = d.id
        WHERE LOWER(d.name)=LOWER($1)
          AND a.asset_tag IS NOT NULL AND a.asset_tag != ''
          AND (CAST(a.asset_tag AS INTEGER) < $2 OR CAST(a.asset_tag AS INTEGER) >= $3)
      `, [department_name, s, e]).catch(() => ({ rows: [{ cnt: 0 }] }));
      const cnt = conflictsR.rows[0].cnt;
      if (cnt > 0) errors.push(`${cnt} existing asset(s) in ${department_name} have tags outside this range`);
    }

    res.json({ valid: errors.length === 0, errors, warnings });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
