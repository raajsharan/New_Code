const { Pool } = require('pg');
require('dotenv').config();

const dbConfig = {
  host:     process.env.DB_HOST || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'infrastructure_inventory',
  user:     process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// Main pool — public schema (asset inventory, users, dropdowns)
const pool = new Pool({ ...dbConfig, max: 20 });
pool.on('error', (err) => console.error('DB pool error:', err));

// Extended inventory pool — ext_inv schema
const extPool = new Pool({ ...dbConfig, max: 10 });
extPool.on('connect', (client) => {
  client.query("SET search_path TO ext_inv, public");
});
extPool.on('error', (err) => console.error('Ext DB pool error:', err));

module.exports = pool;
module.exports.extPool = extPool;