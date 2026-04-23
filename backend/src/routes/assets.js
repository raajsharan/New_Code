const router = require('express').Router();
const pool = require('../config/database');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const { auth, requireWrite } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit');
const { writeImportAuditReport } = require('../services/importAudit');
let encryptPassword;
let decryptPassword;
try {
  ({ encryptPassword, decryptPassword } = require('../utils/encryption'));
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;

  const crypto = require('crypto');
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
  if (!ENCRYPTION_KEY) {
    console.error('ENCRYPTION_KEY environment variable is required');
    process.exit(1);
  }

  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

  encryptPassword = function fallbackEncryptPassword(plainText) {
    if (!plainText) return null;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  };

  decryptPassword = function fallbackDecryptPassword(encrypted) {
    if (!encrypted) return null;
    try {
      const raw = String(encrypted);
      const parts = raw.split(':');
      if (parts.length !== 2) return raw;
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedData = parts[1];
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (e) {
      console.error('Decryption failed:', e.message);
      return String(encrypted);
    }
  };
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const normalizeOemStatus = (v) => {
  const s = String(v || '').trim().toUpperCase();
  return ['YES', 'NO', 'NA'].includes(s) ? s : '';
};
const normalizeEolStatus = (v, fallback = 'InSupport') => {
  const raw = String(v ?? '').trim();
  if (!raw) return fallback;
  const token = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (token === 'insupport') return 'InSupport';
  if (token === 'eol') return 'EOL';
  if (token === 'decom' || token === 'decommissioned' || token === 'decommission') return 'Decom';
  if (token === 'notapplicable' || token === 'na') return 'Not Applicable';
  return raw;
};

function normalizeImportHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseSpreadsheetRecords(file) {
  const name = String(file?.originalname || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const first = wb.SheetNames?.[0];
    if (!first) return [];
    return XLSX.utils.sheet_to_json(wb.Sheets[first], { defval: '', raw: false });
  }
  return parse(file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true });
}

function buildImportHeaderMap(headers, aliases) {
  const byAlias = new Map();
  for (const [canonical, list] of Object.entries(aliases)) {
    const variants = [canonical, ...(list || [])];
    for (const alias of variants) byAlias.set(normalizeImportHeader(alias), canonical);
  }
  const map = {};
  for (const h of headers) {
    const canonical = byAlias.get(normalizeImportHeader(h));
    if (canonical) map[h] = canonical;
  }
  return map;
}

function remapImportRecord(record, headerMap) {
  const out = {};
  for (const [k, v] of Object.entries(record || {})) {
    const canonical = headerMap[k];
    if (!canonical) continue;
    if (out[canonical] === undefined || out[canonical] === null || out[canonical] === '') out[canonical] = v;
  }
  return out;
}

function toBool(value) {
  const s = String(value ?? '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y'].includes(s);
}

const ASSET_IMPORT_ALIASES = {
  vm_name: ['vm name', 'vmname', 'asset_name', 'asset name', 'name', 'server name'],
  os_hostname: ['os hostname', 'oshost', 'hostname', 'host name', 'dns name'],
  ip_address: ['ip', 'ip address', 'ipaddress'],
  asset_type: ['asset type', 'assettype', 'type'],
  os_type: ['os type', 'ostype', 'operating system type'],
  os_version: ['os version', 'osversion', 'operating system version'],
  assigned_user: ['assigned user', 'owner', 'user'],
  department: ['dept', 'department name'],
  business_purpose: ['business purpose', 'purpose'],
  server_status: ['server status', 'status'],
  me_installed_status: ['me installed status', 'me installed', 'manageengine installed'],
  tenable_installed_status: ['tenable installed status', 'tenable installed'],
  patching_schedule: ['patching schedule', 'patch schedule'],
  patching_type: ['patching type', 'patch type'],
  server_patch_type: ['server patch type'],
  location: ['site', 'location name'],
  additional_remarks: ['additional remarks', 'remarks', 'notes'],
  serial_number: ['serial number', 'serial'],
  idrac_enabled: ['idrac enabled', 'idrac', 'idrac status'],
  idrac_ip: ['idrac ip', 'idrac ip address'],
  eol_status: ['eol status', 'lifecycle status'],
  asset_username: ['asset username', 'username'],
  asset_password: ['asset password', 'password'],
  hosted_ip: ['hosted ip', 'host ip'],
  asset_tag: ['asset tag', 'tag'],
  ome_status: ['ome status', 'oem status'],
};
const BULK_PATCH_FIELDS = new Set([
  'assigned_user',
  'department_id',
  'server_status_id',
  'patching_type_id',
  'patching_schedule_id',
  'server_patch_type_id',
  'location_id',
  'eol_status',
  'asset_type_id',
  'os_type_id',
  'os_version_id',
]);
const BULK_INT_FIELDS = new Set([
  'department_id',
  'server_status_id',
  'patching_type_id',
  'patching_schedule_id',
  'server_patch_type_id',
  'location_id',
  'asset_type_id',
  'os_type_id',
  'os_version_id',
]);
const BULK_EOF_STATUS_VALUES = new Set(['InSupport', 'EOL', 'Decom', 'Not Applicable']);

async function canUseBulkUpdate(req) {
  if (req.user?.role === 'superadmin') return true;
  const r = await pool.query(
    `SELECT is_visible
     FROM user_page_permissions
     WHERE user_id=$1 AND page_key='asset-bulk-update'
     LIMIT 1`,
    [req.user.id]
  );
  if (!r.rows.length) return false;
  return !!r.rows[0].is_visible;
}

function buildAssetFilterWhere(filters = {}) {
  const conds = [];
  const params = [];
  let i = 1;

  if (filters.search) {
    conds.push(`(a.os_hostname ILIKE $${i} OR a.ip_address ILIKE $${i} OR a.assigned_user ILIKE $${i} OR a.vm_name ILIKE $${i})`);
    params.push(`%${filters.search}%`);
    i++;
  }
  if (filters.location)      { conds.push(`l.name=$${i++}`); params.push(filters.location); }
  if (filters.department)    { conds.push(`d.name=$${i++}`); params.push(filters.department); }
  if (filters.server_status) { conds.push(`ss.name=$${i++}`); params.push(filters.server_status); }
  if (filters.asset_type)    { conds.push(`at.name=$${i++}`); params.push(filters.asset_type); }

  const joins = `LEFT JOIN asset_types at ON a.asset_type_id=at.id LEFT JOIN departments d ON a.department_id=d.id LEFT JOIN server_status ss ON a.server_status_id=ss.id LEFT JOIN locations l ON a.location_id=l.id`;
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  return { joins, where, params };
}

function normalizeBulkPatch(patch = {}) {
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!BULK_PATCH_FIELDS.has(k) || v === undefined) continue;
    if (k === 'assigned_user') {
      out[k] = String(v || '').trim();
      continue;
    }
    if (k === 'eol_status') {
      if (v === null || v === '') {
        out[k] = 'InSupport';
      } else if (!BULK_EOF_STATUS_VALUES.has(String(v))) {
        throw new Error(`Invalid eol_status: ${v}`);
      } else {
        out[k] = String(v);
      }
      continue;
    }
    if (BULK_INT_FIELDS.has(k)) {
      if (v === null || v === '') {
        out[k] = null;
      } else {
        const n = parseInt(v, 10);
        if (Number.isNaN(n)) throw new Error(`Invalid numeric value for ${k}`);
        out[k] = n;
      }
      continue;
    }
    out[k] = v;
  }
  return out;
}

