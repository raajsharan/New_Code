const express = require('express');
const https = require('https');
const crypto = require('crypto');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const pool = require('../config/database');
const { extPool } = require('../config/database');
const { auth, requireAdmin } = require('../middleware/auth');
const { writeImportAuditReport } = require('../services/importAudit');

const router = express.Router();

let schedulerTimer = null;
let schedulerRunning = false;

const DEFAULT_SCHEDULE = { enabled: false, interval_minutes: 60 };
const ENC_PREFIX = 'enc:v1:';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const toBasicAuth = (username, password) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

const cleanHost = (raw = '') =>
  String(raw || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');

function parseJsonSafe(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripXmlTags(value) {
  return decodeXml(String(value ?? '').replace(/<[^>]+>/g, '').trim());
}

function xmlTagValue(xml, tagName) {
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = String(xml || '').match(re);
  return m ? stripXmlTags(m[1]) : '';
}

function xmlTagValues(xml, tagName) {
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'ig');
  const out = [];
  let m;
  while ((m = re.exec(String(xml || ''))) !== null) out.push(stripXmlTags(m[1]));
  return out;
}

function xmlManagedObjectRefs(xml, typeName) {
  const re = new RegExp(`<ManagedObjectReference[^>]*type="${typeName}"[^>]*>([^<]+)</ManagedObjectReference>`, 'ig');
  const out = [];
  let m;
  while ((m = re.exec(String(xml || ''))) !== null) out.push(stripXmlTags(m[1]));
  return out;
}

function soapEnvelope(innerXml) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25">
  <soapenv:Body>
    ${innerXml}
  </soapenv:Body>
</soapenv:Envelope>`;
}

function retrievePropsEnvelope(propertyCollector, specSetXml, useEx = true) {
  if (useEx) {
    return soapEnvelope(`
      <vim25:RetrievePropertiesEx>
        <vim25:_this type="PropertyCollector">${escapeXml(propertyCollector)}</vim25:_this>
        ${specSetXml}
      </vim25:RetrievePropertiesEx>
    `);
  }
  return soapEnvelope(`
    <vim25:RetrieveProperties>
      <vim25:_this type="PropertyCollector">${escapeXml(propertyCollector)}</vim25:_this>
      ${specSetXml}
    </vim25:RetrieveProperties>
  `);
}

function isRetrievePropertiesExUnsupported(message = '') {
  const text = String(message || '').toLowerCase();
  return text.includes('retrievepropertiesex')
    && (text.includes('unable to resolve wsdl method name') || text.includes('method name'));
}

async function retrievePropertiesCompat({ baseUrl, headers, propertyCollector, specSetXml, ignoreSSL }) {
  try {
    return await requestText({
      method: 'POST',
      url: `${baseUrl}/sdk`,
      headers,
      body: retrievePropsEnvelope(propertyCollector, specSetXml, true),
      rejectUnauthorized: !ignoreSSL,
    });
  } catch (exErr) {
    if (!isRetrievePropertiesExUnsupported(exErr.message)) throw exErr;
    return requestText({
      method: 'POST',
      url: `${baseUrl}/sdk`,
      headers,
      body: retrievePropsEnvelope(propertyCollector, specSetXml, false),
      rejectUnauthorized: !ignoreSSL,
    });
  }
}

function extractSoapObjectBlocks(xml) {
  const blocks = [];
  const re = /<(objects|returnval)\b[^>]*>[\s\S]*?<\/\1>/ig;
  let match;
  while ((match = re.exec(String(xml || ''))) !== null) {
    const block = match[0];
    if (/<obj\b/i.test(block) && /VirtualMachine/i.test(block)) blocks.push(block);
  }
  return blocks;
}

function buildVmwareImportCustomFields(candidate) {
  return {
    vmware_candidate_id: candidate.id,
    vmware_vm_id: candidate.vm_id || '',
    vmware_power_state: candidate.power_state || '',
    vmware_guest_os: candidate.guest_os || '',
    vmware_cpu_count: candidate.cpu_count || null,
    vmware_memory_mb: candidate.memory_size_mb || null,
    vm_name: candidate.vm_name || '',
    os_hostname: candidate.os_hostname || '',
    ip_address: candidate.ip_address || '',
    guest_os: candidate.guest_os || '',
    source_ip: candidate.source_host || '',
    VMName: candidate.vm_name || '',
    OSHostname: candidate.os_hostname || '',
    'IP Address': candidate.ip_address || '',
    'Guest OS': candidate.guest_os || '',
    'Source IP': candidate.source_host || '',
  };
}

function getCredentialSecret() {
  return process.env.VMWARE_CRED_SECRET || process.env.JWT_SECRET || '';
}

function getCryptoKey() {
  const secret = getCredentialSecret();
  if (!secret) throw new Error('Missing credential secret. Set VMWARE_CRED_SECRET in environment.');
  return crypto.createHash('sha256').update(secret).digest();
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

function encryptPassword(plainText) {
  const key = getCryptoKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText || ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptPassword(stored) {
  if (!isEncrypted(stored)) return stored || '';
  const key = getCryptoKey();
  const parts = String(stored).slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted password format');
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}

function requestJson({ method = 'GET', url, headers = {}, body, rejectUnauthorized = false, timeoutMs = 25000 }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const reqHeaders = {
      Accept: 'application/json',
      ...headers,
    };
    if (body !== undefined && body !== null && !reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    const req = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method: normalizedMethod,
        headers: reqHeaders,
        timeout: timeoutMs,
        agent: new https.Agent({ rejectUnauthorized }),
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const parsed = parseJsonSafe(data);
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          if (!ok) {
            const msg = parsed?.value?.messages?.[0]?.default_message || parsed?.message || data || `HTTP ${res.statusCode}`;
            return reject(new Error(msg));
          }
          resolve(parsed ?? data);
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Connection timed out')));
    req.on('error', (e) => reject(e));
    if (body !== undefined && body !== null) {
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(payload);
    }
    req.end();
  });
}

function requestText({ method = 'GET', url, headers = {}, body, rejectUnauthorized = false, timeoutMs = 25000 }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method,
        headers,
        timeout: timeoutMs,
        agent: new https.Agent({ rejectUnauthorized }),
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          if (!ok) return reject(new Error(data || `HTTP ${res.statusCode}`));
          resolve({ body: data, headers: res.headers || {} });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Connection timed out')));
    req.on('error', (e) => reject(e));
    if (body !== undefined && body !== null) req.write(body);
    req.end();
  });
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vmware_sources (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('vcenter','esxi')),
      host VARCHAR(255) NOT NULL,
      username VARCHAR(255) NOT NULL,
      password TEXT NOT NULL,
      ignore_ssl BOOLEAN DEFAULT TRUE,
      is_active BOOLEAN DEFAULT TRUE,
      last_scan_at TIMESTAMP NULL,
      last_scan_status VARCHAR(20) DEFAULT 'never',
      last_error TEXT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vmware_candidates (
      id SERIAL PRIMARY KEY,
      source_id INTEGER REFERENCES vmware_sources(id) ON DELETE CASCADE,
      vm_id VARCHAR(255),
      vm_name VARCHAR(255),
      os_hostname VARCHAR(255),
      ip_address VARCHAR(100),
      mac_address VARCHAR(100),
      power_state VARCHAR(50),
      guest_os VARCHAR(255),
      cpu_count INTEGER,
      memory_size_mb INTEGER,
      source_host VARCHAR(255),
      fingerprint VARCHAR(500) NOT NULL,
      status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new','imported','exists','ignored','failed')),
      reason TEXT,
      payload JSONB DEFAULT '{}',
      first_seen_at TIMESTAMP DEFAULT NOW(),
      last_seen_at TIMESTAMP DEFAULT NOW(),
      imported_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(source_id, fingerprint)
    );
  `);
  await pool.query(`ALTER TABLE vmware_candidates ADD COLUMN IF NOT EXISTS mac_address VARCHAR(100)`);
}

