import React, { useState, useEffect, useCallback } from 'react';
import { backupAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  Database, Download, FileText, RefreshCw, Save, Shield,
  Clock, CheckCircle, AlertTriangle, Play, Calendar,
  HardDrive, Layers, Info, Globe
} from 'lucide-react';

// ── Shared sub-components ─────────────────────────────────────────────────────
const Field = ({ label, children, hint }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
    {children}
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);

const StatusBadge = ({ status }) => {
  const cls = { success: 'bg-green-100 text-green-700', error: 'bg-red-100 text-red-600', running: 'bg-blue-100 text-blue-700' };
  const icons = { success: <CheckCircle size={11}/>, error: <AlertTriangle size={11}/>, running: <RefreshCw size={11} className="animate-spin"/> };
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls[status]||'bg-gray-100 text-gray-500'}`}>
      {icons[status]} {status}
    </span>
  );
};

// ── PostgreSQL Backup Tab ──────────────────────────────────────────────────────
function PgBackupTab({ schedule, onScheduleChange, onSaveSchedule, savingSchedule, log, onRefreshLog }) {
  const [dumping, setDumping] = useState(false);

  const handleDump = async () => {
    setDumping(true);
    try {
      const r = await backupAPI.pgDump();
      // Download the blob
      const url  = URL.createObjectURL(new Blob([r.data], { type: 'application/octet-stream' }));
      const a    = document.createElement('a');
      const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href     = url;
      a.download = `infra_backup_${ts}.sql`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PostgreSQL dump downloaded');
      onRefreshLog();
    } catch (err) {
      const msg = err.response?.data?.error || 'Backup failed — check pg_dump is available on the server';
      toast.error(msg, { duration: 8000 });
    } finally { setDumping(false); }
  };

  return (
    <div className="space-y-6">
      {/* Info */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1">
        <p className="font-semibold flex items-center gap-2"><Info size={13}/> PostgreSQL Database Backup</p>
        <p>Creates a full SQL dump of the <strong>infrastructure_inventory</strong> database using <code className="bg-blue-100 px-1 rounded">pg_dump</code>. The dump file can be used to restore the full database at any point.</p>
        <p>Scheduled backups run on the server and the file is available for download. Manual backup triggers an immediate download.</p>
        <p><strong>Requirement:</strong> <code className="bg-blue-100 px-1 rounded">pg_dump</code> must be installed and accessible on the server (standard with PostgreSQL).</p>
      </div>

      {/* Manual trigger */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Play size={15} className="text-green-600"/> Manual Backup
        </h3>
        <button onClick={handleDump} disabled={dumping} className="btn-primary">
          <Database size={15}/> {dumping ? 'Generating dump…' : 'Download SQL Dump Now'}
        </button>
        <p className="text-xs text-gray-400 mt-2">Generates a full pg_dump and immediately downloads it as a .sql file</p>
      </div>

      {/* Schedule config */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Calendar size={15} className="text-blue-600"/> Backup Schedule
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          <Field label="Enable Scheduled Backup">
            <div className="flex items-center gap-3 h-9">
              <input type="checkbox" className="w-4 h-4 accent-blue-600"
                checked={schedule.pg_enabled}
                onChange={e => onScheduleChange('pg_enabled', e.target.checked)} />
              <span className="text-sm text-gray-600">{schedule.pg_enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </Field>
          <Field label="Frequency">
            <select className="input-field" value={schedule.pg_frequency} onChange={e => onScheduleChange('pg_frequency', e.target.value)}
              disabled={!schedule.pg_enabled}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly (Monday)</option>
              <option value="monthly">Monthly (1st)</option>
            </select>
          </Field>
          <Field label="Time (24h)" hint="Server local time">
            <input type="time" className="input-field" value={schedule.pg_time}
              onChange={e => onScheduleChange('pg_time', e.target.value)}
              disabled={!schedule.pg_enabled} />
          </Field>
          <Field label="Retain Backups" hint="Days to keep files">
            <select className="input-field" value={schedule.pg_retain_days} onChange={e => onScheduleChange('pg_retain_days', parseInt(e.target.value))}
              disabled={!schedule.pg_enabled}>
              {[3,7,14,30,90].map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
          </Field>
          <Field label="Backup Directory" hint="Absolute path on server">
            <input className="input-field font-mono text-xs" placeholder="/backups/postgres"
              value={schedule.pg_backup_path || '/backups/postgres'}
              onChange={e => onScheduleChange('pg_backup_path', e.target.value)}
              disabled={!schedule.pg_enabled} />
          </Field>
          <Field label="File Naming">
            <select className="input-field" value={schedule.pg_overwrite ? 'overwrite' : 'timestamp'}
              onChange={e => onScheduleChange('pg_overwrite', e.target.value === 'overwrite')}
              disabled={!schedule.pg_enabled}>
              <option value="timestamp">New file each run (timestamped)</option>
              <option value="overwrite">Overwrite existing backup file</option>
            </select>
          </Field>
        </div>
        <button onClick={onSaveSchedule} disabled={savingSchedule} className="btn-primary">
          <Save size={14}/> {savingSchedule ? 'Saving…' : 'Save Schedule'}
        </button>
        {schedule.pg_enabled && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-xs text-green-700 flex items-center gap-2">
              <Clock size={12}/>
              Schedule: <strong>{schedule.pg_frequency}</strong> at <strong>{schedule.pg_time}</strong>
              {' · '}Retain for <strong>{schedule.pg_retain_days} days</strong>
            </p>
            <p className="text-xs text-green-600 mt-1">
              Server-side scheduler is active. No manual cron entry is required.
            </p>
          </div>
        )}
      </div>

      {/* Log */}
      <BackupLog log={log.filter(e => e.type === 'pg_dump')} onRefresh={onRefreshLog} />
    </div>
  );
}

// ── CSV Export Tab ─────────────────────────────────────────────────────────────
function CsvExportTab({ schedule, onScheduleChange, onSaveSchedule, savingSchedule, log, onRefreshLog }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const r = await backupAPI.csvExport({
        include_assets:  schedule.csv_include_assets,
        include_ext:     schedule.csv_include_ext,
        include_beijing: schedule.csv_include_beijing,
      });
      const { files } = r.data;
      for (const f of files) {
        const blob = new Blob([f.csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url; a.download = f.name; a.click();
        URL.revokeObjectURL(url);
        await new Promise(res => setTimeout(res, 300)); // stagger downloads
      }
      toast.success(`Exported ${files.length} CSV file${files.length > 1 ? 's' : ''}`);
      onRefreshLog();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Export failed');
    } finally { setExporting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-800 space-y-1">
        <p className="font-semibold flex items-center gap-2"><Info size={13}/> CSV Data Export</p>
        <p>Exports Asset Inventory and Extended Inventory as CSV files. Includes all fields, joined lookups (OS, Department, Location etc.), and custom field values.</p>
        <p>Scheduled exports create dated files on the server. Manual export downloads both CSVs immediately.</p>
      </div>

      {/* What to export */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <FileText size={15} className="text-indigo-600"/> Export Selection
        </h3>
        <div className="flex flex-col gap-3 mb-4">
          <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600"
              checked={schedule.csv_include_assets}
              onChange={e => onScheduleChange('csv_include_assets', e.target.checked)} />
            <HardDrive size={16} className="text-blue-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-800">Asset Inventory</p>
              <p className="text-xs text-gray-500">All assets, VM names, IPs, patching status, custom fields</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600"
              checked={schedule.csv_include_ext}
              onChange={e => onScheduleChange('csv_include_ext', e.target.checked)} />
            <Layers size={16} className="text-indigo-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-800">Extended Inventory</p>
              <p className="text-xs text-gray-500">Network devices, switches, printers, UPS records</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600"
              checked={schedule.csv_include_beijing}
              onChange={e => onScheduleChange('csv_include_beijing', e.target.checked)} />
            <Globe size={16} className="text-blue-800 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-800">Beijing Asset List</p>
              <p className="text-xs text-gray-500">All Beijing assets with VM names, IPs, OS, migration status</p>
            </div>
          </label>
        </div>
        <button onClick={handleExport}
          disabled={exporting || (!schedule.csv_include_assets && !schedule.csv_include_ext && !schedule.csv_include_beijing)}
          className="btn-primary">
          <Download size={15}/> {exporting ? 'Exporting…' : 'Export Selected CSVs Now'}
        </button>
      </div>

      {/* Schedule config */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Calendar size={15} className="text-indigo-600"/> Export Schedule
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Field label="Enable Scheduled Export">
            <div className="flex items-center gap-3 h-9">
              <input type="checkbox" className="w-4 h-4 accent-blue-600"
                checked={schedule.csv_enabled}
                onChange={e => onScheduleChange('csv_enabled', e.target.checked)} />
              <span className="text-sm text-gray-600">{schedule.csv_enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </Field>
          <Field label="Frequency">
            <select className="input-field" value={schedule.csv_frequency} onChange={e => onScheduleChange('csv_frequency', e.target.value)}
              disabled={!schedule.csv_enabled}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly (Monday)</option>
              <option value="monthly">Monthly (1st)</option>
            </select>
          </Field>
          <Field label="Time (24h)" hint="Server local time">
            <input type="time" className="input-field" value={schedule.csv_time}
              onChange={e => onScheduleChange('csv_time', e.target.value)}
              disabled={!schedule.csv_enabled} />
          </Field>
          <Field label="Retain Backups" hint="Days to keep files">
            <select className="input-field" value={schedule.csv_retain_days} onChange={e => onScheduleChange('csv_retain_days', parseInt(e.target.value))}
              disabled={!schedule.csv_enabled}>
              {[3,7,14,30,90].map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
          </Field>
          <Field label="Export Directory" hint="Absolute path on server">
            <input className="input-field font-mono text-xs" placeholder="/backups/csv"
              value={schedule.csv_backup_path || '/backups/csv'}
              onChange={e => onScheduleChange('csv_backup_path', e.target.value)}
              disabled={!schedule.csv_enabled} />
          </Field>
          <Field label="File Naming">
            <select className="input-field" value={schedule.csv_overwrite ? 'overwrite' : 'timestamp'}
              onChange={e => onScheduleChange('csv_overwrite', e.target.value === 'overwrite')}
              disabled={!schedule.csv_enabled}>
              <option value="timestamp">New file each run (timestamped)</option>
              <option value="overwrite">Overwrite existing export file</option>
            </select>
          </Field>
        </div>
        <button onClick={onSaveSchedule} disabled={savingSchedule} className="btn-primary">
          <Save size={14}/> {savingSchedule ? 'Saving…' : 'Save Schedule'}
        </button>
        {schedule.csv_enabled && (
          <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
            <p className="text-xs text-indigo-700 flex items-center gap-2">
              <Clock size={12}/>
              Schedule: <strong>{schedule.csv_frequency}</strong> at <strong>{schedule.csv_time}</strong>
              {' · '}Retain for <strong>{schedule.csv_retain_days} days</strong>
            </p>
            <p className="text-xs text-indigo-600 mt-1">Server-side scheduler is active. No manual cron entry is required.</p>
          </div>
        )}
      </div>

      {/* Log */}
      <BackupLog log={log.filter(e => e.type === 'csv_export')} onRefresh={onRefreshLog} />
    </div>
  );
}

// ── Backup log table ───────────────────────────────────────────────────────────
function BackupLog({ log, onRefresh }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
          <Clock size={14} className="text-gray-500"/> Recent Activity
        </h3>
        <button onClick={onRefresh} className="p-1.5 text-gray-400 hover:text-gray-600 rounded"><RefreshCw size={13}/></button>
      </div>
      {log.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No backup history yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-1.5 px-2 font-semibold text-gray-500">Timestamp</th>
                <th className="text-left py-1.5 px-2 font-semibold text-gray-500">Status</th>
                <th className="text-left py-1.5 px-2 font-semibold text-gray-500">Details</th>
                <th className="text-left py-1.5 px-2 font-semibold text-gray-500">Triggered By</th>
              </tr>
            </thead>
            <tbody>
              {log.slice(0, 10).map((e, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap">
                    {new Date(e.timestamp).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                  </td>
                  <td className="py-1.5 px-2"><StatusBadge status={e.status}/></td>
                  <td className="py-1.5 px-2 text-gray-600">
                    {e.filename || e.details || (e.error && <span className="text-red-500">{e.error.slice(0,60)}</span>) || '—'}
                    {e.size_mb && <span className="ml-2 text-gray-400">({e.size_mb} MB)</span>}
                  </td>
                  <td className="py-1.5 px-2 text-gray-500">{e.triggered_by || 'scheduled'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Cron expression helper ─────────────────────────────────────────────────────
// ── Main page ──────────────────────────────────────────────────────────────────
export default function BackupPage() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('pg');
  const [schedule, setSchedule]   = useState({
    pg_enabled: false, pg_frequency: 'daily', pg_time: '02:00', pg_retain_days: 7,
    pg_backup_path: '/backups/postgres', pg_overwrite: false,
    csv_enabled: false, csv_frequency: 'daily', csv_time: '03:00', csv_retain_days: 7,
    csv_include_assets: true, csv_include_ext: true, csv_include_beijing: true,
    csv_backup_path: '/backups/csv', csv_overwrite: false,
  });
  const [log, setLog]             = useState([]);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [sR, lR] = await Promise.all([backupAPI.getSchedule(), backupAPI.getLog()]);
      setSchedule(s => ({ ...s, ...sR.data }));
      setLog(lR.data);
    } catch {}
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleScheduleChange = (key, val) => setSchedule(s => ({ ...s, [key]: val }));

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      await backupAPI.saveSchedule(schedule);
      toast.success('Schedule settings saved');
    } catch { toast.error('Save failed'); }
    finally { setSavingSchedule(false); }
  };

  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <Shield size={40} className="text-gray-300 mb-3"/>
      <p className="text-gray-500">Admin access required</p>
    </div>
  );

  const TABS = [
    { key: 'pg',  label: 'PostgreSQL Backup', icon: Database },
    { key: 'csv', label: 'CSV Export',         icon: FileText },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-blue-800 rounded-xl flex items-center justify-center">
          <Database size={18} className="text-white"/>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Backup & Export</h1>
          <p className="text-sm text-gray-500 mt-0.5">Database backup and scheduled data exports</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key ? 'bg-white text-blue-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={15}/>{label}
          </button>
        ))}
      </div>

      {activeTab === 'pg' && (
        <PgBackupTab
          schedule={schedule}
          onScheduleChange={handleScheduleChange}
          onSaveSchedule={handleSaveSchedule}
          savingSchedule={savingSchedule}
          log={log}
          onRefreshLog={fetchAll}
        />
      )}
      {activeTab === 'csv' && (
        <CsvExportTab
          schedule={schedule}
          onScheduleChange={handleScheduleChange}
          onSaveSchedule={handleSaveSchedule}
          savingSchedule={savingSchedule}
          log={log}
          onRefreshLog={fetchAll}
        />
      )}
    </div>
  );
}


