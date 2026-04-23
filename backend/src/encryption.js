const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  console.error('ENCRYPTION_KEY environment variable is required');
  process.exit(1);
}

// Ensure key is 32 bytes (256 bits)
const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

/**
 * Encrypt plain text password
 * @param {string} plainText - Password to encrypt
 * @returns {string} Encrypted password (IV:encryptedData in base64)
 */
function encryptPassword(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt encrypted password
 * @param {string} encrypted - Encrypted password (IV:encryptedData format)
 * @returns {string} Decrypted password
 */
function decryptPassword(encrypted) {
  if (!encrypted) return null;
  try {
    const raw = String(encrypted);
    const parts = raw.split(':');
    // Legacy/plain-text values should still render in list/detail screens.
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
}

module.exports = { encryptPassword, decryptPassword };