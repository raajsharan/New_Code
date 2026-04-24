const router = require('express').Router();
const net = require('net');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { Client: SshClient } = require('ssh2');
const pool    = require('../config/database');
const extPool = pool.extPool;
const { auth, requireAdmin } = require('../middleware/auth');
let decryptPassword;
try {
  ({ decryptPassword } = require('../utils/encryption'));
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  ({ decryptPassword } = require('../encryption'));
}

const MAX_JOB_RESULTS = 5000;
const jobStore = new Map();
const execFileAsync = promisify(execFile);

const toTrimmed = (v) => String(v || '').trim();
const isNonBlank = (v) => toTrimmed(v) !== '';
const ENCRYPTED_PASSWORD_PATTERN = /^[a-f0-9]{32}:[a-f0-9]+$/i;

const classifyOsFamily = (osType, osVersion) => {
  const merged = `${toTrimmed(osType)} ${toTrimmed(osVersion)}`.toLowerCase();
  if (!merged) return 'Unknown';
  if (/windows|win\s?server|winrm/.test(merged)) return 'Windows';
  if (/linux|ubuntu|debian|centos|redhat|rhel|suse|unix/.test(merged)) return 'Linux';
  return 'Unknown';
};

const makeLabel = (asset) =>
  toTrimmed(asset.vm_name) || toTrimmed(asset.os_hostname) || toTrimmed(asset.ip_address) || `Asset-${asset.id}`;

const resolveWindowsTransport = (settings = {}) => {
  const raw = String(settings.windows_transport_protocol || settings.windows_mode || 'Auto').trim();
  const mode = raw.toUpperCase();
  if (mode === 'WINRM') return 'WinRM';
  if (mode === 'PSEXEC') return 'PsExec';
  if (mode === 'WMI') return 'WMI';
  return 'Auto';
};

const shQuote = (value) => `'${String(value || '').replace(/'/g, `'\"'\"'`)}'`;
const psQuote = (value) => String(value || '').replace(/'/g, "''");
const DEFAULT_ME_FILE_PATH = '/usr/local/manageengine/uems_agent/bin/dcservice.service';
const DEFAULT_ME_SERVICE_NAME = 'dcservice.service';
const DEFAULT_NESSUS_FILE_PATH = '/opt/nessus_agent/sbin/nessus-service';
const DEFAULT_NESSUS_SERVICE_NAME = 'nessusagent';

function normalizeVerifyMode(rawMode) {
  const mode = String(rawMode || 'both').trim().toLowerCase();
  if (mode === 'file' || mode === 'service' || mode === 'both') return mode;
  return 'both';
}

const getPrimaryPort = (osFamily, settings = {}) => {
  const w = parseInt(settings.windows_primary_port, 10);
  const l = parseInt(settings.linux_primary_port, 10);
  if (osFamily === 'Windows') {
    const winrm = parseInt(settings.windows_winrm_port, 10);
    const psexec = parseInt(settings.windows_psexec_smb_port, 10);
    const wmi = parseInt(settings.windows_wmi_port, 10);
    const mode = resolveWindowsTransport(settings);
    if (mode === 'WinRM') return Number.isFinite(winrm) && winrm > 0 ? winrm : 5985;
    if (mode === 'PsExec') return Number.isFinite(psexec) && psexec > 0 ? psexec : 445;
    if (mode === 'WMI') return Number.isFinite(wmi) && wmi > 0 ? wmi : 135;
    if (Number.isFinite(w) && w > 0) return w;
    if (Number.isFinite(winrm) && winrm > 0) return winrm;
    return 5985;
  }
  if (osFamily === 'Linux') return Number.isFinite(l) && l > 0 ? l : 22;
  return 0;
};

async function commandExists(cmd) {
  try {
    const probe = process.platform === 'win32'
      ? await execFileAsync('where', [cmd], { windowsHide: true })
      : await execFileAsync('which', [cmd], { windowsHide: true });
    return Boolean(String(probe.stdout || '').trim());
  } catch {
    return false;
  }
}

async function updateManageEngineInstalled(assetId, installed) {
  try {
    await pool.query('UPDATE assets SET me_installed_status=$2 WHERE id=$1', [assetId, !!installed]);
  } catch {}
}

async function runLocalCommand(file, args, options = {}) {
  return execFileAsync(file, args, {
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 8,
    timeout: options.timeout || 10 * 60 * 1000,
    ...options,
  });
}

function resolveEndpointPassword(target) {
  const rawStored = toTrimmed(target?.asset_password);
  if (!rawStored) return '';
  const decrypted = toTrimmed(decryptPassword(rawStored));
  if (ENCRYPTED_PASSWORD_PATTERN.test(rawStored) && decrypted === rawStored) {
    throw new Error('Stored credential could not be decrypted. Verify backend ENCRYPTION_KEY matches the key used when credentials were saved.');
  }
  return decrypted;
}

function maskSecret(value) {
  return String(value || '').replace(/./g, '*');
}

function sanitizeCommandErrorMessage(err, secretValues = []) {
  let text = String(err?.message || err || 'Command failed');
  secretValues
    .filter((v) => typeof v === 'string' && v.length)
    .forEach((secret) => {
      text = text.split(secret).join(maskSecret(secret));
    });
  return text;
}

function toLinuxAuthFriendlyError(err, { host, username, password }) {
  const message = sanitizeCommandErrorMessage(err, [password]);
  if (/Permission denied|All configured authentication methods failed|authentication.*failed/i.test(message)) {
    return new Error(`SSH authentication failed for ${username}@${host}. Verify username/password and confirm SSH password login is allowed on target host.`);
  }
  return new Error(message);
}

function openSshConnection({ host, port, username, password }) {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    conn.on('ready', () => resolve(conn));
    conn.on('error', reject);
    conn.connect({ host, port: Number(port), username, password, readyTimeout: 30000, tryKeyboard: true });
  });
}

