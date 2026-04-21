#!/usr/bin/env node
require('dotenv').config();

const crypto = require('crypto');
const pool = require('../src/config/database');

const ENCRYPTED_PASSWORD_PATTERN = /^[a-f0-9]{32}:[a-f0-9]+$/i;

function toTrimmed(v) {
  return String(v || '').trim();
}

function deriveKey(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

function isEncryptedValue(value) {
  return ENCRYPTED_PASSWORD_PATTERN.test(toTrimmed(value));
}

function decryptWithKey(encrypted, key) {
  const raw = toTrimmed(encrypted);
  if (!raw) return '';
  if (!isEncryptedValue(raw)) return raw;
  const [ivHex, cipherHex] = raw.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function encryptWithKey(plainText, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(String(plainText || ''), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

async function main() {
  const oldSecret = toTrimmed(process.env.OLD_ENCRYPTION_KEY);
  const newSecret = toTrimmed(process.env.NEW_ENCRYPTION_KEY);

  if (!oldSecret || !newSecret) {
    throw new Error('OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY are required.');
  }
  if (oldSecret === newSecret) {
    throw new Error('OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY must be different.');
  }

  const oldKey = deriveKey(oldSecret);
  const newKey = deriveKey(newSecret);

  const { rows } = await pool.query(
    `
      SELECT id, asset_password
      FROM assets
      WHERE COALESCE(BTRIM(asset_password), '') <> ''
      ORDER BY id
    `
  );

  if (!rows.length) {
    console.log('No non-empty asset_password values found. Nothing to rotate.');
    return;
  }

  const prepared = [];
  let encryptedCount = 0;
  let plainCount = 0;

  for (const row of rows) {
    const current = toTrimmed(row.asset_password);
    if (!current) continue;
    const wasEncrypted = isEncryptedValue(current);
    let plain;
    try {
      plain = decryptWithKey(current, oldKey);
    } catch (error) {
      throw new Error(`Failed to decrypt assets.id=${row.id}. OLD_ENCRYPTION_KEY is invalid for current stored credentials.`);
    }
    const nextCipher = encryptWithKey(plain, newKey);
    prepared.push({ id: row.id, value: nextCipher, wasEncrypted });
    if (wasEncrypted) encryptedCount += 1;
    else plainCount += 1;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of prepared) {
      await client.query('UPDATE assets SET asset_password=$2, updated_at=NOW() WHERE id=$1', [item.id, item.value]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  console.log('Encryption key rotation completed successfully.');
  console.log(`Rows updated: ${prepared.length}`);
  console.log(`Previously encrypted rows: ${encryptedCount}`);
  console.log(`Plain-text rows migrated to encrypted: ${plainCount}`);
  console.log('Next step: set ENCRYPTION_KEY in your runtime environment to NEW_ENCRYPTION_KEY and restart backend.');
}

main()
  .catch((error) => {
    console.error('Key rotation failed:', error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {}
  });

