const { execFile } = require('child_process');
const { promisify } = require('util');
const { Parser } = require('json2csv');

const execFileAsync = promisify(execFile);

function normalizeBool(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return defaultValue;
}

function resolveConfig(input = {}) {
  const host = input.host || process.env.VMWARE_HOST || '';
  const username = input.username || process.env.VMWARE_USERNAME || '';
  const password = input.password || process.env.VMWARE_PASSWORD || '';
  const sourceHost = input.source_host || host || process.env.VMWARE_SOURCE_HOST || 'vmware';
  const ignoreSSL = normalizeBool(
    input.ignore_ssl !== undefined ? input.ignore_ssl : process.env.VMWARE_IGNORE_SSL,
    true
  );

  if (!host || !username || !password) {
    throw new Error('Missing VMware connection config. Provide host, username, password (query or .env).');
  }
  return { host, username, password, ignoreSSL, sourceHost };
}

async function runGovc(args, env) {
  const { stdout } = await execFileAsync('govc', args, {
    env: { ...process.env, ...env },
    maxBuffer: 50 * 1024 * 1024,
  });
  return stdout;
}

function govcEnv(config) {
  return {
    GOVC_URL: config.host.startsWith('http') ? config.host : `https://${config.host}`,
    GOVC_USERNAME: config.username,
    GOVC_PASSWORD: config.password,
    GOVC_INSECURE: config.ignoreSSL ? '1' : '0',
  };
}

function mapVmRecord(vm, sourceHost) {
  const guest = vm.Guest || {};
  const cfg = vm.Config || {};
  const runtime = vm.Runtime || {};
  const self = vm.Self || {};

  const ip =
    guest.IpAddress ||
    (Array.isArray(guest.Net) && guest.Net[0] && Array.isArray(guest.Net[0].IpAddress) ? guest.Net[0].IpAddress[0] : '') ||
    'N/A';

  return {
    vm_name: cfg.Name || vm.Name || 'N/A',
    os_hostname: guest.HostName || 'N/A',
    ip_address: ip || 'N/A',
    power_state: runtime.PowerState || 'N/A',
    guest_os: guest.GuestFullName || cfg.GuestFullName || 'N/A',
    vm_id: cfg.InstanceUuid || self.Value || vm.MoRef || 'N/A',
    source_host: sourceHost || 'N/A',
  };
}

async function fetchVmListWithGovc(config) {
  const env = govcEnv(config);
  const listRaw = await runGovc(['find', '/', '-type', 'm'], env);
  const vmPaths = listRaw
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (!vmPaths.length) return [];

  const records = [];
  for (const vmPath of vmPaths) {
    // eslint-disable-next-line no-await-in-loop
    const infoRaw = await runGovc(['vm.info', '-json', vmPath], env);
    const parsed = JSON.parse(infoRaw || '{}');
    const vm = Array.isArray(parsed.VirtualMachines) ? parsed.VirtualMachines[0] : null;
    if (!vm) continue;
    records.push(mapVmRecord(vm, config.sourceHost));
  }
  return records;
}

function toCsv(rows) {
  const fields = ['vm_name', 'os_hostname', 'ip_address', 'power_state', 'guest_os', 'vm_id', 'source_host'];
  const parser = new Parser({ fields });
  return parser.parse(rows);
}

async function exportVmInventoryCsv(inputConfig = {}) {
  const cfg = resolveConfig(inputConfig);
  let records = [];
  try {
    records = await fetchVmListWithGovc(cfg);
  } catch (e) {
    throw new Error(`Failed to fetch VMware VMs via govc. ${e.message}`);
  }

  if (!records.length) throw new Error('No virtual machines found.');
  const csv = toCsv(records);
  return { csv, count: records.length };
}

module.exports = {
  exportVmInventoryCsv,
  resolveConfig,
};