function sshExecOnConn(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code) => {
        if (code !== 0) reject(new Error(stderr.trim() || `Remote command exited with code ${code}`));
        else resolve({ stdout, stderr });
      });
      stream.on('data', (data) => { stdout += String(data); });
      stream.stderr.on('data', (data) => { stderr += String(data); });
    });
  });
}

function sftpPutFile(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (err2) => {
        if (err2) reject(err2); else resolve();
      });
    });
  });
}

async function runLinuxRemoteCommand({ host, username, password, port, remoteCommand }) {
  let conn;
  try {
    conn = await openSshConnection({ host, port, username, password });
    const result = await sshExecOnConn(conn, remoteCommand);
    conn.end();
    return result;
  } catch (err) {
    if (conn) try { conn.end(); } catch {}
    throw toLinuxAuthFriendlyError(err, { host, username, password });
  }
}

function parseStatusJson(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line.startsWith('{') || !line.endsWith('}')) continue;
    try {
      return JSON.parse(line);
    } catch {}
  }
  return null;
}

async function verifyLinuxInstallationStatus(target, settings = {}) {
  const host = toTrimmed(target.ip_address);
  const username = toTrimmed(target.asset_username);
  const password = resolveEndpointPassword(target);
  const port = getPrimaryPort('Linux', settings);
  const meFile = toTrimmed(settings.linux_me_installed_file_path || DEFAULT_ME_FILE_PATH);
  const meService = toTrimmed(settings.linux_me_service_name || DEFAULT_ME_SERVICE_NAME);
  const nessusFile = toTrimmed(settings.linux_nessus_installed_file_path || DEFAULT_NESSUS_FILE_PATH);
  const nessusService = toTrimmed(settings.linux_nessus_service_name || DEFAULT_NESSUS_SERVICE_NAME);
  const meVerifyMode = normalizeVerifyMode(settings.linux_me_verify_mode);
  const nessusVerifyMode = normalizeVerifyMode(settings.linux_nessus_verify_mode);

  const script = [
    `ME_FILE=${shQuote(meFile)}`,
    `ME_SERVICE=${shQuote(meService)}`,
    `NESSUS_FILE=${shQuote(nessusFile)}`,
    `NESSUS_SERVICE=${shQuote(nessusService)}`,
    'if [ -f "$ME_FILE" ]; then ME_FILE_EXISTS=1; else ME_FILE_EXISTS=0; fi',
    'if [ -f "$NESSUS_FILE" ]; then NESSUS_FILE_EXISTS=1; else NESSUS_FILE_EXISTS=0; fi',
    'if systemctl is-active --quiet "$ME_SERVICE"; then ME_SERVICE_ACTIVE=1; else ME_SERVICE_ACTIVE=0; fi',
    'if systemctl is-active --quiet "$NESSUS_SERVICE"; then NESSUS_SERVICE_ACTIVE=1; else NESSUS_SERVICE_ACTIVE=0; fi',
    'printf \'{"me_file_exists":%s,"me_service_active":%s,"nessus_file_exists":%s,"nessus_service_active":%s}\' "$ME_FILE_EXISTS" "$ME_SERVICE_ACTIVE" "$NESSUS_FILE_EXISTS" "$NESSUS_SERVICE_ACTIVE"',
  ].join('; ');

  const result = await runLinuxRemoteCommand({
    host,
    username,
    password,
    port,
    remoteCommand: script,
  });
  const parsed = parseStatusJson(result.stdout || result.stderr);
  if (!parsed) {
    throw new Error('Unable to parse installation verification output from endpoint.');
  }

  const meFileExists = Number(parsed.me_file_exists) === 1;
  const meServiceActive = Number(parsed.me_service_active) === 1;
  const nessusFileExists = Number(parsed.nessus_file_exists) === 1;
  const nessusServiceActive = Number(parsed.nessus_service_active) === 1;

  const meInstalled = meVerifyMode === 'file'
    ? meFileExists
    : meVerifyMode === 'service'
      ? meServiceActive
      : (meFileExists && meServiceActive);

  const nessusInstalled = nessusVerifyMode === 'file'
    ? nessusFileExists
    : nessusVerifyMode === 'service'
      ? nessusServiceActive
      : (nessusFileExists && nessusServiceActive);

  return {
    manageengine: {
      file_path: meFile,
      service_name: meService,
      verify_mode: meVerifyMode,
      file_exists: meFileExists,
      service_active: meServiceActive,
      installed: meInstalled,
    },
    nessus: {
      file_path: nessusFile,
      service_name: nessusService,
      verify_mode: nessusVerifyMode,
      file_exists: nessusFileExists,
      service_active: nessusServiceActive,
      installed: nessusInstalled,
    },
  };
}

