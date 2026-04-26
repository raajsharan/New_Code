const router = require('express').Router();
const pool = require('../config/database');
const { auth, requireAdmin } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit');
const { saveToDeletedItems } = require('../services/deletedItems');
const multer = require('multer');
const XLSX = require('xlsx');
const { parse: csvParse } = require('csv-parse/sync');
const crypto = require('crypto');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function normalizeHeader(h) {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const FIELD_ALIASES = {
  ip_address:         ['ip', 'ipaddress', 'ipaddr', 'ip address'],
  vm_name:            ['vmname', 'vm name', 'name', 'servername', 'server name', 'assetname', 'asset name'],
  os_hostname:        ['hostname', 'host name', 'oshostname', 'computername', 'computer name'],
  asset_type:         ['type', 'assettype', 'asset type', 'servertype', 'server type'],
  os_type:            ['os', 'ostype', 'os type', 'operatingsystem', 'operating system'],
  os_version:         ['osversion', 'os version', 'version'],
  assigned_user:      ['user', 'assigneduser', 'assigned user', 'owner'],
  department:         ['dept', 'department', 'deptname', 'department name'],
  location:           ['location', 'site', 'datacenter', 'data center'],
  business_purpose:   ['purpose', 'businesspurpose', 'business purpose', 'description'],
  server_status:      ['status', 'serverstatus', 'server status'],
  serial_number:      ['serial', 'serialnumber', 'serial number', 'sn'],
  eol_status:         ['eol', 'eolstatus', 'eol status', 'lifecycle', 'lifecycle status'],
  asset_tag:          ['tag', 'assettag', 'asset tag'],
  additional_remarks: ['remarks', 'notes', 'comment', 'comments', 'additional remarks'],
};

function buildHeaderMap(headers) {
  const map = {};
  for (const h of headers) {
    const norm = normalizeHeader(h);
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (norm === normalizeHeader(field) || aliases.some(a => normalizeHeader(a) === norm)) {
        map[h] = field;
        break;
      }
    }
  }
  return map;
}

function parseFile(buffer, filename) {
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: '' });
  }
  return csvParse(buffer.toString(), { columns: true, skip_empty_lines: true, trim: true });
}

// GET /api/beijing-assets
router.get('/', auth, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit) || 15));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const status = (req.query.status || '').trim();

    const params = [];
    const where  = [];
    let idx = 1;

    if (search) {
      where.push(`(ip_address ILIKE $${idx} OR vm_name ILIKE $${idx} OR os_hostname ILIKE $${idx} OR department ILIKE $${idx} OR location ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }
    if (status === 'migrated') where.push('is_migrated = TRUE');
    else if (status === 'pending') where.push('is_migrated = FALSE');
    if (req.query.department)    { where.push(`department = $${idx++}`);    params.push(req.query.department); }
    if (req.query.location)      { where.push(`location = $${idx++}`);      params.push(req.query.location); }
    if (req.query.asset_type)    { where.push(`asset_type = $${idx++}`);    params.push(req.query.asset_type); }
    if (req.query.server_status) { where.push(`server_status = $${idx++}`); params.push(req.query.server_status); }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRes, dataRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM beijing_assets ${clause}`, params),
      pool.query(`SELECT * FROM beijing_assets ${clause} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`, [...params, limit, offset]),
    ]);

    res.json({ assets: dataRes.rows, total: parseInt(countRes.rows[0].count), page, limit });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/beijing-assets/import  (standalone — only checks within beijing_assets)