async function getSchedule() {
  const r = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key='vmware_import_schedule'");
  if (!r.rows.length) return { ...DEFAULT_SCHEDULE };
  const saved = parseJsonSafe(r.rows[0].setting_value) || {};
  const mins = Math.max(5, parseInt(saved.interval_minutes, 10) || 60);
  return {
    enabled: !!saved.enabled,
    interval_minutes: mins,
  };
}

async function saveSchedule(schedule) {
  const payload = {
    enabled: !!schedule.enabled,
    interval_minutes: Math.max(5, parseInt(schedule.interval_minutes, 10) || 60),
  };
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES ('vmware_import_schedule', $1)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value=$1, updated_at=NOW()`,
    [JSON.stringify(payload)]
  );
  return payload;
}

async function getOrCreateCsvSource() {
  const existing = await pool.query("SELECT id FROM vmware_sources WHERE host='csv-upload.local' AND username='csv-import' LIMIT 1");
  if (existing.rows.length) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO vmware_sources (name, source_type, host, username, password, ignore_ssl, is_active)
     VALUES ($1, 'esxi', 'csv-upload.local', 'csv-import', $2, TRUE, FALSE) RETURNING id`,
    ['CSV Upload Source', encryptPassword('csv-import-not-used')]
  );
  return created.rows[0].id;
}

function csvField(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]).trim();
  }
  return '';
}

function buildUsernameCandidates(rawUsername, sourceType = 'vcenter') {
  const base = String(rawUsername || '').trim();
  if (!base) return [];
  const out = [];
  const add = (v) => {
    const s = String(v || '').trim();
    if (s && !out.includes(s)) out.push(s);
  };
  add(base);
  if (base.includes('@')) {
    const [user, domain] = base.split('@');
    if (user && domain) {
      const netbios = domain.split('.')[0] || '';
      if (sourceType === 'esxi') add(user);
      if (netbios) {
        add(`${netbios}\\${user}`);
        add(`${netbios.toUpperCase()}\\${user}`);
      }
      add(`${user}@${domain.toLowerCase()}`);
    }
  } else if (base.includes('\\')) {
    const parts = base.split('\\');
    const domain = parts[0] || '';
    const user = parts.slice(1).join('\\');
    if (domain && user) {
      if (sourceType === 'esxi') add(user);
      add(`${user}@${domain}`);
      add(`${user}@${domain.toLowerCase()}`);
      if (!domain.includes('.')) add(`${user}@${domain.toLowerCase()}.local`);
    }
  } else if (sourceType === 'vcenter') {
    add(`${base}@vsphere.local`);
  }
  return out;
}

async function createSession({ host, username, password, ignoreSSL, sourceType = 'vcenter' }) {
  const baseUrl = `https://${cleanHost(host)}`;
  const usernames = buildUsernameCandidates(username, sourceType);
  const errors = [];

  for (const userCandidate of usernames) {
    const authHeader = { Authorization: toBasicAuth(userCandidate, password) };
    const attempts = [
      {
        path: '/rest/com/vmware/cis/session',
        headers: authHeader,
        sessionHeader: 'vmware-api-session-id',
        extract: (r) => r?.value,
      },
      {
        path: '/api/session',
        headers: authHeader,
        body: undefined,
        sessionHeader: 'vmware-api-session-id',
        extract: (r) => (typeof r === 'string' ? r : r?.value),
      },
      {
        path: '/api/session',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: {},
        sessionHeader: 'vmware-api-session-id',
        extract: (r) => (typeof r === 'string' ? r : r?.value),
      },
      {
        path: '/rest/com/vmware/cis/session',
        headers: { ...authHeader, 'vmware-use-header-authn': 'true' },
        sessionHeader: 'vmware-api-session-id',
        extract: (r) => r?.value,
      },
    ];

    for (const a of attempts) {
      try {
        const resp = await requestJson({
          method: 'POST',
          url: `${baseUrl}${a.path}`,
          headers: a.headers || authHeader,
          body: a.body,
          rejectUnauthorized: !ignoreSSL,
        });
        const token = a.extract(resp);
        if (token) return { baseUrl, token, sessionHeader: a.sessionHeader || 'vmware-api-session-id', username_used: userCandidate };
      } catch (e) {
        const detail = e.message.includes('401') || e.message.toLowerCase().includes('unauthorized')
          ? `${a.path}: Authentication rejected for "${userCandidate}"`
          : `${a.path}: ${e.message}`;
        errors.push(detail);
      }
    }
  }
  throw new Error(`Authentication failed for ${host}. Tried REST and header-auth. Details: ${errors.join(' | ')}`);
}

