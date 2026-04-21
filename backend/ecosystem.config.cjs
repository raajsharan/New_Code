const path = require('path');
module.exports = {
  apps: [{
    name: 'infra-inventory-api',
    script: path.join(__dirname, 'src/app.js'),
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env_file: path.join(__dirname, '.env'),
    env: { NODE_ENV: 'production' },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: path.join(__dirname, '../logs/api-error.log'),
    out_file: path.join(__dirname, '../logs/api-out.log'),
    merge_logs: true,
    restart_delay: 3000,
    max_restarts: 10,
    min_uptime: '10s',
  }],
};
