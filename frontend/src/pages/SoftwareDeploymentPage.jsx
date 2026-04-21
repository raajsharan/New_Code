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
  windows_transport_protocol: 'Auto',
  windows_primary_port: 5985,
  windows_winrm_port: 5985,
  windows_psexec_smb_port: 445,
  windows_wmi_port: 135,
  psexec_path: '',
  linux_installer_path: '',
  linux_config_path: '',
  linux_preset: 'BIN only',
  linux_custom_command: 'sudo -S {bin} {config} {args}',
  linux_extra_args: '',
  linux_manageengine_install_enabled: true,
  linux_nessus_install_enabled: false,
  linux_nessus_curl_command: '',
  linux_primary_port: 22,
  linux_me_installed_file_path: '/usr/local/manageengine/uems_agent/bin/dcservice.service',
  linux_me_service_name: 'dcservice.service',
  linux_me_verify_mode: 'both',
  linux_nessus_installed_file_path: '/opt/nessus_agent/sbin/nessus-service',
  linux_nessus_service_name: 'nessusagent',
  linux_nessus_verify_mode: 'both',
};

const OS_FILTERS = ['All', 'Windows', 'Linux', 'Unknown'];
const PAGE_TABS = [
  { key: 'deploy', label: 'Deployment' },
  { key: 'verification', label: 'Installation Verification' },
];

const toInt = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

const ts = () => new Date().toLocaleString();