async function createSoapSession({ host, username, password, ignoreSSL, sourceType = 'vcenter' }) {
  const baseUrl = `https://${cleanHost(host)}`;
  const svcResp = await requestText({
    method: 'POST',
    url: `${baseUrl}/sdk`,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      Accept: 'text/xml',
    },
    body: soapEnvelope(`
      <vim25:RetrieveServiceContent>
        <vim25:_this type="ServiceInstance">ServiceInstance</vim25:_this>
      </vim25:RetrieveServiceContent>
    `),
    rejectUnauthorized: !ignoreSSL,
  });
  const svcXml = svcResp.body || '';
  const serviceContent = {
    propertyCollector: xmlTagValue(svcXml, 'propertyCollector'),
    rootFolder: xmlTagValue(svcXml, 'rootFolder'),
    viewManager: xmlTagValue(svcXml, 'viewManager'),
    sessionManager: xmlTagValue(svcXml, 'sessionManager'),
  };
  if (!serviceContent.propertyCollector || !serviceContent.rootFolder || !serviceContent.viewManager || !serviceContent.sessionManager) {
    throw new Error('Could not parse ESXi SOAP service content');
  }

  const usernames = buildUsernameCandidates(username, sourceType);
  const soapErrors = [];
  for (const userCandidate of usernames) {
    try {
      const loginResp = await requestText({
        method: 'POST',
        url: `${baseUrl}/sdk`,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          Accept: 'text/xml',
        },
        body: soapEnvelope(`
          <vim25:Login>
            <vim25:_this type="SessionManager">${escapeXml(serviceContent.sessionManager)}</vim25:_this>
            <vim25:userName>${escapeXml(userCandidate)}</vim25:userName>
            <vim25:password>${escapeXml(password)}</vim25:password>
          </vim25:Login>
        `),
        rejectUnauthorized: !ignoreSSL,
      });
      const setCookie = loginResp.headers['set-cookie'];
      const cookie = Array.isArray(setCookie)
        ? setCookie.map((c) => String(c).split(';')[0]).join('; ')
        : String(setCookie || '').split(';')[0];
      if (!cookie) throw new Error('Could not establish ESXi SOAP session cookie');
      return { baseUrl, cookie, serviceContent, username_used: userCandidate };
    } catch (e) {
      soapErrors.push(`SOAP login rejected for "${userCandidate}": ${e.message}`);
    }
  }
  throw new Error(soapErrors.join(' | ') || 'SOAP login failed');
}

async function listEsxiVmsViaSoap(soapSession, ignoreSSL) {
  const { baseUrl, cookie, serviceContent } = soapSession;
  const headers = {
    'Content-Type': 'text/xml; charset=utf-8',
    Accept: 'text/xml',
    Cookie: cookie,
  };

  const viewResp = await requestText({
    method: 'POST',
    url: `${baseUrl}/sdk`,
    headers,
    body: soapEnvelope(`
      <vim25:CreateContainerView>
        <vim25:_this type="ViewManager">${escapeXml(serviceContent.viewManager)}</vim25:_this>
        <vim25:container type="Folder">${escapeXml(serviceContent.rootFolder)}</vim25:container>
        <vim25:type>VirtualMachine</vim25:type>
        <vim25:recursive>true</vim25:recursive>
      </vim25:CreateContainerView>
    `),
    rejectUnauthorized: !ignoreSSL,
  });
  const viewId = xmlTagValue(viewResp.body, 'returnval');
  if (!viewId) throw new Error('Could not create ESXi VM container view');

  const vmRefsResp = await retrievePropertiesCompat({
    baseUrl,
    headers,
    propertyCollector: serviceContent.propertyCollector,
    specSetXml: `
      <vim25:specSet>
        <vim25:propSet>
          <vim25:type>ContainerView</vim25:type>
          <vim25:pathSet>view</vim25:pathSet>
        </vim25:propSet>
        <vim25:objectSet>
          <vim25:obj type="ContainerView">${escapeXml(viewId)}</vim25:obj>
        </vim25:objectSet>
      </vim25:specSet>
    `,
    ignoreSSL,
  });
  const vmRefs = xmlManagedObjectRefs(vmRefsResp.body, 'VirtualMachine');
  if (!vmRefs.length) return [];

  const objectSetXml = vmRefs
    .map((id) => `<vim25:objectSet><vim25:obj type="VirtualMachine">${escapeXml(id)}</vim25:obj></vim25:objectSet>`)
    .join('');

  const vmPropsResp = await retrievePropertiesCompat({
    baseUrl,
    headers,
    propertyCollector: serviceContent.propertyCollector,
    specSetXml: `
      <vim25:specSet>
        <vim25:propSet>
          <vim25:type>VirtualMachine</vim25:type>
          <vim25:pathSet>name</vim25:pathSet>
          <vim25:pathSet>guest.ipAddress</vim25:pathSet>
          <vim25:pathSet>guest.net</vim25:pathSet>
          <vim25:pathSet>guest.hostName</vim25:pathSet>
          <vim25:pathSet>guest.guestFullName</vim25:pathSet>
          <vim25:pathSet>runtime.powerState</vim25:pathSet>
          <vim25:pathSet>config.hardware.numCPU</vim25:pathSet>
          <vim25:pathSet>config.hardware.memoryMB</vim25:pathSet>
        </vim25:propSet>
        ${objectSetXml}
      </vim25:specSet>
    `,
    ignoreSSL,
  });

  const vmById = {};
  const objectBlocks = extractSoapObjectBlocks(vmPropsResp.body);
  for (const block of objectBlocks) {
    const vmId = xmlTagValue(block, 'obj');
    if (!vmId) continue;
    const nameToVal = {};
    const propBlocks = block.match(/<propSet>[\s\S]*?<\/propSet>/ig) || [];
    for (const pb of propBlocks) {
      const n = xmlTagValue(pb, 'name');
      const rawVal = xmlTagValue(pb, 'val');
      if (n) nameToVal[n] = rawVal;
    }
    vmById[vmId] = {
      vm_id: vmId,
      name: nameToVal.name || '',
      os_hostname: nameToVal['guest.hostName'] || '',
      ip_address: nameToVal['guest.ipAddress'] || '',
      mac_address: (String(nameToVal['guest.net'] || '').match(/([0-9a-f]{2}(:[0-9a-f]{2}){5})/i) || [])[1] || '',
      power_state: nameToVal['runtime.powerState'] || 'unknown',
      cpu_count: nameToVal['config.hardware.numCPU'] ? parseInt(nameToVal['config.hardware.numCPU'], 10) : null,
      memory_size_mb: nameToVal['config.hardware.memoryMB'] ? parseInt(nameToVal['config.hardware.memoryMB'], 10) : null,
      guest_os: nameToVal['guest.guestFullName'] || '',
      source_host: cleanHost(baseUrl),
    };
  }
  return vmRefs.map((id) => vmById[id]).filter(Boolean);
}

