import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { vmwareAPI } from '../services/api';
import { settingsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp,
  Clock3, Download, DownloadCloud, Plus, RefreshCw, Save, Server, Trash2, Upload, Wifi,
} from 'lucide-react';

const INIT_SOURCE = {
  name: '',
  source_type: 'vcenter',
  host: '',
  username: '',
  password: '',
  ignore_ssl: true,
  is_active: true,
};

const CANDIDATE_COLUMNS = [
  { key: 'source_name', label: 'Source', defaultVisible: true },
  { key: 'source_host', label: 'Host', defaultVisible: true },
  { key: 'source_type', label: 'Type', defaultVisible: false },
  { key: 'vm_name', label: 'VM Name', defaultVisible: true },
  { key: 'os_hostname', label: 'Hostname', defaultVisible: true },
  { key: 'ip_address', label: 'IP', defaultVisible: true },
  { key: 'mac_address', label: 'MAC', defaultVisible: true },
  { key: 'power_state', label: 'Power', defaultVisible: true },
  { key: 'guest_os', label: 'Guest OS', defaultVisible: true },
  { key: 'cpu_count', label: 'vCPU', defaultVisible: false },
  { key: 'memory_size_mb', label: 'Memory (MB)', defaultVisible: false },
  { key: 'vm_id', label: 'VM ID', defaultVisible: false },
  { key: 'reason', label: 'Reason', defaultVisible: true },
];

