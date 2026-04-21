#!/usr/bin/env node
/**
 * Set superadmin password
 * Usage: node set-superadmin-password.js [password]
 * Default password: SuperAdmin@2024
 */
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
require('dotenv').config();

const password = process.argv[2] || 'SuperAdmin@2024';

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'infrastructure_inventory',
  user:     process.env.DB_USER     || 'infra_admin',
  password: process.env.DB_PASSWORD,
});

async function main() {
  const hash = await bcrypt.hash(password, 10);
  const r = await pool.query(
    `INSERT INTO users (username, email, password_hash, full_name, role, is_active)
     VALUES ('superadmin', 'superadmin@infra.local', $1, 'Super Administrator', 'superadmin', TRUE)
     ON CONFLICT (username) DO UPDATE
       SET password_hash = $1, role = 'superadmin', is_active = TRUE, updated_at = NOW()
     RETURNING username, role`,
    [hash]
  );
  console.log(`✅ Superadmin account ready: ${r.rows[0].username} (${r.rows[0].role})`);
  console.log(`   Password: ${password}`);
  console.log('   ⚠️  Change this password after first login via Profile page');
  pool.end();
}

main().catch(e => { console.error('Error:', e.message); pool.end(); process.exit(1); });
