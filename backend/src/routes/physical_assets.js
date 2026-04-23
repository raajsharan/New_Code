const router = require('express').Router();
const pool = require('../config/database');
const { auth, requireWrite, requireAdmin } = require('../middleware/auth');

const PS_SELECT = `
  SELECT ps.*,
    pam.name AS model_name, pam.manufacturer,
    a.vm_name AS asset_vm_name, a.os_hostname, a.ip_address AS asset_ip,
    COALESCE(NULLIF(ps.vm_name,''), a.vm_name)    AS vm_name,
    a.assigned_user,
    COALESCE(d2.name, d.name)   AS department,
    COALESCE(l2.name, l.name)   AS location,
    ps.department_id, ps.location_id
  FROM physical_servers ps
  LEFT JOIN physical_asset_models pam ON ps.model_id      = pam.id
  LEFT JOIN assets       a  ON ps.asset_id      = a.id
  LEFT JOIN departments  d  ON a.department_id  = d.id
  LEFT JOIN locations    l  ON a.location_id    = l.id
  LEFT JOIN departments  d2 ON ps.department_id = d2.id
  LEFT JOIN locations    l2 ON ps.location_id   = l2.id
`;

// GET /api/physical-assets — list all
router.get('/', auth, async (req, res) => {
  try {
    const r = await pool.query(`${PS_SELECT} ORDER BY ps.created_at DESC`);
    res.json(r.rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/physical-assets/by-ip/:ip — get by hosted_ip
router.get('/by-ip/:ip', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `${PS_SELECT} WHERE LOWER(ps.hosted_ip) = LOWER($1)`, [req.params.ip]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Physical server not found for this IP' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/physical-assets/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const r = await pool.query(`${PS_SELECT} WHERE ps.id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/physical-assets
router.post('/', auth, requireWrite, async (req, res) => {
  try {
    const {
      asset_id, hosted_ip, model_id, serial_number, cores, ram_gb,
      total_disks, oem_support_status, rack_number, server_position,
      additional_notes, custom_field_values, vm_name, department_id, location_id
    } = req.body;
    const r = await pool.query(`
      INSERT INTO physical_servers
        (asset_id, hosted_ip, model_id, serial_number, cores, ram_gb,
         total_disks, oem_support_status, rack_number, server_position,
         additional_notes, custom_field_values, vm_name, department_id, location_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING id`,
      [
        asset_id || null, hosted_ip || null, model_id || null,
        serial_number || '', parseInt(cores) || 0, parseInt(ram_gb) || 0,
        parseInt(total_disks) || 0, oem_support_status !== false,
        rack_number || '', server_position || '',
        additional_notes || '', JSON.stringify(custom_field_values || {}),
        vm_name || '', department_id || null, location_id || null,
      ]
    );
    const created = await pool.query(`${PS_SELECT} WHERE ps.id = $1`, [r.rows[0].id]);
    res.status(201).json(created.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'IP already registered as physical server' });
    console.error(e); res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/physical-assets/:id
router.put('/:id', auth, requireWrite, async (req, res) => {
  try {
    const {
      asset_id, hosted_ip, model_id, serial_number, cores, ram_gb,
      total_disks, oem_support_status, rack_number, server_position,
      additional_notes, custom_field_values, vm_name, department_id, location_id
    } = req.body;
    await pool.query(`
      UPDATE physical_servers SET
        asset_id=$1, hosted_ip=$2, model_id=$3, serial_number=$4, cores=$5,
        ram_gb=$6, total_disks=$7, oem_support_status=$8, rack_number=$9,
        server_position=$10, additional_notes=$11, custom_field_values=$12,
        vm_name=$13, department_id=$14, location_id=$15, updated_at=NOW()
      WHERE id=$16`,
      [
        asset_id || null, hosted_ip || null, model_id || null,
        serial_number || '', parseInt(cores) || 0, parseInt(ram_gb) || 0,
        parseInt(total_disks) || 0, oem_support_status !== false,
        rack_number || '', server_position || '',
        additional_notes || '', JSON.stringify(custom_field_values || {}),
        vm_name || '', department_id || null, location_id || null, req.params.id,
      ]
    );
    const updated = await pool.query(`${PS_SELECT} WHERE ps.id = $1`, [req.params.id]);
    res.json(updated.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/physical-assets/:id
router.delete('/:id', auth, requireWrite, async (req, res) => {
  try {
    await pool.query('DELETE FROM physical_servers WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── Models CRUD ───────────────────────────────────────────────────────────────
router.get('/models/all', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM physical_asset_models ORDER BY manufacturer, name');
    res.json(r.rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.post('/models/add', auth, requireWrite, async (req, res) => {
  try {
    const { name, manufacturer } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const r = await pool.query(
      'INSERT INTO physical_asset_models (name, manufacturer) VALUES ($1,$2) RETURNING *',
      [name, manufacturer || '']
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Model already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/models/:id', auth, requireWrite, async (req, res) => {
  try {
    const r = await pool.query(
      'UPDATE physical_asset_models SET name=$1, manufacturer=$2 WHERE id=$3 RETURNING *',
      [req.body.name, req.body.manufacturer || '', req.params.id]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/models/:id', auth, requireWrite, async (req, res) => {
  try {
    await pool.query('DELETE FROM physical_asset_models WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (e) {
    if (e.code === '23503') return res.status(409).json({ error: 'Cannot delete: model in use' });
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Physical server custom fields ─────────────────────────────────────────────
router.get('/custom-fields/all', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM physical_server_custom_fields ORDER BY field_group, sort_order, id');
    res.json(r.rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.post('/custom-fields/add', auth, requireAdmin, async (req, res) => {
  try {
    const { field_label, field_key, field_type, field_options, field_group, is_active, sort_order } = req.body;
    if (!field_label || !field_key || !field_type) return res.status(400).json({ error: 'label, key, type required' });
    const r = await pool.query(
      `INSERT INTO physical_server_custom_fields
       (field_label,field_key,field_type,field_options,field_group,is_active,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [field_label, field_key, field_type,
       field_options ? JSON.stringify(field_options) : null,
       field_group || 'General', is_active !== false, sort_order || 0]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Field key exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/custom-fields/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { field_label, field_type, field_options, field_group, is_active, sort_order } = req.body;
    const r = await pool.query(
      `UPDATE physical_server_custom_fields
       SET field_label=$1,field_type=$2,field_options=$3,field_group=$4,is_active=$5,sort_order=$6,updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [field_label, field_type,
       field_options ? JSON.stringify(field_options) : null,
       field_group || 'General', is_active, sort_order, req.params.id]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/custom-fields/:id', auth, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM physical_server_custom_fields WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── CSV Export ─────────────────────────────────────────────────────────────────
router.get('/export/csv', auth, async (req, res) => {
  try {
    const r = await pool.query(`${PS_SELECT} ORDER BY ps.created_at DESC`);
    const esc = v => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    };
    const headers = [
      'hosted_ip','model_name','manufacturer','serial_number',
      'cores','ram_gb','total_disks','ome_support_status',
      'rack_number','server_position','additional_notes',
      'vm_name','department','location'
    ];
    const rows = r.rows.map(p => [
      p.hosted_ip, p.model_name, p.manufacturer, p.serial_number,
      p.cores, p.ram_gb, p.total_disks, p.oem_support_status ? 'Yes' : 'No',
      p.rack_number, p.server_position, p.additional_notes,
      p.vm_name, p.department, p.location
    ].map(esc).join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="physical-servers-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send([headers.join(','), ...rows].join('\n'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Export failed' }); }
});

// ── CSV Template ───────────────────────────────────────────────────────────────
router.get('/export/csv-template', auth, (req, res) => {
  const headers = [
    'hosted_ip','model_name','manufacturer','serial_number',
    'cores','ram_gb','total_disks','ome_support_status',
    'rack_number','server_position','additional_notes',
    'vm_name','department','location'
  ];
  const example = [
    '10.0.0.1','PowerEdge R750','Dell','SRV-001-2024',
    '16','128','4','Yes',
    'RACK-A1','U12','Primary ESXi host',
    'ESX-HOST-01','Platform Team','DC1'
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="physical_servers_template.csv"');
  res.send(headers.join(',') + '\n' + example.join(','));
});

// ── CSV Import ─────────────────────────────────────────────────────────────────
const multer  = require('multer');
const { parse } = require('csv-parse/sync');
const upload   = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/import/csv', auth, requireWrite, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const records = parse(req.file.buffer.toString(), { columns: true, skip_empty_lines: true, trim: true });
    const results = { success: 0, skipped: 0, failed: 0, errors: [] };

    for (let idx = 0; idx < records.length; idx++) {
      const r = records[idx];
      if (!r.hosted_ip?.trim()) { results.skipped++; results.errors.push(`Row ${idx+2}: hosted_ip required`); continue; }

      try {
        // Resolve model id
        let model_id = null;
        if (r.model_name?.trim()) {
          const mR = await pool.query(
            `SELECT id FROM physical_asset_models WHERE LOWER(name)=LOWER($1) LIMIT 1`, [r.model_name.trim()]
          );
          if (mR.rows.length) {
            model_id = mR.rows[0].id;
          } else {
            // Auto-create model
            const nm = await pool.query(
              `INSERT INTO physical_asset_models (name, manufacturer) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
              [r.model_name.trim(), r.manufacturer?.trim() || '']
            );
            model_id = nm.rows[0].id;
          }
        }

        const omeRaw = (r.ome_support_status ?? r.oem_support_status);
        const oemStatus = omeRaw?.toLowerCase() === 'yes' || omeRaw === '1' || omeRaw?.toLowerCase() === 'true';
        const deptId = r.department
          ? (await pool.query('SELECT id FROM departments WHERE name ILIKE $1 LIMIT 1', [r.department.trim()])).rows[0]?.id || null
          : null;
        const locationId = r.location
          ? (await pool.query('SELECT id FROM locations WHERE name ILIKE $1 LIMIT 1', [r.location.trim()])).rows[0]?.id || null
          : null;

        // Upsert by hosted_ip
        await pool.query(`
          INSERT INTO physical_servers (hosted_ip, model_id, serial_number, cores, ram_gb, total_disks,
            oem_support_status, rack_number, server_position, additional_notes, vm_name, department_id, location_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (hosted_ip) DO UPDATE SET
            model_id=EXCLUDED.model_id, serial_number=EXCLUDED.serial_number,
            cores=EXCLUDED.cores, ram_gb=EXCLUDED.ram_gb, total_disks=EXCLUDED.total_disks,
            oem_support_status=EXCLUDED.oem_support_status, rack_number=EXCLUDED.rack_number,
            server_position=EXCLUDED.server_position, additional_notes=EXCLUDED.additional_notes,
            vm_name=EXCLUDED.vm_name, department_id=EXCLUDED.department_id, location_id=EXCLUDED.location_id,
            updated_at=NOW()`,
          [
            r.hosted_ip.trim(), model_id,
            r.serial_number || '', parseInt(r.cores) || 0, parseInt(r.ram_gb) || 0,
            parseInt(r.total_disks) || 0, oemStatus,
            r.rack_number || '', r.server_position || '', r.additional_notes || '',
            r.vm_name || '', deptId, locationId
          ]
        );
        results.success++;
      } catch (err) { results.failed++; results.errors.push(`Row ${idx+2}: ${err.message}`); }
    }
    res.json(results);
  } catch (e) { res.status(500).json({ error: 'Import failed: ' + e.message }); }
});

module.exports = router;