// ── Small helper: collapsible test-result steps ──────────────────────────────
function TestResultBadge({ result, onClear }) {
  const [open, setOpen] = useState(false);
  if (!result) return null;
  const Icon = result.ok ? CheckCircle2 : AlertCircle;
  const color = result.ok ? 'green' : 'red';
  return (
    <div className={`rounded-lg border border-${color}-200 bg-${color}-50 px-3 py-2 text-sm`}>
      <div className="flex items-start gap-2">
        <Icon size={16} className={`text-${color}-600 mt-0.5 shrink-0`} />
        <div className="flex-1">
          <p className={`font-medium text-${color}-800`}>{result.message}</p>
          {result.ok && (
            <p className="text-xs text-green-700 mt-0.5">
              Method: {result.method} &nbsp;·&nbsp; VMs visible: {result.vm_count}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {Array.isArray(result.steps) && result.steps.length > 0 && (
            <button
              className="text-xs text-gray-500 underline flex items-center gap-0.5"
              onClick={() => setOpen((p) => !p)}
            >
              Details {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
          <button className="text-xs text-gray-400 hover:text-gray-600" onClick={onClear}>✕</button>
        </div>
      </div>
      {open && Array.isArray(result.steps) && (
        <ul className="mt-2 space-y-1 pl-6">
          {result.steps.map((s, i) => (
            <li key={i} className="text-xs flex items-center gap-1.5">
              {s.status === 'ok'
                ? <CheckCircle2 size={11} className="text-green-600 shrink-0" />
                : <AlertCircle size={11} className="text-red-500 shrink-0" />}
              <span className="font-medium">{s.step}:</span>
              <span className="text-gray-600">{s.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function NewAssetImportPage() {
  const { isAdmin } = useAuth();
  const [sources, setSources] = useState([]);
  const [schedule, setSchedule] = useState({ enabled: false, interval_minutes: 60 });
  const [candidates, setCandidates] = useState([]);
  const [sourceForm, setSourceForm] = useState(INIT_SOURCE);
  const [selected, setSelected] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingSource, setSavingSource] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanningSourceId, setScanningSourceId] = useState(null);
  const [scanningAll, setScanningAll] = useState(false);
  const [importing, setImporting] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [candidateColumns, setCandidateColumns] = useState(
    CANDIDATE_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, sch, c, vmCfg] = await Promise.all([
        vmwareAPI.getSources(),
        vmwareAPI.getSchedule(),
        vmwareAPI.getCandidates('new'),
        settingsAPI.getColumnConfig('vmware').catch(() => ({ data: [] })),
      ]);
      setSources(Array.isArray(s.data) ? s.data : []);
      setSchedule(sch.data || { enabled: false, interval_minutes: 60 });
      const rows = Array.isArray(c.data) ? c.data : [];
      const cfg = Array.isArray(vmCfg?.data) ? vmCfg.data : [];
      const visibleCfg = Array.isArray(cfg) && cfg.length
        ? cfg.filter((x) => x?.visible !== false).map((x) => x.key).filter(Boolean)
        : CANDIDATE_COLUMNS.filter((x) => x.defaultVisible).map((x) => x.key);
      setCandidateColumns(visibleCfg);
      setCandidates(rows);
      const defaults = {};
      rows.forEach((_, idx) => { defaults[idx] = false; });
      setSelected(defaults);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load New Asset Import data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) loadAll(); }, [isAdmin, loadAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((r) =>
      [r.vm_name, r.os_hostname, r.ip_address, r.mac_address, r.source_name, r.power_state, r.guest_os]
        .map((x) => String(x || '').toLowerCase())
        .some((x) => x.includes(q))
    );
  }, [candidates, search]);

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const setSourceField = (k, v) => {
    setSourceForm((p) => ({ ...p, [k]: v }));
    // Clear test result when form changes
    if (['host', 'username', 'password', 'ignore_ssl', 'source_type'].includes(k)) {
      setTestResult(null);
    }
  };

  // ── Test Connection ────────────────────────────────────────────────────────
  const testConnection = async () => {
    if (!sourceForm.host || !sourceForm.username || !sourceForm.password) {
      toast.error('Fill in host, username and password before testing');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const r = await vmwareAPI.testConnection({
        host: sourceForm.host,
        username: sourceForm.username,
        password: sourceForm.password,
        source_type: sourceForm.source_type,
        ignore_ssl: sourceForm.ignore_ssl,
      });
      setTestResult(r.data);
    } catch (err) {
      const d = err.response?.data;
      setTestResult(d && typeof d === 'object'
        ? d
        : { ok: false, message: err.response?.data?.error || err.message || 'Test failed', steps: [] }
      );
    } finally {
      setTesting(false);
    }
  };

  const addSource = async () => {
    if (!sourceForm.name || !sourceForm.host || !sourceForm.username || !sourceForm.password) {
      toast.error('Source name, host, username and password are required');
      return;
    }
    setSavingSource(true);
    try {
      await vmwareAPI.createSource(sourceForm);
      toast.success('Source added');
      setSourceForm(INIT_SOURCE);
      setTestResult(null);
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add source');
    } finally {
      setSavingSource(false);
    }
  };

  const removeSource = async (id) => {
    if (!confirm('Delete this source?')) return;
    try {
      await vmwareAPI.deleteSource(id);
      toast.success('Source deleted');
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const toggleSource = async (src) => {
    try {
      await vmwareAPI.updateSource(src.id, { ...src, is_active: !src.is_active });
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    }
  };

  const saveSchedule = async () => {
    setSavingSchedule(true);
    try {
      await vmwareAPI.saveSchedule(schedule);
      toast.success('Scheduler settings saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save scheduler');
    } finally {
      setSavingSchedule(false);
    }
  };

  const runScan = async (sourceId = null) => {
    setScanningSourceId(sourceId === null ? null : sourceId);
    setScanningAll(sourceId === null);
    setScanning(true);
    try {
      const r = await vmwareAPI.scan(sourceId);
      const runs = r.data?.runs || [];
      const success = runs.filter((x) => x.status === 'success').length;
      const failedRuns = runs.filter((x) => x.status === 'failed');
      const failed = failedRuns.length;
      if (failed > 0) {
        const first = failedRuns[0];
        const msg = first?.error || 'Unknown scan error';
        toast.error(`Scan completed with failures. Success: ${success}, Failed: ${failed}. ${msg}`);
      } else {
        toast.success(`Scan completed. Success: ${success}, Failed: ${failed}`);
      }
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Scan failed');
    } finally {
      setScanning(false);
      setScanningSourceId(null);
      setScanningAll(false);
    }
  };

  const importSelected = async () => {
    const ids = candidates
      .map((r, idx) => (selected[idx] ? r.id : null))
      .filter(Boolean);
    if (!ids.length) {
      toast.error('Select at least one VM');
      return;
    }
    setImporting(true);
    try {
      const r = await vmwareAPI.importToExt(ids);
      const d = r.data || {};
      toast.success(`Imported: ${d.success || 0}, Skipped: ${d.skipped || 0}, Failed: ${d.failed || 0}`);
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const downloadCsvTemplate = async () => {
    try {
      const r = await vmwareAPI.downloadCsvTemplate();
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vmware_vm_import_template.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Template download failed');
    }
  };

  const uploadCsvCandidates = async () => {
    if (!csvFile) { toast.error('Select a CSV file'); return; }
    setCsvImporting(true);
    try {
      const r = await vmwareAPI.importCsvCandidates(csvFile);
      const d = r.data || {};
      toast.success(`CSV processed. New: ${d.new_count || 0}, Exists: ${d.exists_count || 0}, Invalid: ${d.invalid || 0}`);
      setCsvFile(null);
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'CSV import failed');
    } finally {
      setCsvImporting(false);
    }
  };

  const toggleAllFiltered = (checked) => {
    const next = { ...selected };
    filtered.forEach((row) => {
      const idx = candidates.indexOf(row);
      next[idx] = checked;
    });
    setSelected(next);
  };

  if (!isAdmin) {
    return <div className="card text-sm text-amber-700 bg-amber-50 border border-amber-200">Admin access required.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
          <DownloadCloud size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">New Asset Import</h1>
          <p className="text-sm text-gray-500">
            Scan vCenter/ESXi using read-only accounts, detect VMs with new IPs, and transfer selected VMs to Ext. Asset Inventory.
          </p>
        </div>
      </div>

      {/* ── Source Accounts ─────────────────────────────────────────────────── */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Server size={16} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">Source Accounts</h2>
        </div>

        {/* Credentials hint */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800 space-y-0.5">
          <p><strong>vCenter:</strong> Use <code>user@vsphere.local</code> or <code>DOMAIN\user</code> with at minimum <em>Read-Only</em> role on the datacenter.</p>
          <p><strong>Standalone ESXi:</strong> Use <code>root</code> (or any account with Host &gt; Config &gt; System Management privilege). SOAP/SDK is used as fallback if REST is unavailable.</p>
          <p><strong>SSL:</strong> Enable "Ignore SSL cert errors" for self-signed certificates (common in lab/internal environments).</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input className="input-field" placeholder="Source Name (e.g. VC-Prod)" value={sourceForm.name} onChange={(e) => setSourceField('name', e.target.value)} />
          <select className="input-field" value={sourceForm.source_type} onChange={(e) => setSourceField('source_type', e.target.value)}>
            <option value="vcenter">vCenter (read-only)</option>
            <option value="esxi">Standalone ESXi (root)</option>
          </select>
          <input className="input-field" placeholder="Host (vcenter.local or 10.0.0.10)" value={sourceForm.host} onChange={(e) => setSourceField('host', e.target.value)} />
          <input className="input-field" placeholder={sourceForm.source_type === 'vcenter' ? 'Username (user@vsphere.local)' : 'Username (root)'} value={sourceForm.username} onChange={(e) => setSourceField('username', e.target.value)} />
          <input className="input-field" type="password" placeholder="Password" value={sourceForm.password} onChange={(e) => setSourceField('password', e.target.value)} />
          <div className="flex flex-col gap-2 px-2 justify-center">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={sourceForm.ignore_ssl} onChange={(e) => setSourceField('ignore_ssl', e.target.checked)} />
              Ignore SSL cert errors
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={sourceForm.is_active} onChange={(e) => setSourceField('is_active', e.target.checked)} />
              Active for scheduler
            </label>
          </div>

          {/* Test result inline */}
          {testResult && (
            <div className="md:col-span-3">
              <TestResultBadge result={testResult} onClear={() => setTestResult(null)} />
            </div>
          )}

          <div className="md:col-span-3 flex items-center gap-2">
            <button type="button" className="btn-secondary flex items-center gap-1.5" onClick={testConnection} disabled={testing}>
              <Wifi size={14} className={testing ? 'animate-pulse' : ''} />
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
            <button type="button" className="btn-primary flex items-center gap-1.5" disabled={savingSource} onClick={addSource}>
              <Plus size={14} /> {savingSource ? 'Adding…' : 'Add Source'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Host</th>
                <th className="px-3 py-2 text-left">Username</th>
                <th className="px-3 py-2 text-left">Last Scan</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">Loading…</td></tr>
              ) : sources.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No sources configured</td></tr>
              ) : sources.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2">{s.source_type}</td>
                  <td className="px-3 py-2">{s.host}</td>
                  <td className="px-3 py-2">{s.username}</td>
                  <td className="px-3 py-2">{s.last_scan_at ? new Date(s.last_scan_at).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${s.last_scan_status === 'success' ? 'bg-green-100 text-green-700' : s.last_scan_status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}
                      title={s.last_error || ''}
                    >
                      {s.last_scan_status}
                    </span>
                    {s.last_scan_status === 'failed' && s.last_error ? (
                      <div className="text-[11px] text-red-600 mt-1 max-w-[260px] truncate" title={s.last_error}>
                        {s.last_error}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        className="btn-secondary text-xs"
                        onClick={() => runScan(s.id)}
                        disabled={scanning}
                      >
                        <RefreshCw size={12} className={scanning && scanningSourceId === s.id ? 'animate-spin' : ''} /> Scan
                      </button>
                      <button className="btn-secondary text-xs" onClick={() => toggleSource(s)}>
                        {s.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="p-1.5 text-red-600 hover:bg-red-50 rounded" onClick={() => removeSource(s.id)} title="Delete Source">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Scheduler ───────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Clock3 size={16} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">Scheduler</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={schedule.enabled} onChange={(e) => setSchedule((p) => ({ ...p, enabled: e.target.checked }))} />
            Enable automatic scan
          </label>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Interval (minutes)</label>
            <input type="number" min={5} className="input-field" value={schedule.interval_minutes} onChange={(e) => setSchedule((p) => ({ ...p, interval_minutes: parseInt(e.target.value, 10) || 60 }))} />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={saveSchedule} disabled={savingSchedule}>
              <Save size={13} /> {savingSchedule ? 'Saving…' : 'Save Scheduler'}
            </button>
            <button className="btn-secondary" onClick={() => runScan(null)} disabled={scanning}>
              <RefreshCw size={13} className={scanning && scanningAll ? 'animate-spin' : ''} /> Scan All Now
            </button>
          </div>
        </div>
      </div>

      {/* ── VM Candidates ───────────────────────────────────────────────────── */}
      <div className="card space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">New VM Candidates (IP not found in inventory)</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{candidates.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <input className="input-field text-sm py-1.5" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn-secondary text-sm" onClick={downloadCsvTemplate}>
              <Download size={13} /> Template
            </button>
            <label className="btn-secondary text-sm cursor-pointer">
              <Upload size={13} /> {csvFile ? `${csvFile.name.slice(0, 14)}...` : 'Select CSV'}
              <input type="file" accept=".csv" className="hidden" onChange={(e) => setCsvFile(e.target.files?.[0] || null)} />
            </label>
            {csvFile ? (
              <button className="btn-secondary text-sm" onClick={uploadCsvCandidates} disabled={csvImporting}>
                {csvImporting ? 'Uploading...' : 'Upload CSV'}
              </button>
            ) : null}
            <button className="btn-success text-sm" onClick={importSelected} disabled={importing || selectedCount === 0}>
              {importing ? 'Transferring…' : `Transfer to Ext. Inventory (${selectedCount})`}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left w-10">
                  <input type="checkbox"
                    checked={filtered.length > 0 && filtered.every((row) => selected[candidates.indexOf(row)])}
                    onChange={(e) => toggleAllFiltered(e.target.checked)}
                  />
                </th>
                {candidateColumns.includes('source_name') && <th className="px-3 py-2 text-left">Source</th>}
                {candidateColumns.includes('source_host') && <th className="px-3 py-2 text-left">Host</th>}
                {candidateColumns.includes('source_type') && <th className="px-3 py-2 text-left">Type</th>}
                {candidateColumns.includes('vm_name') && <th className="px-3 py-2 text-left">VM Name</th>}
                {candidateColumns.includes('os_hostname') && <th className="px-3 py-2 text-left">Hostname</th>}
                {candidateColumns.includes('ip_address') && <th className="px-3 py-2 text-left">IP</th>}
                {candidateColumns.includes('mac_address') && <th className="px-3 py-2 text-left">MAC</th>}
                {candidateColumns.includes('power_state') && <th className="px-3 py-2 text-left">Power</th>}
                {candidateColumns.includes('guest_os') && <th className="px-3 py-2 text-left">Guest OS</th>}
                {candidateColumns.includes('cpu_count') && <th className="px-3 py-2 text-left">vCPU</th>}
                {candidateColumns.includes('memory_size_mb') && <th className="px-3 py-2 text-left">Memory (MB)</th>}
                {candidateColumns.includes('vm_id') && <th className="px-3 py-2 text-left">VM ID</th>}
                {candidateColumns.includes('reason') && <th className="px-3 py-2 text-left">Reason</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={14} className="px-3 py-8 text-center text-gray-400">No new VM candidates. Add a source and run a scan.</td></tr>
              ) : filtered.map((r) => {
                const idx = candidates.indexOf(r);
                return (
                  <tr key={r.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={!!selected[idx]} onChange={(e) => setSelected((p) => ({ ...p, [idx]: e.target.checked }))} />
                    </td>
                    {candidateColumns.includes('source_name') && <td className="px-3 py-2">{r.source_name || '—'}</td>}
                    {candidateColumns.includes('source_host') && <td className="px-3 py-2">{r.source_host || '—'}</td>}
                    {candidateColumns.includes('source_type') && <td className="px-3 py-2">{r.source_type || '—'}</td>}
                    {candidateColumns.includes('vm_name') && <td className="px-3 py-2 font-medium">{r.vm_name || '—'}</td>}
                    {candidateColumns.includes('os_hostname') && <td className="px-3 py-2">{r.os_hostname || '—'}</td>}
                    {candidateColumns.includes('ip_address') && <td className="px-3 py-2 font-mono text-xs text-blue-700">{r.ip_address || '—'}</td>}
                    {candidateColumns.includes('mac_address') && <td className="px-3 py-2 font-mono text-xs text-gray-700">{r.mac_address || '—'}</td>}
                    {candidateColumns.includes('power_state') && (
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          String(r.power_state).toUpperCase().includes('ON')
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {r.power_state || '—'}
                        </span>
                      </td>
                    )}
                    {candidateColumns.includes('guest_os') && <td className="px-3 py-2">{r.guest_os || '—'}</td>}
                    {candidateColumns.includes('cpu_count') && <td className="px-3 py-2">{r.cpu_count ?? '—'}</td>}
                    {candidateColumns.includes('memory_size_mb') && <td className="px-3 py-2">{r.memory_size_mb ?? '—'}</td>}
                    {candidateColumns.includes('vm_id') && <td className="px-3 py-2">{r.vm_id || '—'}</td>}
                    {candidateColumns.includes('reason') && <td className="px-3 py-2 text-gray-500">{r.reason || '—'}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