async function getVmList(session, ignoreSSL) {
  const headers = { [session.sessionHeader || 'vmware-api-session-id']: session.token };
  const attempts = [
    { path: '/api/vcenter/vm', map: (r) => (Array.isArray(r) ? r : []) },
    { path: '/rest/vcenter/vm', map: (r) => (Array.isArray(r?.value) ? r.value : []) },
  ];
  for (const a of attempts) {
    try {
      const resp = await requestJson({
        url: `${session.baseUrl}${a.path}`,
        headers,
        rejectUnauthorized: !ignoreSSL,
      });
      return a.map(resp);
    } catch {
      // try next
    }
  }
  return [];
}

async function getVmDetail(session, vmId, ignoreSSL) {
  const headers = { [session.sessionHeader || 'vmware-api-session-id']: session.token };
  const attempts = [
    { path: `/api/vcenter/vm/${encodeURIComponent(vmId)}`, map: (r) => r || {} },
    { path: `/rest/vcenter/vm/${encodeURIComponent(vmId)}`, map: (r) => r?.value || {} },
  ];
  for (const a of attempts) {
    try {
      const resp = await requestJson({
        url: `${session.baseUrl}${a.path}`,
        headers,
        rejectUnauthorized: !ignoreSSL,
      });
      return a.map(resp);
    } catch {
      // try next
    }
  }
  return {};
}

async function getGuestIdentity(session, vmId, ignoreSSL) {
  const headers = { [session.sessionHeader || 'vmware-api-session-id']: session.token };
  const attempts = [
    { path: `/api/vcenter/vm/${encodeURIComponent(vmId)}/guest/identity`, map: (r) => r || {} },
    { path: `/rest/vcenter/vm/${encodeURIComponent(vmId)}/guest/identity`, map: (r) => r?.value || {} },
  ];
  for (const a of attempts) {
    try {
      const resp = await requestJson({
        url: `${session.baseUrl}${a.path}`,
        headers,
        rejectUnauthorized: !ignoreSSL,
      });
      return a.map(resp);
    } catch {
      // try next
    }
  }
  return {};
}

async function getVmMacAddress(session, vmId, ignoreSSL) {
  if (!vmId) return '';
  const headers = { [session.sessionHeader || 'vmware-api-session-id']: session.token };
  const attempts = [
    { path: `/api/vcenter/vm/${encodeURIComponent(vmId)}/hardware/ethernet`, map: (r) => (Array.isArray(r) ? r : []) },
    { path: `/rest/vcenter/vm/${encodeURIComponent(vmId)}/hardware/ethernet`, map: (r) => (Array.isArray(r?.value) ? r.value : []) },
  ];
  for (const a of attempts) {
    try {
      const resp = await requestJson({
        url: `${session.baseUrl}${a.path}`,
        headers,
        rejectUnauthorized: !ignoreSSL,
      });
      const rows = a.map(resp);
      const nic = rows.find((n) => n?.mac_address && String(n.mac_address).trim());
      if (nic?.mac_address) return String(nic.mac_address).trim();
    } catch {
      // try next
    }
  }
  return '';
}

function pickIp(identity = {}, detail = {}, vm = {}) {
  return identity.ip_address || detail.ip_address || vm.ip_address || '';
}

function mapVmRecord(vm, detail = {}, identity = {}, host) {
  const vmId = vm.vm || vm.vm_id || detail.vm || detail.vm_id || vm.id || '';
  return {
    vm_id: vmId,
    name: vm.name || detail.name || identity.name || '',
    os_hostname: identity.host_name || detail.guest_OS || vm.guest_OS || '',
    ip_address: pickIp(identity, detail, vm),
    mac_address: vm.mac_address || detail.mac_address || identity.mac_address || '',
    power_state: vm.power_state || detail.power_state || 'UNKNOWN',
    cpu_count: vm.cpu_count || detail.cpu_count || null,
    memory_size_mb: vm.memory_size_MiB || detail.memory_size_MiB || null,
    guest_os: detail.guest_OS || vm.guest_OS || '',
    source_host: host,
  };
}