function buildLinuxInstallCommand({
  remoteBin,
  remoteCfg,
  password,
  extraArgs,
  customCommand,
}) {
  const template = toTrimmed(customCommand);

  if (!template) {
    const binName = path.basename(remoteBin || '');
    const cfgName = remoteCfg ? path.basename(remoteCfg) : '';
    let command = `cd /tmp && chmod +x ${shQuote(`./${binName}`)} && printf '%s\\n' ${shQuote(password)} | sudo -S ${shQuote(`./${binName}`)}`;
    if (cfgName) {
      command += ` -s ${shQuote(cfgName)}`;
    }
    if (extraArgs) {
      command += ` ${extraArgs}`;
    }
    return command.replace(/\s+/g, ' ').trim();
  }

  const argParts = [];

  if (remoteCfg && !template.includes('{config}')) {
    argParts.push(`-s ${shQuote(remoteCfg)}`);
  }
  if (extraArgs) {
    argParts.push(extraArgs);
  }

  let command = template
    .replaceAll('{bin}', shQuote(remoteBin))
    .replaceAll('{config}', remoteCfg ? `-s ${shQuote(remoteCfg)}` : '')
    .replaceAll('{args}', argParts.join(' '))
    .replaceAll('{password}', shQuote(password));

  if (!template.includes('{args}') && argParts.length) {
    command = `${command} ${argParts.join(' ')}`;
  }

  command = command.replace(/\s+/g, ' ').trim();

  if (/sudo\s+-S\b/.test(command) && !/\|\s*sudo\s+-S\b/.test(command) && !command.includes('{password}')) {
    command = `printf '%s\\n' ${shQuote(password)} | ${command}`;
  }

  return command;
}

async function deployLinuxEndpoint(target, settings = {}) {
  const host = toTrimmed(target.ip_address);
  const username = toTrimmed(target.asset_username);
  const password = resolveEndpointPassword(target);
  const port = getPrimaryPort('Linux', settings);
  const localBin = toTrimmed(settings.linux_installer_path);
  const localCfg = toTrimmed(settings.linux_config_path);
  const extraArgs = toTrimmed(settings.linux_extra_args);
  const customCommand = toTrimmed(settings.linux_custom_command);
  const meInstallEnabledSetting = settings.linux_manageengine_install_enabled;
  const manageEngineInstallEnabled = meInstallEnabledSetting === undefined
    ? true
    : (meInstallEnabledSetting === true || String(meInstallEnabledSetting).toLowerCase() === 'true');
  const nessusCurlCommand = toTrimmed(settings.linux_nessus_curl_command);
  const nessusInstallEnabled = settings.linux_nessus_install_enabled === true || String(settings.linux_nessus_install_enabled).toLowerCase() === 'true';
  const shouldInstallManageEngine = manageEngineInstallEnabled && isNonBlank(localBin);
  const shouldInstallNessus = nessusInstallEnabled && isNonBlank(nessusCurlCommand);
  const remoteBin = shouldInstallManageEngine ? `/tmp/${path.basename(localBin)}` : '';
  const remoteCfg = shouldInstallManageEngine && localCfg ? `/tmp/${path.basename(localCfg)}` : '';

  if (!shouldInstallManageEngine && !shouldInstallNessus) {
    throw new Error('No Linux install action configured. Provide ManageEngine installer path or enable Nessus curl install command.');
  }

  const remoteSteps = [];
  if (shouldInstallManageEngine) {
    const installCommand = buildLinuxInstallCommand({ remoteBin, remoteCfg, password, extraArgs, customCommand });
    if (customCommand) remoteSteps.push(`chmod +x ${shQuote(remoteBin)}`);
    remoteSteps.push(installCommand);
  }
  if (shouldInstallNessus) {
    remoteSteps.push(`bash -lc ${shQuote(nessusCurlCommand)}`);
  }
  if (shouldInstallManageEngine) {
    const toClean = [remoteBin, remoteCfg].filter(Boolean).map(shQuote).join(' ');
    remoteSteps.push(`rm -f ${toClean} || true`);
  }
  const remoteCommand = remoteSteps.join(' && ');

  let conn;
  try {
    conn = await openSshConnection({ host, port, username, password });
    if (shouldInstallManageEngine) {
      await sftpPutFile(conn, localBin, remoteBin);
      if (localCfg) await sftpPutFile(conn, localCfg, remoteCfg);
    }
    const result = await sshExecOnConn(conn, remoteCommand);
    conn.end();
    return {
      message: (result.stdout || result.stderr || 'Deployment command completed').trim(),
      manageEngineExecuted: shouldInstallManageEngine,
      nessusExecuted: shouldInstallNessus,
    };
  } catch (err) {
    if (conn) try { conn.end(); } catch {}
    throw toLinuxAuthFriendlyError(err, { host, username, password });
  }
}

