const router = require('express').Router();
const pool = require('../config/database');
const extPool = require('../config/database').extPool;
const { auth } = require('../middleware/auth');

const toInt = (v) => parseInt(v, 10) || 0;
const pct2 = (num, den) => (den > 0 ? Number(((num / den) * 100).toFixed(2)) : 0);
const ensureArr = (v) => Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [];
const mergeUnique = (...lists) => Array.from(new Set(lists.flat().map((x) => String(x || '').trim()).filter(Boolean)));
const DASHBOARD_MSL_PIVOTS = {
  location: {
    label: 'Location',
    join: 'LEFT JOIN locations l ON a.location_id = l.id',
    expr: "COALESCE(l.name,'Unassigned')",
  },
  department: {
    label: 'Department',
    join: 'LEFT JOIN departments d ON a.department_id = d.id',
    expr: "COALESCE(d.name,'Unassigned')",
  },
  asset_type: {
    label: 'Asset Type',
    join: 'LEFT JOIN asset_types at2 ON a.asset_type_id = at2.id',
    expr: "COALESCE(at2.name,'Unassigned')",
  },
  server_status: {
    label: 'Server Status',
    join: 'LEFT JOIN server_status ss2 ON a.server_status_id = ss2.id',
    expr: "COALESCE(ss2.name,'Unassigned')",
  },
  eol_status: {
    label: 'EOL Status',
    join: '',
    expr: "COALESCE(a.eol_status,'InSupport')",
  },
  password_status: {
    label: 'Password Status',
    join: '',
    expr: "(CASE WHEN NULLIF(BTRIM(COALESCE(a.asset_password,'')), '') IS NOT NULL THEN 'Known' ELSE 'Unknown' END)",
  },
};

const DEFAULT_DASHBOARD_COMPLIANCE_CONFIG = {
  msl: {
    include_asset_types: ['VM'],
    include_server_statuses: ['Alive', 'Powered Off'],
    exclude_eol_statuses: ['Decom', 'Not Applicable'],
    include_password_statuses: ['Known', 'Unknown'],
    pivot_by: 'location',
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
    powered_off_server_statuses: ['Alive But Powered Off'],
    compliance_alive_statuses: ['Alive'],
  },
};

let vmTableExistsPromise = null;

async function hasVmTable() {
  if (!vmTableExistsPromise) {
    vmTableExistsPromise = pool
      .query("SELECT to_regclass('public.vm') AS table_name")
      .then((result) => Boolean(result.rows[0]?.table_name))
      .catch((error) => {
        vmTableExistsPromise = null;
        throw error;
      });
  }

  return vmTableExistsPromise;
}

async function getVmCountBreakdown(groupBy) {
  const useVmTable = await hasVmTable();

  if (useVmTable) {
    return pool.query(`
      SELECT COALESCE(${groupBy}, 'Unknown') AS name, COUNT(*)::int AS count
      FROM vm
      GROUP BY ${groupBy}
      ORDER BY count DESC
    `);
  }

  if (groupBy === 'department') {
    return pool.query(`
      SELECT COALESCE(d.name, 'Unknown') AS name, COUNT(*)::int AS count
      FROM assets a
      LEFT JOIN asset_types at ON a.asset_type_id = at.id
      LEFT JOIN departments d ON a.department_id = d.id
      WHERE COALESCE(at.name, '') = 'VM'
      GROUP BY COALESCE(d.name, 'Unknown')
      ORDER BY count DESC
    `);
  }

  return pool.query(`
    SELECT COALESCE(l.name, 'Unknown') AS name, COUNT(*)::int AS count
    FROM assets a
    LEFT JOIN asset_types at ON a.asset_type_id = at.id
    LEFT JOIN locations l ON a.location_id = l.id
    WHERE COALESCE(at.name, '') = 'VM'
    GROUP BY COALESCE(l.name, 'Unknown')
    ORDER BY count DESC
  `);
}