function fingerprintForVm(vm) {
  const ip = String(vm.ip_address || '').trim().toLowerCase();
  const id = String(vm.vm_id || '').trim().toLowerCase();
  const name = String(vm.name || vm.os_hostname || '').trim().toLowerCase();
  return `${ip}|${id}|${name}`;
}

async function ipExistsAnywhere(ip) {
  if (!ip || String(ip).trim() === '' || ip === 'N/A') return false;
  const cleanIp = String(ip).trim();
  try {
    const a = await pool.query(
      'SELECT id FROM assets WHERE TRIM(LOWER(ip_address))=LOWER($1) LIMIT 1',
      [cleanIp]
    );
    if (a.rows.length) return true;
  } catch { /* assets table may not exist in all setups */ }
  try {
    const e = await extPool.query(
      'SELECT id FROM items WHERE TRIM(LOWER(ip_address))=LOWER($1) LIMIT 1',
      [cleanIp]
    );
    return e.rows.length > 0;
  } catch { return false; }
}

async function upsertCandidate(sourceId, vm, status, reason = '') {
  const fp = fingerprintForVm(vm);
  await pool.query(
    `INSERT INTO vmware_candidates (
       source_id, vm_id, vm_name, os_hostname, ip_address, mac_address, power_state, guest_os,
       cpu_count, memory_size_mb, source_host, fingerprint, status, reason, payload, first_seen_at, last_seen_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
     ON CONFLICT (source_id, fingerprint) DO UPDATE SET
       vm_id=EXCLUDED.vm_id,
       vm_name=EXCLUDED.vm_name,
       os_hostname=EXCLUDED.os_hostname,
       ip_address=EXCLUDED.ip_address,
       mac_address=EXCLUDED.mac_address,
       power_state=EXCLUDED.power_state,
       guest_os=EXCLUDED.guest_os,
       cpu_count=EXCLUDED.cpu_count,
       memory_size_mb=EXCLUDED.memory_size_mb,
       source_host=EXCLUDED.source_host,
       status=EXCLUDED.status,
       reason=EXCLUDED.reason,
       payload=EXCLUDED.payload,
       last_seen_at=NOW(),
       updated_at=NOW()`,
    [
      sourceId,
      vm.vm_id || null,
      vm.name || null,
      vm.os_hostname || null,
      vm.ip_address || null,
      vm.mac_address || null,
      vm.power_state || null,
      vm.guest_os || null,
      vm.cpu_count || null,
      vm.memory_size_mb || null,
      vm.source_host || null,
      fp,
      status,
      reason,
      JSON.stringify(vm),
    ]
  );
}

async function scanSource(source) {
  const scanStart = new Date().toISOString();
  const host = cleanHost(source.host);
  const scanLimit = 200;
  try {
    let plainPassword = '';
    try {
      plainPassword = decryptPassword(source.password);
    } catch {
      throw new Error('Stored password cannot be decrypted. Re-save this source password after confirming VMWARE_CRED_SECRET.');
    }
    let allVms = [];
    let detailed = [];
    let restError = null;

    try {
      const session = await createSession({
        host,
        username: String(source.username || '').trim(),
        password: plainPassword,
        ignoreSSL: source.ignore_ssl,
        sourceType: source.source_type || 'vcenter',
      });
      allVms = await getVmList(session, source.ignore_ssl);
      const rows = allVms.slice(0, scanLimit);
      detailed = await Promise.all(rows.map(async (vm) => {
        const vmId = vm.vm || vm.vm_id || vm.id;
        const [detail, identity, macAddress] = await Promise.all([
          vmId ? getVmDetail(session, vmId, source.ignore_ssl) : Promise.resolve({}),
          vmId ? getGuestIdentity(session, vmId, source.ignore_ssl) : Promise.resolve({}),
          vmId ? getVmMacAddress(session, vmId, source.ignore_ssl) : Promise.resolve(''),
        ]);
        return mapVmRecord({ ...vm, mac_address: macAddress }, detail, identity, host);
      }));
    } catch (e) {
      restError = e;
    }

    // For ESXi: also try SOAP if REST failed or returned nothing
    // For vCenter: if REST returned nothing due to auth failure, report a clear error
    if (!detailed.length || (restError && source.source_type === 'esxi')) {
      try {
        const soapSession = await createSoapSession({
          host,
          username: String(source.username || '').trim(),
          password: plainPassword,
          ignoreSSL: source.ignore_ssl,
          sourceType: source.source_type || 'vcenter',
        });
        const soapVms = await listEsxiVmsViaSoap(soapSession, source.ignore_ssl);
        if (soapVms.length) {
          allVms = soapVms;
          detailed = soapVms.slice(0, scanLimit);
        }
      } catch (soapErr) {
        if (source.source_type === 'esxi') {
          const restMsg = restError ? restError.message : 'REST endpoint did not return VM data';
          throw new Error(`ESXi scan failed. REST: ${restMsg} | SOAP: ${soapErr.message}`);
        }
        // vCenter: if both failed, surface the original REST error which is more descriptive
        if (restError) throw restError;
      }
    }

    if (!detailed.length && restError) {
      throw restError;
    }

    let newCount = 0;
    let existsCount = 0;
    for (const vm of detailed) {
      if (vm.ip_address && await ipExistsAnywhere(vm.ip_address)) {
        existsCount++;
        await upsertCandidate(source.id, vm, 'exists', 'IP already exists in inventory');
      } else {
        newCount++;
        await upsertCandidate(source.id, vm, 'new', vm.ip_address ? 'New IP' : 'No IP assigned');
      }
    }

    await pool.query(
      `UPDATE vmware_sources
       SET last_scan_at=NOW(), last_scan_status='success', last_error=NULL, updated_at=NOW()
       WHERE id=$1`,
      [source.id]
    );

    return {
      source_id: source.id,
      source_name: source.name,
      started_at: scanStart,
      scanned: detailed.length,
      new_count: newCount,
      exists_count: existsCount,
      truncated: allVms.length > scanLimit,
      total_remote: allVms.length,
      status: 'success',
    };
  } catch (e) {
    await pool.query(
      `UPDATE vmware_sources
       SET last_scan_at=NOW(), last_scan_status='failed', last_error=$2, updated_at=NOW()
       WHERE id=$1`,
      [source.id, e.message]
    );
    return {
      source_id: source.id,
      source_name: source.name,
      started_at: scanStart,
      scanned: 0,
      new_count: 0,
      exists_count: 0,
      truncated: false,
      total_remote: 0,
      status: 'failed',
      error: e.message,
    };
  }
}