async function deployWindowsEndpoint(target, settings = {}) {
  const host = toTrimmed(target.ip_address);
  const username = toTrimmed(target.asset_username);
  const password = resolveEndpointPassword(target);
  const installerPath = toTrimmed(settings.windows_installer_path);
  const remoteDir = toTrimmed(settings.windows_remote_directory || 'C:\\Windows\\Temp');
  const installerName = path.basename(installerPath);
  const remoteInstaller = `${remoteDir}\\${installerName}`;
  const silentArgs = toTrimmed(settings.windows_silent_args);
  const mode = resolveWindowsTransport(settings);
  const psCmd = process.platform === 'win32' ? 'powershell.exe' : (await commandExists('pwsh') ? 'pwsh' : null);

  if (!psCmd) throw new Error('PowerShell is not available for Windows deployment.');
  if (mode !== 'Auto' && mode !== 'WinRM') {
    throw new Error(`Windows deployment execution currently supports WinRM only. Selected mode: ${mode}`);
  }

  const script = `
$sec = ConvertTo-SecureString '${psQuote(password)}' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential ('${psQuote(username)}', $sec)
$session = New-PSSession -ComputerName '${psQuote(host)}' -Port ${getPrimaryPort('Windows', settings)} -Credential $cred
try {
  Invoke-Command -Session $session -ScriptBlock {
    param($dir)
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  } -ArgumentList '${psQuote(remoteDir)}'
  Copy-Item -ToSession $session -Path '${psQuote(installerPath)}' -Destination '${psQuote(remoteInstaller)}' -Force
  $result = Invoke-Command -Session $session -ScriptBlock {
    param($installer, $args)
    $proc = Start-Process -FilePath $installer -ArgumentList $args -Wait -PassThru
    [PSCustomObject]@{
      ExitCode = $proc.ExitCode
      Installer = $installer
    }
  } -ArgumentList '${psQuote(remoteInstaller)}', '${psQuote(silentArgs)}'
  Invoke-Command -Session $session -ScriptBlock {
    param($f)
    Remove-Item -Path $f -Force -ErrorAction SilentlyContinue
  } -ArgumentList '${psQuote(remoteInstaller)}'
  $result | ConvertTo-Json -Compress
}
finally {
  if ($session) { Remove-PSSession $session }
}
`.trim();

  const result = await runLocalCommand(psCmd, ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 20 * 60 * 1000 });
  const raw = String(result.stdout || '').trim();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {}
  if (payload && Number(payload.ExitCode) !== 0) {
    throw new Error(`Installer exited with code ${payload.ExitCode}`);
  }
  return { message: raw || (result.stderr || 'Deployment command completed').trim() };
}

const tcpProbe = (host, port, timeoutMs = 2500) =>
  new Promise((resolve) => {
    if (!isNonBlank(host) || !port) {
      resolve({ ok: false, message: 'Missing host or port' });
      return;
    }
    const socket = new net.Socket();
    let finished = false;
    const done = (ok, message) => {
      if (finished) return;
      finished = true;
      try { socket.destroy(); } catch {}
      resolve({ ok, message });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true, `Port ${port} reachable`));
    socket.once('timeout', () => done(false, `Timeout to ${host}:${port}`));
    socket.once('error', (err) => done(false, err.message || `Unable to connect ${host}:${port}`));
    try {
      socket.connect(port, host);
    } catch (e) {
      done(false, e.message || 'Connection setup failed');
    }
  });

async function fetchVmAssetsByIds(ids = []) {
  const normalized = [...new Set((ids || []).map((v) => parseInt(v, 10)).filter((v) => Number.isFinite(v) && v > 0))];
  if (!normalized.length) return [];
  const q = await pool.query(
    `
      SELECT
        a.id,
        a.vm_name,
        a.os_hostname,
        a.ip_address,
        a.asset_username,
        a.asset_password,
        a.me_installed_status,
        COALESCE(at.name, '') AS asset_type,
        COALESCE(ot.name, '') AS os_type,
        COALESCE(ov.name, '') AS os_version
      FROM assets a
      LEFT JOIN asset_types at ON a.asset_type_id = at.id
      LEFT JOIN os_types ot ON a.os_type_id = ot.id
      LEFT JOIN os_versions ov ON a.os_version_id = ov.id
      WHERE a.id = ANY($1::int[])
        AND COALESCE(at.name, '') = 'VM'
    `,
    [normalized]
  );
  return q.rows;
}