router.post('/import', auth, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const rows = parseFile(req.file.buffer, req.file.originalname);
    if (!rows.length) return res.status(400).json({ error: 'File is empty or could not be parsed' });

    const headerMap    = buildHeaderMap(Object.keys(rows[0]));
    const batchId      = crypto.randomUUID();
    const importSource = req.file.originalname;

    const beijingRes = await pool.query("SELECT LOWER(TRIM(ip_address)) AS ip FROM beijing_assets WHERE ip_address IS NOT NULL AND ip_address <> ''");
    const beijingIPs = new Set(beijingRes.rows.map(r => r.ip));

    let added = 0;
    const skipped          = [];
    const alreadyInBeijing = [];

    for (const row of rows) {
      const mapped = {};
      for (const [orig, field] of Object.entries(headerMap)) {
        mapped[field] = String(row[orig] ?? '').trim();
      }

      const ip = (mapped.ip_address || '').trim();
      if (!ip) { skipped.push({ ip: '(empty)', reason: 'Missing IP address' }); continue; }

      const ipNorm = ip.toLowerCase();
      if (beijingIPs.has(ipNorm)) { alreadyInBeijing.push(ip); continue; }

      await pool.query(
        `INSERT INTO beijing_assets
           (ip_address, vm_name, os_hostname, asset_type, os_type, os_version,
            assigned_user, department, location, business_purpose, server_status,
            serial_number, eol_status, asset_tag, additional_remarks,
            import_source, import_batch_id, submitted_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          ip,
          mapped.vm_name          || null,
          mapped.os_hostname      || null,
          mapped.asset_type       || null,
          mapped.os_type          || null,
          mapped.os_version       || null,
          mapped.assigned_user    || null,
          mapped.department       || null,
          mapped.location         || null,
          mapped.business_purpose || null,
          mapped.server_status    || null,
          mapped.serial_number    || null,
          mapped.eol_status       || null,
          mapped.asset_tag        || null,
          mapped.additional_remarks || null,
          importSource, batchId,
          req.user?.username || null,
        ]
      );
      added++;
      beijingIPs.add(ipNorm);
    }

    res.json({ added, skipped: skipped.length, already_in_beijing: alreadyInBeijing.length, skipped_details: skipped, already_in_beijing_ips: alreadyInBeijing, batch_id: batchId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/beijing-assets/migrate
router.post('/migrate', auth, requireAdmin, async (req, res) => {
  try {
    const { ids, migration_comment } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'No assets selected for migration' });

    const migratedBy = req.user?.username || 'unknown';
    const migratedAt = new Date();
    const results    = { migrated: [], failed: [] };

    for (const id of ids) {
      try {
        const { rows } = await pool.query('SELECT * FROM beijing_assets WHERE id = $1', [id]);
        if (!rows.length)   { results.failed.push({ id, reason: 'Not found' }); continue; }
        const a = rows[0];
        if (a.is_migrated) { results.failed.push({ id, ip: a.ip_address, reason: 'Already migrated' }); continue; }

        // Prevent duplicate IP in Asset List
        const dup = await pool.query('SELECT id FROM assets WHERE LOWER(TRIM(ip_address)) = LOWER($1)', [a.ip_address]);
        if (dup.rows.length) { results.failed.push({ id, ip: a.ip_address, reason: 'IP already exists in Asset List' }); continue; }

        // Resolve dropdown FK IDs by name
        const [typeRes, deptRes, locRes] = await Promise.all([
          a.asset_type ? pool.query('SELECT id FROM asset_types  WHERE LOWER(name) = LOWER($1) LIMIT 1', [a.asset_type]) : { rows: [] },
          a.department ? pool.query('SELECT id FROM departments  WHERE LOWER(name) = LOWER($1) LIMIT 1', [a.department]) : { rows: [] },
          a.location   ? pool.query('SELECT id FROM locations    WHERE LOWER(name) = LOWER($1) LIMIT 1', [a.location])   : { rows: [] },
        ]);

        const migrationNote = `[Migrated from Beijing Asset List on ${migratedAt.toISOString()} by ${migratedBy}${migration_comment ? ': ' + migration_comment : ''}]`;
        const remarks = [a.additional_remarks, migrationNote].filter(Boolean).join('\n');

        const insertRes = await pool.query(
          `INSERT INTO assets
             (vm_name, os_hostname, ip_address, asset_type_id, assigned_user,
              department_id, location_id, business_purpose, serial_number,
              eol_status, asset_tag, additional_remarks, submitted_by, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING id`,
          [
            a.vm_name || null, a.os_hostname || null, a.ip_address,
            typeRes.rows[0]?.id || null,
            a.assigned_user || null,
            deptRes.rows[0]?.id || null,
            locRes.rows[0]?.id  || null,
            a.business_purpose || null,
            a.serial_number    || null,
            a.eol_status       || null,
            a.asset_tag        || null,
            remarks,
            a.submitted_by || null,
            new Date(),
          ]
        );

        const newAssetId = insertRes.rows[0].id;

        await pool.query(
          `UPDATE beijing_assets
           SET is_migrated=TRUE, migrated_at=$1, migrated_by=$2,
               migration_comment=$3, migrated_asset_id=$4, updated_at=NOW()
           WHERE id=$5`,
          [migratedAt, migratedBy, migration_comment || null, newAssetId, id]
        );

        results.migrated.push({ id, ip: a.ip_address, asset_id: newAssetId });
      } catch (itemErr) {
        results.failed.push({ id, reason: itemErr.message });
      }
    }

    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/beijing-assets/export/csv
router.get('/export/csv', auth, async (req, res) => {
  try {
    const { status = '', department = '', location = '', asset_type = '', server_status = '' } = req.query;
    const params = [];
    const where  = [];
    let idx = 1;
    if (status === 'migrated') where.push('is_migrated = TRUE');
    else if (status === 'pending') where.push('is_migrated = FALSE');
    if (department)    { where.push(`department = $${idx++}`);    params.push(department); }
    if (location)      { where.push(`location = $${idx++}`);      params.push(location); }
    if (asset_type)    { where.push(`asset_type = $${idx++}`);    params.push(asset_type); }
    if (server_status) { where.push(`server_status = $${idx++}`); params.push(server_status); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await pool.query(`SELECT * FROM beijing_assets ${clause} ORDER BY created_at DESC`, params);
    const cols = ['id','ip_address','vm_name','os_hostname','asset_type','os_type','os_version','assigned_user','department','location','server_status','serial_number','eol_status','asset_tag','additional_remarks','is_migrated','migrated_at','migrated_by','migration_comment','import_source','submitted_by','created_at'];
    const csv = [
      cols.join(','),
      ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="beijing-assets-${Date.now()}.csv"`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/beijing-assets/template
router.get('/template', auth, (req, res) => {
  const headers = [
    'IP Address', 'VM Name', 'Hostname', 'Asset Type', 'OS Type', 'OS Version',
    'Assigned User', 'Department', 'Location', 'Business Purpose', 'Server Status',
    'Serial Number', 'EOL Status', 'Asset Tag', 'Additional Remarks',
  ];
  const csv = headers.join(',') + '\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="beijing_assets_template.csv"');
  res.send(csv);
});

// POST /api/beijing-assets/preview  (standalone — only checks within beijing_assets)
router.post('/preview', auth, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const rows = parseFile(req.file.buffer, req.file.originalname);
    if (!rows.length) return res.status(400).json({ error: 'File is empty or could not be parsed' });

    const headers = Object.keys(rows[0]);
    const headerMap      = buildHeaderMap(headers);
    const mappedFields   = [...new Set(Object.values(headerMap))];
    const unmappedColumns = headers.filter(h => !headerMap[h]);

    const beijingRes = await pool.query("SELECT LOWER(TRIM(ip_address)) AS ip FROM beijing_assets WHERE ip_address IS NOT NULL AND ip_address != ''");
    const beijingIPs = new Set(beijingRes.rows.map(r => r.ip));

    const previewRows = rows.map((row, idx) => {
      const mapped = {};
      for (const [orig, field] of Object.entries(headerMap)) {
        mapped[field] = String(row[orig] ?? '').trim();
      }
      const ip = (mapped.ip_address || '').trim();
      const errors = [];
      if (!ip) {
        errors.push('Missing IP address');
      } else if (beijingIPs.has(ip.toLowerCase())) {
        errors.push('Already in Beijing Asset List');
      }
      return { row_number: idx + 1, data: mapped, errors, verified: errors.length === 0 };
    });

    const verifiedCount = previewRows.filter(r => r.verified).length;
    res.json({
      rows: previewRows,
      verified_count: verifiedCount,
      unverified_count: previewRows.length - verifiedCount,
      mapped_fields: mappedFields,
      unmapped_columns: unmappedColumns,
      total_rows: previewRows.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/beijing-assets/import-selected  (standalone — only checks within beijing_assets)
router.post('/import-selected', auth, requireAdmin, async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No rows provided' });

    const batchId    = crypto.randomUUID();
    const beijingRes = await pool.query("SELECT LOWER(TRIM(ip_address)) AS ip FROM beijing_assets WHERE ip_address IS NOT NULL AND ip_address != ''");
    const beijingIPs = new Set(beijingRes.rows.map(r => r.ip));

    let added = 0;
    const skipped = [];

    for (const row of rows) {
      const mapped = row.data || {};
      const ip = (mapped.ip_address || '').trim();
      if (!ip) { skipped.push({ row: row.row_number, reason: 'Missing IP' }); continue; }
      const ipNorm = ip.toLowerCase();
      if (beijingIPs.has(ipNorm)) { skipped.push({ row: row.row_number, ip, reason: 'Already in Beijing List' }); continue; }

      await pool.query(
        `INSERT INTO beijing_assets
           (ip_address, vm_name, os_hostname, asset_type, os_type, os_version,
            assigned_user, department, location, business_purpose, server_status,
            serial_number, eol_status, asset_tag, additional_remarks,
            import_source, import_batch_id, submitted_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          ip,
          mapped.vm_name          || null,
          mapped.os_hostname      || null,
          mapped.asset_type       || null,
          mapped.os_type          || null,
          mapped.os_version       || null,
          mapped.assigned_user    || null,
          mapped.department       || null,
          mapped.location         || null,
          mapped.business_purpose || null,
          mapped.server_status    || null,
          mapped.serial_number    || null,
          mapped.eol_status       || null,
          mapped.asset_tag        || null,
          mapped.additional_remarks || null,
          'excel-import', batchId,
          req.user?.username || null,
        ]
      );
      added++;
      beijingIPs.add(ipNorm);
    }

    res.json({ added, skipped: skipped.length, skipped_details: skipped, batch_id: batchId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/beijing-assets  (create a single asset manually — only checks within beijing_assets)
router.post('/', auth, requireAdmin, async (req, res) => {
  try {
    const ip = (req.body.ip_address || '').trim();
    if (!ip) return res.status(400).json({ error: 'IP address is required' });

    const bRes = await pool.query("SELECT 1 FROM beijing_assets WHERE LOWER(TRIM(ip_address)) = LOWER($1) LIMIT 1", [ip]);
    if (bRes.rows.length) return res.status(400).json({ error: 'IP already exists in Beijing Asset List', duplicate: true });

    const FIELDS = ['vm_name','os_hostname','asset_type','os_type','os_version','assigned_user',
      'department','location','business_purpose','server_status','serial_number',
      'eol_status','asset_tag','additional_remarks'];

    const { rows } = await pool.query(
      `INSERT INTO beijing_assets
         (ip_address,vm_name,os_hostname,asset_type,os_type,os_version,
          assigned_user,department,location,business_purpose,server_status,
          serial_number,eol_status,asset_tag,additional_remarks,submitted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [ip, ...FIELDS.map(f => req.body[f] || null), req.user?.username || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/beijing-assets/check-duplicate  (only checks within beijing_assets)
router.get('/check-duplicate', auth, async (req, res) => {
  try {
    const ip        = (req.query.ip || '').trim();
    const excludeId = req.query.exclude_id ? parseInt(req.query.exclude_id) : null;
    if (!ip) return res.json({ duplicate: false });

    const bRes = await pool.query(
      excludeId
        ? "SELECT 1 FROM beijing_assets WHERE LOWER(TRIM(ip_address)) = LOWER($1) AND id <> $2 LIMIT 1"
        : "SELECT 1 FROM beijing_assets WHERE LOWER(TRIM(ip_address)) = LOWER($1) LIMIT 1",
      excludeId ? [ip, excludeId] : [ip]
    );
    if (bRes.rows.length) return res.json({ duplicate: true, message: 'IP already exists in Beijing Asset List' });
    res.json({ duplicate: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/beijing-assets/:id
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM beijing_assets WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    await saveToDeletedItems('beijing_assets', rows[0].id, rows[0], req.user?.username);
    await pool.query('DELETE FROM beijing_assets WHERE id = $1', [req.params.id]);
    try {
      await writeAuditLog({ entityType: 'beijing_asset', entityId: req.params.id, action: 'delete', beforeState: rows[0], afterState: null, user: req.user, req });
    } catch (ae) { console.warn('Audit log failed (beijing delete):', ae.message); }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/beijing-assets/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM beijing_assets WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/beijing-assets/:id
router.put('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const EDITABLE = [
      'vm_name', 'os_hostname', 'ip_address', 'asset_type', 'os_type', 'os_version',
      'assigned_user', 'department', 'location', 'business_purpose', 'server_status',
      'serial_number', 'eol_status', 'asset_tag', 'additional_remarks',
    ];
    const updates = [];
    const values  = [];
    let idx = 1;
    for (const f of EDITABLE) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${idx++}`);
        values.push(req.body[f] || null);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE beijing_assets SET ${updates.join(', ')}, updated_at=NOW() WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── CUSTOM FIELDS ────────────────────────────────────────────────────────────
router.get('/custom-fields', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM beijing_custom_fields ORDER BY display_order, id');
    res.json(r.rows);
  } catch (e) {
    if (e.code === '42P01') return res.json([]);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/custom-fields/add', auth, requireAdmin, async (req, res) => {
  try {
    const { field_label, field_type = 'text', display_order = 0 } = req.body || {};
    if (!field_label?.trim()) return res.status(400).json({ error: 'field_label is required' });
    const field_key = field_label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const r = await pool.query(
      `INSERT INTO beijing_custom_fields (field_key, field_label, field_type, display_order)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [field_key, field_label.trim(), field_type, display_order]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'A field with that name already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/custom-fields/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { field_label, field_type, is_active, display_order } = req.body || {};
    const r = await pool.query(
      `UPDATE beijing_custom_fields SET
         field_label=COALESCE($1,field_label), field_type=COALESCE($2,field_type),
         is_active=COALESCE($3,is_active), display_order=COALESCE($4,display_order),
         updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [field_label||null, field_type||null, is_active!=null?is_active:null, display_order!=null?display_order:null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/custom-fields/:id', auth, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM beijing_custom_fields WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
