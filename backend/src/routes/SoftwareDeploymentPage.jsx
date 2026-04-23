import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { deploymentAPI } from '../services/api';
import {
  RefreshCw, Play, CheckCircle2, Save, Upload, Download, Trash2, Package,
} from 'lucide-react';

const CONFIG_KEY = 'software_deploy_config_v1';

const DEFAULT_SETTINGS = {
  windows_installer_path: '',
  windows_silent_args: '/silent',
  windows_remote_directory: 'C:\\Windows\\Temp',
  windows_mode: 'Auto',
  windows_primary_port: 5985,
  psexec_path: '',
  linux_installer_path: '',
  linux_config_path: '',
  linux_preset: 'BIN only',
  linux_custom_command: 'sudo -S {bin} {args}',
  linux_extra_args: '',
  linux_primary_port: 22,
};

const OS_FILTERS = ['All', 'Windows', 'Linux', 'Unknown'];

const toInt = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

const ts = () => new Date().toLocaleString();

export default function SoftwareDeploymentPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [osFilter, setOsFilter] = useState('All');
  const [onlyWithCreds, setOnlyWithCreds] = useState(true);
  const [skipIfInstalled, setSkipIfInstalled] = useState(true);
  const [endpoints, setEndpoints] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [logs, setLogs] = useState([]);
  const fileRef = useRef(null);

  const appendLog = (line) => setLogs((prev) => [...prev.slice(-400), `[${ts()}] ${line}`]);

  const loadEndpoints = useCallback(async () => {
    setLoading(true);
    try {
      const r = await deploymentAPI.getEndpoints({
        search,
        os: osFilter,
        only_with_credentials: onlyWithCreds,
      });
      setEndpoints(Array.isArray(r.data?.endpoints) ? r.data.endpoints : []);
    } catch {
      toast.error('Failed to load deployment endpoints');
    } finally {
      setLoading(false);
    }
  }, [search, osFilter, onlyWithCreds]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONFIG_KEY);
      if (saved) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
    } catch {}
  }, []);

  useEffect(() => { loadEndpoints(); }, [loadEndpoints]);

  const setField = (k, v) => setSettings((prev) => ({ ...prev, [k]: v }));

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const selectedCount = selected.size;
  const allVisibleSelected = endpoints.length > 0 && endpoints.every((e) => selected.has(e.id));

  const progress = useMemo(() => {
    if (!endpoints.length) return 0;
    const done = endpoints.filter((e) => e.status !== 'Idle').length;
    return Math.round((done / endpoints.length) * 100);
  }, [endpoints]);

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        endpoints.forEach((e) => next.delete(e.id));
        return next;
      });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      endpoints.forEach((e) => next.add(e.id));
      return next;
    });
  };

  const saveConfig = () => {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(settings));
      toast.success('Deployment config saved locally');
      appendLog('Config saved to browser storage.');
    } catch {
      toast.error('Could not save config');
    }
  };

  const loadConfig = () => {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) {
        toast.error('No saved config found');
        return;
      }
      setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
      toast.success('Config loaded');
      appendLog('Config loaded from browser storage.');
    } catch {
      toast.error('Could not load config');
    }
  };

  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `deployment-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(href);
  };

  const importConfig = async (evt) => {
    const file = evt.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setSettings({ ...DEFAULT_SETTINGS, ...(parsed || {}) });
      toast.success('Config imported');
      appendLog(`Config imported from ${file.name}.`);
    } catch {
      toast.error('Invalid config file');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const runTest = async (ids) => {
    if (!ids.length) {
      toast.error('Select endpoints first');
      return;
    }
    setBusy(true);
    appendLog(`Running connectivity test for ${ids.length} endpoint(s).`);
    try {
      const r = await deploymentAPI.test({ endpoint_ids: ids, settings });
      const rows = Array.isArray(r.data?.results) ? r.data.results : [];
      appendLog(`Connectivity test completed. ${rows.length} endpoint(s) checked.`);
      rows.forEach((row) => appendLog(`${row.host || row.name} -> ${row.status}: ${row.message}`));
      await loadEndpoints();
      toast.success('Test completed');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Test failed');
      appendLog(`Test failed: ${e.response?.data?.error || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const runDeploy = async (ids) => {
    if (!ids.length) {
      toast.error('Select endpoints first');
      return;
    }
    setBusy(true);
    appendLog(`Starting deployment readiness run for ${ids.length} endpoint(s).`);
    try {
      const payload = {
        endpoint_ids: ids,
        settings: {
          ...settings,
          windows_primary_port: toInt(settings.windows_primary_port, 5985),
          linux_primary_port: toInt(settings.linux_primary_port, 22),
        },
        skip_if_installed: !!skipIfInstalled,
      };
      const r = await deploymentAPI.deploy(payload);
      const summary = r.data?.summary || {};
      const lines = Array.isArray(r.data?.log) ? r.data.log : [];
      lines.forEach((line) => setLogs((prev) => [...prev.slice(-400), line]));
      await loadEndpoints();
      toast.success(`Ready: ${summary.ready || 0}, Blocked: ${summary.blocked || 0}`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Deployment run failed');
      appendLog(`Deployment failed: ${e.response?.data?.error || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Package size={20} className="text-blue-700" />Software Deployment</h1>
        <p className="text-sm text-gray-500 mt-0.5">Deploy software to Windows and Linux VMs using credentials already stored in inventory.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card space-y-4 xl:col-span-1">
          <p className="font-semibold text-gray-800">Actions</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-primary text-xs" onClick={() => runDeploy(selectedIds)} disabled={busy || !selectedCount}>
              <Play size={13} /> Deploy Selected
            </button>
            <button type="button" className="btn-secondary text-xs" onClick={() => runDeploy(endpoints.map((e) => e.id))} disabled={busy || !endpoints.length}>
              <Play size={13} /> Deploy All
            </button>
            <button type="button" className="btn-secondary text-xs" onClick={() => runTest(selectedIds)} disabled={busy || !selectedCount}>
              <CheckCircle2 size={13} /> Test Selected
            </button>
            <button type="button" className="btn-secondary text-xs" onClick={() => runTest(endpoints.map((e) => e.id))} disabled={busy || !endpoints.length}>
              <CheckCircle2 size={13} /> Test All
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={skipIfInstalled} onChange={(e) => setSkipIfInstalled(e.target.checked)} />
            Skip if agent already installed
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary text-xs" onClick={saveConfig}><Save size={13} /> Save Config</button>
            <button type="button" className="btn-secondary text-xs" onClick={loadConfig}><Upload size={13} /> Load Config</button>
            <button type="button" className="btn-secondary text-xs" onClick={exportConfig}><Download size={13} /> Export Config</button>
            <button type="button" className="btn-secondary text-xs" onClick={() => fileRef.current?.click()}><Upload size={13} /> Import Config</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importConfig} />

          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase">Progress</p>
            <div className="w-full h-3 rounded bg-gray-100 overflow-hidden">
              <div className="h-3 bg-green-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-500">{progress}% endpoint status coverage</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase">Deployment Log</p>
              <button type="button" className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1" onClick={() => setLogs([])}>
                <Trash2 size={12} /> Clear
              </button>
            </div>
            <div className="h-44 rounded border border-gray-200 bg-gray-50 p-2 overflow-auto font-mono text-[11px] text-gray-700 whitespace-pre-wrap">
              {logs.length ? logs.join('\n') : 'No log entries yet.'}
            </div>
          </div>
        </div>

        <div className="card space-y-4 xl:col-span-2">
          <p className="font-semibold text-gray-800">Endpoints</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input className="input-field text-sm md:col-span-2" placeholder="Search by name, host, OS, username" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="input-field text-sm" value={osFilter} onChange={(e) => setOsFilter(e.target.value)}>
              {OS_FILTERS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <button type="button" className="btn-secondary text-xs" onClick={loadEndpoints} disabled={loading || busy}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={onlyWithCreds} onChange={(e) => setOnlyWithCreds(e.target.checked)} />
            Show only endpoints with stored credentials
          </label>

          <div className="border border-gray-200 rounded overflow-auto max-h-[360px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="table-th w-10">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                  </th>
                  <th className="table-th">Name</th>
                  <th className="table-th">Host / IP</th>
                  <th className="table-th">OS</th>
                  <th className="table-th">Username</th>
                  <th className="table-th">Primary Port</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td className="table-td text-gray-400 text-center" colSpan={7}>Loading endpoints...</td></tr>
                ) : endpoints.length === 0 ? (
                  <tr><td className="table-td text-gray-400 text-center" colSpan={7}>No VM endpoints found for current filters</td></tr>
                ) : endpoints.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="table-td">
                      <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleRow(e.id)} />
                    </td>
                    <td className="table-td font-medium text-gray-700">{e.name}</td>
                    <td className="table-td font-mono text-xs">{e.host || '-'}</td>
                    <td className="table-td">{e.os_family}</td>
                    <td className="table-td">{e.username || '-'}</td>
                    <td className="table-td">{e.os_family === 'Windows' ? settings.windows_primary_port : settings.linux_primary_port}</td>
                    <td className="table-td">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        e.status === 'Ready' || e.status === 'Connection Passed'
                          ? 'bg-green-100 text-green-700'
                          : e.status === 'Blocked' || e.status === 'Connection Failed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-700'
                      }`}>
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">{selectedCount} selected / {endpoints.length} visible endpoint(s)</p>
        </div>
      </div>

      <div className="card space-y-4">
        <p className="font-semibold text-gray-800">Installer Settings</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Windows installer (.exe)</p>
            <input className="input-field text-sm" value={settings.windows_installer_path} onChange={(e) => setField('windows_installer_path', e.target.value)} placeholder="C:\\Path\\AgentSetup.exe" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Windows primary port</p>
            <input className="input-field text-sm" type="number" value={settings.windows_primary_port} onChange={(e) => setField('windows_primary_port', e.target.value)} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Windows silent args</p>
            <input className="input-field text-sm" value={settings.windows_silent_args} onChange={(e) => setField('windows_silent_args', e.target.value)} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Windows remote directory</p>
            <input className="input-field text-sm" value={settings.windows_remote_directory} onChange={(e) => setField('windows_remote_directory', e.target.value)} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Windows mode</p>
            <select className="input-field text-sm" value={settings.windows_mode} onChange={(e) => setField('windows_mode', e.target.value)}>
              <option value="Auto">Auto</option>
              <option value="WinRM">WinRM</option>
              <option value="PsExec">PsExec</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">PsExec path</p>
            <input className="input-field text-sm" value={settings.psexec_path} onChange={(e) => setField('psexec_path', e.target.value)} placeholder="C:\\Path\\PsExec.exe" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Linux installer (.bin)</p>
            <input className="input-field text-sm" value={settings.linux_installer_path} onChange={(e) => setField('linux_installer_path', e.target.value)} placeholder="/opt/installer/agent.bin" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Linux config (json)</p>
            <input className="input-field text-sm" value={settings.linux_config_path} onChange={(e) => setField('linux_config_path', e.target.value)} placeholder="/opt/installer/serverinfo.json" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Linux preset</p>
            <input className="input-field text-sm" value={settings.linux_preset} onChange={(e) => setField('linux_preset', e.target.value)} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Linux custom command</p>
            <input className="input-field text-sm" value={settings.linux_custom_command} onChange={(e) => setField('linux_custom_command', e.target.value)} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Linux extra args</p>
            <input className="input-field text-sm" value={settings.linux_extra_args} onChange={(e) => setField('linux_extra_args', e.target.value)} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Linux primary port</p>
            <input className="input-field text-sm" type="number" value={settings.linux_primary_port} onChange={(e) => setField('linux_primary_port', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
        This page currently performs deployment readiness and connectivity validation using stored credentials metadata.
        Executing remote installers can be added as the next step with environment-specific WinRM/SSH runners.
      </div>
    </div>
  );
}