// GET /api/deployment/endpoints
router.get('/endpoints', auth, requireAdmin, async (req, res) => {
  try {
    const search = toTrimmed(req.query.search).toLowerCase();
    const osFilter = toTrimmed(req.query.os || 'All');
    const onlyWithCreds = String(req.query.only_with_credentials || '').toLowerCase() === 'true';

    const data = await pool.query(`
      SELECT
        a.id,
        a.vm_name,
        a.os_hostname,
        a.ip_address,
        a.asset_username,
        a.asset_password,
        COALESCE(at.name, '') AS asset_type,
        COALESCE(ot.name, '') AS os_type,
        COALESCE(ov.name, '') AS os_version
      FROM assets a
      LEFT JOIN asset_types at ON a.asset_type_id = at.id
      LEFT JOIN os_types ot ON a.os_type_id = ot.id
      LEFT JOIN os_versions ov ON a.os_version_id = ov.id
      WHERE COALESCE(at.name, '') = 'VM'
      ORDER BY a.updated_at DESC NULLS LAST, a.id DESC
      LIMIT 3000
    `);

    const endpoints = (data.rows || []).map((r) => {
      const os_family = classifyOsFamily(r.os_type, r.os_version);
      const has_username = isNonBlank(r.asset_username);
      const has_password = isNonBlank(r.asset_password);
      const key = String(r.id);
      return {
        id: r.id,
        name: makeLabel(r),
        host: toTrimmed(r.ip_address),
        vm_name: toTrimmed(r.vm_name),
        os_hostname: toTrimmed(r.os_hostname),
        os_family,
        os_type: r.os_type || '',
        os_version: r.os_version || '',
        username: has_username ? toTrimmed(r.asset_username) : '',
        has_credentials: has_username && has_password,
        status: jobStore.get(key)?.last_status || 'Idle',
      };
    }).filter((r) => {
      if (osFilter && osFilter !== 'All' && r.os_family !== osFilter) return false;
      if (onlyWithCreds && !r.has_credentials) return false;
      if (!search) return true;
      const hay = `${r.name} ${r.host} ${r.username} ${r.os_type} ${r.os_version}`.toLowerCase();
      return hay.includes(search);
    });

    res.json({ endpoints });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to load deployment endpoints' });
  }
});

// POST /api/deployment/test
router.post('/test', auth, requireAdmin, async (req, res) => {
  try {
    const endpointIds = Array.isArray(req.body?.endpoint_ids) ? req.body.endpoint_ids : [];
    const settings = req.body?.settings || {};
    const targets = await fetchVmAssetsByIds(endpointIds);
    if (!targets.length) return res.status(400).json({ error: 'No valid VM endpoints selected' });

    const results = [];
    for (const t of targets) {
      const osFamily = classifyOsFamily(t.os_type, t.os_version);
      const windowsProtocol = osFamily === 'Windows' ? resolveWindowsTransport(settings) : null;
      const port = getPrimaryPort(osFamily, settings);
      const probe = await tcpProbe(toTrimmed(t.ip_address), port, 2500);
      const status = probe.ok ? 'Connection Passed' : 'Connection Failed';
      const item = {
        id: t.id,
        name: makeLabel(t),
        host: toTrimmed(t.ip_address),
        os_family: osFamily,
        windows_protocol: windowsProtocol,
        port,
        status,
        message: probe.message,
        tested_at: new Date().toISOString(),
      };
      jobStore.set(String(t.id), { last_status: status, last_message: probe.message, updated_at: item.tested_at });
      results.push(item);
    }
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Connection test failed' });
  }
});

