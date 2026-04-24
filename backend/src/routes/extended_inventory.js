const router  = require('express').Router();
const pool    = require('../config/database');
const extPool = require('../config/database').extPool;
const multer  = require('multer');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const { auth, requireWrite, requireAdmin } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit');
const { writeImportAuditReport } = require('../services/importAudit');
let encryptPassword;
let decryptPassword;
try {
  ({ encryptPassword, decryptPassword } = require('../utils/encryption'));
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  ({ encryptPassword, decryptPassword } = require('../encryption'));
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function normalizeStoredAssetPassword(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^[a-f0-9]{32}:[a-f0-9]+$/i.test(raw)) return raw;
  return encryptPassword(raw);
}

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

const EXT_IMPORT_ALIASES = {
  vm_name: ['vm name', 'vmname', 'asset_name', 'asset name', 'name', 'server name'],
  os_hostname: ['os hostname', 'hostname', 'host name', 'dns name'],
  ip_address: ['ip', 'ip address', 'ipaddress'],
  asset_type: ['asset type', 'assettype', 'type'],
  os_type: ['os type', 'ostype', 'operating system type'],
  os_version: ['os version', 'osversion', 'operating system version'],
  assigned_user: ['assigned user', 'owner', 'user'],
  department: ['dept', 'department name'],
  business_purpose: ['business purpose', 'purpose'],
  server_status: ['server status'],
  me_installed_status: ['me installed status', 'me installed', 'manageengine installed'],
  tenable_installed_status: ['tenable installed status', 'tenable installed'],
  patching_schedule: ['patching schedule', 'patch schedule'],
  patching_type: ['patching type', 'patch type'],
  server_patch_type: ['server patch type'],
  location: ['site', 'location name'],
  serial_number: ['serial number', 'serial'],
  idrac_enabled: ['idrac enabled', 'idrac', 'idrac status'],
  idrac_ip: ['idrac ip', 'idrac ip address'],
  eol_status: ['eol status', 'lifecycle status'],
  ome_status: ['ome status', 'oem status'],
  asset_username: ['asset username', 'username'],
  asset_password: ['asset password', 'password'],
  hosted_ip: ['hosted ip', 'host ip'],
  asset_tag: ['asset tag', 'tag'],
  status: ['record status', 'inventory status'],
  description: ['desc'],
  additional_remarks: ['additional remarks', 'remarks', 'notes'],
};

// Resolve public-schema FK names into rows for enrichment
async function enrichRows(rows) {
  if (!rows.length) return rows;
  const deptIds   = [...new Set(rows.map(r => r.department_id).filter(Boolean))];
  const locIds    = [...new Set(rows.map(r => r.location_id).filter(Boolean))];
  const atIds     = [...new Set(rows.map(r => r.asset_type_id).filter(Boolean))];
  const otIds     = [...new Set(rows.map(r => r.os_type_id).filter(Boolean))];
  const ovIds     = [...new Set(rows.map(r => r.os_version_id).filter(Boolean))];
  const ssIds     = [...new Set(rows.map(r => r.server_status_id).filter(Boolean))];
  const ptIds     = [...new Set(rows.map(r => r.patching_type_id).filter(Boolean))];
  const psIds     = [...new Set(rows.map(r => r.patching_schedule_id).filter(Boolean))];
  const sptIds    = [...new Set(rows.map(r => r.server_patch_type_id).filter(Boolean))];

  const q = (t, ids) => ids.length ? pool.query(`SELECT id,name FROM ${t} WHERE id=ANY($1)`, [ids]) : { rows: [] };
  const [depts,locs,ats,ots,ovs,ss,pts,pss,spts] = await Promise.all([
    q('departments',deptIds), q('locations',locIds), q('asset_types',atIds),
    q('os_types',otIds), q('os_versions',ovIds), q('server_status',ssIds),
    q('patching_types',ptIds), q('patching_schedules',psIds), q('server_patch_types',sptIds),
  ]);
  const mk = (arr) => Object.fromEntries(arr.rows.map(r=>[r.id,r.name]));
  const dM=mk(depts),lM=mk(locs),atM=mk(ats),otM=mk(ots),ovM=mk(ovs),
        ssM=mk(ss),ptM=mk(pts),psM=mk(pss),sptM=mk(spts);

  return rows.map(r => ({
    ...r,
    department:      r.department_id    ? dM[r.department_id]    : null,
    location:        r.location_id      ? lM[r.location_id]      : null,
    asset_type:      r.asset_type_id    ? atM[r.asset_type_id]   : null,
    os_type:         r.os_type_id       ? otM[r.os_type_id]      : null,
    os_version:      r.os_version_id    ? ovM[r.os_version_id]   : null,
    server_status:   r.server_status_id ? ssM[r.server_status_id]: null,
    patching_type:   r.patching_type_id ? ptM[r.patching_type_id]: null,
    patching_schedule: r.patching_schedule_id ? psM[r.patching_schedule_id] : null,
    server_patch_type: r.server_patch_type_id ? sptM[r.server_patch_type_id]: null,
  }));
}

