/**
 * /api/backup — Backup management (PostgreSQL dump + CSV schedule)
 */
const router  = require('express').Router();
const pool    = require('../config/database');
const { auth, requireAdmin } = require('../middleware/auth');
const { exec } = require('child_process');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');

const DEFAULT_SCHEDULE = {
  pg_enabled: false,
  pg_frequency: 'daily',
  pg_time: '02:00',
  pg_retain_days: 7,
  pg_backup_path: '/backups/postgres',
  pg_overwrite: false,
  csv_enabled: false,
  csv_frequency: 'daily',
  csv_time: '03:00',
  csv_retain_days: 7,
  csv_include_assets: true,
  csv_include_ext: true,
  csv_backup_path: '/backups/csv',
  csv_overwrite: false,
};
const SCHEDULER_TICK_MS = 30000;
const lastRunMap = new Map();
let schedulerInitialized = false;

// ── Backup log table (in-memory for session, persisted to app_settings) ──────
async function getBackupLog() {
  try {
    const r = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key='backup_log'");
    if (r.rows.length) return JSON.parse(r.rows[0].setting_value || '[]');
  } catch {}
  return [];
}
async function appendBackupLog(entry) {
  try {
    const log = await getBackupLog();
    log.unshift(entry); // newest first
    const trimmed = log.slice(0, 50); // keep last 50
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES ('backup_log', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value=$1, updated_at=NOW()`,
      [JSON.stringify(trimmed)]
    );
  } catch {}
}

const readSchedule = async () => {
  try {
    const r = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key='backup_schedule'");
    const saved = r.rows.length ? JSON.parse(r.rows[0].setting_value || '{}') : {};
    return { ...DEFAULT_SCHEDULE, ...saved };
  } catch {
    return { ...DEFAULT_SCHEDULE };
  }
};

const toCronKey = (frequency = 'daily', hhmm = '00:00') => `${frequency}:${hhmm}`;

function shouldRunNow(prefix, frequency, hhmm, now = new Date()) {
  const [hStr, mStr] = String(hhmm || '00:00').split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
  if (now.getHours() !== h || now.getMinutes() !== m) return false;

  if (frequency === 'weekly' && now.getDay() !== 1) return false; // Monday
  if (frequency === 'monthly' && now.getDate() !== 1) return false;

  const runKey = `${prefix}:${toCronKey(frequency, hhmm)}`;
  const stamp = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} ${now.getHours()}:${now.getMinutes()}`;
  if (lastRunMap.get(runKey) === stamp) return false;
  lastRunMap.set(runKey, stamp);
  return true;
}

function runPgDump(dbConfig) {
  const env = { ...process.env, PGPASSWORD: dbConfig.password };
  const cmd = `pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -F p --no-password`;
  return new Promise((resolve, reject) => {
    exec(cmd, { env, maxBuffer: 100 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

function cleanupOldPgBackups(dirPath, retainDays) {
  const keepMs = Math.max(1, parseInt(retainDays, 10) || 7) * 24 * 60 * 60 * 1000;
  const now = Date.now();
  try {
    const files = fs.readdirSync(dirPath);
    files
      .filter((name) => /^infra_backup_.*\.sql$/i.test(name) || name === 'infra_backup.sql')
      .forEach((name) => {
        const full = path.join(dirPath, name);
        try {
          const st = fs.statSync(full);
          if ((now - st.mtimeMs) > keepMs) fs.unlinkSync(full);
        } catch {}
      });
  } catch {}
}

function cleanupOldCsvBackups(dirPath, retainDays) {
  const keepMs = Math.max(1, parseInt(retainDays, 10) || 7) * 24 * 60 * 60 * 1000;
  const now = Date.now();
  try {
    const files = fs.readdirSync(dirPath);
    files
      .filter((name) =>
        /^asset_inventory_.*\.csv$/i.test(name)
        || /^ext_inventory_.*\.csv$/i.test(name)
        || name === 'asset_inventory.csv'
        || name === 'ext_inventory.csv'
      )
      .forEach((name) => {
        const full = path.join(dirPath, name);
        try {
          const st = fs.statSync(full);
          if ((now - st.mtimeMs) > keepMs) fs.unlinkSync(full);
        } catch {}
      });
  } catch {}
}

async function buildCsvSections({ include_assets = true, include_ext = true }) {
  const results = {};
  if (include_assets) {
    const r = await pool.query(`
      SELECT a.id, a.vm_name, a.os_hostname, a.ip_address,
        at.name AS asset_type, ot.name AS os_type, ov.name AS os_version,
        a.assigned_user, d.name AS department, a.business_purpose,
        ss.name AS server_status, pt.name AS patching_type,
        ps.name AS patching_schedule, spt.name AS server_patch_type,
        l.name AS location, a.serial_number, a.eol_status, a.asset_tag,
        a.hosted_ip, a.asset_username, a.additional_remarks,
        a.me_installed_status, a.tenable_installed_status, a.oem_status,
        a.submitted_by, a.created_at, a.updated_at
      FROM assets a
      LEFT JOIN asset_types at    ON a.asset_type_id    = at.id
      LEFT JOIN os_types ot       ON a.os_type_id       = ot.id
      LEFT JOIN os_versions ov    ON a.os_version_id    = ov.id
      LEFT JOIN departments d     ON a.department_id    = d.id
      LEFT JOIN server_status ss  ON a.server_status_id = ss.id
      LEFT JOIN patching_types pt ON a.patching_type_id = pt.id
      LEFT JOIN patching_schedules ps ON a.patching_schedule_id = ps.id
      LEFT JOIN server_patch_types spt ON a.server_patch_type_id = spt.id
      LEFT JOIN locations l       ON a.location_id      = l.id
      ORDER BY a.created_at DESC`);
    results.assets = r.rows;
  }

  if (include_ext) {
    const extPool = require('../config/database').extPool;
    const r = await extPool.query(`
      SELECT i.id, i.vm_name, i.asset_name, i.os_hostname, i.ip_address,
        i.asset_type, i.assigned_user, i.business_purpose,
        i.status, i.additional_remarks,
        i.me_installed_status, i.tenable_installed_status,
        i.serial_number, i.asset_tag, i.hosted_ip, i.eol_status,
        i.asset_username, i.submitted_by, i.created_at, i.updated_at,
        d.name AS department, l.name AS location
      FROM items i
      LEFT JOIN public.departments d ON i.department_id = d.id
      LEFT JOIN public.locations   l ON i.location_id   = l.id
      ORDER BY i.created_at DESC`);
    results.ext = r.rows;
  }

  const esc = (v) => {
    if (v === null || v === undefined || v === false) return '';
    if (v === true) return 'Yes';
    const s = String(v).replace(/"/g, '""');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
  };

  const toCSV = (rows) => {
    if (!rows?.length) return '';
    const headers = Object.keys(rows[0]);
    return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sections = [];
  if (results.assets) sections.push({ key: 'assets', name: `asset_inventory_${timestamp}.csv`, csv: toCSV(results.assets), count: results.assets.length });
  if (results.ext) sections.push({ key: 'ext', name: `ext_inventory_${timestamp}.csv`, csv: toCSV(results.ext), count: results.ext.length });
  return sections;
}

function writeCsvSectionsToPath(sections, backupPath, overwrite) {
  const resolvedBackupPath = String(backupPath || '').trim();
  if (!resolvedBackupPath) return sections;
  fs.mkdirSync(resolvedBackupPath, { recursive: true });
  sections.forEach((section) => {
    const filename = overwrite
      ? (section.key === 'assets' ? 'asset_inventory.csv' : 'ext_inventory.csv')
      : section.name;
    const fullPath = path.join(resolvedBackupPath, filename);
    fs.writeFileSync(fullPath, section.csv || '', 'utf8');
    section.saved_path = fullPath;
    section.name = filename;
  });
  return sections;
}

async function runScheduledTasks() {
  const schedule = await readSchedule();
  const now = new Date();

  if (schedule.pg_enabled && shouldRunNow('pg', schedule.pg_frequency, schedule.pg_time, now)) {
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || '5432',
      database: process.env.DB_NAME || 'infrastructure_inventory',
      user: process.env.DB_USER || 'infra_admin',
      password: process.env.DB_PASSWORD || '',
    };
    try {
      const dump = await runPgDump(dbConfig);
      const backupDir = String(schedule.pg_backup_path || '/backups/postgres').trim();
      fs.mkdirSync(backupDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = schedule.pg_overwrite ? 'infra_backup.sql' : `infra_backup_${timestamp}.sql`;
      const fullPath = path.join(backupDir, filename);
      fs.writeFileSync(fullPath, dump, 'utf8');
      cleanupOldPgBackups(backupDir, schedule.pg_retain_days);
      await appendBackupLog({
        type: 'pg_dump',
        status: 'success',
        filename,
        details: `${fullPath} (${(Buffer.byteLength(dump, 'utf8') / 1024 / 1024).toFixed(2)} MB)`,
        timestamp: new Date().toISOString(),
        triggered_by: 'scheduler',
      });
    } catch (error) {
      await appendBackupLog({
        type: 'pg_dump',
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
        triggered_by: 'scheduler',
      });
    }
  }

  if (schedule.csv_enabled && shouldRunNow('csv', schedule.csv_frequency, schedule.csv_time, now)) {
    try {
      const sections = await buildCsvSections({
        include_assets: schedule.csv_include_assets,
        include_ext: schedule.csv_include_ext,
      });
      const csvDir = schedule.csv_backup_path || '/backups/csv';
      writeCsvSectionsToPath(sections, csvDir, schedule.csv_overwrite);
      cleanupOldCsvBackups(String(csvDir).trim(), schedule.csv_retain_days);
      await appendBackupLog({
        type: 'csv_export',
        status: 'success',
        timestamp: new Date().toISOString(),
        triggered_by: 'scheduler',
        details: sections.map((s) => `${s.name} (${s.count} rows)`).join(', '),
      });
    } catch (error) {
      await appendBackupLog({
        type: 'csv_export',
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
        triggered_by: 'scheduler',
      });
    }
  }
}

function initScheduler() {
  if (schedulerInitialized) return;
  schedulerInitialized = true;
  setInterval(() => {
    runScheduledTasks().catch(() => {});
  }, SCHEDULER_TICK_MS);
}

// ── GET /api/backup/schedule — get current schedule settings ─────────────────
router.get('/schedule', auth, requireAdmin, async (req, res) => {
  try {
    res.json(await readSchedule());
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── PUT /api/backup/schedule — save schedule settings ────────────────────────
router.put('/schedule', auth, requireAdmin, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES ('backup_schedule', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value=$1, updated_at=NOW()`,
      [JSON.stringify(req.body)]
    );
    res.json({ message: 'Schedule saved' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── GET /api/backup/log — backup history ─────────────────────────────────────
router.get('/log', auth, requireAdmin, async (req, res) => {
  try { res.json(await getBackupLog()); }
  catch { res.json([]); }
});

// ── POST /api/backup/pg-dump — trigger a manual PostgreSQL dump ───────────────
router.post('/pg-dump', auth, requireAdmin, async (req, res) => {
  const dbConfig = {
    host:     process.env.DB_HOST     || 'localhost',
    port:     process.env.DB_PORT     || '5432',
    database: process.env.DB_NAME     || 'infrastructure_inventory',
    user:     process.env.DB_USER     || 'infra_admin',
    password: process.env.DB_PASSWORD || '',
  };

  const timestamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename   = `infra_backup_${timestamp}.sql`;
  const tmpPath    = path.join(os.tmpdir(), filename);

  try {
    const stdout = await runPgDump(dbConfig);
    fs.writeFileSync(tmpPath, stdout);
    const sizeMB = (Buffer.byteLength(stdout, 'utf8') / 1024 / 1024).toFixed(2);
    const entry = { type: 'pg_dump', status: 'success', filename, size_mb: sizeMB, timestamp: new Date().toISOString(), triggered_by: req.user?.username };
    await appendBackupLog(entry);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Backup-Size', sizeMB + ' MB');
    res.send(stdout);

    // Cleanup temp file
    try { fs.unlinkSync(tmpPath); } catch {}
  } catch (error) {
    const entry = { type: 'pg_dump', status: 'error', filename, timestamp: new Date().toISOString(), error: error.message };
    await appendBackupLog(entry);
    res.status(500).json({ error: 'pg_dump failed: ' + error.message });
  }
});

// ── POST /api/backup/csv-export — export both asset and ext inventory CSV ─────
router.post('/csv-export', auth, requireAdmin, async (req, res) => {
  const {
    include_assets = true,
    include_ext = true,
    backup_path = '',
    overwrite = false,
  } = req.body || {};
  try {
    const csvSections = await buildCsvSections({ include_assets, include_ext });
    const resolvedBackupPath = String(backup_path || '').trim();
    writeCsvSectionsToPath(csvSections, resolvedBackupPath, overwrite);

    const entry = {
      type: 'csv_export', status: 'success', timestamp: new Date().toISOString(),
      triggered_by: req.user?.username,
      details: csvSections.map(s => `${s.name} (${s.count} rows)`).join(', ') + (resolvedBackupPath ? ` -> ${resolvedBackupPath}` : ''),
    };
    await appendBackupLog(entry);

    res.json({ files: csvSections, saved_to: resolvedBackupPath || null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'CSV export failed: ' + e.message });
  }
});

module.exports = router;
initScheduler();