// POST /api/deployment/verify-installation
router.post('/verify-installation', auth, requireAdmin, async (req, res) => {
  try {
    const endpointIds = Array.isArray(req.body?.endpoint_ids) ? req.body.endpoint_ids : [];
    const settings = req.body?.settings || {};
    const targets = await fetchVmAssetsByIds(endpointIds);
    if (!targets.length) return res.status(400).json({ error: 'No valid VM endpoints selected' });

    const results = [];
    for (const t of targets) {
      const osFamily = classifyOsFamily(t.os_type, t.os_version);
      const host = toTrimmed(t.ip_address);
      const label = makeLabel(t);
      const hasCreds = isNonBlank(t.asset_username) && isNonBlank(t.asset_password);
      const checkedAt = new Date().toISOString();

      let status = 'Verified';
      let message = 'Installation and service verification completed.';
      let checks = null;

      if (!hasCreds) {
        status = 'Blocked';
        message = 'Missing stored username/password credentials.';
      } else if (osFamily !== 'Linux') {
        status = 'Blocked';
        message = `Installation verification currently supports Linux endpoints only. Endpoint OS: ${osFamily}.`;
      } else {
        const probe = await tcpProbe(host, getPrimaryPort('Linux', settings), 3000);
        if (!probe.ok) {
          status = 'Blocked';
          message = `Connectivity test failed: ${probe.message}`;
        } else {
          try {
            checks = await verifyLinuxInstallationStatus(t, settings);
            if (checks.manageengine.installed) {
              await updateManageEngineInstalled(t.id, true);
            }
            const meText = checks.manageengine.installed ? 'Installed' : 'Not Installed';
            const neText = checks.nessus.installed ? 'Installed' : 'Not Installed';
            message = `ManageEngine: ${meText}, Nessus: ${neText}`;
          } catch (error) {
            status = 'Failed';
            message = error.message || 'Installation verification failed.';
          }
        }
      }

      results.push({
        id: t.id,
        name: label,
        host,
        os_family: osFamily,
        status,
        message,
        checks,
        checked_at: checkedAt,
      });
      jobStore.set(String(t.id), { last_status: status, last_message: message, updated_at: checkedAt });
    }

    const summary = {
      total: results.length,
      verified: results.filter((r) => r.status === 'Verified').length,
      blocked: results.filter((r) => r.status === 'Blocked').length,
      failed: results.filter((r) => r.status === 'Failed').length,
    };

    res.json({ results, summary });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Installation verification failed' });
  }
});

