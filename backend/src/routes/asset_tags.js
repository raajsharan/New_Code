const router = require('express').Router();
const pool   = require('../config/database');
const { auth } = require('../middleware/auth');

const DEPT_RANGES = {
  'IT Team':                       { start:    1, end:  1000 },
  'Platform Team':                 { start: 1000, end:  2000 },
  'Boston QA Team':                { start: 2000, end:  4000 },
  'Toronto QA Team':               { start: 2000, end:  4000 },
  'Bomgar Team':                   { start: 2000, end:  4000 },
  'Support & Service':             { start: 4000, end:  5000 },
  'Lab Team':                      { start: 5000, end:  6000 },
  'Dev Team':                      { start: 6000, end:  7000 },
  'Architecture Team':             { start: 7000, end:  8000 },
  'PM / Support / NEA / Other':    { start: 8000, end:  8500 },
  'PM / Support / NEA / Other Teams': { start: 8000, end: 8500 },
  'Security Team':                 { start: 8501, end:  9000 },
  'POC Team':                      { start: 9000, end:  9500 },
};

// Look up range for a dept name (case-insensitive, with DB fallback)
async function getRangeForDept(deptName) {
  // 1. Check hardcoded map first (fast path)
  for (const [key, range] of Object.entries(DEPT_RANGES)) {
    if (key.toLowerCase() === deptName.toLowerCase()) return range;
  }
  // 2. Fallback: DB lookup
  try {
    const r = await pool.query(
      'SELECT range_start, range_end FROM asset_tag_ranges WHERE LOWER(department_name)=LOWER($1) LIMIT 1',
      [deptName]
    );
    if (r.rows.length) return { start: r.rows[0].range_start, end: r.rows[0].range_end };
  } catch {}
  return null;
}

// Get all used tags globally (from assets table + asset_tags table)
async function getUsedTags(excludeAssetId = null) {
  const q = excludeAssetId
    ? `SELECT asset_tag FROM assets WHERE asset_tag IS NOT NULL AND asset_tag != '' AND id != $1`
    : `SELECT asset_tag FROM assets WHERE asset_tag IS NOT NULL AND asset_tag != ''`;
  const params = excludeAssetId ? [excludeAssetId] : [];
  const assetRows = await pool.query(q, params);

  // Also from asset_tags table if exists
  let extraRows = [];
  try {
    const r = await pool.query(`SELECT tag_value FROM asset_tags WHERE is_used = TRUE`);
    extraRows = r.rows.map(r => r.tag_value);
  } catch {}

  const used = new Set([
    ...assetRows.rows.map(r => r.asset_tag),
    ...extraRows,
  ]);
  return used;
}

// ── GET /api/asset-tags/ranges ─────────────────────────────────────────────
router.get('/ranges', auth, async (req, res) => {
  try {
    // Return merged: hardcoded + DB rows
    const dbRows = await pool.query('SELECT * FROM asset_tag_ranges ORDER BY range_start');
    const merged = [];
    const seen   = new Set();
    // Hardcoded first
    for (const [dept, range] of Object.entries(DEPT_RANGES)) {
      if (!seen.has(dept.toLowerCase())) {
        merged.push({ department_name: dept, range_start: range.start, range_end: range.end });
        seen.add(dept.toLowerCase());
      }
    }
    // DB extras
    for (const row of dbRows.rows) {
      if (!seen.has(row.department_name.toLowerCase())) {
        merged.push(row);
        seen.add(row.department_name.toLowerCase());
      }
    }
    res.json(merged);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── GET /api/asset-tags/department-stats?dept=<name>&exclude_asset_id=<id> ─
// Full stats for the Asset Tag Widget UI
router.get('/department-stats', auth, async (req, res) => {
  try {
    const { dept, exclude_asset_id } = req.query;
    if (!dept) return res.status(400).json({ error: 'dept required' });

    const range = await getRangeForDept(dept);
    if (!range) return res.json({ found: false, dept, range: null });

    const totalSlots = range.end - range.start;
    const usedAll    = await getUsedTags(exclude_asset_id ? parseInt(exclude_asset_id) : null);

    // Count used tags within this range
    let usedInRange = 0;
    const usedTagsInRange = new Set();
    for (const tag of usedAll) {
      const n = parseInt(tag);
      if (!isNaN(n) && n >= range.start && n < range.end) {
        usedInRange++;
        usedTagsInRange.add(n);
      }
    }

    const availableCount = totalSlots - usedInRange;

    // First 20 available tags for quick-pick chips
    const next20 = [];
    for (let n = range.start; n < range.end && next20.length < 20; n++) {
      if (!usedTagsInRange.has(n)) {
        next20.push(String(n).padStart(4, '0'));
      }
    }

    // Full available list (first 200 for dropdown)
    const available200 = [];
    for (let n = range.start; n < range.end && available200.length < 200; n++) {
      if (!usedTagsInRange.has(n)) {
        available200.push(String(n).padStart(4, '0'));
      }
    }

    res.json({
      found:          true,
      dept,
      range:          { start: range.start, end: range.end, label: `${String(range.start).padStart(4,'0')}–${String(range.end - 1).padStart(4,'0')}` },
      total_slots:    totalSlots,
      used_count:     usedInRange,
      available_count: availableCount,
      next_available: next20[0] || null,
      next_20:        next20,
      available:      available200,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── GET /api/asset-tags/available/:dept ─────────────────────────────────────
// Kept for backward-compat
router.get('/available/:dept', auth, async (req, res) => {
  try {
    const dept  = decodeURIComponent(req.params.dept);
    const range = await getRangeForDept(dept);
    if (!range) return res.json({ available: [], range: null, used_count: 0 });

    const used = await getUsedTags();
    const available = [];
    for (let n = range.start; n < range.end && available.length < 100; n++) {
      const tag4 = String(n).padStart(4, '0');
      if (!used.has(tag4) && !used.has(String(n))) available.push(tag4);
    }
    res.json({ available, range: { start: range.start, end: range.end }, used_count: used.size });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ── GET /api/asset-tags/validate ────────────────────────────────────────────
router.get('/validate', auth, async (req, res) => {
  try {
    const { tag, dept, exclude_asset_id } = req.query;
    if (!tag) return res.json({ valid: false, error: 'Tag required' });

    const padded = String(parseInt(tag)).padStart(4, '0');

    // Duplicate check across ALL assets
    const existing = exclude_asset_id
      ? await pool.query('SELECT id, vm_name FROM assets WHERE asset_tag=$1 AND id!=$2', [padded, exclude_asset_id])
      : await pool.query('SELECT id, vm_name FROM assets WHERE asset_tag=$1', [padded]);

    if (existing.rows.length) {
      return res.json({ valid: false, error: `Tag ${padded} is already assigned to "${existing.rows[0].vm_name || 'ID:' + existing.rows[0].id}"` });
    }

    // Range check
    if (dept) {
      const range = await getRangeForDept(dept);
      if (range) {
        const n = parseInt(tag);
        if (isNaN(n) || n < range.start || n >= range.end) {
          return res.json({
            valid: false,
            error: `Tag ${padded} is outside the allowed range ${range.start}–${range.end - 1} for ${dept}`,
          });
        }
      }
    }

    res.json({ valid: true, error: null, tag: padded });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