// GET /api/extended-inventory
router.get('/', auth, async (req, res) => {
  try {
    const { search, department, location, status, asset_type, server_status, page=1, limit=20 } = req.query;
    const conds = [], params = [];
    let i = 1;
    if (search) {
      conds.push(`(asset_name ILIKE $${i} OR ip_address ILIKE $${i} OR os_hostname ILIKE $${i} OR assigned_user ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    if (status) { conds.push(`status=$${i++}`); params.push(status); }
    if (department) {
      const dr = await pool.query('SELECT id FROM departments WHERE name ILIKE $1',[department]);
      if (dr.rows.length) { conds.push(`department_id=$${i++}`); params.push(dr.rows[0].id); }
    }
    if (location) {
      const lr = await pool.query('SELECT id FROM locations WHERE name ILIKE $1',[location]);
      if (lr.rows.length) { conds.push(`location_id=$${i++}`); params.push(lr.rows[0].id); }
    }
    if (asset_type) {
      const ar = await pool.query('SELECT id FROM asset_types WHERE name ILIKE $1',[asset_type]);
      if (ar.rows.length) { conds.push(`asset_type_id=$${i++}`); params.push(ar.rows[0].id); }
    }
    if (server_status) {
      const sr = await pool.query('SELECT id FROM server_status WHERE name ILIKE $1',[server_status]);
      if (sr.rows.length) { conds.push(`server_status_id=$${i++}`); params.push(sr.rows[0].id); }
    }

    const where  = conds.length ? 'WHERE '+conds.join(' AND ') : '';
    const offset = (page-1)*limit;
    const countR = await extPool.query(`SELECT COUNT(*) FROM items ${where}`, params);
    const dataR  = await extPool.query(`SELECT * FROM items ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i+1}`, [...params,parseInt(limit),parseInt(offset)]);
    const enriched = await enrichRows(dataR.rows);

    // Mask passwords
    const canView = req.user.role==='admin' ||
      (await pool.query('SELECT can_view_passwords FROM password_visibility_settings WHERE user_id=$1',[req.user.id])).rows[0]?.can_view_passwords;
    if (!canView) enriched.forEach(r=>{ if(r.asset_password) r.asset_password='••••••••'; });

    res.json({ items:enriched, total:parseInt(countR.rows[0].count), page:parseInt(page), limit:parseInt(limit) });
  } catch(e) { console.error(e); res.status(500).json({ error:'Server error' }); }
});

router.get('/check-duplicate', auth, async (req,res) => {
  try {
    const { ip_address, exclude_id } = req.query;
    if (!ip_address?.trim()) return res.json({ duplicate:false, errors:[] });
    const q = exclude_id
      ? await extPool.query('SELECT id,asset_name FROM items WHERE LOWER(ip_address)=LOWER($1) AND id!=$2',[ip_address.trim(),exclude_id])
      : await extPool.query('SELECT id,asset_name FROM items WHERE LOWER(ip_address)=LOWER($1)',[ip_address.trim()]);
    const errors = q.rows.length?[`IP "${ip_address}" already used by "${q.rows[0].asset_name||'ID:'+q.rows[0].id}"`]:[];
    res.json({ duplicate:errors.length>0, errors });
  } catch { res.status(500).json({ error:'Server error' }); }
});

router.get('/not-transferred', auth, async (req,res) => {
  try {
    const r = await extPool.query('SELECT * FROM items ORDER BY created_at DESC');
    res.json(await enrichRows(r.rows));
  } catch(e) { console.error(e); res.status(500).json({ error:'Server error' }); }
});

router.get('/transfer-log', auth, requireAdmin, async (req,res) => {
  try { res.json((await extPool.query('SELECT * FROM transfer_log ORDER BY transferred_at DESC LIMIT 200')).rows); }
  catch { res.status(500).json({ error:'Server error' }); }
});

// Helper to build the payload for INSERT / UPDATE
function buildPayload(body, username) {
  return [
    body.vm_name||'', body.asset_name||'', body.os_hostname||'',
    body.ip_address||null, body.asset_type||'',
    body.asset_type_id||null, body.os_type_id||null, body.os_version_id||null,
    body.department_id||null, body.assigned_user||'', body.location_id||null,
    body.business_purpose||'', body.server_status_id||null,
    body.me_installed_status||false, body.tenable_installed_status||false,
    body.patching_schedule_id||null, body.patching_type_id||null, body.server_patch_type_id||null,
    body.serial_number||'', body.idrac_enabled||false, body.idrac_ip||'',
    normalizeOemStatus(body.oem_status), body.eol_status||'InSupport', body.asset_username||'', body.asset_password||'',
    body.hosted_ip||'', body.asset_tag||'',
    body.status||'Active', body.description||'', body.additional_remarks||'',
    username, JSON.stringify(body.custom_field_values||{})
  ];
}

const INSERT_SQL = `
  INSERT INTO items (
    vm_name,asset_name,os_hostname,ip_address,asset_type,
    asset_type_id,os_type_id,os_version_id,department_id,assigned_user,location_id,
    business_purpose,server_status_id,me_installed_status,tenable_installed_status,
    patching_schedule_id,patching_type_id,server_patch_type_id,
    serial_number,idrac_enabled,idrac_ip,oem_status,eol_status,asset_username,asset_password,
    hosted_ip,asset_tag,status,description,additional_remarks,submitted_by,custom_field_values
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
  RETURNING id`;

const UPDATE_SQL = `
  UPDATE items SET
    vm_name=$1,asset_name=$2,os_hostname=$3,ip_address=$4,asset_type=$5,
    asset_type_id=$6,os_type_id=$7,os_version_id=$8,department_id=$9,assigned_user=$10,location_id=$11,
    business_purpose=$12,server_status_id=$13,me_installed_status=$14,tenable_installed_status=$15,
    patching_schedule_id=$16,patching_type_id=$17,server_patch_type_id=$18,
    serial_number=$19,idrac_enabled=$20,idrac_ip=$21,oem_status=$22,eol_status=$23,asset_username=$24,asset_password=$25,
    hosted_ip=$26,asset_tag=$27,status=$28,description=$29,additional_remarks=$30,
    submitted_by=$31,custom_field_values=$32,updated_at=NOW()
  WHERE id=$33`;

router.post('/', auth, requireWrite, async (req,res) => {
  try {
    if (req.body.ip_address?.trim()) {
      const dup = await extPool.query('SELECT id FROM items WHERE LOWER(ip_address)=LOWER($1)',[req.body.ip_address.trim()]);
      if (dup.rows.length) return res.status(409).json({ error:`IP "${req.body.ip_address}" already exists`, duplicate:true });
    }
    const r = await extPool.query(INSERT_SQL, buildPayload(req.body, req.user.username));
    const rows = await extPool.query('SELECT * FROM items WHERE id=$1',[r.rows[0].id]);
    res.status(201).json((await enrichRows(rows.rows))[0]);
  } catch(e) {
    if (e.code==='23505') return res.status(409).json({ error:'Duplicate IP', duplicate:true });
    console.error(e); res.status(500).json({ error:'Server error' });
  }
});

// GET /api/extended-inventory/report - all items for reporting
router.get('/report', auth, async (req, res) => {
  try {
    const r = await extPool.query('SELECT * FROM items ORDER BY created_at DESC');
    const enriched = await enrichRows(r.rows);
    res.json(enriched);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/extended-inventory/:id - single item
router.get('/:id', auth, async (req, res) => {
  try {
    const rows = await extPool.query('SELECT * FROM items WHERE id=$1', [req.params.id]);
    if (!rows.rows.length) return res.status(404).json({ error: 'Not found' });
    const enriched = await enrichRows(rows.rows);
    res.json(enriched[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id', auth, requireWrite, async (req,res) => {
  try {
    if (req.body.ip_address?.trim()) {
      const dup = await extPool.query('SELECT id FROM items WHERE LOWER(ip_address)=LOWER($1) AND id!=$2',[req.body.ip_address.trim(),req.params.id]);
      if (dup.rows.length) return res.status(409).json({ error:`IP "${req.body.ip_address}" already exists`, duplicate:true });
    }
    await extPool.query(UPDATE_SQL, [...buildPayload(req.body, req.user.username), req.params.id]);
    const rows = await extPool.query('SELECT * FROM items WHERE id=$1',[req.params.id]);
    res.json((await enrichRows(rows.rows))[0]);
  } catch(e) {
    if (e.code==='23505') return res.status(409).json({ error:'Duplicate IP', duplicate:true });
    res.status(500).json({ error:'Server error' });
  }
});

router.delete('/:id', auth, requireWrite, async (req,res) => {
  try { await extPool.query('DELETE FROM items WHERE id=$1',[req.params.id]); res.json({ message:'Deleted' }); }
  catch { res.status(500).json({ error:'Server error' }); }
});

// POST /:id/transfer
router.post('/:id/transfer', auth, requireAdmin, async (req,res) => {
  const client=await pool.connect(), extClient=await extPool.connect();
  try {
    const extRow = await extClient.query('SELECT * FROM items WHERE id=$1',[req.params.id]);
    if (!extRow.rows.length) return res.status(404).json({ error:'Not found' });
    const item = extRow.rows[0];
    if (item.transferred) return res.status(409).json({ error:'Already transferred' });

    const ipCheck = await client.query('SELECT id FROM assets WHERE LOWER(ip_address)=LOWER($1)',[item.ip_address]);
    if (ipCheck.rows.length) return res.status(409).json({ error:`IP "${item.ip_address}" already in main inventory` });

    await client.query('BEGIN');
    const { map_location_id, transfer_notes, map_eol_status, additional_remarks } = req.body;

    // Build the additional_remarks for the new asset: combine source item's remarks + transfer comment
    const sourceRemarks = item.additional_remarks || '';
    const transferComment = additional_remarks?.trim() || '';
    const finalRemarks = [
      sourceRemarks,
      transferComment ? `[Transfer Comment] ${transferComment}` : '',
    ].filter(Boolean).join('\n\n');

    const newAsset = await client.query(`
      INSERT INTO assets (
        vm_name,os_hostname,ip_address,asset_type_id,os_type_id,os_version_id,
        assigned_user,department_id,business_purpose,server_status_id,
        me_installed_status,tenable_installed_status,patching_schedule_id,
        patching_type_id,server_patch_type_id,location_id,additional_remarks,
        serial_number,idrac_enabled,idrac_ip,eol_status,
        asset_username,asset_password,hosted_ip,asset_tag,oem_status,
        submitted_by,created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,NOW())
      RETURNING id`,
      [
        item.vm_name||item.asset_name, item.os_hostname||item.asset_name, item.ip_address,
        item.asset_type_id, item.os_type_id, item.os_version_id,
        item.assigned_user, item.department_id, item.business_purpose||item.description,
        item.server_status_id, item.me_installed_status, item.tenable_installed_status,
        item.patching_schedule_id, item.patching_type_id, item.server_patch_type_id,
        map_location_id||item.location_id, finalRemarks,
        item.serial_number, item.idrac_enabled, item.idrac_ip,
        map_eol_status||item.eol_status||'InSupport',
        item.asset_username, normalizeStoredAssetPassword(item.asset_password), item.hosted_ip, item.asset_tag, item.oem_status||'',
        req.user.username,
      ]
    );
    const mainAssetId = newAsset.rows[0].id;
    await extClient.query(
      `UPDATE items SET transferred=TRUE,transferred_at=NOW(),transferred_by=$1,main_asset_id=$2,transfer_notes=$3,updated_at=NOW() WHERE id=$4`,
      [req.user.username, mainAssetId, transfer_notes||'', req.params.id]
    );
    await extClient.query(
      `INSERT INTO transfer_log (ext_item_id,ext_asset_name,ext_ip_address,main_asset_id,transferred_by,transfer_notes) VALUES ($1,$2,$3,$4,$5,$6)`,
      [item.id,item.asset_name||item.vm_name,item.ip_address,mainAssetId,req.user.username,transfer_notes||'']
    );
    // PERMANENTLY REMOVE from extended inventory after successful transfer
    await extClient.query('DELETE FROM items WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');

    try {
      await writeAuditLog({
        entityType: 'transfer',
        entityId: item.id,
        action: 'transfer',
        beforeState: item,
        afterState: {
          ext_item_id: item.id,
          main_asset_id: mainAssetId,
          transfer_notes: transfer_notes || '',
          transferred_by: req.user.username,
        },
        user: req.user,
        req,
      });

      await writeAuditLog({
        entityType: 'asset',
        entityId: mainAssetId,
        action: 'create-from-transfer',
        beforeState: null,
        afterState: {
          id: mainAssetId,
          source_ext_item_id: item.id,
          ip_address: item.ip_address,
          vm_name: item.vm_name || item.asset_name,
          submitted_by: req.user.username,
        },
        user: req.user,
        req,
      });
    } catch (auditErr) {
      console.warn('Audit log write failed (transfer):', auditErr.message);
    }

    res.json({ message:'Transferred and removed from extended inventory', main_asset_id:mainAssetId });
  } catch(e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error(e); res.status(500).json({ error:e.message||'Transfer failed' });
  } finally { client.release(); extClient.release(); }
});

// Export CSV
router.get('/export/csv', auth, async (req,res) => {
  try {
    const r = await extPool.query('SELECT * FROM items ORDER BY created_at DESC');
    const enriched = await enrichRows(r.rows);
    const esc = v => { if(!v&&v!==0)return''; const s=String(v).replace(/"/g,'""'); return s.includes(',')||s.includes('"')?`"${s}"`:s; };
    const canShowPw = !!req.user?.can_view_passwords;
    const headers = ['ID','VM Name','Asset Name','Hostname','IP','Asset Type','OS Type','OS Version',
      'User','Dept','Location','Status','Patch Type','Schedule','EOL','ME','Tenable',
      'Serial','iDRAC','iDRAC IP','Hosted IP','Asset Tag','Submitted By','Transferred','Created'];
    if (canShowPw) headers.push('Username', 'Password');
    const rows = enriched.map(a => {
      const cols = [
        a.id,a.vm_name,a.asset_name,a.os_hostname,a.ip_address,
        a.asset_type,a.os_type,a.os_version,a.assigned_user,a.department,a.location,
        a.server_status,a.patching_type,a.patching_schedule,a.eol_status,
        a.me_installed_status?'Yes':'No',a.tenable_installed_status?'Yes':'No',
        a.serial_number,a.idrac_enabled?'Yes':'No',a.idrac_ip,a.hosted_ip,a.asset_tag,
        a.submitted_by,a.transferred?'Yes':'No',
        new Date(a.created_at).toISOString().split('T')[0],
      ];
      if (canShowPw) {
        cols.push(a.asset_username || '');
        cols.push(a.asset_password ? (decryptPassword(a.asset_password) || '') : '');
      }
      return cols.map(esc).join(',');
    });
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition',`attachment; filename="extended-inventory-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send([headers.join(','),...rows].join('\n'));
  } catch { res.status(500).json({ error:'Export failed' }); }
});

router.get('/export/csv-template', auth, (req,res) => {
  const h = ['vm_name','os_hostname','ip_address','asset_type',
    'os_type','os_version',
    'assigned_user','department','business_purpose','server_status','me_installed_status',
    'tenable_installed_status','patching_schedule','patching_type','server_patch_type',
    'location','serial_number','idrac_enabled','idrac_ip','eol_status',
    'ome_status','asset_username','asset_password','hosted_ip','asset_tag','status','description','additional_remarks'];
  const ex = ['VM-01','switch-01.local','10.0.0.1','Switch',
    'Linux','Ubuntu 22.04 LTS',
    'john.doe','IT','Core switch','Alive','false','false','Monthly','Manual','Non-Critical',
    'DC1','SN123','false','','InSupport','YES','admin','pass123','','','Active','Core switch notes','Imported from CMDB'];
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition','attachment; filename="extended_inventory_template.csv"');
  res.send(h.join(',')+'\n'+ex.join(','));
});

function normalizeImportCell(value) {
  return String(value ?? '').trim();
}

function normalizeCompareValue(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeCompareBool(value) {
  return toBool(value) ? 'true' : 'false';
}

const EXT_COMPARE_BOOL_KEYS = new Set([
  'me_installed_status',
  'tenable_installed_status',
  'idrac_enabled',
]);

function compareExtRowWithExisting(importRow, existingRow) {
  const changedFields = [];
  for (const [key, rawVal] of Object.entries(importRow || {})) {
    if (key === 'ip_address') continue;
    const hasInput = normalizeImportCell(rawVal) !== '';
    if (!hasInput) continue;
    const imported = EXT_COMPARE_BOOL_KEYS.has(key)
      ? normalizeCompareBool(rawVal)
      : normalizeCompareValue(rawVal);
    const existing = EXT_COMPARE_BOOL_KEYS.has(key)
      ? normalizeCompareBool(existingRow?.[key])
      : normalizeCompareValue(existingRow?.[key]);
    if (imported !== existing) changedFields.push(key);
  }
  return { update_required: changedFields.length > 0, changed_fields: changedFields };
}

function isExtPatchEffective(existingRow, patch = {}) {
  const cols = Object.keys(patch || {});
  const effectiveCols = cols.filter((c) => c !== 'submitted_by');
  return effectiveCols.some((c) => {
    const before = existingRow?.[c];
    const after = patch[c];
    if (before === null || before === undefined) return !(after === null || after === undefined || after === '');
    if (after === null || after === undefined) return !(before === null || before === undefined || before === '');
    return String(before) !== String(after);
  });
}

async function filterEffectiveExtChangedFields(importRow, candidateFields) {
  const effective = [];
  const uniqueFields = Array.from(new Set(candidateFields || []));
  const body = await mapExtImportBody(importRow);
  const ip = normalizeImportCell(importRow?.ip_address);
  const existingR = await extPool.query('SELECT * FROM items WHERE LOWER(ip_address)=LOWER($1) LIMIT 1', [ip]);
  const existingRow = existingR.rows[0] || null;
  if (!existingRow) return [];
  for (const field of uniqueFields) {
    const patch = buildExtUpdatePatch(body, [field], 'preview-compare');
    if (isExtPatchEffective(existingRow, patch)) effective.push(field);
  }
  return effective;
}

async function checkExtUpdateNeedByIP(importRow) {
  const ip = normalizeImportCell(importRow?.ip_address);
  if (!ip) return { exists: false, update_required: false, changed_fields: [] };
  const existingR = await extPool.query('SELECT * FROM items WHERE LOWER(ip_address)=LOWER($1) LIMIT 1', [ip]);
  if (!existingR.rows.length) return { exists: false, update_required: false, changed_fields: [] };
  const compared = compareExtRowWithExisting(importRow, existingR.rows[0]);
  if (!compared.changed_fields.length) return { exists: true, update_required: false, changed_fields: [] };
  const effectiveFields = await filterEffectiveExtChangedFields(importRow, compared.changed_fields);
  return { exists: true, update_required: effectiveFields.length > 0, changed_fields: effectiveFields };
}

function basicExtImportValidation(row) {
  const errors = [];
  if (!normalizeImportCell(row.ip_address)) errors.push('Missing IP Address');
  if (!normalizeImportCell(row.vm_name) && !normalizeImportCell(row.os_hostname)) {
    errors.push('Missing VM Name / Hostname');
  }
  return errors;
}

async function mapExtImportBody(r) {
  const fk = async(t,v)=>v?(await pool.query(`SELECT id FROM ${t} WHERE name ILIKE $1`,[v])).rows[0]?.id||null:null;
  const ot = await fk('os_types',r.os_type);
  const ov = ot&&r.os_version?(await pool.query('SELECT id FROM os_versions WHERE name ILIKE $1 AND os_type_id=$2',[r.os_version,ot])).rows[0]?.id:null;
  return {
    vm_name:r.vm_name, asset_name:r.vm_name, os_hostname:r.os_hostname,
    ip_address:r.ip_address, asset_type:r.asset_type,
    asset_type_id:await fk('asset_types',r.asset_type), os_type_id:ot, os_version_id:ov,
    department_id:await fk('departments',r.department), assigned_user:r.assigned_user,
    location_id:await fk('locations',r.location), business_purpose:r.business_purpose,
    server_status_id:await fk('server_status',r.server_status),
    me_installed_status:toBool(r.me_installed_status),
    tenable_installed_status:toBool(r.tenable_installed_status),
    patching_schedule_id:await fk('patching_schedules',r.patching_schedule),
    patching_type_id:await fk('patching_types',r.patching_type),
    server_patch_type_id:await fk('server_patch_types',r.server_patch_type),
    serial_number:r.serial_number, idrac_enabled:toBool(r.idrac_enabled), idrac_ip:r.idrac_ip,
    oem_status:r.ome_status ?? r.oem_status, eol_status:normalizeEolStatus(r.eol_status), asset_username:r.asset_username, asset_password:r.asset_password,
    hosted_ip:r.hosted_ip, asset_tag:r.asset_tag,
    status:r.status||'Active', description:r.description, additional_remarks:r.additional_remarks,
  };
}

function normalizeExtUpdateFieldName(field) {
  const s = String(field || '').trim();
  if (!s) return '';
  if (s === 'oem_status') return 'ome_status';
  return s;
}

function buildExtUpdatePatch(importBody, selectedFields, username) {
  const fields = Array.from(new Set((selectedFields || []).map(normalizeExtUpdateFieldName))).filter(Boolean);
  if (!fields.length) return {};

  const patch = {};
  const setIfPresent = (field, col, transform = (v) => v) => {
    if (!fields.includes(field)) return;
    const raw = importBody?.[field];
    if (raw === undefined || raw === null || String(raw).trim() === '') return;
    patch[col] = transform(raw);
  };

  setIfPresent('vm_name', 'vm_name', (v) => String(v).trim());
  if (fields.includes('vm_name') && String(importBody?.vm_name || '').trim() !== '') {
    patch.asset_name = String(importBody.vm_name).trim();
  }
  setIfPresent('os_hostname', 'os_hostname', (v) => String(v).trim());
  setIfPresent('asset_type', 'asset_type', (v) => String(v).trim());
  setIfPresent('assigned_user', 'assigned_user', (v) => String(v).trim());
  setIfPresent('business_purpose', 'business_purpose', (v) => String(v).trim());
  setIfPresent('serial_number', 'serial_number', (v) => String(v).trim());
  setIfPresent('idrac_ip', 'idrac_ip', (v) => String(v).trim());
  setIfPresent('asset_username', 'asset_username', (v) => String(v).trim());
  setIfPresent('asset_password', 'asset_password', (v) => String(v).trim());
  setIfPresent('hosted_ip', 'hosted_ip', (v) => String(v).trim());
  setIfPresent('asset_tag', 'asset_tag', (v) => String(v).trim());
  setIfPresent('status', 'status', (v) => String(v).trim());
  setIfPresent('description', 'description', (v) => String(v).trim());
  setIfPresent('additional_remarks', 'additional_remarks', (v) => String(v).trim());
  setIfPresent('eol_status', 'eol_status', (v) => normalizeEolStatus(v, 'InSupport'));
  setIfPresent('ome_status', 'oem_status', (v) => normalizeOemStatus(v));
  setIfPresent('me_installed_status', 'me_installed_status', (v) => toBool(v));
  setIfPresent('tenable_installed_status', 'tenable_installed_status', (v) => toBool(v));
  setIfPresent('idrac_enabled', 'idrac_enabled', (v) => toBool(v));

  if (fields.includes('asset_type') && importBody?.asset_type_id !== undefined) {
    patch.asset_type_id = importBody.asset_type_id || null;
  }
  if (fields.includes('os_type') && importBody?.os_type_id !== undefined) {
    patch.os_type_id = importBody.os_type_id || null;
  }
  if (fields.includes('os_version') && importBody?.os_version_id !== undefined) {
    patch.os_version_id = importBody.os_version_id || null;
  }
  if (fields.includes('department') && importBody?.department_id !== undefined) {
    patch.department_id = importBody.department_id || null;
  }
  if (fields.includes('server_status') && importBody?.server_status_id !== undefined) {
    patch.server_status_id = importBody.server_status_id || null;
  }
  if (fields.includes('patching_schedule') && importBody?.patching_schedule_id !== undefined) {
    patch.patching_schedule_id = importBody.patching_schedule_id || null;
  }
  if (fields.includes('patching_type') && importBody?.patching_type_id !== undefined) {
    patch.patching_type_id = importBody.patching_type_id || null;
  }
  if (fields.includes('server_patch_type') && importBody?.server_patch_type_id !== undefined) {
    patch.server_patch_type_id = importBody.server_patch_type_id || null;
  }
  if (fields.includes('location') && importBody?.location_id !== undefined) {
    patch.location_id = importBody.location_id || null;
  }

  if (Object.keys(patch).length) patch.submitted_by = username;
  return patch;
}

async function updateExtByIP(importRow, selectedFields, username) {
  const ip = normalizeImportCell(importRow?.ip_address);
  if (!ip) return { updated: false, reason: 'missing_ip' };
  const existingR = await extPool.query('SELECT id FROM items WHERE LOWER(ip_address)=LOWER($1) LIMIT 1', [ip]);
  if (!existingR.rows.length) return { updated: false, reason: 'not_found' };

  const body = await mapExtImportBody(importRow);
  const patch = buildExtUpdatePatch(body, selectedFields, username);
  const cols = Object.keys(patch);
  if (!cols.length) return { updated: false, reason: 'no_fields' };
  const existingRow = (await extPool.query('SELECT * FROM items WHERE id=$1', [existingR.rows[0].id])).rows[0];
  const hasRealChange = isExtPatchEffective(existingRow, patch);
  if (!hasRealChange) return { updated: false, reason: 'no_effective_change' };
  const setExpr = cols.map((c, idx) => `${c}=$${idx + 1}`).join(', ');
  const values = cols.map((c) => patch[c]);

  await extPool.query(
    `UPDATE items SET ${setExpr}, updated_at=NOW() WHERE id=$${values.length + 1}`,
    [...values, existingR.rows[0].id]
  );
  return { updated: true, id: existingR.rows[0].id };
}

// POST /api/extended-inventory/import/csv/preview
router.post('/import/csv/preview', auth, requireWrite, upload.single('file'), async (req,res) => {
  try {
    if (!req.file) return res.status(400).json({ error:'No file uploaded' });
    const sourceRows = parseSpreadsheetRecords(req.file);
    const rawHeaders = sourceRows[0] ? Object.keys(sourceRows[0]) : [];
    if (!sourceRows.length) return res.status(400).json({ error: 'No data rows found in file' });
    const headerMap = buildImportHeaderMap(rawHeaders, EXT_IMPORT_ALIASES);
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
    for (let idx=0; idx<records.length; idx++) {
      const normalized = Object.fromEntries(
        Object.entries(records[idx] || {}).map(([k, v]) => [k, normalizeImportCell(v)])
      );
      if (normalizeImportCell(normalized.eol_status) !== '') {
        normalized.eol_status = normalizeEolStatus(normalized.eol_status, '');
      }
      const rowErrors = basicExtImportValidation(normalized);
      if (normalized.ip_address && !compareExisting) {
        const dup = await extPool.query('SELECT id FROM items WHERE LOWER(ip_address)=LOWER($1)',[normalized.ip_address.trim()]);
        if (dup.rows.length) rowErrors.push(`IP "${normalized.ip_address}" already exists`);
      }
      let updateCheck = null;
      if (compareExisting) {
        updateCheck = await checkExtUpdateNeedByIP(normalized);
        if (updateCheck.exists) {
          existingRowsCount++;
          if (updateCheck.update_required) updateRequiredCount++;
          else noUpdateNeededCount++;
        }
      }
      const verified = rowErrors.length === 0;
      if (verified) verifiedCount++;
      rows.push({ row_number: idx + 2, data: normalized, verified, errors: rowErrors, update_check: updateCheck });
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
  } catch(e) {
    res.status(500).json({ error:'Preview failed: '+e.message });
  }
});

// POST /api/extended-inventory/import/csv/import-selected
router.post('/import/csv/import-selected', auth, requireWrite, async (req,res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const onlyVerified = req.body?.only_verified !== false;
    const allowUpdates = toBool(req.body?.allow_updates);
    const sourcePage = String(req.body?.import_source || 'extended-import').trim();
    if (!rows.length) return res.status(400).json({ error: 'No rows selected for import' });

    const results = {success:0,failed:0,skipped:0,errors:[]};
    for (let idx=0; idx<rows.length; idx++) {
      const entry = rows[idx] || {};
      const r = entry.data || entry;
      const rowLabel = entry.row_number ? `Row ${entry.row_number}` : `Selected row ${idx + 1}`;
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
        const baseErrors = basicExtImportValidation(r);
        if (baseErrors.length) {
          results.skipped++;
          results.errors.push(`${rowLabel}: ${baseErrors.join(', ')}`);
          continue;
        }
        if (r.ip_address?.trim()) {
          const dup = await extPool.query('SELECT id FROM items WHERE LOWER(ip_address)=LOWER($1) LIMIT 1',[r.ip_address.trim()]);
          if (dup.rows.length) {
            if (!allowUpdates) {
              results.skipped++;
              results.errors.push(`${rowLabel}: IP duplicate`);
              continue;
            }
            const updateResult = await updateExtByIP(r, selectedUpdateFields, req.user.username);
            if (updateResult.updated) results.success++;
            else {
              results.skipped++;
              results.errors.push(`${rowLabel}: update skipped (${updateResult.reason || 'no_fields'})`);
            }
            continue;
          }
        }
        const body = await mapExtImportBody(r);
        await extPool.query(INSERT_SQL, buildPayload(body, req.user.username));
        results.success++;
      } catch(err) {
        results.failed++;
        results.errors.push(`${rowLabel}: ${err.message}`);
      }
    }
    await writeImportAuditReport({
      sourcePage,
      targetScope: 'extended-inventory',
      importMode: onlyVerified ? 'csv-selected-verified' : 'csv-selected',
      totalCount: rows.length,
      successCount: results.success,
      failedCount: results.failed,
      skippedCount: results.skipped,
      reasons: results.errors,
      user: req.user,
    });
    res.json(results);
  } catch(e) {
    res.status(500).json({ error:'Import selected failed: '+e.message });
  }
});

// CSV Import
router.post('/import/csv', auth, requireWrite, upload.single('file'), async (req,res) => {
  try {
    if (!req.file) return res.status(400).json({ error:'No file uploaded' });
    const sourceRows = parseSpreadsheetRecords(req.file);
    const rawHeaders = sourceRows[0] ? Object.keys(sourceRows[0]) : [];
    if (!sourceRows.length) return res.status(400).json({ error: 'No data rows found in file' });
    const headerMap = buildImportHeaderMap(rawHeaders, EXT_IMPORT_ALIASES);
    const records = sourceRows.map((row) => remapImportRecord(row, headerMap));
    const mappedFields = Array.from(new Set(Object.values(headerMap)));
    const sourcePage = String(req.body?.import_source || 'extended-import').trim();
    if (!mappedFields.length) {
      return res.status(400).json({ error: 'No recognized columns found. Use the template headers or close variants.' });
    }
    const results = {success:0,failed:0,skipped:0,errors:[], mapped_fields: mappedFields, unmapped_columns: rawHeaders.filter((h) => !headerMap[h])};
    for (let idx=0; idx<records.length; idx++) {
      const r = records[idx];
      try {
        const baseErrors = basicExtImportValidation(r);
        if (baseErrors.length) { results.skipped++; results.errors.push(`Row ${idx+2}: ${baseErrors.join(', ')}`); continue; }
        if (r.ip_address?.trim()) {
          const dup = await extPool.query('SELECT id FROM items WHERE LOWER(ip_address)=LOWER($1)',[r.ip_address.trim()]);
          if (dup.rows.length) { results.skipped++; results.errors.push(`Row ${idx+2}: IP duplicate`); continue; }
        }
        const body = await mapExtImportBody(r);
        await extPool.query(INSERT_SQL, buildPayload(body, req.user.username));
        results.success++;
      } catch(err) { results.failed++; results.errors.push(`Row ${idx+2}: ${err.message}`); }
    }
    await writeImportAuditReport({
      sourcePage,
      targetScope: 'extended-inventory',
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
  } catch(e) { res.status(500).json({ error:'Import failed: '+e.message }); }
});

// Custom fields CRUD (ext_inv schema)
router.get('/custom-fields/all', auth, async (req,res) => {
  try { res.json((await extPool.query('SELECT * FROM custom_fields ORDER BY field_group,sort_order,id')).rows); }
  catch { res.status(500).json({ error:'Server error' }); }
});

router.post('/custom-fields/add', auth, requireAdmin, async (req,res) => {
  try {
    const { field_label,field_key,field_type,field_options,field_group,is_active,sort_order } = req.body;
    if (!field_label||!field_key||!field_type) return res.status(400).json({ error:'label,key,type required' });
    const r = await extPool.query(
      `INSERT INTO custom_fields (field_label,field_key,field_type,field_options,field_group,is_active,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [field_label,field_key,field_type,field_options?JSON.stringify(field_options):null,field_group||'General',is_active!==false,sort_order||0]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) {
    if (e.code==='23505') return res.status(409).json({ error:'Field key exists' });
    res.status(500).json({ error:'Server error' });
  }
});

router.put('/custom-fields/:id', auth, requireAdmin, async (req,res) => {
  try {
    const { field_label,field_type,field_options,field_group,is_active,sort_order } = req.body;
    const r = await extPool.query(
      `UPDATE custom_fields SET field_label=$1,field_type=$2,field_options=$3,field_group=$4,is_active=$5,sort_order=$6,updated_at=NOW() WHERE id=$7 RETURNING *`,
      [field_label,field_type,field_options?JSON.stringify(field_options):null,field_group||'General',is_active,sort_order,req.params.id]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ error:'Server error' }); }
});

router.delete('/custom-fields/:id', auth, requireAdmin, async (req,res) => {
  try { await extPool.query('DELETE FROM custom_fields WHERE id=$1',[req.params.id]); res.json({ message:'Deleted' }); }
  catch { res.status(500).json({ error:'Server error' }); }
});

// ─── BULK UPDATE ──────────────────────────────────────────────────────────────

const EXT_BULK_PATCH_FIELDS  = new Set(['assigned_user','department_id','server_status_id','patching_type_id','patching_schedule_id','location_id','eol_status','status']);
const EXT_BULK_INT_FIELDS    = new Set(['department_id','server_status_id','patching_type_id','patching_schedule_id','location_id']);
const EXT_BULK_EOL_VALUES    = new Set(['InSupport','EOL','Decom','Not Applicable']);
const EXT_BULK_STATUS_VALUES = new Set(['Active','Inactive','Decommissioned','Maintenance']);

async function canUseExtBulkUpdate(req) {
  if (req.user?.role === 'superadmin') return true;
  const r = await pool.query(
    `SELECT is_visible FROM user_page_permissions WHERE user_id=$1 AND page_key='ext-asset-bulk-update' LIMIT 1`,
    [req.user.id]
  );
  if (!r.rows.length) return false;
  return !!r.rows[0].is_visible;
}

function normalizeExtBulkPatch(patch = {}) {
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!EXT_BULK_PATCH_FIELDS.has(k) || v === undefined) continue;
    if (k === 'assigned_user') { out[k] = String(v || '').trim(); continue; }
    if (k === 'eol_status') {
      if (v === null || v === '') { out[k] = 'InSupport'; }
      else if (!EXT_BULK_EOL_VALUES.has(String(v))) { throw new Error(`Invalid eol_status: ${v}`); }
      else { out[k] = String(v); }
      continue;
    }
    if (k === 'status') {
      if (v && !EXT_BULK_STATUS_VALUES.has(String(v))) { throw new Error(`Invalid status: ${v}`); }
      out[k] = String(v || '');
      continue;
    }
    if (EXT_BULK_INT_FIELDS.has(k)) {
      if (v === null || v === '') { out[k] = null; }
      else { const n = parseInt(v, 10); if (Number.isNaN(n)) throw new Error(`Invalid numeric value for ${k}`); out[k] = n; }
      continue;
    }
    out[k] = v;
  }
  return out;
}

async function buildExtFilterWhere(filters = {}) {
  const conds = [], params = [];
  let i = 1;
  if (filters.search) {
    conds.push(`(asset_name ILIKE $${i} OR ip_address ILIKE $${i} OR os_hostname ILIKE $${i} OR assigned_user ILIKE $${i})`);
    params.push(`%${filters.search}%`); i++;
  }
  if (filters.department) {
    const dr = await pool.query('SELECT id FROM departments WHERE name ILIKE $1', [filters.department]);
    if (dr.rows.length) { conds.push(`department_id=$${i++}`); params.push(dr.rows[0].id); }
  }
  if (filters.location) {
    const lr = await pool.query('SELECT id FROM locations WHERE name ILIKE $1', [filters.location]);
    if (lr.rows.length) { conds.push(`location_id=$${i++}`); params.push(lr.rows[0].id); }
  }
  if (filters.server_status) {
    const sr = await pool.query('SELECT id FROM server_status WHERE name ILIKE $1', [filters.server_status]);
    if (sr.rows.length) { conds.push(`server_status_id=$${i++}`); params.push(sr.rows[0].id); }
  }
  if (filters.asset_type) {
    const ar = await pool.query('SELECT id FROM asset_types WHERE name ILIKE $1', [filters.asset_type]);
    if (ar.rows.length) { conds.push(`asset_type_id=$${i++}`); params.push(ar.rows[0].id); }
  }
  return { where: conds.length ? 'WHERE ' + conds.join(' AND ') : '', params };
}

// POST /api/extended-inventory/bulk-update
router.post('/bulk-update', auth, requireWrite, async (req, res) => {
  try {
    const allowed = await canUseExtBulkUpdate(req);
    if (!allowed) return res.status(403).json({ error: 'Access denied for bulk update' });

    const filters   = req.body?.filters || {};
    const patchRaw  = req.body?.patch   || {};
    const dryRun    = req.body?.dry_run === true;
    const patch     = normalizeExtBulkPatch(patchRaw);
    const patchEntries = Object.entries(patch).filter(([k]) => EXT_BULK_PATCH_FIELDS.has(k));
    if (!patchEntries.length) return res.status(400).json({ error: 'patch must include at least one allowed field' });

    const { where, params } = await buildExtFilterWhere(filters);
    const matched = await extPool.query(`SELECT id FROM items ${where} ORDER BY id ASC`, params);
    const ids     = matched.rows.map(r => String(r.id));

    const now  = new Date();
    const jobR = await pool.query(
      `INSERT INTO bulk_jobs (entity_type, filters_json, patch_json, status, total_count,
         requested_by_user_id, requested_by_username, started_at, finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, status, total_count, created_at`,
      ['ext_item', JSON.stringify(filters), JSON.stringify(Object.fromEntries(patchEntries)),
       dryRun ? 'completed' : 'running', ids.length,
       req.user.id, req.user.username || '', now, dryRun ? now : null]
    );
    const job = jobR.rows[0];

    for (const id of ids) {
      await pool.query(
        `INSERT INTO bulk_job_items (job_id, entity_id, status) VALUES ($1,$2,$3)`,
        [job.id, id, dryRun ? 'skipped' : 'pending']
      );
    }

    let successCount = 0, failedCount = 0;

    if (!dryRun && ids.length > 0) {
      const patchObj = Object.fromEntries(patchEntries);
      const sets = [], setParams = [];
      let si = 1;
      for (const [k, v] of Object.entries(patchObj)) { sets.push(`${k}=$${si++}`); setParams.push(v); }

      for (const id of ids) {
        try {
          const before = await extPool.query('SELECT * FROM items WHERE id=$1', [id]);
          if (!before.rows.length) {
            failedCount++;
            await pool.query(`UPDATE bulk_job_items SET status='failed', error_message=$1, updated_at=NOW() WHERE job_id=$2 AND entity_id=$3`, ['Record not found', job.id, id]);
            continue;
          }
          await extPool.query(`UPDATE items SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${si}`, [...setParams, parseInt(id, 10)]);
          const after = await extPool.query('SELECT * FROM items WHERE id=$1', [id]);
          await pool.query(
            `UPDATE bulk_job_items SET status='updated', error_message=NULL, before_json=$1, after_json=$2, updated_at=NOW() WHERE job_id=$3 AND entity_id=$4`,
            [JSON.stringify(before.rows[0] || null), JSON.stringify(after.rows[0] || null), job.id, id]
          );
          successCount++;
          try {
            await writeAuditLog({ entityType:'ext_item', entityId:id, action:'bulk-update',
              beforeState:before.rows[0]||null, afterState:after.rows[0]||null, user:req.user, req });
          } catch (ae) { console.warn(`Audit log failed (ext bulk-update ${id}):`, ae.message); }
        } catch (itemErr) {
          failedCount++;
          await pool.query(`UPDATE bulk_job_items SET status='failed', error_message=$1, updated_at=NOW() WHERE job_id=$2 AND entity_id=$3`, [itemErr.message||'Update failed', job.id, id]);
        }
      }
    }

    if (dryRun) {
      await pool.query(`UPDATE bulk_jobs SET status='completed', success_count=0, failed_count=0, finished_at=NOW() WHERE id=$1`, [job.id]);
    } else {
      const fs = failedCount > 0 && successCount === 0 ? 'failed' : 'completed';
      await pool.query(`UPDATE bulk_jobs SET status=$1, success_count=$2, failed_count=$3, finished_at=NOW() WHERE id=$4`, [fs, successCount, failedCount, job.id]);
    }

    res.status(202).json({
      job_id: job.id,
      status: dryRun ? 'completed' : (failedCount > 0 && successCount === 0 ? 'failed' : 'completed'),
      matched_count: ids.length,
      success_count: successCount,
      failed_count: failedCount,
    });
  } catch (e) {
    if (String(e.message || '').startsWith('Invalid')) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/extended-inventory/bulk-update/:jobId
router.get('/bulk-update/:jobId', auth, async (req, res) => {
  try {
    const allowed = await canUseExtBulkUpdate(req);
    if (!allowed) return res.status(403).json({ error: 'Access denied for bulk update' });
    const job = await pool.query(
      `SELECT id, entity_type, status, total_count, success_count, failed_count, error_message,
              created_at, started_at, finished_at, requested_by_user_id, requested_by_username
       FROM bulk_jobs WHERE id=$1 AND entity_type='ext_item'`,
      [req.params.jobId]
    );
    if (!job.rows.length) return res.status(404).json({ error: 'Bulk job not found' });
    const items = await pool.query(
      `SELECT entity_id, status, error_message, before_json, after_json, updated_at
       FROM bulk_job_items WHERE job_id=$1 ORDER BY id ASC LIMIT 500`,
      [req.params.jobId]
    );
    res.json({ job: job.rows[0], items: items.rows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});


module.exports = router;