import React, { useState } from 'react';
import { settingsAPI } from '../services/api';
import toast from 'react-hot-toast';
import { Database, Copy, CheckCheck, Terminal, AlertCircle } from 'lucide-react';

const SETUP_STEPS = [
  {
    title: '1. Install PostgreSQL',
    lang: 'bash',
    code: `# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql
sudo systemctl enable postgresql

# RHEL/CentOS
sudo dnf install postgresql-server postgresql-contrib -y
sudo postgresql-setup --initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql`,
  },
  {
    title: '2. Create Database & User',
    lang: 'sql',
    code: `-- Run as postgres superuser
-- sudo -u postgres psql

CREATE DATABASE infrastructure_inventory;
CREATE USER infra_admin WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE infrastructure_inventory TO infra_admin;

-- Connect to the database
\\c infrastructure_inventory

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO infra_admin;`,
  },
  {
    title: '3. Install Backend Dependencies',
    lang: 'bash',
    code: `cd backend
npm install

# Copy and edit environment file
cp .env.example .env
nano .env   # Set DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET`,
  },
  {
    title: '4. Run Database Schema',
    lang: 'bash',
    code: `# Apply the full schema (creates all tables + sample data)
psql -U infra_admin -d infrastructure_inventory -f ../database/schema.sql

# Or connect and paste manually:
psql -U infra_admin -h localhost -d infrastructure_inventory`,
  },
  {
    title: '5. Start the Application',
    lang: 'bash',
    code: `# Start backend API
cd backend
npm run dev    # Development
npm start      # Production

# Start frontend (in a separate terminal)
cd frontend
npm install
npm run dev    # Development (http://localhost:3000)
npm run build  # Build for production`,
  },
];

const ADMIN_PASSWORD_SQL = `-- If admin password needs to be reset, run this in PostgreSQL:
-- The hash below is for password: admin123
UPDATE users 
SET password_hash = '$2b$10$rQmGKP2NsKaYQ5YhEtBCTOZt5JfQfF7cFCvPAGjPwkl8YCcXfLjxO'
WHERE username = 'admin';

-- To generate a new hash, use Node.js:
-- node -e "const bcrypt = require('bcrypt'); bcrypt.hash('new_password', 10).then(h => console.log(h));"`;

export default function DatabaseSetupPage() {
  const [copied, setCopied] = useState({});

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(p => ({ ...p, [key]: true }));
      setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 2000);
      toast.success('Copied to clipboard');
    }).catch(() => toast.error('Copy failed'));
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Database size={22} className="text-primary-700" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Database Setup</h1>
          <p className="text-sm text-gray-500">PostgreSQL setup commands and schema reference</p>
        </div>
      </div>

      {/* Warning */}
      <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
        <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">Prerequisites</p>
          <p className="text-sm text-amber-700 mt-0.5">
            This guide assumes PostgreSQL 14+ is being used. The backend requires Node.js 18+. 
            Always back up your database before running schema changes in production.
          </p>
        </div>
      </div>

      {/* Connection info */}
      <div className="card mb-5">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Terminal size={15} /> Default Connection Settings</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Host', value: 'localhost' },
            { label: 'Port', value: '5432' },
            { label: 'Database', value: 'infrastructure_inventory' },
            { label: 'Default Admin', value: 'admin@infra.local / admin123' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 font-medium">{label}</p>
              <p className="text-sm font-mono font-medium text-gray-700 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {SETUP_STEPS.map((step, i) => (
          <div key={i} className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-700">{step.title}</h3>
              <button
                onClick={() => copyToClipboard(step.code, `step-${i}`)}
                className="btn-secondary text-xs py-1"
              >
                {copied[`step-${i}`] ? <><CheckCheck size={12} className="text-green-600" /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
            <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre">
              {step.code}
            </pre>
          </div>
        ))}

        {/* Admin password reset */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700">Reset Admin Password</h3>
            <button onClick={() => copyToClipboard(ADMIN_PASSWORD_SQL, 'pw-reset')} className="btn-secondary text-xs py-1">
              {copied['pw-reset'] ? <><CheckCheck size={12} className="text-green-600" /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre">
            {ADMIN_PASSWORD_SQL}
          </pre>
        </div>
      </div>

      {/* Quick reference */}
      <div className="card mt-5">
        <h3 className="font-semibold text-gray-700 mb-3">Useful psql Commands</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { cmd: '\\l', desc: 'List all databases' },
            { cmd: '\\c infrastructure_inventory', desc: 'Connect to database' },
            { cmd: '\\dt', desc: 'List all tables' },
            { cmd: '\\d assets', desc: 'Describe assets table' },
            { cmd: 'SELECT COUNT(*) FROM assets;', desc: 'Count total assets' },
            { cmd: 'SELECT * FROM users;', desc: 'List all users' },
            { cmd: 'TRUNCATE assets RESTART IDENTITY;', desc: 'Clear all assets (danger!)' },
          ].map(({ cmd, desc }) => (
            <div key={cmd} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
              <code className="text-xs font-mono bg-gray-900 text-green-400 px-2 py-1 rounded flex-shrink-0">{cmd}</code>
              <span className="text-xs text-gray-500">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
