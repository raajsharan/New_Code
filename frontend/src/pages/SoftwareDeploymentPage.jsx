import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { deploymentAPI } from '../services/api';
import {
  RefreshCw, Play, CheckCircle2, Save, Upload, Download, Trash2, Package, AlertTriangle,
  Activity, Settings2, Search, Eye, EyeOff,
} from 'lucide-react';

const CONFIG_KEY = 'software_deploy_config_v1';

const REGIONS = ['Burlington', 'Toronto', 'Bomgar', 'Beijing'];

const DEFAULT_SETTINGS = {
  windows_region: 'Burlington',
  windows_installer_path_burlington: '',
  windows_installer_path_toronto: '',
  windows_installer_path_bomgar: '',
  windows_installer_path_beijing: '',
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
  { key: 'service-status', label: 'Service Status' },
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
  const [duplicateWarning, setDuplicateWarning] = useState(null); // { ids, duplicates }
  const fileRef = useRef(null);

  // Service Status (ManageEngine Endpoint Central)
  const [meConfig, setMeConfig]         = useState({ server_url: '', api_key: '', enabled: false, has_key: false });
  const [meConfigDirty, setMeConfigDirty] = useState({ server_url: '', api_key: '' });
  const [meConfigLoaded, setMeConfigLoaded] = useState(false);
  const [meSaving, setMeSaving]         = useState(false);
  const [meTesting, setMeTesting]       = useState(false);
  const [meTestResult, setMeTestResult] = useState(null); // { ok, message/error }
  const [meShowKey, setMeShowKey]       = useState(false);
  const [meAgents, setMeAgents]         = useState([]);
  const [meTotal, setMeTotal]           = useState(0);
  const [meLoading, setMeLoading]       = useState(false);
  const [meSearch, setMeSearch]         = useState('');
  const [meFilter, setMeFilter]         = useState('allcomputers');
  const [mePage, setMePage]             = useState(1);
  const ME_PAGE_SIZE = 200;
  const windowsProtocol = settings.windows_transport_protocol || settings.windows_mode || 'Auto';

  const appendLog = (line) => setLogs((prev) => [...prev.slice(-400), `[${ts()}] ${line}`]);

  const loadMeConfig = useCallback(async () => {
    try {
      const r = await deploymentAPI.getMeConfig();
      setMeConfig(r.data);
      setMeConfigDirty({ server_url: r.data.server_url || '', api_key: '' });
      setMeConfigLoaded(true);
    } catch { toast.error('Failed to load ManageEngine config'); }
  }, []);

  const saveMeConfig = async () => {
    setMeSaving(true);
    try {
      await deploymentAPI.saveMeConfig({ server_url: meConfigDirty.server_url, api_key: meConfigDirty.api_key || undefined, enabled: meConfig.enabled });
      toast.success('ManageEngine config saved');
      await loadMeConfig();
    } catch (e) { toast.error(e?.response?.data?.error || 'Save failed'); }
    finally { setMeSaving(false); }
  };

  const testMeConnection = async () => {
    setMeTesting(true);
    setMeTestResult(null);
    try {
      const r = await deploymentAPI.testMeConnection({ server_url: meConfigDirty.server_url });
      setMeTestResult(r.data);
      if (r.data.ok) toast.success(r.data.message || 'Connection successful');
      else toast.error(r.data.error || 'Connection failed');
    } catch (e) {
      const msg = e?.response?.data?.error || 'Connection test failed';
      setMeTestResult({ ok: false, error: msg });
      toast.error(msg);
    } finally { setMeTesting(false); }
  };

  const loadMeAgents = useCallback(async () => {
    setMeLoading(true);
    try {
      const r = await deploymentAPI.getMeAgentStatus({ search: meSearch, filterby: meFilter, page: mePage, page_size: ME_PAGE_SIZE });
      setMeAgents(r.data.computers || []);
      setMeTotal(r.data.total || 0);
    } catch (e) { toast.error(e?.response?.data?.error || 'Failed to fetch agent status'); }
    finally { setMeLoading(false); }
  }, [meSearch, meFilter, mePage]);

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

  useEffect(() => {
    if (activeTab === 'service-status' && !meConfigLoaded) loadMeConfig();
  }, [activeTab, meConfigLoaded, loadMeConfig]);

  useEffect(() => {
    if (activeTab === 'service-status' && meAgents.length > 0) loadMeAgents();
  // Only re-fetch when page changes (not on every filter change — user must click Fetch)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mePage]);

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

  const checkAndDeploy = async (ids) => {
    if (!ids.length) { toast.error('Select endpoints first'); return; }
    try {
      const r = await deploymentAPI.checkDuplicates(ids);
      const dups = r.data?.duplicates || [];
      if (dups.length > 0) { setDuplicateWarning({ ids, duplicates: dups }); return; }
    } catch { /* if check fails, proceed */ }
    runDeploy(ids);
  };

  const runDeploy = async (ids) => {
    if (!ids.length) {
      toast.error('Select endpoints first');
      return;
    }
    setDuplicateWarning(null);
    setBusy(true);
    appendLog(`Starting deployment run for ${ids.length} endpoint(s).`);
    try {
      const regionKey = `windows_installer_path_${(settings.windows_region || 'burlington').toLowerCase()}`;
      const resolvedWinPath = settings[regionKey] || '';
      const payload = {
        endpoint_ids: ids,
        settings: {
          ...settings,
          windows_installer_path: resolvedWinPath,
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

            {/* Hostname duplicate warning */}
            {duplicateWarning && (
              <div className="rounded-xl border border-orange-300 bg-orange-50 p-3 space-y-2">
                <p className="text-xs font-semibold text-orange-800 flex items-center gap-1.5">
                  <AlertTriangle size={14} /> Hostname Duplicate Detected
                </p>
                <p className="text-xs text-orange-700">The following hostnames exist in both Asset Inventory and Ext. Asset Inventory:</p>
                <ul className="text-xs text-orange-800 space-y-0.5 pl-2">
                  {duplicateWarning.duplicates.map((d, i) => (
                    <li key={i}>• <strong>{d.hostname}</strong> → also in Ext: {d.matches.join(', ')}</li>
                  ))}
                </ul>
                <div className="flex gap-2 pt-1">
                  <button type="button" className="btn-primary text-xs !bg-orange-600 hover:!bg-orange-700"
                    onClick={() => runDeploy(duplicateWarning.ids)}>Proceed Anyway</button>
                  <button type="button" className="btn-secondary text-xs"
                    onClick={() => setDuplicateWarning(null)}>Cancel</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-primary text-xs" onClick={() => checkAndDeploy(selectedIds)} disabled={busy || !selectedCount}>
                <Play size={13} /> Deploy Selected
              </button>
              <button type="button" className="btn-secondary text-xs" onClick={() => checkAndDeploy(endpoints.map((e) => e.id))} disabled={busy || !endpoints.length}>
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
              <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                {OS_FILTERS.map((o) => (
                  <button key={o} type="button" onClick={() => setOsFilter(o)}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${osFilter === o ? 'bg-slate-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {o}
                  </button>
                ))}
              </div>
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
                <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                  {OS_FILTERS.map((o) => (
                    <button key={o} type="button" onClick={() => setOsFilter(o)}
                      className={`px-3 py-1.5 text-xs font-semibold transition-colors ${osFilter === o ? 'bg-slate-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      {o}
                    </button>
                  ))}
                </div>
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
              <div className="md:col-span-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">ManageEngine Agent — Windows Region</p>
                <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 space-y-3">
                  <p className="text-xs text-gray-500">Select the target region. The corresponding installer path will be used for deployment.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {REGIONS.map(region => {
                      const key = `windows_installer_path_${region.toLowerCase()}`;
                      const active = settings.windows_region === region;
                      return (
                        <div key={region} className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${active ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                          <input type="radio" name="windows_region" className="accent-blue-600 flex-shrink-0"
                            checked={active} onChange={() => setField('windows_region', region)} />
                          <span className={`text-xs font-semibold w-20 flex-shrink-0 ${active ? 'text-blue-700' : 'text-gray-700'}`}>{region}</span>
                          <input className="input-field text-xs flex-1 !py-1" placeholder="C:\Path\AgentSetup.exe"
                            value={settings[key] || ''} onChange={e => setField(key, e.target.value)} />
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400">Active: <strong className="text-blue-600">{settings.windows_region}</strong> → {settings[`windows_installer_path_${(settings.windows_region||'burlington').toLowerCase()}`] || <span className="text-orange-500">path not set</span>}</p>
                </div>
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

      {activeTab === 'service-status' && (
        <div className="space-y-4">
          {/* ME Configuration card */}
          <div className={`${glassCard} p-4 space-y-4`}>
            <div className="flex items-center gap-2">
              <Settings2 size={15} className="text-blue-600" />
              <p className="font-semibold text-gray-800">ManageEngine Endpoint Central — API Configuration</p>
            </div>
            <p className="text-xs text-gray-500 -mt-2">
              Connect to your ManageEngine Endpoint Central server using a read-only API key to pull live agent statuses.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Server URL</p>
                <input
                  className="input-field text-sm"
                  placeholder="https://manage-engine.example.com:8383"
                  value={meConfigDirty.server_url}
                  onChange={e => setMeConfigDirty(p => ({ ...p, server_url: e.target.value }))}
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                  API Key {meConfig.has_key && <span className="text-green-600 ml-1 normal-case font-normal">(saved)</span>}
                </p>
                <div className="relative">
                  <input
                    className="input-field text-sm pr-9"
                    type={meShowKey ? 'text' : 'password'}
                    placeholder={meConfig.has_key ? '••••••••••••••• (leave blank to keep existing)' : 'Paste API key here'}
                    value={meConfigDirty.api_key}
                    onChange={e => setMeConfigDirty(p => ({ ...p, api_key: e.target.value }))}
                  />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setMeShowKey(v => !v)}>
                    {meShowKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
            {meTestResult && (
              <div className={`text-xs rounded-lg px-3 py-2 border ${meTestResult.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                {meTestResult.ok ? `✓ ${meTestResult.message}` : `✗ ${meTestResult.error}`}
              </div>
            )}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-gray-400">API requests are proxied through the backend server. The key is stored server-side only.</p>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary text-xs" onClick={testMeConnection} disabled={meTesting || !meConfigDirty.server_url}>
                  <Activity size={13} /> {meTesting ? 'Testing…' : 'Test Connection'}
                </button>
                <button type="button" className="btn-primary text-xs" onClick={saveMeConfig} disabled={meSaving}>
                  <Save size={13} /> {meSaving ? 'Saving…' : 'Save Config'}
                </button>
              </div>
            </div>
          </div>

          {/* Fetch / Filter bar */}
          <div className={`${glassCard} p-4`}>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="input-field text-sm pl-8"
                  placeholder="Search by name, IP, domain, site…"
                  value={meSearch}
                  onChange={e => { setMeSearch(e.target.value); setMePage(1); }}
                  onKeyDown={e => { if (e.key === 'Enter') loadMeAgents(); }}
                />
              </div>
              <select className="input-field text-sm w-auto" value={meFilter} onChange={e => { setMeFilter(e.target.value); setMePage(1); }}>
                <option value="allcomputers">All Computers</option>
                <option value="onlinecomputers">Online</option>
                <option value="offlinecomputers">Offline</option>
                <option value="managedcomputers">Managed</option>
                <option value="unmanagedcomputers">Unmanaged</option>
              </select>
              <button type="button" className="btn-primary text-xs" onClick={() => { setMePage(1); loadMeAgents(); }} disabled={meLoading || !meConfig.has_key}>
                <Activity size={13} /> {meLoading ? 'Loading…' : 'Fetch Status'}
              </button>
              <button type="button" className="btn-secondary text-xs" onClick={loadMeAgents} disabled={meLoading || !meAgents.length}>
                <RefreshCw size={13} /> Refresh
              </button>
            </div>
            {!meConfig.has_key && (
              <p className="text-xs text-amber-600 mt-2">Save a server URL and API key above before fetching agent statuses.</p>
            )}
          </div>

          {/* Results table */}
          <div className={`${glassCard} p-4 space-y-3`}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-800">Agent Status</p>
              <p className="text-xs text-gray-500">{meAgents.length} shown{meTotal > meAgents.length ? ` of ${meTotal} total` : ''}</p>
            </div>
            <div className="border border-gray-200 rounded overflow-auto max-h-[520px]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <th className="table-th">Computer Name</th>
                    <th className="table-th">IP Address</th>
                    <th className="table-th">Domain</th>
                    <th className="table-th">OS</th>
                    <th className="table-th">Agent Version</th>
                    <th className="table-th">Agent Status</th>
                    <th className="table-th">Last Contact</th>
                    <th className="table-th">Site</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {meLoading ? (
                    <tr><td className="table-td text-gray-400 text-center" colSpan={8}>Loading agent statuses…</td></tr>
                  ) : meAgents.length === 0 ? (
                    <tr><td className="table-td text-gray-400 text-center" colSpan={8}>
                      {meConfig.has_key ? 'Click "Fetch Status" to load agents' : 'Configure API settings above first'}
                    </td></tr>
                  ) : meAgents.map((a, i) => {
                    const online = String(a.agent_status).toLowerCase().includes('online') || String(a.agent_status) === '1';
                    const offline = String(a.agent_status).toLowerCase().includes('offline') || String(a.agent_status) === '2';
                    return (
                      <tr key={a.computer_id || i} className="hover:bg-gray-50">
                        <td className="table-td font-medium text-gray-800">{a.computer_name || '—'}</td>
                        <td className="table-td font-mono text-xs">{a.ip_address || '—'}</td>
                        <td className="table-td text-xs">{a.domain || '—'}</td>
                        <td className="table-td text-xs">{a.os_name || '—'}</td>
                        <td className="table-td text-xs font-mono">{a.agent_version || '—'}</td>
                        <td className="table-td">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            online  ? 'bg-green-100 text-green-700' :
                            offline ? 'bg-red-100 text-red-600'     :
                                      'bg-gray-100 text-gray-500'
                          }`}>
                            {a.agent_status || '—'}
                          </span>
                        </td>
                        <td className="table-td text-xs text-gray-500">{a.last_contact || '—'}</td>
                        <td className="table-td text-xs">{a.office_site || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {meTotal > ME_PAGE_SIZE && (
              <div className="flex items-center gap-3 justify-center text-xs">
                <button className="btn-secondary text-xs" disabled={mePage <= 1} onClick={() => setMePage(p => p - 1)}>← Prev</button>
                <span className="text-gray-500">Page {mePage} of {Math.ceil(meTotal / ME_PAGE_SIZE)}</span>
                <button className="btn-secondary text-xs" disabled={mePage >= Math.ceil(meTotal / ME_PAGE_SIZE)} onClick={() => setMePage(p => p + 1)}>Next →</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