function buildBulkUpdateSql(patchObj, firstParamIndex = 1) {
  const keys = Object.keys(patchObj);
  const sets = [];
  const params = [];
  let i = firstParamIndex;
  for (const key of keys) {
    sets.push(`${key}=$${i++}`);
    params.push(patchObj[key]);
  }
  return { keys, sets, params, nextIndex: i };
}

const ASSET_SELECT = `
  SELECT a.*,
    at.name AS asset_type, ot.name AS os_type, ov.name AS os_version,
    d.name AS department, ss.name AS server_status,
    ps.name AS patching_schedule, pt.name AS patching_type,
    spt.name AS server_patch_type, l.name AS location
  FROM assets a
  LEFT JOIN asset_types at         ON a.asset_type_id       = at.id
  LEFT JOIN os_types ot            ON a.os_type_id          = ot.id
  LEFT JOIN os_versions ov         ON a.os_version_id       = ov.id
  LEFT JOIN departments d          ON a.department_id       = d.id
  LEFT JOIN server_status ss       ON a.server_status_id    = ss.id
  LEFT JOIN patching_schedules ps  ON a.patching_schedule_id = ps.id
  LEFT JOIN patching_types pt      ON a.patching_type_id    = pt.id
  LEFT JOIN server_patch_types spt ON a.server_patch_type_id = spt.id
  LEFT JOIN locations l            ON a.location_id         = l.id
`;

// IP-only duplicate check (hostname duplicates are allowed)
async function checkIPDuplicate(ip_address, excludeId = null) {
  if (!ip_address?.trim()) return null;
  const q = excludeId
    ? await pool.query('SELECT id,vm_name,os_hostname FROM assets WHERE LOWER(ip_address)=LOWER($1) AND id!=$2', [ip_address.trim(), excludeId])
    : await pool.query('SELECT id,vm_name,os_hostname FROM assets WHERE LOWER(ip_address)=LOWER($1)', [ip_address.trim()]);
  if (q.rows.length) {
    const a = q.rows[0];
    return `IP "${ip_address}" already assigned to "${a.vm_name || a.os_hostname || 'ID:'+a.id}"`;
  }
  return null;
}