// POST /api/deployment/deploy
router.post('/deploy', auth, requireAdmin, async (req, res) => {
  try {
    const endpointIds = Array.isArray(req.body?.endpoint_ids) ? req.body.endpoint_ids : [];
    const settings = req.body?.settings || {};
    const skipIfInstalled = req.body?.skip_if_installed !== false;
    const targets = await fetchVmAssetsByIds(endpointIds);
    if (!targets.length) return res.status(400).json({ error: 'No valid VM endpoints selected' });

    const jobId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const logLines = [];
    const results = [];

    logLines.push(`[INFO] ${startedAt}: Deployment started for ${targets.length} endpoint(s).`);
    if (skipIfInstalled) logLines.push('[INFO] Skip-if-installed flag is enabled.');

    for (const t of targets) {
      const osFamily = classifyOsFamily(t.os_type, t.os_version);
      const windowsProtocol = osFamily === 'Windows' ? resolveWindowsTransport(settings) : null;
      const host = toTrimmed(t.ip_address);
      const label = makeLabel(t);
      const hasUser = isNonBlank(t.asset_username);
      const hasPass = isNonBlank(t.asset_password);
      const hasCreds = hasUser && hasPass;
      const port = getPrimaryPort(osFamily, settings);
      const probe = await tcpProbe(host, port, 3000);

      const winInstaller = isNonBlank(settings.windows_installer_path);
      const linuxInstaller = isNonBlank(settings.linux_installer_path);
      const linuxNessusCurlInstall = (settings.linux_nessus_install_enabled === true || String(settings.linux_nessus_install_enabled).toLowerCase() === 'true')
        && isNonBlank(settings.linux_nessus_curl_command);
      const meInstallEnabledSetting = settings.linux_manageengine_install_enabled;
      const linuxManageEngineInstallEnabled = meInstallEnabledSetting === undefined
        ? true
        : (meInstallEnabledSetting === true || String(meInstallEnabledSetting).toLowerCase() === 'true');
      const skipManageEngineForInstalled = osFamily === 'Linux' && skipIfInstalled && t.me_installed_status === true;
      const effectiveLinuxManageEngineInstall = linuxInstaller && linuxManageEngineInstallEnabled && !skipManageEngineForInstalled;
      const linuxManageEngineRequested = linuxInstaller && linuxManageEngineInstallEnabled;
      const installerOk = osFamily === 'Windows'
        ? winInstaller
        : osFamily === 'Linux'
          ? (effectiveLinuxManageEngineInstall || linuxNessusCurlInstall)
          : false;
      const shouldSkipInstalled = osFamily === 'Linux'
        ? (skipManageEngineForInstalled && !linuxNessusCurlInstall && !effectiveLinuxManageEngineInstall)
        : (skipIfInstalled && t.me_installed_status === true);

      let status = 'Deployed';
      let message = 'Deployment completed successfully.';
      const linuxManageEngineState = osFamily === 'Linux'
        ? (effectiveLinuxManageEngineInstall
          ? 'executed'
          : (skipManageEngineForInstalled
            ? 'skipped (already installed)'
            : (linuxManageEngineRequested ? 'not configured' : 'disabled')))
        : null;
      const linuxNessusState = osFamily === 'Linux'
        ? (linuxNessusCurlInstall ? 'executed' : 'disabled')
        : null;

      if (!hasCreds) {
        status = 'Blocked';
        message = 'Missing stored username/password credentials.';
      } else if (shouldSkipInstalled) {
        status = 'Skipped';
        if (osFamily === 'Linux') {
          message = `Skipped. ManageEngine=${linuxManageEngineState}, Nessus=${linuxNessusState}.`;
        } else {
          message = 'Skipped because agent is already marked as installed.';
        }
      } else if (!installerOk) {
        status = 'Blocked';
        message = osFamily === 'Linux'
          ? 'Missing Linux install action. Provide ManageEngine installer path or enable Nessus curl install command.'
          : `Missing ${osFamily} installer path in settings.`;
      } else if (!probe.ok) {
        status = 'Blocked';
        message = `Connectivity test failed: ${probe.message}`;
      } else if (osFamily === 'Unknown') {
        status = 'Blocked';
        message = 'OS family is unknown; classify endpoint as Windows or Linux first.';
      } else {
        try {
          const deployResult = osFamily === 'Linux'
            ? await deployLinuxEndpoint(t, {
              ...settings,
              linux_manageengine_install_enabled: effectiveLinuxManageEngineInstall,
            })
            : await deployWindowsEndpoint(t, settings);
          if (osFamily === 'Linux') {
            const output = (deployResult.message || '').trim();
            const summary = `ManageEngine=${linuxManageEngineState}, Nessus=${linuxNessusState}`;
            message = output ? `${summary}\n${output}` : summary;
          } else {
            message = deployResult.message || message;
          }
          if (osFamily !== 'Linux' || deployResult.manageEngineExecuted) {
            await updateManageEngineInstalled(t.id, true);
          }
        } catch (deployError) {
          status = 'Failed';
          message = deployError.message || 'Deployment execution failed.';
        }
      }

      const ts = new Date().toISOString();
      logLines.push(`[${status === 'Deployed' ? 'SUCCESS' : status === 'Skipped' ? 'INFO' : 'WARN'}] ${host || label}: ${message}`);
      results.push({
        id: t.id,
        name: label,
        host,
        os_family: osFamily,
        windows_protocol: windowsProtocol,
        port,
        status,
        message,
        checked_at: ts,
      });
      jobStore.set(String(t.id), { last_status: status, last_message: message, updated_at: ts });
    }

    const summary = {
      total: results.length,
      deployed: results.filter((r) => r.status === 'Deployed').length,
      skipped: results.filter((r) => r.status === 'Skipped').length,
      blocked: results.filter((r) => r.status === 'Blocked').length,
      failed: results.filter((r) => r.status === 'Failed').length,
    };

    const finishedAt = new Date().toISOString();
    logLines.push(`[INFO] ${finishedAt}: Deployment completed. Deployed=${summary.deployed}, Skipped=${summary.skipped}, Blocked=${summary.blocked}, Failed=${summary.failed}.`);

    const payload = {
      job_id: jobId,
      started_at: startedAt,
      finished_at: finishedAt,
      summary,
      results,
      log: logLines.slice(0, MAX_JOB_RESULTS),
    };
    jobStore.set(`job:${jobId}`, payload);
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Deployment run failed' });
  }
});

// POST /api/deployment/check-duplicates
// Cross-checks selected asset hostnames against Ext. Asset Inventory before deployment
router.post('/check-duplicates', auth, requireAdmin, async (req, res) => {
  try {
    const ids = (Array.isArray(req.body?.endpoint_ids) ? req.body.endpoint_ids : [])
      .map(Number).filter(Number.isFinite);
    if (!ids.length) return res.json({ duplicates: [] });

    const assetsQ = await pool.query(
      `SELECT id, vm_name, os_hostname FROM assets WHERE id = ANY($1::int[])`,
      [ids]
    );

    const duplicates = [];
    for (const ep of assetsQ.rows) {
      const hostname = toTrimmed(ep.os_hostname) || toTrimmed(ep.vm_name);
      if (!hostname) continue;
      const extQ = await extPool.query(
        `SELECT id, COALESCE(vm_name,'') AS vm_name, COALESCE(asset_name,'') AS asset_name
         FROM items
         WHERE LOWER(TRIM(COALESCE(vm_name,'')))  = LOWER($1)
            OR LOWER(TRIM(COALESCE(asset_name,''))) = LOWER($1)
         LIMIT 5`,
        [hostname]
      );
      if (extQ.rows.length > 0) {
        duplicates.push({
          asset_id: ep.id,
          hostname,
          matches: extQ.rows.map(r => r.vm_name || r.asset_name).filter(Boolean),
        });
      }
    }

    res.json({ duplicates });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Duplicate check failed' });
  }
});

