const router  = require('express').Router();
const multer  = require('multer');
const xlsx    = require('xlsx');
const pool    = require('../config/database');
const extPool = pool.extPool;
const { auth, requireAdmin } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const IP_RE = /^(192\.168\.|10\.)\d{1,3}\.\d{1,3}$/;

function extractIPs(str) {
  if (!str) return [];
  return String(str).split(/[\s,;|]+/).map(s => s.trim()).filter(s => IP_RE.test(s));
}

function findCol(headers, ...terms) {
  for (const term of terms) {
    const t = term.toLowerCase();
    const i = headers.findIndex(h => h === t || h.includes(t));
    if (i >= 0) return i;
  }
  return -1;
}

// POST /api/tenable/import
router.post('/import', auth, requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File required' });
  try {
    const wb   = xlsx.read(req.file.buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (rows.length < 2) return res.status(400).json({ error: 'No data rows found in Excel' });

    const headers = rows[0].map(h => String(h || '').toLowerCase().trim());
    const col = {
      host: findCol(headers, 'dns name', 'host name', 'hostname', 'host'),
      name: headers.findIndex(h => h === 'name'),
      mac:  findCol(headers, 'mac address', 'display_mac_address', 'mac'),
      ip:   findCol(headers, 'ipv4 addresses', 'ipv4_addresses', 'ipv4', 'ip addresses', 'ip address', 'ip'),
      last: findCol(headers, 'last observed', 'last_observed', 'last seen', 'last'),
      os:   findCol(headers, 'operating systems', 'operating_systems', 'operating system', 'os name', 'os'),
    };

    if (col.ip < 0) {
      return res.status(400).json({ error: 'Cannot find IP column. Expected header containing "IPv4 Addresses", "IP Address", or similar.' });
    }

    const imp = await pool.query(
      'INSERT INTO tenable_imports (filename, imported_by) VALUES ($1,$2) RETURNING id',
      [req.file.originalname, req.user.id]
    );
    const importId = imp.rows[0].id;

    let newIPs = 0, updatedIPs = 0;
    const seen = new Set();

    for (let i = 1; i < rows.length; i++) {
      const row   = rows[i];
      const rawIP = String(row[col.ip] || '');
      const ips   = extractIPs(rawIP);
      for (const ip of ips) {
        if (seen.has(ip)) continue;
        seen.add(ip);
        const r = await pool.query(
          `INSERT INTO tenable_assets
             (ip_address, host_name, name, display_mac_address, ipv4_addresses, last_observed, operating_systems, import_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (ip_address) DO UPDATE SET
             host_name=EXCLUDED.host_name, name=EXCLUDED.name,
             display_mac_address=EXCLUDED.display_mac_address,
             ipv4_addresses=EXCLUDED.ipv4_addresses,
             last_observed=EXCLUDED.last_observed,
             operating_systems=EXCLUDED.operating_systems,
             import_id=EXCLUDED.import_id, updated_at=NOW()
           RETURNING (xmax=0) AS is_new`,
          [
            ip,
            col.host >= 0 ? String(row[col.host] || '') || null : null,
            col.name >= 0 ? String(row[col.name] || '') || null : null,
            col.mac  >= 0 ? String(row[col.mac]  || '') || null : null,
            rawIP || null,
            col.last >= 0 ? String(row[col.last] || '') || null : null,
            col.os   >= 0 ? String(row[col.os]   || '') || null : null,
            importId,
          ]
        );
        if (r.rows[0]?.is_new) newIPs++; else updatedIPs++;
      }
    }

    await pool.query(
      'UPDATE tenable_imports SET total_ips=$1, new_ips=$2, updated_ips=$3 WHERE id=$4',
      [seen.size, newIPs, updatedIPs, importId]
    );

    res.json({ success: true, import_id: importId, total_ips: seen.size, new_ips: newIPs, updated_ips: updatedIPs });
  } catch (err) {
    console.error('Tenable import:', err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

// GET /api/tenable/imports
router.get('/imports', auth, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ti.*, u.username AS imported_by_name
       FROM tenable_imports ti
       LEFT JOIN users u ON u.id = ti.imported_by
       ORDER BY ti.imported_at DESC LIMIT 100`
    );
    res.json(r.rows);
  } catch { res.status(500).json({ error: 'Failed to fetch imports' }); }
});

// DELETE /api/tenable/imports/:id
router.delete('/imports/:id', auth, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM tenable_imports WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Delete failed' }); }
});

// GET /api/tenable/total-ips
router.get('/total-ips', auth, async (req, res) => {
  try {
    const [cnt, latest] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM tenable_assets'),
      pool.query('SELECT imported_at, filename FROM tenable_imports ORDER BY imported_at DESC LIMIT 1'),
    ]);
    res.json({ total: parseInt(cnt.rows[0].count), latest_import: latest.rows[0] || null });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// GET /api/tenable/report
router.get('/report', auth, async (req, res) => {
  try {
    const [tenableR, assetsR, extR, locsR, deptsR] = await Promise.all([
      pool.query('SELECT * FROM tenable_assets'),
      pool.query(
        `SELECT a.id, COALESCE(a.vm_name,'') AS vm_name, COALESCE(a.os_hostname,'') AS os_hostname,
                a.ip_address, a.location_id, a.department_id,
                COALESCE(at.name,'') AS asset_type,
                COALESCE(l.name,'')  AS location,
                COALESCE(d.name,'')  AS department
         FROM assets a
         LEFT JOIN asset_types  at ON at.id = a.asset_type_id
         LEFT JOIN locations     l ON l.id  = a.location_id
         LEFT JOIN departments   d ON d.id  = a.department_id
         WHERE a.ip_address IS NOT NULL AND a.ip_address <> ''`
      ),
      extPool.query(
        `SELECT id, COALESCE(vm_name,'') AS vm_name, COALESCE(asset_name,'') AS asset_name,
                ip_address, COALESCE(asset_type,'') AS asset_type,
                location_id, department_id
         FROM items WHERE ip_address IS NOT NULL AND ip_address <> ''`
      ),
      pool.query('SELECT id, name FROM locations'),
      pool.query('SELECT id, name FROM departments'),
    ]);

    const locMap  = Object.fromEntries(locsR.rows.map(r  => [r.id, r.name]));
    const deptMap = Object.fromEntries(deptsR.rows.map(r => [r.id, r.name]));
    extR.rows.forEach(r => {
      r.location   = locMap[r.location_id]   || '';
      r.department = deptMap[r.department_id] || '';
    });

    const tenableMap       = new Map(tenableR.rows.map(r => [r.ip_address, r]));
    const matched          = [];
    const notInTenable     = [];
    const coveredTenableIPs = new Set();

    function processRows(rows, source) {
      for (const asset of rows) {
        const allIPs      = String(asset.ip_address || '').split(',').map(s => s.trim()).filter(Boolean);
        const relevantIPs = allIPs.filter(ip => IP_RE.test(ip));
        if (relevantIPs.length === 0) continue;

        const name       = asset.vm_name || asset.asset_name || asset.os_hostname || '';
        const matchedIPs = relevantIPs.filter(ip => tenableMap.has(ip));

        if (matchedIPs.length > 0) {
          for (const ip of matchedIPs) {
            const td = tenableMap.get(ip);
            coveredTenableIPs.add(ip);
            matched.push({
              source, asset_id: asset.id, name, raw_ips: asset.ip_address, matched_ip: ip,
              asset_type: asset.asset_type || '', location: asset.location || '', department: asset.department || '',
              tenable_host_name: td.host_name || '', tenable_name: td.name || '',
              tenable_mac: td.display_mac_address || '', tenable_last_observed: td.last_observed || '',
              tenable_os: td.operating_systems || '',
            });
          }
        } else {
          for (const ip of relevantIPs) {
            notInTenable.push({
              source, asset_id: asset.id, name, raw_ips: asset.ip_address, ip_address: ip,
              asset_type: asset.asset_type || '', location: asset.location || '', department: asset.department || '',
            });
          }
        }
      }
    }

    processRows(assetsR.rows, 'Asset Inventory');
    processRows(extR.rows,    'Ext. Asset Inventory');

    const tenableOnly = tenableR.rows
      .filter(t => !coveredTenableIPs.has(t.ip_address))
      .map(t => ({
        ip_address: t.ip_address, host_name: t.host_name || '', name: t.name || '',
        display_mac_address: t.display_mac_address || '', ipv4_addresses: t.ipv4_addresses || '',
        last_observed: t.last_observed || '', operating_systems: t.operating_systems || '',
      }));

    res.json({
      matched,
      not_in_tenable: notInTenable,
      tenable_only:   tenableOnly,
      summary: {
        total_tenable_ips:    tenableMap.size,
        matched_count:        matched.length,
        not_in_tenable_count: notInTenable.length,
        tenable_only_count:   tenableOnly.length,
      },
    });
  } catch (err) {
    console.error('Tenable report:', err);
    res.status(500).json({ error: 'Report failed: ' + err.message });
  }
});

module.exports = router;