async function runScheduledScan() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    await ensureTables();
    const r = await pool.query('SELECT * FROM vmware_sources WHERE is_active=TRUE ORDER BY id');
    for (const src of r.rows) {
      // eslint-disable-next-line no-await-in-loop
      await scanSource(src);
    }
  } finally {
    schedulerRunning = false;
  }
}

async function refreshScheduler() {
  const cfg = await getSchedule();
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  if (cfg.enabled) {
    schedulerTimer = setInterval(() => {
      runScheduledScan().catch((e) => console.error('VMware scheduler scan failed:', e.message));
    }, cfg.interval_minutes * 60 * 1000);
  }
}

async function startScheduler() {
  try {
    await ensureTables();
    await refreshScheduler();
  } catch (e) {
    console.error('Failed to start VMware scheduler:', e.message);
  }
}

router.get('/sources', auth, requireAdmin, async (req, res) => {
  try {
    await ensureTables();
    const r = await pool.query(
      `SELECT id,name,source_type,host,username,ignore_ssl,is_active,last_scan_at,last_scan_status,last_error,created_at,updated_at
       FROM vmware_sources ORDER BY id DESC`
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

router.post('/sources', auth, requireAdmin, async (req, res) => {
  try {
    await ensureTables();
    const { name, source_type = 'vcenter', host, username, password, ignore_ssl = true, is_active = true } = req.body || {};
    if (!name || !host || !username || !password) {
      return res.status(400).json({ error: 'name, host, username and password are required' });
    }
    if (!['vcenter', 'esxi'].includes(source_type)) {
      return res.status(400).json({ error: "source_type must be 'vcenter' or 'esxi'" });
    }
    const encryptedPassword = encryptPassword(password);
    const r = await pool.query(
      `INSERT INTO vmware_sources (name,source_type,host,username,password,ignore_ssl,is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,source_type,host,username,ignore_ssl,is_active,last_scan_at,last_scan_status,last_error,created_at,updated_at`,
      [name.trim(), source_type, cleanHost(host), username.trim(), encryptedPassword, !!ignore_ssl, !!is_active]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

router.put('/sources/:id', auth, requireAdmin, async (req, res) => {
  try {
    await ensureTables();
    const sourceId = parseInt(req.params.id, 10);
    if (!sourceId) return res.status(400).json({ error: 'Invalid source id' });
    const current = await pool.query('SELECT * FROM vmware_sources WHERE id=$1', [sourceId]);
    if (!current.rows.length) return res.status(404).json({ error: 'Source not found' });
    const cur = current.rows[0];
    const { name, source_type, host, username, password, ignore_ssl, is_active } = req.body || {};
    const effectivePassword = password
      ? encryptPassword(password)
      : (isEncrypted(cur.password) ? cur.password : encryptPassword(cur.password));
    const r = await pool.query(
      `UPDATE vmware_sources
       SET name=$1, source_type=$2, host=$3, username=$4, password=$5, ignore_ssl=$6, is_active=$7, updated_at=NOW()
       WHERE id=$8
       RETURNING id,name,source_type,host,username,ignore_ssl,is_active,last_scan_at,last_scan_status,last_error,created_at,updated_at`,
      [
        (name ?? cur.name).trim(),
        source_type ?? cur.source_type,
        cleanHost(host ?? cur.host),
        (username ?? cur.username).trim(),
        effectivePassword,
        ignore_ssl === undefined ? cur.ignore_ssl : !!ignore_ssl,
        is_active === undefined ? cur.is_active : !!is_active,
        sourceId,
      ]
    );
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

router.delete('/sources/:id', auth, requireAdmin, async (req, res) => {
  try {
    await ensureTables();
    const sourceId = parseInt(req.params.id, 10);
    if (!sourceId) return res.status(400).json({ error: 'Invalid source id' });
    await pool.query('DELETE FROM vmware_sources WHERE id=$1', [sourceId]);
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

router.get('/schedule', auth, requireAdmin, async (req, res) => {
  try {
    const cfg = await getSchedule();
    res.json(cfg);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

router.put('/schedule', auth, requireAdmin, async (req, res) => {
  try {
    const saved = await saveSchedule(req.body || {});
    await refreshScheduler();
    res.json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

router.post('/scan', auth, requireAdmin, async (req, res) => {
  try {
    await ensureTables();
    const sourceIdRaw = req.body?.source_id;
    const hasSourceId = sourceIdRaw !== undefined && sourceIdRaw !== null && String(sourceIdRaw).trim() !== '';
    const sourceId = hasSourceId ? parseInt(String(sourceIdRaw), 10) : null;
    if (hasSourceId && !Number.isInteger(sourceId)) {
      return res.status(400).json({ error: 'Invalid source_id' });
    }
    let sources = [];
    if (sourceId !== null) {
      const r = await pool.query('SELECT * FROM vmware_sources WHERE id=$1', [sourceId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Source not found' });
      sources = r.rows;
    } else {
      const r = await pool.query('SELECT * FROM vmware_sources WHERE is_active=TRUE ORDER BY id');
      sources = r.rows;
    }
    const runs = [];
    for (const src of sources) {
      // eslint-disable-next-line no-await-in-loop
      runs.push(await scanSource(src));
    }
    res.json({ runs });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

router.get('/candidates', auth, requireAdmin, async (req, res) => {
  try {
    await ensureTables();
    const status = String(req.query.status || 'new').trim();
    const q = `
      SELECT c.id,c.source_id,s.name AS source_name,s.source_type,c.vm_id,c.vm_name,c.os_hostname,c.ip_address,
             c.mac_address,c.power_state,c.guest_os,c.cpu_count,c.memory_size_mb,c.source_host,c.status,c.reason,
             c.first_seen_at,c.last_seen_at,c.imported_at,c.created_at,c.updated_at
      FROM vmware_candidates c
      JOIN vmware_sources s ON s.id=c.source_id
      WHERE c.status=$1
      ORDER BY c.last_seen_at DESC, c.id DESC
      LIMIT 1000`;
    const r = await pool.query(q, [status]);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

router.post('/import-to-ext', auth, requireAdmin, async (req, res) => {
  try {
    await ensureTables();
    const ids = Array.isArray(req.body?.candidate_ids) ? req.body.candidate_ids.map((x) => parseInt(x, 10)).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: 'candidate_ids is required' });

    const q = await pool.query(
      `SELECT * FROM vmware_candidates WHERE id = ANY($1::int[]) AND status='new' ORDER BY id`,
      [ids]
    );
    const rows = q.rows;
    const results = { success: 0, skipped: 0, failed: 0, errors: [] };

    for (const c of rows) {
      try {
        if (c.ip_address) {
          const dup = await extPool.query('SELECT id FROM items WHERE LOWER(ip_address)=LOWER($1) LIMIT 1', [c.ip_address]);
          if (dup.rows.length) {
            await pool.query("UPDATE vmware_candidates SET status='exists', reason='IP already exists in Ext Inventory', updated_at=NOW() WHERE id=$1", [c.id]);
            results.skipped++;
            results.errors.push(`Candidate ${c.id}: IP ${c.ip_address} already exists`);
            continue;
          }
        }
        await extPool.query(
          `INSERT INTO items (
             vm_name, asset_name, os_hostname, ip_address, status, business_purpose,
             me_installed_status, tenable_installed_status, eol_status, oem_status,
             submitted_by, custom_field_values
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            c.vm_name || c.os_hostname || 'VM',
            c.vm_name || c.os_hostname || 'VM',
            c.os_hostname || c.vm_name || 'VM',
            c.ip_address || null,
            (String(c.power_state || '').toUpperCase() === 'POWERED_OFF') ? 'Inactive' : 'Active',
            `Imported from ${c.source_host || 'VMware'} (New Asset Import)`,
            false,
            false,
            'InSupport',
            '',
            req.user.username,
            JSON.stringify(buildVmwareImportCustomFields(c)),
          ]
        );
        await pool.query("UPDATE vmware_candidates SET status='imported', reason='Imported to Ext Inventory', imported_at=NOW(), updated_at=NOW() WHERE id=$1", [c.id]);
        results.success++;
      } catch (e) {
        await pool.query("UPDATE vmware_candidates SET status='failed', reason=$2, updated_at=NOW() WHERE id=$1", [c.id, e.message]);
        results.failed++;
        results.errors.push(`Candidate ${c.id}: ${e.message}`);
      }
    }
    await writeImportAuditReport({
      sourcePage: 'new-asset-import',
      targetScope: 'extended-inventory',
      importMode: 'vmware-candidates',
      totalCount: rows.length,
      successCount: results.success,
      failedCount: results.failed,
      skippedCount: results.skipped,
      reasons: results.errors,
      user: req.user,
    });
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

router.get('/csv-template', auth, requireAdmin, async (req, res) => {
  const headers = ['vm_name', 'os_hostname', 'ip_address', 'mac_address', 'power_state', 'guest_os', 'vm_id', 'source_host'];
  const sample = ['APP-SRV-01', 'app-srv-01.local', '10.10.10.21', '00:50:56:aa:bb:cc', 'POWERED_ON', 'Ubuntu Linux (64-bit)', 'vm-1001', 'esxi-01.local'];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="vmware_vm_import_template.csv"');
  res.send(`${headers.join(',')}\n${sample.join(',')}`);
});

router.post('/import-csv-candidates', auth, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    await ensureTables();
    if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });
    const rows = parse(req.file.buffer.toString('utf8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    if (!rows.length) return res.status(400).json({ error: 'CSV has no data rows' });

    const sourceId = await getOrCreateCsvSource();
    await pool.query('DELETE FROM vmware_candidates WHERE source_id=$1', [sourceId]);

    const results = { total: rows.length, imported_rows: 0, new_count: 0, exists_count: 0, invalid: 0, errors: [] };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const vm = {
        vm_id: csvField(row, ['vm_id', 'id']),
        name: csvField(row, ['vm_name', 'name']),
        os_hostname: csvField(row, ['os_hostname', 'hostname']),
        ip_address: csvField(row, ['ip_address', 'ip']),
        mac_address: csvField(row, ['mac_address', 'mac']),
        power_state: csvField(row, ['power_state', 'power']) || 'UNKNOWN',
        guest_os: csvField(row, ['guest_os', 'os']),
        cpu_count: null,
        memory_size_mb: null,
        source_host: csvField(row, ['source_host']) || 'csv-upload',
      };

      if (!vm.name && !vm.os_hostname) {
        results.invalid++;
        results.errors.push(`Row ${i + 2}: vm_name or os_hostname is required`);
        continue;
      }

      if (vm.ip_address && await ipExistsAnywhere(vm.ip_address)) {
        await upsertCandidate(sourceId, vm, 'exists', 'IP already exists in inventory');
        results.exists_count++;
      } else {
        await upsertCandidate(sourceId, vm, 'new', vm.ip_address ? 'New IP (CSV)' : 'No IP assigned (CSV)');
        results.new_count++;
      }
      results.imported_rows++;
    }

    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message || 'CSV import failed' });
  }
});

// ── Test Connection ──────────────────────────────────────────────────────────
// Validates credentials against a vCenter/ESXi host WITHOUT persisting anything.
// Returns { ok, method, vm_count, message } so the UI can show a clear result.
router.post('/test-connection', auth, requireAdmin, async (req, res) => {
  const { host, username, password, source_type = 'vcenter', ignore_ssl = true } = req.body || {};
  if (!host || !username || !password) {
    return res.status(400).json({ ok: false, message: 'host, username and password are required' });
  }

  const cleanedHost = cleanHost(host);
  const steps = [];

  // ── Step 1: Try REST session auth ──────────────────────────────────────────
  let session = null;
  try {
    session = await createSession({
      host: cleanedHost,
      username: String(username || '').trim(),
      password,
      ignoreSSL: !!ignore_ssl,
      sourceType: source_type,
    });
    const userNote = session.username_used ? ` as ${session.username_used}` : '';
    steps.push({ step: 'REST auth', status: 'ok', detail: `Session token obtained via ${session.sessionHeader}${userNote}` });
  } catch (authErr) {
    steps.push({ step: 'REST auth', status: 'failed', detail: authErr.message });
  }

  // ── Step 2: If REST session succeeded, try listing VMs ────────────────────
  if (session) {
    try {
      const vms = await getVmList(session, !!ignore_ssl);
      const count = Array.isArray(vms) ? vms.length : 0;
      steps.push({ step: 'List VMs (REST)', status: 'ok', detail: `${count} VM(s) visible` });
      return res.json({
        ok: true,
        method: 'REST',
        vm_count: count,
        message: `Connected successfully. ${count} VM(s) found via REST API.`,
        steps,
      });
    } catch (listErr) {
      steps.push({ step: 'List VMs (REST)', status: 'failed', detail: listErr.message });
    }
  }

  // ── Step 3: Try SOAP (ESXi or REST-unavailable vCenter) ───────────────────
  try {
    const soapSess = await createSoapSession({
      host: cleanedHost,
      username: String(username || '').trim(),
      password,
      ignoreSSL: !!ignore_ssl,
      sourceType: source_type,
    });
    const userNote = soapSess.username_used ? ` as ${soapSess.username_used}` : '';
    steps.push({ step: 'SOAP auth', status: 'ok', detail: `Session cookie obtained${userNote}` });

    const soapVms = await listEsxiVmsViaSoap(soapSess, !!ignore_ssl);
    const count = Array.isArray(soapVms) ? soapVms.length : 0;
    steps.push({ step: 'List VMs (SOAP)', status: 'ok', detail: `${count} VM(s) visible` });
    return res.json({
      ok: true,
      method: 'SOAP',
      vm_count: count,
      message: `Connected via SOAP/SDK. ${count} VM(s) found. (REST API unavailable — this is normal for standalone ESXi.)`,
      steps,
    });
  } catch (soapErr) {
    steps.push({ step: 'SOAP auth', status: 'failed', detail: soapErr.message });
  }

  // ── All methods failed ─────────────────────────────────────────────────────
  const restDetail = steps.find((s) => s.step === 'REST auth')?.detail || '';
  const soapDetail = steps.find((s) => s.step === 'SOAP auth')?.detail || '';

  let hint = '';
  const combined = `${restDetail} ${soapDetail}`.toLowerCase();
  if (combined.includes('401') || combined.includes('unauthorized') || combined.includes('authentication rejected') || combined.includes('invalidlogin')) {
    hint = source_type === 'esxi'
      ? 'Hint: ESXi typically accepts local users only (for example "root" or local account), not AD/SSO domain formats.'
      : 'Hint: Username or password is incorrect. For vCenter use "user@vsphere.local" or "DOMAIN\\\\user".';
  } else if (combined.includes('econnrefused') || combined.includes('timed out') || combined.includes('timeout')) {
    hint = 'Hint: Cannot reach the host. Check the hostname/IP, firewall rules, and that the host is powered on.';
  } else if (combined.includes('certificate') || combined.includes('self-signed') || combined.includes('unable to verify')) {
    hint = 'Hint: SSL certificate error. Enable "Ignore SSL cert errors" and try again.';
  } else if (combined.includes('enotfound') || combined.includes('getaddrinfo')) {
    hint = 'Hint: Hostname could not be resolved. Use an IP address or check DNS.';
  }

  return res.status(502).json({
    ok: false,
    method: null,
    vm_count: 0,
    message: `Connection failed for ${host}. ${hint}`.trim(),
    steps,
  });
});

// Backward-compatible endpoints used by the previous UI.
router.post('/discover', auth, requireAdmin, async (req, res) => {
  try {
    const { host, username, password, ignoreSSL = true } = req.body || {};
    if (!host || !username || !password) {
      return res.status(400).json({ error: 'host, username and password are required' });
    }
    const source = { id: 0, host, username, password, ignore_ssl: !!ignoreSSL, name: 'Adhoc' };
    const out = await scanSource(source);
    const tempRows = await pool.query(
      `SELECT vm_id, vm_name AS name, os_hostname, ip_address, mac_address, power_state, guest_os, cpu_count, memory_size_mb, source_host
       FROM vmware_candidates WHERE source_id=$1 ORDER BY id DESC LIMIT 200`,
      [0]
    ).catch(() => ({ rows: [] }));
    res.json({ total: out.total_remote, returned: out.scanned, truncated: out.truncated, vms: tempRows.rows });
  } catch (e) {
    res.status(500).json({ error: `Discovery failed: ${e.message}` });
  }
});

module.exports = router;
module.exports.startScheduler = startScheduler;