// GET /api/assets
router.get('/', auth, async (req, res) => {
  try {
    const { search, location, department, server_status, asset_type, page = 1, limit = 20 } = req.query;
    const conds = [], params = [];
    let i = 1;
    if (search) {
      conds.push(`(a.os_hostname ILIKE $${i} OR a.ip_address ILIKE $${i} OR a.assigned_user ILIKE $${i} OR a.vm_name ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    if (location)      { conds.push(`l.name=$${i++}`); params.push(location); }
    if (department)    { conds.push(`d.name=$${i++}`); params.push(department); }
    if (server_status) { conds.push(`ss.name=$${i++}`); params.push(server_status); }
    if (asset_type)    { conds.push(`at.name=$${i++}`); params.push(asset_type); }

    const joins = `LEFT JOIN asset_types at ON a.asset_type_id=at.id LEFT JOIN departments d ON a.department_id=d.id LEFT JOIN server_status ss ON a.server_status_id=ss.id LEFT JOIN locations l ON a.location_id=l.id LEFT JOIN patching_types pt ON a.patching_type_id=pt.id LEFT JOIN patching_schedules ps ON a.patching_schedule_id=ps.id LEFT JOIN server_patch_types spt ON a.server_patch_type_id=spt.id LEFT JOIN os_types ot ON a.os_type_id=ot.id LEFT JOIN os_versions ov ON a.os_version_id=ov.id`;
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const countR = await pool.query(`SELECT COUNT(*) FROM assets a ${joins} ${where}`, params);
    const offset = (page - 1) * limit;
    const dataR  = await pool.query(`${ASSET_SELECT} ${where} ORDER BY a.created_at DESC LIMIT $${i} OFFSET $${i+1}`, [...params, parseInt(limit), parseInt(offset)]);

    // Decrypt passwords
    dataR.rows.forEach(r => { if (r.asset_password) r.asset_password = decryptPassword(r.asset_password); });

    // Mask passwords
    const canView = req.user.role === 'admin' ||
      (await pool.query('SELECT can_view_passwords FROM password_visibility_settings WHERE user_id=$1', [req.user.id])).rows[0]?.can_view_passwords;
    if (!canView) dataR.rows.forEach(r => { if (r.asset_password) r.asset_password = '••••••••'; });

    res.json({ assets: dataR.rows, total: parseInt(countR.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/assets/check-duplicate — IP only
router.get('/check-duplicate', auth, async (req, res) => {
  try {
    const { ip_address, exclude_id } = req.query;
    const err = await checkIPDuplicate(ip_address, exclude_id ? parseInt(exclude_id) : null);
    res.json({ duplicate: !!err, errors: err ? [err] : [] });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/assets/report - fetch all assets (no pagination) for reporting
router.get('/report', auth, async (req, res) => {
  try {
    const r = await pool.query(`${ASSET_SELECT} ORDER BY a.created_at DESC`);
    res.json(r.rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/assets/bulk-update
router.post('/bulk-update', auth, requireWrite, async (req, res) => {
  try {
    const allowed = await canUseBulkUpdate(req);
    if (!allowed) return res.status(403).json({ error: 'Access denied for bulk update' });

    const filters = req.body?.filters || {};
    const patchRaw = req.body?.patch || {};
    const dryRun = req.body?.dry_run === true;
    const patch = normalizeBulkPatch(patchRaw);

    const patchEntries = Object.entries(patch).filter(([k, v]) => BULK_PATCH_FIELDS.has(k) && v !== undefined);
    if (!patchEntries.length) {
      return res.status(400).json({ error: 'patch must include at least one allowed field' });
    }

    const { joins, where, params } = buildAssetFilterWhere(filters);
    const matched = await pool.query(
      `SELECT a.id
       FROM assets a
       ${joins}
       ${where}
       ORDER BY a.id ASC`,
      params
    );
    const ids = matched.rows.map((r) => String(r.id));

    const status = dryRun ? 'completed' : 'running';
    const now = new Date();
    const jobR = await pool.query(
      `INSERT INTO bulk_jobs (
         entity_type, filters_json, patch_json, status, total_count,
         requested_by_user_id, requested_by_username, started_at, finished_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, status, total_count, created_at`,
      [
        'asset',
        JSON.stringify(filters),
        JSON.stringify(Object.fromEntries(patchEntries)),
        status,
        ids.length,
        req.user.id,
        req.user.username || '',
        now,
        dryRun ? now : null,
      ]
    );
    const job = jobR.rows[0];

    for (const id of ids) {
      await pool.query(
        `INSERT INTO bulk_job_items (job_id, entity_id, status)
         VALUES ($1,$2,$3)`,
        [job.id, id, dryRun ? 'skipped' : 'pending']
      );
    }

    let successCount = 0;
    let failedCount = 0;

    if (!dryRun && ids.length > 0) {
      const patchObj = Object.fromEntries(patchEntries);
      const { sets, params: setParams, nextIndex } = buildBulkUpdateSql(patchObj, 1);

      for (const id of ids) {
        try {
          const before = await pool.query(`${ASSET_SELECT} WHERE a.id=$1`, [id]);
          if (!before.rows.length) {
            failedCount++;
            await pool.query(
              `UPDATE bulk_job_items
               SET status='failed', error_message=$1, updated_at=NOW()
               WHERE job_id=$2 AND entity_id=$3`,
              ['Asset not found', job.id, id]
            );
            continue;
          }

          const updateParams = [...setParams, req.user.username || '', parseInt(id, 10)];
          await pool.query(
            `UPDATE assets
             SET ${sets.join(', ')}, submitted_by=$${nextIndex}, updated_at=NOW()
             WHERE id=$${nextIndex + 1}`,
            updateParams
          );

          const after = await pool.query(`${ASSET_SELECT} WHERE a.id=$1`, [id]);
          await pool.query(
            `UPDATE bulk_job_items
             SET status='updated', error_message=NULL, before_json=$1, after_json=$2, updated_at=NOW()
             WHERE job_id=$3 AND entity_id=$4`,
            [
              JSON.stringify(before.rows[0] || null),
              JSON.stringify(after.rows[0] || null),
              job.id,
              id,
            ]
          );

          successCount++;
          try {
            await writeAuditLog({
              entityType: 'asset',
              entityId: id,
              action: 'bulk-update',
              beforeState: before.rows[0] || null,
              afterState: after.rows[0] || null,
              user: req.user,
              req,
            });
          } catch (auditErr) {
            console.warn(`Audit log write failed (asset bulk-update ${id}):`, auditErr.message);
          }
        } catch (itemErr) {
          failedCount++;
          await pool.query(
            `UPDATE bulk_job_items
             SET status='failed', error_message=$1, updated_at=NOW()
             WHERE job_id=$2 AND entity_id=$3`,
            [itemErr.message || 'Update failed', job.id, id]
          );
        }
      }
    }

    if (dryRun) {
      await pool.query(
        `UPDATE bulk_jobs
         SET status='completed', success_count=0, failed_count=0, finished_at=NOW(), error_message=NULL
         WHERE id=$1`,
        [job.id]
      );
    } else {
      const finalStatus = failedCount > 0 && successCount === 0 ? 'failed' : 'completed';
      const finalError = failedCount > 0 ? `${failedCount} record(s) failed during bulk update` : null;
      await pool.query(
        `UPDATE bulk_jobs
         SET status=$1, success_count=$2, failed_count=$3, finished_at=NOW(), error_message=$4
         WHERE id=$5`,
        [finalStatus, successCount, failedCount, finalError, job.id]
      );
    }

    try {
      await writeAuditLog({
        entityType: 'asset_bulk_job',
        entityId: job.id,
        action: dryRun ? 'dry-run' : 'create',
        beforeState: null,
        afterState: {
          entity_type: 'asset',
          matched_count: ids.length,
          filters,
          patch: Object.fromEntries(patchEntries),
          dry_run: dryRun,
          success_count: successCount,
          failed_count: failedCount,
        },
        user: req.user,
        req,
      });
    } catch (auditErr) {
      console.warn('Audit log write failed (asset bulk create):', auditErr.message);
    }

    res.status(202).json({
      job_id: job.id,
      status: dryRun ? 'completed' : (failedCount > 0 && successCount === 0 ? 'failed' : 'completed'),
      matched_count: ids.length,
      success_count: successCount,
      failed_count: failedCount,
    });
  } catch (e) {
    if (String(e.message || '').startsWith('Invalid ')) {
      return res.status(400).json({ error: e.message });
    }
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/assets/bulk-update/:jobId
router.get('/bulk-update/:jobId', auth, async (req, res) => {
  try {
    const allowed = await canUseBulkUpdate(req);
    if (!allowed) return res.status(403).json({ error: 'Access denied for bulk update' });

    const job = await pool.query(
      `SELECT id, entity_type, status, total_count, success_count, failed_count, error_message,
              created_at, started_at, finished_at, requested_by_user_id, requested_by_username
       FROM bulk_jobs
       WHERE id=$1 AND entity_type='asset'`,
      [req.params.jobId]
    );
    if (!job.rows.length) return res.status(404).json({ error: 'Bulk job not found' });

    const items = await pool.query(
      `SELECT entity_id, status, error_message, before_json, after_json, updated_at
       FROM bulk_job_items
       WHERE job_id=$1
       ORDER BY id ASC
       LIMIT 500`,
      [req.params.jobId]
    );

    res.json({
      job: job.rows[0],
      items: items.rows,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/assets/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const r = await pool.query(`${ASSET_SELECT} WHERE a.id=$1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Asset not found' });
    if (r.rows[0].asset_password) r.rows[0].asset_password = decryptPassword(r.rows[0].asset_password);
    res.json(r.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/assets
router.post('/', auth, requireWrite, async (req, res) => {
  try {
    const {
      vm_name, os_hostname, ip_address, asset_type_id, os_type_id, os_version_id,
      assigned_user, department_id, business_purpose, server_status_id,
      me_installed_status, tenable_installed_status, patching_schedule_id,
      patching_type_id, server_patch_type_id, location_id, additional_remarks,
      serial_number, idrac_enabled, idrac_ip, eol_status,
      asset_username, asset_password, custom_field_values,
      hosted_ip, asset_tag, oem_status
    } = req.body;

    const ipErr = await checkIPDuplicate(ip_address);
    if (ipErr) return res.status(409).json({ error: ipErr, duplicate: true });

    const encryptedPassword = asset_password ? encryptPassword(asset_password) : null;

    const r = await pool.query(`
      INSERT INTO assets (vm_name,os_hostname,ip_address,asset_type_id,os_type_id,os_version_id,
        assigned_user,department_id,business_purpose,server_status_id,
        me_installed_status,tenable_installed_status,patching_schedule_id,
        patching_type_id,server_patch_type_id,location_id,additional_remarks,
        serial_number,idrac_enabled,idrac_ip,eol_status,asset_username,asset_password,
        custom_field_values,submitted_by,hosted_ip,asset_tag,oem_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
      RETURNING id`,
      [vm_name,os_hostname,ip_address,asset_type_id||null,os_type_id||null,os_version_id||null,
       assigned_user,department_id||null,business_purpose,server_status_id||null,
       me_installed_status||false,tenable_installed_status||false,patching_schedule_id||null,
       patching_type_id||null,server_patch_type_id||null,location_id||null,additional_remarks,
       serial_number,idrac_enabled||false,idrac_ip||null,eol_status||'InSupport',
       asset_username,encryptedPassword,JSON.stringify(custom_field_values||{}),
       req.user.username, hosted_ip||'', asset_tag||'', oem_status||'']
    );
    const created = await pool.query(`${ASSET_SELECT} WHERE a.id=$1`, [r.rows[0].id]);
    try {
      await writeAuditLog({
        entityType: 'asset',
        entityId: r.rows[0].id,
        action: 'create',
        beforeState: null,
        afterState: created.rows[0] || null,
        user: req.user,
        req,
      });
    } catch (auditErr) {
      console.warn('Audit log write failed (asset create):', auditErr.message);
    }
    res.status(201).json(created.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Duplicate IP address', duplicate: true });
    console.error(e); res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/assets/:id
router.put('/:id', auth, requireWrite, async (req, res) => {
  try {
    const {
      vm_name, os_hostname, ip_address, asset_type_id, os_type_id, os_version_id,
      assigned_user, department_id, business_purpose, server_status_id,
      me_installed_status, tenable_installed_status, patching_schedule_id,
      patching_type_id, server_patch_type_id, location_id, additional_remarks,
      serial_number, idrac_enabled, idrac_ip, eol_status,
      asset_username, asset_password, custom_field_values,
      hosted_ip, asset_tag, oem_status
    } = req.body;

    const ipErr = await checkIPDuplicate(ip_address, parseInt(req.params.id));
    if (ipErr) return res.status(409).json({ error: ipErr, duplicate: true });

    const encryptedPassword = asset_password ? encryptPassword(asset_password) : null;

    const before = await pool.query(`${ASSET_SELECT} WHERE a.id=$1`, [req.params.id]);
    if (!before.rows.length) return res.status(404).json({ error: 'Asset not found' });

    await pool.query(`
      UPDATE assets SET vm_name=$1,os_hostname=$2,ip_address=$3,asset_type_id=$4,os_type_id=$5,os_version_id=$6,
        assigned_user=$7,department_id=$8,business_purpose=$9,server_status_id=$10,
        me_installed_status=$11,tenable_installed_status=$12,patching_schedule_id=$13,
        patching_type_id=$14,server_patch_type_id=$15,location_id=$16,additional_remarks=$17,
        serial_number=$18,idrac_enabled=$19,idrac_ip=$20,eol_status=$21,
        asset_username=$22,asset_password=$23,custom_field_values=$24,
        submitted_by=$25,hosted_ip=$26,asset_tag=$27,oem_status=$28,updated_at=NOW()
      WHERE id=$29`,
      [vm_name,os_hostname,ip_address,asset_type_id||null,os_type_id||null,os_version_id||null,
       assigned_user,department_id||null,business_purpose,server_status_id||null,
       me_installed_status||false,tenable_installed_status||false,patching_schedule_id||null,
       patching_type_id||null,server_patch_type_id||null,location_id||null,additional_remarks,
       serial_number,idrac_enabled||false,idrac_ip||null,eol_status||'InSupport',
       asset_username,encryptedPassword,JSON.stringify(custom_field_values||{}),
       req.user.username, hosted_ip||'', asset_tag||'', oem_status||'', req.params.id]
    );
    const updated = await pool.query(`${ASSET_SELECT} WHERE a.id=$1`, [req.params.id]);
    try {
      await writeAuditLog({
        entityType: 'asset',
        entityId: req.params.id,
        action: 'update',
        beforeState: before.rows[0] || null,
        afterState: updated.rows[0] || null,
        user: req.user,
        req,
      });
    } catch (auditErr) {
      console.warn('Audit log write failed (asset update):', auditErr.message);
    }
    if (updated.rows[0]?.asset_password) updated.rows[0].asset_password = decryptPassword(updated.rows[0].asset_password);
    res.json(updated.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Duplicate IP address', duplicate: true });
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/assets/:id
router.delete('/:id', auth, requireWrite, async (req, res) => {
  try {
    const before = await pool.query(`${ASSET_SELECT} WHERE a.id=$1`, [req.params.id]);
    if (!before.rows.length) return res.status(404).json({ error: 'Not found' });

    const r = await pool.query('DELETE FROM assets WHERE id=$1 RETURNING id', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });

    try {
      await writeAuditLog({
        entityType: 'asset',
        entityId: req.params.id,
        action: 'delete',
        beforeState: before.rows[0] || null,
        afterState: null,
        user: req.user,
        req,
      });
    } catch (auditErr) {
      console.warn('Audit log write failed (asset delete):', auditErr.message);
    }

    res.json({ message: 'Deleted', id: req.params.id });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/assets/export/csv
router.get('/export/csv', auth, async (req, res) => {
  try {
    const { search, location, department, server_status, asset_type } = req.query;
    const conds = [], params = [];
    let i = 1;
    if (search)        { conds.push(`(a.os_hostname ILIKE $${i} OR a.ip_address ILIKE $${i} OR a.vm_name ILIKE $${i})`); params.push(`%${search}%`); i++; }
    if (location)      { conds.push(`l.name=$${i++}`); params.push(location); }
    if (department)    { conds.push(`d.name=$${i++}`); params.push(department); }
    if (server_status) { conds.push(`ss.name=$${i++}`); params.push(server_status); }
    if (asset_type)    { conds.push(`at.name=$${i++}`); params.push(asset_type); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const r = await pool.query(`${ASSET_SELECT} ${where} ORDER BY a.created_at DESC`, params);

    const esc = v => { if (!v && v !== 0) return ''; const s = String(v).replace(/"/g,'""'); return s.includes(',') || s.includes('"') ? `"${s}"` : s; };
    const headers = ['ID','VM Name','Hostname','IP','Asset Type','OS','Version','User','Dept',
      'Status','Patch Type','Sched','Location','Serial','iDRAC','iDRAC IP','EOL',
      'ME','Tenable','Hosted IP','Asset Tag','Submitted By','Created'];
    const rows = r.rows.map(a => [
      a.id,a.vm_name,a.os_hostname,a.ip_address,a.asset_type,a.os_type,a.os_version,
      a.assigned_user,a.department,a.server_status,a.patching_type,a.patching_schedule,
      a.location,a.serial_number,a.idrac_enabled?'Yes':'No',a.idrac_ip,a.eol_status,
      a.me_installed_status?'Yes':'No',a.tenable_installed_status?'Yes':'No',
      a.hosted_ip,a.asset_tag,a.submitted_by,
      new Date(a.created_at).toISOString().split('T')[0]
    ].map(esc).join(','));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="inventory-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send([headers.join(','), ...rows].join('\n'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Export failed' }); }
});

// GET /api/assets/export/csv-template
router.get('/export/csv-template', auth, (req, res) => {
  const h = ['vm_name','os_hostname','ip_address','asset_type','os_type','os_version','assigned_user',
    'department','business_purpose','server_status','me_installed_status','tenable_installed_status',
    'patching_schedule','patching_type','server_patch_type','location','additional_remarks',
    'serial_number','idrac_enabled','idrac_ip','eol_status','asset_username','asset_password',
    'hosted_ip','asset_tag','ome_status'];
  const ex = ['SERVER-01','server-01.local','192.168.1.10','VM','Linux','Ubuntu 22.04 LTS','john.doe',
    'IT','Web server','Alive','true','false','Monthly','Auto','Critical','DC1','Notes',
    'SN123','false','','InSupport','admin','password123','10.0.0.1','0001','YES'];
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition','attachment; filename="asset_import_template.csv"');
  res.send(h.join(',') + '\n' + ex.join(','));
});

function normalizeImportCell(value) {
  return String(value ?? '').trim();
}

function normalizeStoredAssetPassword(value) {
  const raw = normalizeImportCell(value);
  if (!raw) return null;
  if (/^[a-f0-9]{32}:[a-f0-9]+$/i.test(raw)) return raw;
  return encryptPassword(raw);
}

function normalizeCompareValue(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeCompareBool(value) {
  return toBool(value) ? 'true' : 'false';
}

const IMPORT_COMPARE_KEY_MAP = {
  ome_status: 'oem_status',
};

const IMPORT_COMPARE_BOOL_KEYS = new Set([
  'me_installed_status',
  'tenable_installed_status',
  'idrac_enabled',
]);

function compareAssetRowWithExisting(importRow, existingRow) {
  const changedFields = [];
  for (const [rawKey, rawVal] of Object.entries(importRow || {})) {
    const key = IMPORT_COMPARE_KEY_MAP[rawKey] || rawKey;
    if (key === 'ip_address') continue;
    const hasInput = normalizeImportCell(rawVal) !== '';
    if (!hasInput) continue;

    const imported = IMPORT_COMPARE_BOOL_KEYS.has(rawKey)
      ? normalizeCompareBool(rawVal)
      : normalizeCompareValue(rawVal);
    const existing = IMPORT_COMPARE_BOOL_KEYS.has(rawKey)
      ? normalizeCompareBool(existingRow?.[key])
      : normalizeCompareValue(existingRow?.[key]);
    if (imported !== existing) changedFields.push(rawKey);
  }
  return { update_required: changedFields.length > 0, changed_fields: changedFields };
}

function isAssetPatchEffective(existingRow, patch = {}) {
  const cols = Object.keys(patch || {});
  const effectiveCols = cols.filter((c) => c !== 'submitted_by');
  return effectiveCols.some((c) => {
    if (c === 'asset_password') return true;
    const before = existingRow?.[c];
    const after = patch[c];
    if (before === null || before === undefined) return !(after === null || after === undefined || after === '');
    if (after === null || after === undefined) return !(before === null || before === undefined || before === '');
    return String(before) !== String(after);
  });
}

async function filterEffectiveAssetChangedFields(importRow, candidateFields, existingRow) {
  const effective = [];
  const uniqueFields = Array.from(new Set(candidateFields || []));
  for (const field of uniqueFields) {
    const patch = await buildAssetUpdatePatch(importRow, [field], existingRow, 'preview-compare');
    if (isAssetPatchEffective(existingRow, patch)) effective.push(field);
  }
  return effective;
}

async function checkAssetUpdateNeedByIP(importRow) {
  const ip = normalizeImportCell(importRow?.ip_address);
  if (!ip) return { exists: false, update_required: false, changed_fields: [] };
  const existingR = await pool.query('SELECT * FROM assets WHERE LOWER(ip_address)=LOWER($1) LIMIT 1', [ip]);
  if (!existingR.rows.length) return { exists: false, update_required: false, changed_fields: [] };
  const compared = compareAssetRowWithExisting(importRow, existingR.rows[0]);
  if (!compared.changed_fields.length) return { exists: true, update_required: false, changed_fields: [] };
  const effectiveFields = await filterEffectiveAssetChangedFields(importRow, compared.changed_fields, existingR.rows[0]);
  return { exists: true, update_required: effectiveFields.length > 0, changed_fields: effectiveFields };
}

function basicAssetImportValidation(row) {
  const errors = [];
  if (!normalizeImportCell(row.ip_address)) errors.push('Missing IP Address');
  if (!normalizeImportCell(row.vm_name) && !normalizeImportCell(row.os_hostname)) {
    errors.push('Missing VM Name / Hostname');
  }
  return errors;
}

async function mapAssetInsertValues(r, username) {
  const fk = async (t, v) => v ? (await pool.query(`SELECT id FROM ${t} WHERE name ILIKE $1`, [v])).rows[0]?.id || null : null;
  const ot = await fk('os_types', r.os_type);
  const ov = ot && r.os_version
    ? (await pool.query('SELECT id FROM os_versions WHERE name ILIKE $1 AND os_type_id=$2', [r.os_version, ot])).rows[0]?.id || null
    : null;
  return [
    r.vm_name, r.os_hostname, r.ip_address,
    await fk('asset_types', r.asset_type), ot, ov,
    r.assigned_user, await fk('departments', r.department), r.business_purpose,
    await fk('server_status', r.server_status),
    toBool(r.me_installed_status), toBool(r.tenable_installed_status),
    await fk('patching_schedules', r.patching_schedule),
    await fk('patching_types', r.patching_type),
    await fk('server_patch_types', r.server_patch_type),
    await fk('locations', r.location),
    r.additional_remarks, r.serial_number, toBool(r.idrac_enabled), r.idrac_ip || null,
    normalizeEolStatus(r.eol_status), r.asset_username, normalizeStoredAssetPassword(r.asset_password),
    username, r.hosted_ip || '', r.asset_tag || '', normalizeOemStatus(r.ome_status ?? r.oem_status)
  ];
}

function normalizeUpdateFieldName(field) {
  const s = String(field || '').trim();
  if (!s) return '';
  if (s === 'oem_status') return 'ome_status';
  return s;
}

async function buildAssetUpdatePatch(importRow, selectedFields, existingRow, username) {
  const fields = Array.from(new Set((selectedFields || []).map(normalizeUpdateFieldName))).filter(Boolean);
  if (!fields.length) return {};

  const fk = async (t, v) => {
    const normalized = normalizeImportCell(v);
    if (!normalized) return null;
    const r = await pool.query(`SELECT id FROM ${t} WHERE name ILIKE $1 LIMIT 1`, [normalized]);
    return r.rows[0]?.id || null;
  };

  const patch = {};
  const setIfPresent = (field, col, transform = (v) => v) => {
    if (!fields.includes(field)) return;
    const raw = importRow?.[field];
    if (normalizeImportCell(raw) === '') return;
    patch[col] = transform(raw);
  };

  setIfPresent('vm_name', 'vm_name', (v) => normalizeImportCell(v));
  setIfPresent('os_hostname', 'os_hostname', (v) => normalizeImportCell(v));
  setIfPresent('assigned_user', 'assigned_user', (v) => normalizeImportCell(v));
  setIfPresent('business_purpose', 'business_purpose', (v) => normalizeImportCell(v));
  setIfPresent('additional_remarks', 'additional_remarks', (v) => normalizeImportCell(v));
  setIfPresent('serial_number', 'serial_number', (v) => normalizeImportCell(v));
  setIfPresent('idrac_ip', 'idrac_ip', (v) => normalizeImportCell(v));
  setIfPresent('asset_username', 'asset_username', (v) => normalizeImportCell(v));
  setIfPresent('hosted_ip', 'hosted_ip', (v) => normalizeImportCell(v));
  setIfPresent('asset_tag', 'asset_tag', (v) => normalizeImportCell(v));
  setIfPresent('eol_status', 'eol_status', (v) => normalizeEolStatus(v, 'InSupport'));
  setIfPresent('ome_status', 'oem_status', (v) => normalizeOemStatus(v));
  setIfPresent('me_installed_status', 'me_installed_status', (v) => toBool(v));
  setIfPresent('tenable_installed_status', 'tenable_installed_status', (v) => toBool(v));
  setIfPresent('idrac_enabled', 'idrac_enabled', (v) => toBool(v));
  setIfPresent('asset_password', 'asset_password', (v) => encryptPassword(normalizeImportCell(v)));

  if (fields.includes('asset_type') && normalizeImportCell(importRow?.asset_type) !== '') {
    patch.asset_type_id = await fk('asset_types', importRow.asset_type);
  }
  let nextOsTypeId = existingRow?.os_type_id || null;
  if (fields.includes('os_type') && normalizeImportCell(importRow?.os_type) !== '') {
    nextOsTypeId = await fk('os_types', importRow.os_type);
    patch.os_type_id = nextOsTypeId;
  }
  if (fields.includes('os_version') && normalizeImportCell(importRow?.os_version) !== '') {
    const osVerName = normalizeImportCell(importRow.os_version);
    let q;
    if (nextOsTypeId) {
      q = await pool.query(
        'SELECT id FROM os_versions WHERE name ILIKE $1 AND os_type_id=$2 LIMIT 1',
        [osVerName, nextOsTypeId]
      );
    } else {
      q = await pool.query('SELECT id FROM os_versions WHERE name ILIKE $1 LIMIT 1', [osVerName]);
    }
    patch.os_version_id = q.rows[0]?.id || null;
  }
  if (fields.includes('department') && normalizeImportCell(importRow?.department) !== '') {
    patch.department_id = await fk('departments', importRow.department);
  }
  if (fields.includes('server_status') && normalizeImportCell(importRow?.server_status) !== '') {
    patch.server_status_id = await fk('server_status', importRow.server_status);
  }
  if (fields.includes('patching_schedule') && normalizeImportCell(importRow?.patching_schedule) !== '') {
    patch.patching_schedule_id = await fk('patching_schedules', importRow.patching_schedule);
  }
  if (fields.includes('patching_type') && normalizeImportCell(importRow?.patching_type) !== '') {
    patch.patching_type_id = await fk('patching_types', importRow.patching_type);
  }
  if (fields.includes('server_patch_type') && normalizeImportCell(importRow?.server_patch_type) !== '') {
    patch.server_patch_type_id = await fk('server_patch_types', importRow.server_patch_type);
  }
  if (fields.includes('location') && normalizeImportCell(importRow?.location) !== '') {
    patch.location_id = await fk('locations', importRow.location);
  }

  if (Object.keys(patch).length) patch.submitted_by = username;
  return patch;
}

async function updateAssetByIP(importRow, selectedFields, username) {
  const ip = normalizeImportCell(importRow?.ip_address);
  if (!ip) return { updated: false, reason: 'missing_ip' };
  const existingR = await pool.query('SELECT * FROM assets WHERE LOWER(ip_address)=LOWER($1) LIMIT 1', [ip]);
  if (!existingR.rows.length) return { updated: false, reason: 'not_found' };

  const existing = existingR.rows[0];
  const patch = await buildAssetUpdatePatch(importRow, selectedFields, existing, username);
  const cols = Object.keys(patch);
  if (!cols.length) return { updated: false, reason: 'no_fields' };
  const hasRealChange = isAssetPatchEffective(existing, patch);
  if (!hasRealChange) return { updated: false, reason: 'no_effective_change' };

  const setExpr = cols.map((c, idx) => `${c}=$${idx + 1}`).join(', ');
  const values = cols.map((c) => patch[c]);
  await pool.query(
    `UPDATE assets SET ${setExpr}, updated_at=NOW() WHERE id=$${values.length + 1}`,
    [...values, existing.id]
  );
  return { updated: true, id: existing.id };
}

// POST /api/assets/import/csv/preview
router.post('/import/csv/preview', auth, requireWrite, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const sourceRows = parseSpreadsheetRecords(req.file);
    const rawHeaders = sourceRows[0] ? Object.keys(sourceRows[0]) : [];
    if (!sourceRows.length) return res.status(400).json({ error: 'No data rows found in file' });

    const headerMap = buildImportHeaderMap(rawHeaders, ASSET_IMPORT_ALIASES);
    const mappedFields = Array.from(new Set(Object.values(headerMap)));
    if (!mappedFields.length) {
      return res.status(400).json({ error: 'No recognized columns found. Use the template headers or close variants.' });
    }

    const records = sourceRows.map((row) => remapImportRecord(row, headerMap));
    const compareExisting = toBool(req.body?.compare_existing);
    const rows = [];
    let verifiedCount = 0;
    let updateRequiredCount = 0;
    let noUpdateNeededCount = 0;
    let existingRowsCount = 0;

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const normalized = Object.fromEntries(
        Object.entries(r || {}).map(([k, v]) => [k, normalizeImportCell(v)])
      );
      if (normalizeImportCell(normalized.eol_status) !== '') {
        normalized.eol_status = normalizeEolStatus(normalized.eol_status, '');
      }
      const rowErrors = basicAssetImportValidation(normalized);
      if (normalized.ip_address && !compareExisting) {
        const ipErr = await checkIPDuplicate(normalized.ip_address);
        if (ipErr) rowErrors.push(ipErr);
      }
      let updateCheck = null;
      if (compareExisting) {
        updateCheck = await checkAssetUpdateNeedByIP(normalized);
        if (updateCheck.exists) {
          existingRowsCount++;
          if (updateCheck.update_required) updateRequiredCount++;
          else noUpdateNeededCount++;
        }
      }
      const verified = rowErrors.length === 0;
      if (verified) verifiedCount++;
      rows.push({
        row_number: i + 2,
        data: normalized,
        verified,
        errors: rowErrors,
        update_check: updateCheck,
      });
    }

    res.json({
      total_rows: rows.length,
      verified_count: verifiedCount,
      unverified_count: rows.length - verifiedCount,
      mapped_fields: mappedFields,
      unmapped_columns: rawHeaders.filter((h) => !headerMap[h]),
      compare_existing: compareExisting,
      existing_rows_count: existingRowsCount,
      update_required_count: updateRequiredCount,
      no_update_needed_count: noUpdateNeededCount,
      rows,
    });
  } catch (e) {
    res.status(500).json({ error: 'Preview failed: ' + e.message });
  }
});

// POST /api/assets/import/csv/import-selected
router.post('/import/csv/import-selected', auth, requireWrite, async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const onlyVerified = req.body?.only_verified !== false;
    const allowUpdates = toBool(req.body?.allow_updates);
    const sourcePage = String(req.body?.import_source || 'asset-import').trim();
    if (!rows.length) return res.status(400).json({ error: 'No rows selected for import' });

    const results = { success: 0, failed: 0, skipped: 0, errors: [] };
    for (let i = 0; i < rows.length; i++) {
      const entry = rows[i] || {};
      const r = entry.data || entry;
      const rowLabel = entry.row_number ? `Row ${entry.row_number}` : `Selected row ${i + 1}`;
      try {
        const selectedUpdateFields = Array.isArray(entry.update_fields)
          ? entry.update_fields
          : (entry.update_check?.changed_fields || []);
        const wantsUpdate = allowUpdates && selectedUpdateFields.length > 0;

        if (onlyVerified && entry.verified === false && !wantsUpdate) {
          results.skipped++;
          results.errors.push(`${rowLabel}: not verified`);
          continue;
        }
        const baseErrors = basicAssetImportValidation(r);
        if (baseErrors.length) {
          results.skipped++;
          results.errors.push(`${rowLabel}: ${baseErrors.join(', ')}`);
          continue;
        }
        const ip = normalizeImportCell(r.ip_address);
        const existingByIp = ip
          ? await pool.query('SELECT id FROM assets WHERE LOWER(ip_address)=LOWER($1) LIMIT 1', [ip])
          : { rows: [] };

        if (existingByIp.rows.length) {
          if (!allowUpdates) {
            results.skipped++;
            results.errors.push(`${rowLabel}: IP duplicate`);
            continue;
          }
          const updateResult = await updateAssetByIP(r, selectedUpdateFields, req.user.username);
          if (updateResult.updated) {
            results.success++;
          } else {
            results.skipped++;
            results.errors.push(`${rowLabel}: update skipped (${updateResult.reason || 'no_fields'})`);
          }
          continue;
        }

        const insertValues = await mapAssetInsertValues(r, req.user.username);
        await pool.query(`
          INSERT INTO assets (vm_name,os_hostname,ip_address,asset_type_id,os_type_id,os_version_id,
            assigned_user,department_id,business_purpose,server_status_id,me_installed_status,
            tenable_installed_status,patching_schedule_id,patching_type_id,server_patch_type_id,
            location_id,additional_remarks,serial_number,idrac_enabled,idrac_ip,eol_status,
            asset_username,asset_password,submitted_by,hosted_ip,asset_tag,oem_status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
          insertValues
        );
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(`${rowLabel}: ${err.message}`);
      }
    }
    await writeImportAuditReport({
      sourcePage,
      targetScope: 'assets',
      importMode: onlyVerified ? 'csv-selected-verified' : 'csv-selected',
      totalCount: rows.length,
      successCount: results.success,
      failedCount: results.failed,
      skippedCount: results.skipped,
      reasons: results.errors,
      user: req.user,
    });
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: 'Import selected failed: ' + e.message });
  }
});

// POST /api/assets/import/csv
router.post('/import/csv', auth, requireWrite, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const sourceRows = parseSpreadsheetRecords(req.file);
    const rawHeaders = sourceRows[0] ? Object.keys(sourceRows[0]) : [];
    if (!sourceRows.length) return res.status(400).json({ error: 'No data rows found in file' });
    const headerMap = buildImportHeaderMap(rawHeaders, ASSET_IMPORT_ALIASES);
    const records = sourceRows.map((row) => remapImportRecord(row, headerMap));
    const mappedFields = Array.from(new Set(Object.values(headerMap)));
    const sourcePage = String(req.body?.import_source || 'asset-import').trim();
    if (!mappedFields.length) {
      return res.status(400).json({ error: 'No recognized columns found. Use the template headers or close variants.' });
    }
    const results = { success: 0, failed: 0, skipped: 0, errors: [], mapped_fields: mappedFields, unmapped_columns: rawHeaders.filter((h) => !headerMap[h]) };
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      try {
        const baseErrors = basicAssetImportValidation(r);
        if (baseErrors.length) { results.skipped++; results.errors.push(`Row ${i+2}: ${baseErrors.join(', ')}`); continue; }
        const ipErr = await checkIPDuplicate(r.ip_address);
        if (ipErr) { results.skipped++; results.errors.push(`Row ${i+2} skipped (IP dup): ${ipErr}`); continue; }
        const insertValues = await mapAssetInsertValues(r, req.user.username);
        await pool.query(`
          INSERT INTO assets (vm_name,os_hostname,ip_address,asset_type_id,os_type_id,os_version_id,
            assigned_user,department_id,business_purpose,server_status_id,me_installed_status,
            tenable_installed_status,patching_schedule_id,patching_type_id,server_patch_type_id,
            location_id,additional_remarks,serial_number,idrac_enabled,idrac_ip,eol_status,
            asset_username,asset_password,submitted_by,hosted_ip,asset_tag,oem_status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
          insertValues
        );
        results.success++;
      } catch (err) { results.failed++; results.errors.push(`Row ${i+2}: ${err.message}`); }
    }
    await writeImportAuditReport({
      sourcePage,
      targetScope: 'assets',
      importMode: 'csv-direct',
      totalCount: records.length,
      successCount: results.success,
      failedCount: results.failed,
      skippedCount: results.skipped,
      mappedFields: results.mapped_fields,
      unmappedColumns: results.unmapped_columns,
      reasons: results.errors,
      user: req.user,
    });
    res.json(results);
  } catch (e) { res.status(500).json({ error: 'Import failed: ' + e.message }); }
});


module.exports = router;