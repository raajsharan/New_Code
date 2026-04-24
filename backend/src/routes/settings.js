const router = require('express').Router();
const pool = require('../config/database');
const multer = require('multer');
const { auth, requireAdmin } = require('../middleware/auth');

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpeg|jpg|gif|svg\+xml|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

router.get('/branding', async (req, res) => {
  try {
    const r = await pool.query("SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN ('app_name','company_name','logo_data','logo_filename','theme_color','me_agent_icon_url','tenable_agent_icon_url')");
    const result = {};
    r.rows.forEach(row => { result[row.setting_key] = row.setting_value; });
    res.json(result);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/branding', auth, requireAdmin, async (req, res) => {
  try {
    const { app_name, company_name, theme_color, me_agent_icon_url, tenable_agent_icon_url } = req.body;
    for (const [k, v] of Object.entries({ app_name, company_name, theme_color, me_agent_icon_url, tenable_agent_icon_url })) {
      if (v !== undefined) await pool.query(`INSERT INTO app_settings (setting_key,setting_value) VALUES ($1,$2) ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2, updated_at=NOW()`, [k, v]);
    }
    res.json({ message: 'Branding updated' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.post('/branding/logo', auth, requireAdmin, logoUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    await pool.query(`INSERT INTO app_settings (setting_key,setting_value) VALUES ('logo_data',$1) ON CONFLICT (setting_key) DO UPDATE SET setting_value=$1, updated_at=NOW()`, [dataUrl]);
    await pool.query(`INSERT INTO app_settings (setting_key,setting_value) VALUES ('logo_filename',$1) ON CONFLICT (setting_key) DO UPDATE SET setting_value=$1, updated_at=NOW()`, [req.file.originalname]);
    res.json({ message: 'Logo uploaded', logo_data: dataUrl, filename: req.file.originalname });
  } catch (e) { res.status(500).json({ error: e.message || 'Upload failed' }); }
});

router.delete('/branding/logo', auth, requireAdmin, async (req, res) => {
  try {
    await pool.query("UPDATE app_settings SET setting_value='' WHERE setting_key IN ('logo_data','logo_filename')");
    res.json({ message: 'Logo removed' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── Custom Fields (with field_group) ─────────────────────────────────────────
router.get('/custom-fields', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM custom_fields ORDER BY field_group, sort_order, id');
    res.json(r.rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.post('/custom-fields', auth, requireAdmin, async (req, res) => {
  try {
    const { field_label, field_key, field_type, field_options, field_group, is_active, sort_order } = req.body;
    if (!field_label || !field_key || !field_type) return res.status(400).json({ error: 'label, key and type required' });
    const r = await pool.query(
      `INSERT INTO custom_fields (field_label,field_key,field_type,field_options,field_group,is_active,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [field_label, field_key, field_type, field_options ? JSON.stringify(field_options) : null, field_group || 'General', is_active !== false, sort_order || 0]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Field key already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/custom-fields/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { field_label, field_type, field_options, field_group, is_active, sort_order } = req.body;
    const r = await pool.query(
      `UPDATE custom_fields SET field_label=$1,field_type=$2,field_options=$3,field_group=$4,is_active=$5,sort_order=$6,updated_at=NOW() WHERE id=$7 RETURNING *`,
      [field_label, field_type, field_options ? JSON.stringify(field_options) : null, field_group || 'General', is_active, sort_order, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/custom-fields/:id', auth, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM custom_fields WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── Physical Asset field layout ───────────────────────────────────────────────
router.get('/physical-field-layout', auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key='physical_field_layout'");
    if (!r.rows.length) return res.json({});
    try { res.json(JSON.parse(r.rows[0].setting_value)); } catch { res.json({}); }
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/physical-field-layout', auth, requireAdmin, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES ('physical_field_layout', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value=$1, updated_at=NOW()`,
      [JSON.stringify(req.body)]
    );
    res.json({ message: 'Saved' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── Extended Inventory field layout ──────────────────────────────────────────
// (Extended uses the same layout as Add Asset — they share the same group config)
router.get('/ext-field-layout', auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key='add_asset_field_layout'");
    if (!r.rows.length) return res.json({});
    try { res.json(JSON.parse(r.rows[0].setting_value)); } catch { res.json({}); }
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/ext-field-layout', auth, requireAdmin, async (req, res) => {
  try {
    // Saving ext layout also updates the main asset layout (they are shared)
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES ('add_asset_field_layout', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value=$1, updated_at=NOW()`,
      [JSON.stringify(req.body)]
    );
    res.json({ message: 'Saved' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── OME Status options (manageable list) ─────────────────────────────────────
const DEFAULT_OME_OPTIONS = [
  { value: 'YES', label: 'YES — OME Support Active' },
  { value: 'NO',  label: 'NO — OME Support Expired' },
  { value: 'NA',  label: 'NA — Not Applicable' },
];
const readOmeOptions = async (req, res) => {
  try {
    const r = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key='oem_status_options'");
    if (!r.rows.length) return res.json(DEFAULT_OME_OPTIONS);
    try { res.json(JSON.parse(r.rows[0].setting_value)); } catch { res.json(DEFAULT_OME_OPTIONS); }
  } catch { res.status(500).json({ error: 'Server error' }); }
};
const writeOmeOptions = async (req, res) => {
  try {
    const opts = req.body;
    if (!Array.isArray(opts)) return res.status(400).json({ error: 'Expected array' });
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES ('oem_status_options', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value=$1, updated_at=NOW()`,
      [JSON.stringify(opts)]
    );
    res.json({ message: 'Saved' });
  } catch { res.status(500).json({ error: 'Server error' }); }
};
// Keep both endpoints for backward compatibility.
router.get('/oem-options', auth, readOmeOptions);
router.put('/oem-options', auth, requireAdmin, writeOmeOptions);
router.get('/ome-options', auth, readOmeOptions);
router.put('/ome-options', auth, requireAdmin, writeOmeOptions);

// Dashboard compliance config (for custom dashboard card calculations)
const DEFAULT_DASHBOARD_COMPLIANCE_CONFIG = {
  msl: {
    include_asset_types: ['VM'],
    include_server_statuses: ['Alive', 'Powered Off'],
    exclude_eol_statuses: ['Decom', 'Not Applicable'],
    include_password_statuses: ['Known', 'Unknown'],
  },
  ext: {
    total_scope_exclude_statuses: [],
    total_scope_exclude_eol_statuses: [],
    me_not_applicable: {
      require_me_not_installed: true,
      include_patching_types: ['Exception', 'Beijing IT Team'],
      include_server_statuses: ['Not Alive'],
      include_eol_statuses: ['Decom', 'Not Applicable'],
    },
    auto_patching_types: ['Auto'],
    manual_patching_types: ['Manual'],
    name_conflict_fields: ['vm_name', 'os_hostname'],
  },
  ops: {
    total_include_server_statuses: [],
    auto_patching_types: ['Auto'],
    manual_patching_types: ['Manual'],
    exception_patching_types: ['Exception'],
    beijing_patching_types: ['Beijing IT Team'],
    eol_patching_types: ['EOL - No Patches'],
    not_applicable_patching_types: ['Not Applicable'],
    onboard_pending_patching_types: ['Onboard Pending'],
    on_hold_patching_types: ['On Hold'],
    uncategorized_patching_types: [],
    powered_off_server_statuses: ['Powered Off'],
    compliance_alive_statuses: ['Alive'],
  },
};

router.get('/dashboard-compliance-config', auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key='dashboard_compliance_config'");
    if (!r.rows.length) return res.json(DEFAULT_DASHBOARD_COMPLIANCE_CONFIG);
    try {
      const parsed = JSON.parse(r.rows[0].setting_value || '{}');
      res.json({
        ...DEFAULT_DASHBOARD_COMPLIANCE_CONFIG,
        ...parsed,
        msl: {
          ...DEFAULT_DASHBOARD_COMPLIANCE_CONFIG.msl,
          ...(parsed?.msl || {}),
        },
        ext: {
          ...DEFAULT_DASHBOARD_COMPLIANCE_CONFIG.ext,
          ...(parsed?.ext || {}),
          me_not_applicable: {
            ...DEFAULT_DASHBOARD_COMPLIANCE_CONFIG.ext.me_not_applicable,
            ...(parsed?.ext?.me_not_applicable || {}),
          },
        },
        ops: {
          ...DEFAULT_DASHBOARD_COMPLIANCE_CONFIG.ops,
          ...(parsed?.ops || {}),
        },
      });
    } catch {
      res.json(DEFAULT_DASHBOARD_COMPLIANCE_CONFIG);
    }
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/dashboard-compliance-config', auth, requireAdmin, async (req, res) => {
  try {
    const cfg = req.body;
    if (!cfg || typeof cfg !== 'object') {
      return res.status(400).json({ error: 'Expected configuration object' });
    }
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES ('dashboard_compliance_config', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value=$1, updated_at=NOW()`,
      [JSON.stringify(cfg)]
    );
    res.json({ message: 'Saved' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Dashboard icon config ──────────────────────────────────────────────────────
router.get('/dashboard-icons', auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key='dashboard_icons'");
    if (!r.rows.length) return res.json([]);
    try { res.json(JSON.parse(r.rows[0].setting_value)); } catch { res.json([]); }
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/dashboard-icons', auth, requireAdmin, async (req, res) => {
  try {
    const icons = req.body;
    if (!Array.isArray(icons)) return res.status(400).json({ error: 'Expected array' });
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES ('dashboard_icons', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value=$1, updated_at=NOW()`,
      [JSON.stringify(icons)]
    );
    res.json({ message: 'Saved' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});



// ── Column visibility config ───────────────────────────────────────────────────
['asset', 'ext', 'vmware', 'beijing'].forEach(scope => {
  const dbKey = `column_config_${scope}`;
  router.get(`/column-config/${scope}`, auth, async (req, res) => {
    try {
      const r = await pool.query('SELECT setting_value FROM app_settings WHERE setting_key=$1', [dbKey]);
      if (!r.rows.length) return res.json([]);
      try { res.json(JSON.parse(r.rows[0].setting_value)); } catch { res.json([]); }
    } catch { res.status(500).json({ error: 'Server error' }); }
  });
  router.put(`/column-config/${scope}`, auth, requireAdmin, async (req, res) => {
    try {
      const config = req.body;
      if (!Array.isArray(config)) return res.status(400).json({ error: 'Expected array' });
      await pool.query(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES ($1,$2)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2, updated_at=NOW()`,
        [dbKey, JSON.stringify(config)]
      );
      res.json({ message: 'Saved' });
    } catch { res.status(500).json({ error: 'Server error' }); }
  });
});

// ── Page / navigation icon config ─────────────────────────────────────────────
router.get('/page-icons', auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key='page_icons'");
    if (!r.rows.length) return res.json([]);
    try { res.json(JSON.parse(r.rows[0].setting_value)); } catch { res.json([]); }
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/page-icons', auth, requireAdmin, async (req, res) => {
  try {
    const icons = req.body;
    if (!Array.isArray(icons)) return res.status(400).json({ error: 'Expected array' });
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES ('page_icons', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value=$1, updated_at=NOW()`,
      [JSON.stringify(icons)]
    );
    res.json({ message: 'Saved' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── Built-in field type overrides ─────────────────────────────────────────────
// Supports asset, ext, physical — stored as { [field_key]: { type, options, label } }
['asset', 'ext', 'physical'].forEach(scope => {
  const dbKey = `builtin_field_types_${scope}`;
  router.get(`/builtin-field-types/${scope}`, auth, async (req, res) => {
    try {
      const r = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key=$1", [dbKey]);
      if (!r.rows.length) return res.json({});
      try { res.json(JSON.parse(r.rows[0].setting_value)); } catch { res.json({}); }
    } catch { res.status(500).json({ error: 'Server error' }); }
  });
  router.put(`/builtin-field-types/${scope}`, auth, requireAdmin, async (req, res) => {
    try {
      await pool.query(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES ($1,$2)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2, updated_at=NOW()`,
        [dbKey, JSON.stringify(req.body)]
      );
      res.json({ message: 'Saved' });
    } catch { res.status(500).json({ error: 'Server error' }); }
  });
});

// ── Add Asset field layout ─────────────────────────────────────────────────────
router.get('/field-layout', auth, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT setting_value FROM app_settings WHERE setting_key='add_asset_field_layout'"
    );
    if (!r.rows.length) return res.json({});
    try { res.json(JSON.parse(r.rows[0].setting_value)); }
    catch { res.json({}); }
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/field-layout', auth, requireAdmin, async (req, res) => {
  try {
    const layout = req.body;
    if (typeof layout !== 'object') return res.status(400).json({ error: 'Layout must be an object' });
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES ('add_asset_field_layout', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value=$1, updated_at=NOW()`,
      [JSON.stringify(layout)]
    );
    res.json({ message: 'Layout saved', layout });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.get('/db-commands', auth, requireAdmin, async (req, res) => {
  const fs = require('fs'), path = require('path');
  try {
    const schemaPath = path.join(__dirname, '../../../../database/schema.sql');
    res.json({ sql: fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf8') : '' });
  } catch { res.status(500).json({ error: 'Could not read schema' }); }
});

module.exports = router;