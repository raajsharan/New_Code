const pool = require('../config/database');

const SENSITIVE_KEYS = new Set([
  'asset_password',
  'password',
  'password_hash',
  'smtp_password',
  'secret',
  'token',
]);

function redactValue(key, value) {
  if (value === null || value === undefined) return value;
  if (SENSITIVE_KEYS.has(String(key).toLowerCase())) return '[REDACTED]';
  return value;
}

function sanitizeObject(input) {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map((item) => sanitizeObject(item));
  if (typeof input !== 'object') return input;

  const out = {};
  for (const [k, v] of Object.entries(input)) {
    const rv = redactValue(k, v);
    out[k] = rv === v ? sanitizeObject(v) : rv;
  }
  return out;
}

function getRequestIp(req) {
  const xf = req?.headers?.['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req?.ip || req?.socket?.remoteAddress || null;
}

async function writeAuditLog({
  entityType,
  entityId,
  action,
  beforeState = null,
  afterState = null,
  user = null,
  req = null,
}) {
  if (!entityType || !entityId || !action) return;

  const beforeJson = sanitizeObject(beforeState);
  const afterJson = sanitizeObject(afterState);

  await pool.query(
    `INSERT INTO audit_logs (
      entity_type, entity_id, action,
      before_json, after_json,
      actor_user_id, actor_username, ip_address
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      String(entityType),
      String(entityId),
      String(action),
      beforeJson ? JSON.stringify(beforeJson) : null,
      afterJson ? JSON.stringify(afterJson) : null,
      user?.id || null,
      user?.username || null,
      getRequestIp(req),
    ]
  );
}

module.exports = { writeAuditLog, sanitizeObject };