export default function SoftwareDeploymentPage() {
  const [activeTab, setActiveTab] = useState('deploy');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [osFilter, setOsFilter] = useState('All');
  const [onlyWithCreds, setOnlyWithCreds] = useState(true);
  const [skipIfInstalled, setSkipIfInstalled] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [endpoints, setEndpoints] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [logs, setLogs] = useState([]);
  const [verificationRows, setVerificationRows] = useState([]);
  const fileRef = useRef(null);
  const windowsProtocol = settings.windows_transport_protocol || settings.windows_mode || 'Auto';

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
      setHasLoaded(true);
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
    appendLog(`Starting deployment run for ${ids.length} endpoint(s).`);
    try {
      const payload = {
        endpoint_ids: ids,
        settings: {
          ...settings,
          windows_transport_protocol: windowsProtocol,
          windows_primary_port: toInt(settings.windows_primary_port, 5985),
          windows_winrm_port: toInt(settings.windows_winrm_port, 5985),
          windows_psexec_smb_port: toInt(settings.windows_psexec_smb_port, 445),
          windows_wmi_port: toInt(settings.windows_wmi_port, 135),
          linux_primary_port: toInt(settings.linux_primary_port, 22),
        },
        skip_if_installed: !!skipIfInstalled,
      };
      const r = await deploymentAPI.deploy(payload);
      const summary = r.data?.summary || {};
      const lines = Array.isArray(r.data?.log) ? r.data.log : [];
      lines.forEach((line) => setLogs((prev) => [...prev.slice(-400), line]));
      await loadEndpoints();
      toast.success(`Deployed: ${summary.deployed || 0}, Failed: ${summary.failed || 0}, Blocked: ${summary.blocked || 0}`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Deployment run failed');
      appendLog(`Deployment failed: ${e.response?.data?.error || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const runVerifyInstallation = async (ids) => {
    if (!ids.length) {
      toast.error('Select endpoints first');
      return;
    }
    setVerifyBusy(true);
    appendLog(`Running installation verification for ${ids.length} endpoint(s).`);
    try {
      const payload = {
        endpoint_ids: ids,
        settings: {
          ...settings,
          linux_primary_port: toInt(settings.linux_primary_port, 22),
        },
      };
      const r = await deploymentAPI.verifyInstallation(payload);
      const rows = Array.isArray(r.data?.results) ? r.data.results : [];
      const summary = r.data?.summary || {};
      setVerificationRows(rows);
      rows.forEach((row) => appendLog(`[VERIFY] ${row.host || row.name} -> ${row.status}: ${row.message}`));
      await loadEndpoints();
      toast.success(`Verified: ${summary.verified || 0}, Failed: ${summary.failed || 0}, Blocked: ${summary.blocked || 0}`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Installation verification failed');
      appendLog(`Installation verification failed: ${e.response?.data?.error || 'Unknown error'}`);
    } finally {
      setVerifyBusy(false);
    }
  };

  const glassCard = 'rounded-2xl border border-slate-200/90 bg-white/85 shadow-sm backdrop-blur-sm';

  return (
    <div className="space-y-5 rounded-[28px] border border-slate-200 bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 p-4 sm:p-5">
      <div className={`${glassCard} p-5`}>
        <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500 font-semibold">Workspace</p>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2 mt-1"><Package size={20} className="text-blue-700" />Software Deployment</h1>
        <p className="text-sm text-gray-500 mt-1">Deploy software to Windows and Linux VMs using credentials already stored in inventory.</p>
      </div>

      <div className="inline-flex flex-wrap gap-1 bg-white/80 border border-slate-200 p-1 rounded-xl shadow-sm">
        {PAGE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === tab.key ? 'bg-slate-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'deploy' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className={`${glassCard} p-4 space-y-4 xl:col-span-1`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Operations</p>
            <p className="font-semibold text-gray-800 -mt-2">Actions</p>
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

          <div className={`${glassCard} p-4 space-y-4 xl:col-span-2`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Targets</p>
            <p className="font-semibold text-gray-800 -mt-2">Endpoints</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input
                className="input-field text-sm md:col-span-2"
                placeholder="Search by name, host, OS, username"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') loadEndpoints(); }}
              />
              <select className="input-field text-sm" value={osFilter} onChange={(e) => setOsFilter(e.target.value)}>
                {OS_FILTERS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <button type="button" className="btn-secondary text-xs" onClick={loadEndpoints} disabled={loading || busy || verifyBusy}>
                <RefreshCw size={13} /> Search & Load
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
                    <th className="table-th">Windows Mode</th>
                    <th className="table-th">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td className="table-td text-gray-400 text-center" colSpan={8}>Loading endpoints...</td></tr>
                  ) : endpoints.length === 0 ? (
                    <tr><td className="table-td text-gray-400 text-center" colSpan={8}>{hasLoaded ? 'No VM endpoints found for current filters' : 'Use search and click "Search & Load" to fetch endpoints'}</td></tr>
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
                      <td className="table-td">{e.os_family === 'Windows' ? windowsProtocol : '-'}</td>
                      <td className="table-td">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          e.status === 'Deployed' || e.status === 'Ready' || e.status === 'Connection Passed' || e.status === 'Verified'
                            ? 'bg-green-100 text-green-700'
                            : e.status === 'Skipped'
                              ? 'bg-blue-100 text-blue-700'
                              : e.status === 'Blocked' || e.status === 'Connection Failed' || e.status === 'Failed'
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
      )}

      {activeTab === 'verification' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className={`${glassCard} p-4 space-y-4 xl:col-span-1`}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Verification</p>
              <p className="font-semibold text-gray-800 -mt-2">Installation and Service Verification</p>
              <div className="grid grid-cols-1 gap-2">
                <button type="button" className="btn-primary text-xs" onClick={() => runVerifyInstallation(selectedIds)} disabled={verifyBusy || !selectedCount}>
                  <CheckCircle2 size={13} /> Check Selected
                </button>
                <button type="button" className="btn-secondary text-xs" onClick={() => runVerifyInstallation(endpoints.map((e) => e.id))} disabled={verifyBusy || !endpoints.length}>
                  <CheckCircle2 size={13} /> Check All Visible
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Configure and verify installed file, service status, or both for ManageEngine and Nessus Agent on Linux VMs.
              </p>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                Last run summary: Verified {verificationRows.filter((r) => r.status === 'Verified').length}, Failed {verificationRows.filter((r) => r.status === 'Failed').length}, Blocked {verificationRows.filter((r) => r.status === 'Blocked').length}
              </div>
            </div>

            <div className={`${glassCard} p-4 space-y-4 xl:col-span-2`}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Targets</p>
              <p className="font-semibold text-gray-800 -mt-2">Endpoints</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <input
                  className="input-field text-sm md:col-span-2"
                  placeholder="Search by name, host, OS, username"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') loadEndpoints(); }}
                />
                <select className="input-field text-sm" value={osFilter} onChange={(e) => setOsFilter(e.target.value)}>
                  {OS_FILTERS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <button type="button" className="btn-secondary text-xs" onClick={loadEndpoints} disabled={loading || verifyBusy || busy}>
                  <RefreshCw size={13} /> Search & Load
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
                      <th className="table-th">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      <tr><td className="table-td text-gray-400 text-center" colSpan={6}>Loading endpoints...</td></tr>
                    ) : endpoints.length === 0 ? (
                      <tr><td className="table-td text-gray-400 text-center" colSpan={6}>{hasLoaded ? 'No VM endpoints found for current filters' : 'Use search and click "Search & Load" to fetch endpoints'}</td></tr>
                    ) : endpoints.map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="table-td">
                          <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleRow(e.id)} />
                        </td>
                        <td className="table-td font-medium text-gray-700">{e.name}</td>
                        <td className="table-td font-mono text-xs">{e.host || '-'}</td>
                        <td className="table-td">{e.os_family}</td>
                        <td className="table-td">{e.username || '-'}</td>
                        <td className="table-td">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            e.status === 'Verified' || e.status === 'Connection Passed' ? 'bg-green-100 text-green-700'
                              : e.status === 'Blocked' || e.status === 'Failed' ? 'bg-red-100 text-red-700'
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

          <div className={`${glassCard} p-4 space-y-4`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Configuration</p>
            <p className="font-semibold text-gray-800 -mt-2">Verification Settings</p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800">ManageEngine</p>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Installed file path</p>
                  <input className="input-field text-sm" value={settings.linux_me_installed_file_path} onChange={(e) => setField('linux_me_installed_file_path', e.target.value)} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Service name</p>
                  <input className="input-field text-sm" value={settings.linux_me_service_name} onChange={(e) => setField('linux_me_service_name', e.target.value)} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Verify by</p>
                  <select className="input-field text-sm" value={settings.linux_me_verify_mode} onChange={(e) => setField('linux_me_verify_mode', e.target.value)}>
                    <option value="both">File + Service</option>
                    <option value="file">File only</option>
                    <option value="service">Service only</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800">Nessus</p>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Installed file path</p>
                  <input className="input-field text-sm" value={settings.linux_nessus_installed_file_path} onChange={(e) => setField('linux_nessus_installed_file_path', e.target.value)} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Service name</p>
                  <input className="input-field text-sm" value={settings.linux_nessus_service_name} onChange={(e) => setField('linux_nessus_service_name', e.target.value)} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Verify by</p>
                  <select className="input-field text-sm" value={settings.linux_nessus_verify_mode} onChange={(e) => setField('linux_nessus_verify_mode', e.target.value)}>
                    <option value="both">File + Service</option>
                    <option value="file">File only</option>
                    <option value="service">Service only</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className={`${glassCard} p-4 space-y-4`}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-800">Verification Results</p>
              <button type="button" className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1" onClick={() => setVerificationRows([])}>
                <Trash2 size={12} /> Clear
              </button>
            </div>
            <div className="border border-gray-200 rounded overflow-auto max-h-[360px]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <th className="table-th">Endpoint</th>
                    <th className="table-th">OS</th>
                    <th className="table-th">ManageEngine</th>
                    <th className="table-th">Nessus Agent</th>
                    <th className="table-th">Overall</th>
                    <th className="table-th">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {verificationRows.length === 0 ? (
                    <tr><td className="table-td text-gray-400 text-center" colSpan={6}>No verification results yet.</td></tr>
                  ) : verificationRows.map((row) => (
                    <tr key={`verify-${row.id}`} className="hover:bg-gray-50">
                      <td className="table-td">
                        <p className="font-medium text-gray-700">{row.name}</p>
                        <p className="text-xs font-mono text-gray-500">{row.host || '-'}</p>
                      </td>
                      <td className="table-td">{row.os_family}</td>
                      <td className="table-td text-xs">
                        {row.checks?.manageengine ? (
                          <span className={row.checks.manageengine.installed ? 'text-green-700' : 'text-amber-700'}>
                            ({row.checks.manageengine.verify_mode || 'both'}) file: {row.checks.manageengine.file_exists ? 'yes' : 'no'}, service: {row.checks.manageengine.service_active ? 'active' : 'inactive'}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="table-td text-xs">
                        {row.checks?.nessus ? (
                          <span className={row.checks.nessus.installed ? 'text-green-700' : 'text-amber-700'}>
                            ({row.checks.nessus.verify_mode || 'both'}) file: {row.checks.nessus.file_exists ? 'yes' : 'no'}, service: {row.checks.nessus.service_active ? 'active' : 'inactive'}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="table-td">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          row.status === 'Verified' ? 'bg-green-100 text-green-700'
                            : row.status === 'Blocked' || row.status === 'Failed' ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="table-td text-xs text-gray-600">{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'deploy' && (
        <>
          <div className={`${glassCard} p-4 space-y-4`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Configuration</p>
            <p className="font-semibold text-gray-800 -mt-2">Installer Settings</p>
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
                <div className="rounded border border-gray-200 bg-gray-50 p-2.5 space-y-2">
                  {['Auto', 'WinRM', 'PsExec', 'WMI'].map((mode) => (
                    <label key={mode} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="windows_transport_protocol"
                        checked={windowsProtocol === mode}
                        onChange={() => setField('windows_transport_protocol', mode)}
                      />
                      {mode}
                    </label>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">PsExec path</p>
                <input className="input-field text-sm" value={settings.psexec_path} onChange={(e) => setField('psexec_path', e.target.value)} placeholder="C:\\Path\\PsExec.exe" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">WinRM port</p>
                <input className="input-field text-sm" type="number" value={settings.windows_winrm_port} onChange={(e) => setField('windows_winrm_port', e.target.value)} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">PsExec / SMB port</p>
                <input className="input-field text-sm" type="number" value={settings.windows_psexec_smb_port} onChange={(e) => setField('windows_psexec_smb_port', e.target.value)} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">WMI port</p>
                <input className="input-field text-sm" type="number" value={settings.windows_wmi_port} onChange={(e) => setField('windows_wmi_port', e.target.value)} />
              </div>
              <div className="md:col-span-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Linux Installation</p>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 space-y-3">
                    <p className="text-sm font-semibold text-slate-800">ManageEngine</p>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={settings.linux_manageengine_install_enabled !== false}
                        onChange={(e) => setField('linux_manageengine_install_enabled', e.target.checked)}
                      />
                      Install ManageEngine via .bin
                    </label>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Installer (.bin)</p>
                      <input className="input-field text-sm" value={settings.linux_installer_path} onChange={(e) => setField('linux_installer_path', e.target.value)} placeholder="/opt/installer/agent.bin" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Config (json)</p>
                      <input className="input-field text-sm" value={settings.linux_config_path} onChange={(e) => setField('linux_config_path', e.target.value)} placeholder="/opt/installer/serverinfo.json" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Preset</p>
                      <input className="input-field text-sm" value={settings.linux_preset} onChange={(e) => setField('linux_preset', e.target.value)} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Custom command</p>
                      <input className="input-field text-sm" value={settings.linux_custom_command} onChange={(e) => setField('linux_custom_command', e.target.value)} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Extra args</p>
                      <input className="input-field text-sm" value={settings.linux_extra_args} onChange={(e) => setField('linux_extra_args', e.target.value)} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Linux primary port</p>
                      <input className="input-field text-sm" type="number" value={settings.linux_primary_port} onChange={(e) => setField('linux_primary_port', e.target.value)} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 space-y-3">
                    <p className="text-sm font-semibold text-slate-800">Nessus</p>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={!!settings.linux_nessus_install_enabled}
                        onChange={(e) => setField('linux_nessus_install_enabled', e.target.checked)}
                      />
                      Install Nessus via curl command
                    </label>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Curl install command</p>
                      <textarea
                        className="input-field text-sm font-mono min-h-[120px]"
                        value={settings.linux_nessus_curl_command}
                        onChange={(e) => setField('linux_nessus_curl_command', e.target.value)}
                        placeholder="curl -H 'X-Key: ...' 'https://sensor.cloud.tenable.com/install/agent?name='${HOSTNAME}'&groups=Servers' | bash;"
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      This command runs on the target Linux VM over SSH during deployment.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Linux deployment and installation verification use SSH/SCP-compatible system tools on the backend host. Windows deployment currently runs through WinRM when PowerShell remoting is available on the backend host.
          </div>
        </>
      )}
    </div>
  );
}