router.get('/vm-count-by-department', auth, async (req, res) => {
  try {
    const result = await getVmCountBreakdown('department');
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/vm-count-by-location', auth, async (req, res) => {
  try {
    const result = await getVmCountBreakdown('location');
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/dashboard/stats
router.get('/stats', auth, async (req, res) => {
  try {
    const cfgR = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key='dashboard_compliance_config'");
    let complianceCfg = DEFAULT_DASHBOARD_COMPLIANCE_CONFIG;
    if (cfgR.rows.length) {
      try {
        const parsed = JSON.parse(cfgR.rows[0].setting_value || '{}');
        complianceCfg = {
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
        };
      } catch {}
    }

    const opsCfg = complianceCfg?.ops || {};
    const opsTotalStatuses = ensureArr(opsCfg.total_include_server_statuses);
    const opsAutoTypes = ensureArr(opsCfg.auto_patching_types);
    const opsManualTypes = ensureArr(opsCfg.manual_patching_types);
    const opsExceptionTypes = ensureArr(opsCfg.exception_patching_types);
    const opsBeijingTypes = ensureArr(opsCfg.beijing_patching_types);
    const opsEolTypes = ensureArr(opsCfg.eol_patching_types);
    const opsNotApplicableTypes = ensureArr(opsCfg.not_applicable_patching_types);
    const opsPendingTypes = ensureArr(opsCfg.onboard_pending_patching_types);
    const opsOnHoldTypes = ensureArr(opsCfg.on_hold_patching_types);
    const opsUncategorizedTypes = ensureArr(opsCfg.uncategorized_patching_types);
    const opsPoweredOffStatuses = mergeUnique(
      ensureArr(opsCfg.powered_off_server_statuses),
      ['Powered Off', 'Alive But Powered Off']
    );
    const opsDeptScopeStatuses = mergeUnique(opsTotalStatuses, opsPoweredOffStatuses);
    const opsComplianceAliveStatuses = ensureArr(opsCfg.compliance_alive_statuses);
    const summaryAssetTypes = ['VM', 'Physical Server'];
    const assetInventoryPatchingAssetTypes = ['VM', 'Physical Server', 'Bare Metal Server', 'Bare Metal'];
    const assetInventoryActiveTypes = mergeUnique(
      opsAutoTypes,
      opsManualTypes,
      opsExceptionTypes,
      opsBeijingTypes,
      opsEolTypes,
      opsNotApplicableTypes
    );
    const assetInventoryNonActiveTypes = mergeUnique(
      opsPendingTypes,
      opsOnHoldTypes,
      opsUncategorizedTypes
    );

    const summary = await pool.query(`
      SELECT
        COUNT(*)                                                          AS all_assets_total,
        COUNT(*) FILTER (WHERE COALESCE(at.name,'') = ANY($1::text[])) AS total_assets,
        COUNT(*) FILTER (WHERE COALESCE(at.name,'')='VM')              AS vm_count,
        COUNT(*) FILTER (WHERE COALESCE(at.name,'')='Physical Server') AS physical_server_count,
        COUNT(*) FILTER (WHERE COALESCE(at.name,'') = ANY($1::text[]) AND a.me_installed_status=TRUE)      AS me_installed_count,
        COUNT(*) FILTER (WHERE COALESCE(at.name,'') = ANY($1::text[]) AND a.tenable_installed_status=TRUE) AS tenable_installed_count,
        COUNT(*) FILTER (WHERE COALESCE(at.name,'') = ANY($1::text[]) AND ((CARDINALITY($2::text[]) = 0 AND COALESCE(pt.name,'') = 'Auto') OR (CARDINALITY($2::text[]) > 0 AND COALESCE(pt.name,'') = ANY($2::text[])))) AS auto_patch_count,
        COUNT(*) FILTER (WHERE COALESCE(at.name,'') = ANY($1::text[]) AND ((CARDINALITY($3::text[]) = 0 AND COALESCE(pt.name,'') = 'Manual') OR (CARDINALITY($3::text[]) > 0 AND COALESCE(pt.name,'') = ANY($3::text[])))) AS manual_patch_count,
        COUNT(*) FILTER (WHERE COALESCE(at.name,'') = ANY($1::text[]) AND ((CARDINALITY($4::text[]) = 0 AND COALESCE(pt.name,'') = 'Exception') OR (CARDINALITY($4::text[]) > 0 AND COALESCE(pt.name,'') = ANY($4::text[])))) AS exception_count,
        COUNT(*) FILTER (WHERE COALESCE(at.name,'') = ANY($1::text[]) AND ((CARDINALITY($5::text[]) = 0 AND COALESCE(pt.name,'') = 'Beijing IT Team') OR (CARDINALITY($5::text[]) > 0 AND COALESCE(pt.name,'') = ANY($5::text[])))) AS beijing_count,
        COUNT(*) FILTER (WHERE COALESCE(at.name,'') = ANY($1::text[]) AND ((CARDINALITY($6::text[]) = 0 AND COALESCE(pt.name,'') = 'EOL - No Patches') OR (CARDINALITY($6::text[]) > 0 AND COALESCE(pt.name,'') = ANY($6::text[])))) AS eol_no_patch_count,
        COUNT(*) FILTER (WHERE COALESCE(at.name,'') = ANY($1::text[]) AND ((CARDINALITY($7::text[]) = 0 AND COALESCE(pt.name,'') = 'Onboard Pending') OR (CARDINALITY($7::text[]) > 0 AND COALESCE(pt.name,'') = ANY($7::text[])))) AS onboard_pending_count,
        COUNT(*) FILTER (WHERE COALESCE(at.name,'') = ANY($1::text[]) AND ((CARDINALITY($8::text[]) = 0 AND COALESCE(pt.name,'') = 'On Hold') OR (CARDINALITY($8::text[]) > 0 AND COALESCE(pt.name,'') = ANY($8::text[])))) AS on_hold_count,
        COUNT(*) FILTER (WHERE COALESCE(at.name,'') = ANY($1::text[]) AND ((CARDINALITY($9::text[]) = 0 AND COALESCE(ss.name,'') = 'Alive') OR (CARDINALITY($9::text[]) > 0 AND COALESCE(ss.name,'') = ANY($9::text[])))) AS alive_servers,
        COUNT(*) FILTER (WHERE COALESCE(at.name,'') = ANY($1::text[]) AND COALESCE(ss.name,'') = ANY($10::text[])) AS powered_off_servers,
        COUNT(*) FILTER (WHERE COALESCE(at.name,'') = ANY($1::text[]) AND COALESCE(ss.name,'')='Not Alive') AS not_alive_servers
      FROM assets a
      LEFT JOIN asset_types at    ON a.asset_type_id    = at.id
      LEFT JOIN patching_types pt ON a.patching_type_id = pt.id
      LEFT JOIN server_status ss  ON a.server_status_id = ss.id
    `, [
      summaryAssetTypes,
      opsAutoTypes,
      opsManualTypes,
      opsExceptionTypes,
      opsBeijingTypes,
      opsEolTypes,
      opsPendingTypes,
      opsOnHoldTypes,
      opsComplianceAliveStatuses,
      opsPoweredOffStatuses,
    ]);

    const locationDist = await pool.query(`
      SELECT l.name AS location, COUNT(*) AS count
      FROM assets a LEFT JOIN locations l ON a.location_id=l.id
      WHERE l.name IS NOT NULL
      GROUP BY l.name ORDER BY count DESC
    `);

    const deptStats = await pool.query(`
      SELECT
        COALESCE(d.name,'Unassigned') AS department,
        COUNT(*)                                                 AS total,
        COUNT(*) FILTER (WHERE (CARDINALITY($1::text[]) = 0 AND COALESCE(pt.name,'') = 'Auto') OR (CARDINALITY($1::text[]) > 0 AND COALESCE(pt.name,'') = ANY($1::text[]))) AS auto_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($2::text[]) = 0 AND COALESCE(pt.name,'') = 'Manual') OR (CARDINALITY($2::text[]) > 0 AND COALESCE(pt.name,'') = ANY($2::text[]))) AS manual_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($3::text[]) = 0 AND COALESCE(pt.name,'') = 'Exception') OR (CARDINALITY($3::text[]) > 0 AND COALESCE(pt.name,'') = ANY($3::text[]))) AS exception_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($4::text[]) = 0 AND COALESCE(pt.name,'') = 'Beijing IT Team') OR (CARDINALITY($4::text[]) > 0 AND COALESCE(pt.name,'') = ANY($4::text[]))) AS beijing_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($5::text[]) = 0 AND COALESCE(pt.name,'') = 'EOL - No Patches') OR (CARDINALITY($5::text[]) > 0 AND COALESCE(pt.name,'') = ANY($5::text[]))) AS eol_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($6::text[]) = 0 AND COALESCE(pt.name,'') = 'Not Applicable') OR (CARDINALITY($6::text[]) > 0 AND COALESCE(pt.name,'') = ANY($6::text[]))) AS not_applicable_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($7::text[]) = 0 AND COALESCE(pt.name,'') = 'Onboard Pending') OR (CARDINALITY($7::text[]) > 0 AND COALESCE(pt.name,'') = ANY($7::text[]))) AS onboard_pending_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($8::text[]) = 0 AND COALESCE(pt.name,'') = 'On Hold') OR (CARDINALITY($8::text[]) > 0 AND COALESCE(pt.name,'') = ANY($8::text[]))) AS on_hold_count,
        COUNT(*) FILTER (
          WHERE (
            (CARDINALITY($9::text[]) > 0 AND COALESCE(pt.name,'') = ANY($9::text[]))
            OR (
              CARDINALITY($9::text[]) = 0
              AND NULLIF(BTRIM(COALESCE(pt.name,'')), '') IS NULL
            )
          )
        ) AS uncategorized_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($10::text[]) = 0 AND COALESCE(ss.name,'') = 'Powered Off') OR (CARDINALITY($10::text[]) > 0 AND COALESCE(ss.name,'') = ANY($10::text[]))) AS alive_powered_off_count
      FROM assets a
      LEFT JOIN asset_types at    ON a.asset_type_id    = at.id
      LEFT JOIN departments d     ON a.department_id    = d.id
      LEFT JOIN patching_types pt ON a.patching_type_id = pt.id
      LEFT JOIN server_status ss  ON a.server_status_id = ss.id
      WHERE COALESCE(at.name,'') = 'VM'
        AND (CARDINALITY($11::text[]) = 0 OR COALESCE(ss.name,'') = ANY($11::text[]))
      GROUP BY COALESCE(d.name,'Unassigned')
      ORDER BY total DESC
    `, [opsAutoTypes, opsManualTypes, opsExceptionTypes, opsBeijingTypes, opsEolTypes, opsNotApplicableTypes, opsPendingTypes, opsOnHoldTypes, opsUncategorizedTypes, opsPoweredOffStatuses, opsDeptScopeStatuses]);

    const compliance = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE (CARDINALITY($1::text[]) = 0 AND COALESCE(ss.name,'') = 'Alive') OR (CARDINALITY($1::text[]) > 0 AND COALESCE(ss.name,'') = ANY($1::text[]))) AS total_alive,
        COUNT(*) FILTER (WHERE ((CARDINALITY($2::text[]) = 0 AND COALESCE(pt.name,'') = 'Auto') OR (CARDINALITY($2::text[]) > 0 AND COALESCE(pt.name,'') = ANY($2::text[]))) AND ((CARDINALITY($1::text[]) = 0 AND COALESCE(ss.name,'') = 'Alive') OR (CARDINALITY($1::text[]) > 0 AND COALESCE(ss.name,'') = ANY($1::text[])))) AS auto_alive,
        COUNT(*) FILTER (WHERE ((CARDINALITY($3::text[]) = 0 AND COALESCE(pt.name,'') = 'Manual') OR (CARDINALITY($3::text[]) > 0 AND COALESCE(pt.name,'') = ANY($3::text[]))) AND ((CARDINALITY($1::text[]) = 0 AND COALESCE(ss.name,'') = 'Alive') OR (CARDINALITY($1::text[]) > 0 AND COALESCE(ss.name,'') = ANY($1::text[])))) AS manual_alive,
        COUNT(*) FILTER (WHERE (CARDINALITY($4::text[]) = 0 AND COALESCE(pt.name,'') = 'EOL - No Patches') OR (CARDINALITY($4::text[]) > 0 AND COALESCE(pt.name,'') = ANY($4::text[]))) AS eol_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($5::text[]) = 0 AND COALESCE(pt.name,'') = 'Exception') OR (CARDINALITY($5::text[]) > 0 AND COALESCE(pt.name,'') = ANY($5::text[]))) AS exception_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($6::text[]) = 0 AND COALESCE(pt.name,'') = 'Beijing IT Team') OR (CARDINALITY($6::text[]) > 0 AND COALESCE(pt.name,'') = ANY($6::text[]))) AS beijing_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($7::text[]) = 0 AND COALESCE(pt.name,'') = 'Onboard Pending') OR (CARDINALITY($7::text[]) > 0 AND COALESCE(pt.name,'') = ANY($7::text[]))) AS onboard_pending_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($8::text[]) = 0 AND COALESCE(pt.name,'') = 'On Hold') OR (CARDINALITY($8::text[]) > 0 AND COALESCE(pt.name,'') = ANY($8::text[]))) AS on_hold_count,
        COUNT(*)                                                                   AS grand_total
      FROM assets a
      LEFT JOIN patching_types pt ON a.patching_type_id = pt.id
      LEFT JOIN server_status  ss ON a.server_status_id = ss.id
    `, [opsComplianceAliveStatuses, opsAutoTypes, opsManualTypes, opsEolTypes, opsExceptionTypes, opsBeijingTypes, opsPendingTypes, opsOnHoldTypes]);

    const assetInventoryActiveStatusResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE COALESCE(at.name, '') = ANY($1::text[])
            AND COALESCE(ot.name, '') = ANY($2::text[])
        ) AS total,
        COUNT(*) FILTER (
          WHERE COALESCE(at.name, '') = ANY($1::text[])
            AND COALESCE(ot.name, '') = ANY($2::text[])
            AND COALESCE(pt.name, '') = ANY($3::text[])
        ) AS active,
        COUNT(*) FILTER (
          WHERE COALESCE(at.name, '') = ANY($1::text[])
            AND COALESCE(ot.name, '') = ANY($2::text[])
            AND (
              COALESCE(pt.name, '') = ANY($4::text[])
              OR (
                CARDINALITY($4::text[]) = 0
                AND NULLIF(BTRIM(COALESCE(pt.name, '')), '') IS NULL
              )
            )
        ) AS non_active
        ,
        COUNT(*) FILTER (
          WHERE COALESCE(at.name, '') = ANY($1::text[])
            AND COALESCE(ot.name, '') = ANY($2::text[])
            AND COALESCE(pt.name, '') = ANY($5::text[])
        ) AS pending,
        COUNT(*) FILTER (
          WHERE COALESCE(at.name, '') = ANY($1::text[])
            AND COALESCE(ot.name, '') = ANY($2::text[])
            AND COALESCE(pt.name, '') = ANY($6::text[])
        ) AS on_hold
      FROM assets a
      LEFT JOIN asset_types at ON a.asset_type_id = at.id
      LEFT JOIN os_types ot ON a.os_type_id = ot.id
      LEFT JOIN patching_types pt ON a.patching_type_id = pt.id
    `, [['VM', 'Physical Server'], ['Windows', 'Linux'], assetInventoryActiveTypes, assetInventoryNonActiveTypes, opsPendingTypes, opsOnHoldTypes]);

    const assetInventoryPatchingStatusResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE COALESCE(at.name, '') = ANY($1::text[])
        ) AS total,
        COUNT(*) FILTER (
          WHERE COALESCE(at.name, '') = ANY($1::text[])
            AND ((CARDINALITY($2::text[]) = 0 AND COALESCE(pt.name,'') = 'Auto') OR (CARDINALITY($2::text[]) > 0 AND COALESCE(pt.name,'') = ANY($2::text[])))
        ) AS auto_count,
        COUNT(*) FILTER (
          WHERE COALESCE(at.name, '') = ANY($1::text[])
            AND ((CARDINALITY($3::text[]) = 0 AND COALESCE(pt.name,'') = 'Manual') OR (CARDINALITY($3::text[]) > 0 AND COALESCE(pt.name,'') = ANY($3::text[])))
        ) AS manual_count,
        COUNT(*) FILTER (
          WHERE COALESCE(at.name, '') = ANY($1::text[])
            AND ((CARDINALITY($4::text[]) = 0 AND COALESCE(pt.name,'') = 'Exception') OR (CARDINALITY($4::text[]) > 0 AND COALESCE(pt.name,'') = ANY($4::text[])))
        ) AS exception_count,
        COUNT(*) FILTER (
          WHERE COALESCE(at.name, '') = ANY($1::text[])
            AND ((CARDINALITY($5::text[]) = 0 AND COALESCE(pt.name,'') = 'Beijing IT Team') OR (CARDINALITY($5::text[]) > 0 AND COALESCE(pt.name,'') = ANY($5::text[])))
        ) AS beijing_count,
        COUNT(*) FILTER (
          WHERE COALESCE(at.name, '') = ANY($1::text[])
            AND ((CARDINALITY($6::text[]) = 0 AND COALESCE(pt.name,'') = 'EOL - No Patches') OR (CARDINALITY($6::text[]) > 0 AND COALESCE(pt.name,'') = ANY($6::text[])))
        ) AS eol_count,
        COUNT(*) FILTER (
          WHERE COALESCE(at.name, '') = ANY($1::text[])
            AND ((CARDINALITY($7::text[]) = 0 AND COALESCE(pt.name,'') = 'Onboard Pending') OR (CARDINALITY($7::text[]) > 0 AND COALESCE(pt.name,'') = ANY($7::text[])))
        ) AS pending_count,
        COUNT(*) FILTER (
          WHERE COALESCE(at.name, '') = ANY($1::text[])
            AND ((CARDINALITY($8::text[]) = 0 AND COALESCE(pt.name,'') = 'On Hold') OR (CARDINALITY($8::text[]) > 0 AND COALESCE(pt.name,'') = ANY($8::text[])))
        ) AS on_hold_count,
        COUNT(*) FILTER (
          WHERE COALESCE(at.name, '') = ANY($1::text[])
            AND ((CARDINALITY($9::text[]) = 0 AND COALESCE(ss.name,'') = 'Alive But Powered Off') OR (CARDINALITY($9::text[]) > 0 AND COALESCE(ss.name,'') = ANY($9::text[])))
        ) AS alive_powered_off_count
      FROM assets a
      LEFT JOIN asset_types at ON a.asset_type_id = at.id
      LEFT JOIN patching_types pt ON a.patching_type_id = pt.id
      LEFT JOIN server_status ss ON a.server_status_id = ss.id
    `, [assetInventoryPatchingAssetTypes, opsAutoTypes, opsManualTypes, opsExceptionTypes, opsBeijingTypes, opsEolTypes, opsPendingTypes, opsOnHoldTypes, opsPoweredOffStatuses]);

    const allLocations = await pool.query('SELECT name FROM locations ORDER BY name');
    const locationStats = await pool.query(`
      SELECT
        COALESCE(l.name,'Unassigned') AS location,
        COUNT(*)                                                 AS total,
        COUNT(*) FILTER (WHERE at.name='VM')                    AS vm_count,
        COUNT(*) FILTER (WHERE at.name='Physical Server')       AS physical_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($1::text[]) = 0 AND COALESCE(pt.name,'') = 'Auto') OR (CARDINALITY($1::text[]) > 0 AND COALESCE(pt.name,'') = ANY($1::text[]))) AS auto_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($2::text[]) = 0 AND COALESCE(pt.name,'') = 'Manual') OR (CARDINALITY($2::text[]) > 0 AND COALESCE(pt.name,'') = ANY($2::text[]))) AS manual_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($3::text[]) = 0 AND COALESCE(pt.name,'') = 'Beijing IT Team') OR (CARDINALITY($3::text[]) > 0 AND COALESCE(pt.name,'') = ANY($3::text[]))) AS beijing_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($4::text[]) = 0 AND COALESCE(pt.name,'') = 'Onboard Pending') OR (CARDINALITY($4::text[]) > 0 AND COALESCE(pt.name,'') = ANY($4::text[]))) AS onboard_pending_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($5::text[]) = 0 AND COALESCE(pt.name,'') = 'Exception') OR (CARDINALITY($5::text[]) > 0 AND COALESCE(pt.name,'') = ANY($5::text[]))) AS exception_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($6::text[]) = 0 AND COALESCE(pt.name,'') = 'EOL - No Patches') OR (CARDINALITY($6::text[]) > 0 AND COALESCE(pt.name,'') = ANY($6::text[]))) AS eol_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($7::text[]) = 0 AND COALESCE(pt.name,'') = 'On Hold') OR (CARDINALITY($7::text[]) > 0 AND COALESCE(pt.name,'') = ANY($7::text[]))) AS on_hold_count,
        COUNT(*) FILTER (WHERE (CARDINALITY($8::text[]) = 0 AND COALESCE(ss.name,'') = 'Alive') OR (CARDINALITY($8::text[]) > 0 AND COALESCE(ss.name,'') = ANY($8::text[]))) AS alive_count
      FROM assets a
      LEFT JOIN locations      l  ON a.location_id      = l.id
      LEFT JOIN patching_types pt ON a.patching_type_id = pt.id
      LEFT JOIN asset_types    at ON a.asset_type_id    = at.id
      LEFT JOIN server_status  ss ON a.server_status_id = ss.id
      WHERE (CARDINALITY($9::text[]) = 0 OR COALESCE(ss.name,'') = ANY($9::text[]))
      GROUP BY COALESCE(l.name,'Unassigned')
      ORDER BY total DESC
    `, [opsAutoTypes, opsManualTypes, opsBeijingTypes, opsPendingTypes, opsExceptionTypes, opsEolTypes, opsOnHoldTypes, opsComplianceAliveStatuses, opsTotalStatuses]);
    const locMap = {};
    locationStats.rows.forEach((r) => { locMap[r.location] = r; });
    const zeroRow = (name) => ({
      location: name, total: '0', vm_count: '0', physical_count: '0',
      auto_count: '0', manual_count: '0', beijing_count: '0',
      onboard_pending_count: '0', exception_count: '0', eol_count: '0',
      on_hold_count: '0', alive_count: '0',
    });
    const fullLocationStats = allLocations.rows.map((l) => locMap[l.name] || zeroRow(l.name));

    const c = compliance.rows[0] || {};
    const ai = assetInventoryActiveStatusResult.rows[0] || {};
    const aip = assetInventoryPatchingStatusResult.rows[0] || {};
    const totalAlive = toInt(c.total_alive);
    const autoAlive = toInt(c.auto_alive);
    const manualAlive = toInt(c.manual_alive);
    const compliancePct = totalAlive > 0 ? Math.round(((autoAlive + manualAlive) / totalAlive) * 100) : 0;
    const assetInventoryActiveStatus = {
      total: toInt(ai.total),
      active: toInt(ai.active),
      non_active: toInt(ai.non_active),
      pending: toInt(ai.pending),
      on_hold: toInt(ai.on_hold),
      uncategorized: Math.max(0, toInt(ai.total) - toInt(ai.active) - toInt(ai.non_active)),
    };
    const assetInventoryPatchingStatus = {
      total: toInt(aip.total),
      auto: toInt(aip.auto_count),
      manual: toInt(aip.manual_count),
      exception: toInt(aip.exception_count),
      beijing: toInt(aip.beijing_count),
      eol: toInt(aip.eol_count),
      pending: toInt(aip.pending_count),
      on_hold: toInt(aip.on_hold_count),
      alive_powered_off: toInt(aip.alive_powered_off_count),
    };

    // Extended inventory sections
    let extStats = { total: 0, active: 0, inactive: 0, decommissioned: 0, maintenance: 0, me_count: 0, tenable_count: 0 };
    let extDeptStats = [];
    let extLocationStats = [];
    let extCompliance = { compliance_pct: 0, total_alive: 0, auto_alive: 0, manual_alive: 0, grand_total: 0 };
    let extEndpoint = {
      total_endpoints: 0,
      password_received: 0,
      compliance_pct: 0,
      me_installed: 0,
      me_not_applicable: 0,
      name_conflicts: 0,
      auto_patching: 0,
      manual_patching: 0,
    };

    try {
      const extTotalExcludeStatuses = ensureArr(complianceCfg?.ext?.total_scope_exclude_statuses);
      const extTotalExcludeEol = ensureArr(complianceCfg?.ext?.total_scope_exclude_eol_statuses);
      const meCfg = complianceCfg?.ext?.me_not_applicable || {};
      const meNotInstalledOnly = meCfg.require_me_not_installed !== false;
      const mePatchTypes = ensureArr(meCfg.include_patching_types);
      const meServerStatuses = ensureArr(meCfg.include_server_statuses);
      const meEolStatuses = ensureArr(meCfg.include_eol_statuses);
      const autoTypes = ensureArr(complianceCfg?.ext?.auto_patching_types);
      const manualTypes = ensureArr(complianceCfg?.ext?.manual_patching_types);
      const conflictFields = ensureArr(complianceCfg?.ext?.name_conflict_fields);
      const includeVmConflicts = conflictFields.includes('vm_name');
      const includeHostConflicts = conflictFields.includes('os_hostname');

      const [extSummary, extDept, extLoc, extComp, extEndpointBase, extNameConflict] = await Promise.all([
        extPool.query(`
          SELECT
            COUNT(*)                                                   AS total,
            COUNT(*) FILTER (WHERE status='Active')                    AS active,
            COUNT(*) FILTER (WHERE status='Inactive')                  AS inactive,
            COUNT(*) FILTER (WHERE status='Decommissioned')            AS decommissioned,
            COUNT(*) FILTER (WHERE status='Maintenance')               AS maintenance,
            COUNT(*) FILTER (WHERE me_installed_status=TRUE)           AS me_count,
            COUNT(*) FILTER (WHERE tenable_installed_status=TRUE)      AS tenable_count
          FROM items`),
        extPool.query(`
          SELECT
            COALESCE(d.name,'Unassigned') AS department,
            COUNT(*)                                                   AS total,
            COUNT(*) FILTER (WHERE i.status='Active')                  AS active_count,
            COUNT(*) FILTER (WHERE i.status='Inactive')                AS inactive_count,
            COUNT(*) FILTER (WHERE i.status='Decommissioned')          AS decommissioned_count,
            COUNT(*) FILTER (WHERE i.status='Maintenance')             AS maintenance_count,
            COUNT(*) FILTER (WHERE i.me_installed_status=TRUE)         AS me_count,
            COUNT(*) FILTER (WHERE i.tenable_installed_status=TRUE)    AS tenable_count,
            COUNT(*) FILTER (WHERE COALESCE(pt.name,'')='Auto')        AS auto_count,
            COUNT(*) FILTER (WHERE COALESCE(pt.name,'')='Manual')      AS manual_count,
            COUNT(*) FILTER (WHERE COALESCE(pt.name,'')='Exception')   AS exception_count,
            COUNT(*) FILTER (WHERE COALESCE(pt.name,'')='Beijing IT Team') AS beijing_count,
            COUNT(*) FILTER (WHERE COALESCE(pt.name,'')='EOL - No Patches') AS eol_count,
            COUNT(*) FILTER (WHERE COALESCE(pt.name,'')='Not Applicable') AS not_applicable_count,
            COUNT(*) FILTER (WHERE COALESCE(pt.name,'')='Onboard Pending') AS onboard_pending_count,
            COUNT(*) FILTER (WHERE COALESCE(pt.name,'')='On Hold')     AS on_hold_count,
            COUNT(*) FILTER (WHERE COALESCE(ss.name,'')='Alive')       AS alive_count,
            COUNT(*) FILTER (WHERE COALESCE(ss.name,'')='Powered Off') AS powered_off_count,
            COUNT(*) FILTER (WHERE COALESCE(ss.name,'')='Not Alive')   AS not_alive_count
          FROM items i
          LEFT JOIN public.departments d ON i.department_id = d.id
          LEFT JOIN public.patching_types pt ON i.patching_type_id = pt.id
          LEFT JOIN public.server_status ss ON i.server_status_id = ss.id
          GROUP BY COALESCE(d.name,'Unassigned')
          ORDER BY total DESC`),
        extPool.query(`
          SELECT
            COALESCE(l.name,'Unassigned') AS location,
            COUNT(*)                                                   AS total,
            COUNT(*) FILTER (WHERE i.status='Active')                  AS active_count,
            COUNT(*) FILTER (WHERE i.status='Inactive')                AS inactive_count,
            COUNT(*) FILTER (WHERE i.me_installed_status=TRUE)         AS me_count,
            COUNT(*) FILTER (WHERE i.tenable_installed_status=TRUE)    AS tenable_count
          FROM items i
          LEFT JOIN public.locations l ON i.location_id = l.id
          GROUP BY COALESCE(l.name,'Unassigned')
          ORDER BY total DESC`),
        extPool.query(`
          SELECT
            COUNT(*) FILTER (WHERE ss.name='Alive')                    AS total_alive,
            COUNT(*) FILTER (WHERE i.patching_type_id IS NOT NULL AND ss.name='Alive') AS auto_alive,
            COUNT(*)                                                    AS grand_total
          FROM items i
          LEFT JOIN public.server_status ss ON i.server_status_id = ss.id`),
        extPool.query(`
          SELECT
            COUNT(*) AS total_endpoints,
            COUNT(*) FILTER (WHERE NULLIF(BTRIM(COALESCE(i.asset_password,'')), '') IS NOT NULL) AS password_received,
            COUNT(*) FILTER (WHERE i.me_installed_status=TRUE) AS me_installed,
            COUNT(*) FILTER (
              WHERE ($1::boolean = FALSE OR i.me_installed_status = FALSE)
                AND (
                  (CARDINALITY($2::text[]) > 0 AND COALESCE(pt.name,'') = ANY($2::text[]))
                  OR (CARDINALITY($3::text[]) > 0 AND COALESCE(ss.name,'') = ANY($3::text[]))
                  OR (CARDINALITY($4::text[]) > 0 AND COALESCE(i.eol_status,'InSupport') = ANY($4::text[]))
                )
            ) AS me_not_applicable,
            COUNT(*) FILTER (
              WHERE (
                (CARDINALITY($5::text[]) = 0 AND COALESCE(pt.name,'') = 'Auto')
                OR (CARDINALITY($5::text[]) > 0 AND COALESCE(pt.name,'') = ANY($5::text[]))
              )
            ) AS auto_patching,
            COUNT(*) FILTER (
              WHERE (
                (CARDINALITY($6::text[]) = 0 AND COALESCE(pt.name,'') = 'Manual')
                OR (CARDINALITY($6::text[]) > 0 AND COALESCE(pt.name,'') = ANY($6::text[]))
              )
            ) AS manual_patching
          FROM items i
          LEFT JOIN public.patching_types pt ON i.patching_type_id = pt.id
          LEFT JOIN public.server_status ss ON i.server_status_id = ss.id
          WHERE (CARDINALITY($7::text[]) = 0 OR COALESCE(i.status,'') <> ALL($7::text[]))
            AND (CARDINALITY($8::text[]) = 0 OR COALESCE(i.eol_status,'InSupport') <> ALL($8::text[]))`,
          [meNotInstalledOnly, mePatchTypes, meServerStatuses, meEolStatuses, autoTypes, manualTypes, extTotalExcludeStatuses, extTotalExcludeEol]),
        extPool.query(`
          WITH vm_dup AS (
            SELECT vm_name
            FROM items
            WHERE NULLIF(BTRIM(COALESCE(vm_name,'')), '') IS NOT NULL
            GROUP BY vm_name
            HAVING COUNT(*) > 1
          ),
          host_dup AS (
            SELECT os_hostname
            FROM items
            WHERE NULLIF(BTRIM(COALESCE(os_hostname,'')), '') IS NOT NULL
            GROUP BY os_hostname
            HAVING COUNT(*) > 1
          )
          SELECT COUNT(*) AS name_conflicts
          FROM items i
          WHERE ($1::boolean = TRUE AND i.vm_name IN (SELECT vm_name FROM vm_dup))
             OR ($2::boolean = TRUE AND i.os_hostname IN (SELECT os_hostname FROM host_dup))`,
          [includeVmConflicts, includeHostConflicts]),
      ]);

      extStats = extSummary.rows[0] || extStats;
      extDeptStats = extDept.rows || [];
      extLocationStats = extLoc.rows || [];

      const ec = extComp.rows[0] || {};
      const etAlive = toInt(ec.total_alive);
      const eaAlive = toInt(ec.auto_alive);
      extCompliance = { ...ec, compliance_pct: etAlive > 0 ? Math.round((eaAlive / etAlive) * 100) : 0 };

      const eb = extEndpointBase.rows[0] || {};
      const extSummaryTotal = toInt(extStats.total);
      const extEndpointTotal = toInt(eb.total_endpoints);
      const effectiveExtTotal = extEndpointTotal || extSummaryTotal;
      extEndpoint = {
        total_endpoints: effectiveExtTotal,
        password_received: toInt(eb.password_received),
        compliance_pct: pct2(toInt(eb.password_received), effectiveExtTotal),
        me_installed: toInt(eb.me_installed),
        me_not_applicable: toInt(eb.me_not_applicable),
        name_conflicts: toInt(extNameConflict.rows?.[0]?.name_conflicts),
        auto_patching: toInt(eb.auto_patching),
        manual_patching: toInt(eb.manual_patching),
      };
    } catch (e) {
      console.warn('Extended inventory stats failed:', e.message);
    }

    // New card 1: Total inventory MSL compliance + location-wise MSL
    const mslAssetTypes = ensureArr(complianceCfg?.msl?.include_asset_types);
    const mslServerStatuses = ensureArr(complianceCfg?.msl?.include_server_statuses);
    const mslExcludeEol = ensureArr(complianceCfg?.msl?.exclude_eol_statuses);
    const mslPasswordStatuses = ensureArr(complianceCfg?.msl?.include_password_statuses);
    const mslPivotBy = String(complianceCfg?.msl?.pivot_by || 'location').trim();
    const pivotCfg = DASHBOARD_MSL_PIVOTS[mslPivotBy] || DASHBOARD_MSL_PIVOTS.location;

    const mslScope = await pool.query(`
      SELECT
        COUNT(*) AS total_scope,
        COUNT(*) FILTER (WHERE NULLIF(BTRIM(COALESCE(a.asset_password,'')), '') IS NOT NULL) AS compliant_scope
      FROM assets a
      LEFT JOIN asset_types at ON a.asset_type_id = at.id
      LEFT JOIN server_status ss ON a.server_status_id = ss.id
      WHERE (CARDINALITY($1::text[]) = 0 OR COALESCE(at.name,'') = ANY($1::text[]))
        AND (CARDINALITY($2::text[]) = 0 OR COALESCE(ss.name,'') = ANY($2::text[]))
        AND (CARDINALITY($3::text[]) = 0 OR COALESCE(a.eol_status,'InSupport') <> ALL($3::text[]))
        AND (CARDINALITY($4::text[]) = 0 OR (CASE
          WHEN NULLIF(BTRIM(COALESCE(a.asset_password,'')), '') IS NOT NULL THEN 'Known'
          ELSE 'Unknown'
        END) = ANY($4::text[]))
    `, [mslAssetTypes, mslServerStatuses, mslExcludeEol, mslPasswordStatuses]);

    const mslPivot = await pool.query(`
      SELECT
        ${pivotCfg.expr} AS pivot_value,
        COUNT(*) AS total_scope,
        COUNT(*) FILTER (WHERE NULLIF(BTRIM(COALESCE(a.asset_password,'')), '') IS NOT NULL) AS compliant_scope
      FROM assets a
      LEFT JOIN asset_types at ON a.asset_type_id = at.id
      LEFT JOIN server_status ss ON a.server_status_id = ss.id
      ${pivotCfg.join}
      WHERE (CARDINALITY($1::text[]) = 0 OR COALESCE(at.name,'') = ANY($1::text[]))
        AND (CARDINALITY($2::text[]) = 0 OR COALESCE(ss.name,'') = ANY($2::text[]))
        AND (CARDINALITY($3::text[]) = 0 OR COALESCE(a.eol_status,'InSupport') <> ALL($3::text[]))
        AND (CARDINALITY($4::text[]) = 0 OR (CASE
          WHEN NULLIF(BTRIM(COALESCE(a.asset_password,'')), '') IS NOT NULL THEN 'Known'
          ELSE 'Unknown'
        END) = ANY($4::text[]))
      GROUP BY ${pivotCfg.expr}
      ORDER BY total_scope DESC, pivot_value ASC
    `, [mslAssetTypes, mslServerStatuses, mslExcludeEol, mslPasswordStatuses]);

    const mslScopedTotal = toInt(mslScope.rows?.[0]?.total_scope);
    const mslCompliant = toInt(mslScope.rows?.[0]?.compliant_scope);
    const mslTotal = toInt(summary.rows?.[0]?.all_assets_total);
    const extTotal = toInt(extStats.total);
    const extCompliant = toInt(extEndpoint.password_received);
    const combinedTotal = mslTotal + extTotal;
    const combinedCompliant = mslCompliant + extCompliant;

    const inventoryCompliance = {
      msl: { compliant: mslCompliant, total: mslTotal, scoped_total: mslScopedTotal, pct: pct2(mslCompliant, mslTotal) },
      ext: { compliant: extCompliant, total: extTotal, pct: pct2(extCompliant, extTotal) },
      combined: { compliant: combinedCompliant, total: combinedTotal, pct: pct2(combinedCompliant, combinedTotal) },
      msl_pivot_by: mslPivotBy in DASHBOARD_MSL_PIVOTS ? mslPivotBy : 'location',
      msl_pivot_label: pivotCfg.label,
      msl_pivot_stats: (mslPivot.rows || []).map((r) => {
        const total = toInt(r.total_scope);
        const compliant = toInt(r.compliant_scope);
        return { pivot_value: r.pivot_value, compliant, total, pct: pct2(compliant, total) };
      }),
      msl_location_stats: (mslPivot.rows || []).map((r) => {
        const total = toInt(r.total_scope);
        const compliant = toInt(r.compliant_scope);
        return { location: r.pivot_value, compliant, total, pct: pct2(compliant, total) };
      }),
    };

    res.json({
      ...summary.rows[0],
      location_distribution: locationDist.rows,
      dept_stats: deptStats.rows,
      compliance: { ...c, compliance_pct: compliancePct },
      location_stats: fullLocationStats,
      ext_stats: extStats,
      asset_inventory_active_status: assetInventoryActiveStatus,
      asset_inventory_patching_status: assetInventoryPatchingStatus,
      ext_dept_stats: extDeptStats,
      ext_location_stats: extLocationStats,
      ext_compliance: extCompliance,
      inventory_compliance: inventoryCompliance,
      ext_endpoint_compliance: extEndpoint,
      ops_matrix_config: {
        labels: {
          alive_powered_off: 'Alive but Powered Off',
          auto: 'Auto',
          beijing: 'Beijing IT Team',
          exception: 'Exception',
          manual: 'Manual',
          not_applicable: 'Not Applicable',
          on_hold: 'On Hold',
          onboard_pending: 'Onboard Pending',
          uncategorized: '—',
          total: 'Total',
        },
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