// GET /api/deployment/jobs/:id
router.get('/jobs/:id', auth, requireAdmin, async (req, res) => {
  const job = jobStore.get(`job:${req.params.id}`);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// ─── MANAGEENGINE ENDPOINT CENTRAL — SERVICE STATUS ──────────────────────────

const ME_CONFIG_KEY = 'me_endpoint_central_config';

// GET /api/deployment/me-config
router.get('/me-config', auth, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query('SELECT setting_value FROM app_settings WHERE setting_key=$1', [ME_CONFIG_KEY]);
    if (!r.rows.length) return res.json({ server_url: '', api_key: '', enabled: false, has_key: false });
    const cfg = JSON.parse(r.rows[0].setting_value || '{}');
    res.json({ server_url: cfg.server_url || '', api_key: cfg.api_key ? '***' : '', enabled: !!cfg.enabled, has_key: !!cfg.api_key });
  } catch (e) { res.status(500).json({ error: 'Failed to load ME config' }); }
});

// PUT /api/deployment/me-config
router.put('/me-config', auth, requireAdmin, async (req, res) => {
  try {
    const { server_url, api_key, enabled } = req.body || {};
    const existing = await pool.query('SELECT setting_value FROM app_settings WHERE setting_key=$1', [ME_CONFIG_KEY]);
    const prev = existing.rows.length ? JSON.parse(existing.rows[0].setting_value || '{}') : {};
    const stored = {
      server_url: String(server_url || prev.server_url || '').trim(),
      api_key: api_key && api_key !== '***' ? String(api_key).trim() : (prev.api_key || ''),
      enabled: enabled !== undefined ? !!enabled : !!prev.enabled,
    };
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES ($1,$2)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2, updated_at=NOW()`,
      [ME_CONFIG_KEY, JSON.stringify(stored)]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Failed to save ME config' }); }
});

// GET /api/deployment/me-agent-status
router.get('/me-agent-status', auth, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query('SELECT setting_value FROM app_settings WHERE setting_key=$1', [ME_CONFIG_KEY]);
    if (!r.rows.length) return res.status(400).json({ error: 'ManageEngine config not set' });
    const cfg = JSON.parse(r.rows[0].setting_value || '{}');
    if (!cfg.server_url || !cfg.api_key) return res.status(400).json({ error: 'Server URL and API key are required' });

    const baseUrl = cfg.server_url.replace(/\/$/, '');
    const { search = '', page = 1, page_size = 200, filterby = 'allcomputers' } = req.query;

    const https = require('https');
    const http  = require('http');

    const fetchMe = (url, apiKey) => new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const mod = parsed.protocol === 'https:' ? https : http;
      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
        rejectUnauthorized: false,
        timeout: 15000,
      };
      const reqH = mod.request(options, (resp) => {
        let data = '';
        resp.on('data', c => { data += c; });
        resp.on('end', () => {
          try { resolve({ status: resp.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: resp.statusCode, body: data }); }
        });
      });
      reqH.on('error', reject);
      reqH.on('timeout', () => { reqH.destroy(); reject(new Error('Request timeout')); });
      reqH.end();
    });

    const resindex = (Number(page) - 1) * Number(page_size);
    const apiUrl = `${baseUrl}/api/1.4/som/computers?filterby=${encodeURIComponent(filterby)}&resindex=${resindex}&count=${page_size}`;
    const result = await fetchMe(apiUrl, cfg.api_key);

    if (result.status !== 200) {
      return res.status(502).json({ error: `ManageEngine API returned ${result.status}`, detail: result.body });
    }

    const raw = result.body;
    const computers = raw?.computers_data?.computers || raw?.computers || [];
    const total = raw?.message_response?.computers?.total ?? raw?.total ?? computers.length;

    const mapped = computers.map(c => ({
      computer_id:    c.computer_id    ?? c.computerid    ?? '',
      computer_name:  c.computer_name  ?? c.computername  ?? '',
      domain:         c.domain         ?? '',
      ip_address:     c.ip_address     ?? c.ipaddress     ?? '',
      os_name:        c.os_name        ?? c.osname        ?? '',
      agent_version:  c.agent_version  ?? c.agentversion  ?? '',
      agent_status:   c.agent_status   ?? c.agentstatus   ?? '',
      last_contact:   c.last_contact_time ?? c.lastcontacttime ?? '',
      managed_status: c.managed_status ?? '',
      office_site:    c.office_site    ?? c.officesite    ?? '',
    }));

    const searchLower = String(search).toLowerCase();
    const filtered = searchLower
      ? mapped.filter(c => (c.computer_name + c.ip_address + c.domain + c.office_site).toLowerCase().includes(searchLower))
      : mapped;

    res.json({ computers: filtered, total: Number(total), page: Number(page), page_size: Number(page_size) });
  } catch (e) {
    console.error('ME agent status error:', e.message);
    res.status(502).json({ error: e.message || 'Failed to fetch ManageEngine agent status' });
  }
});

module.exports = router;