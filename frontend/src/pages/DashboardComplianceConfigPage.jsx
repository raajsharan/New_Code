import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { dropdownsAPI, settingsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { Save, RotateCcw, Plus, X, Settings } from 'lucide-react';

const DEFAULT_CFG = {
  msl: {
    include_asset_types: ['VM'],
    include_server_statuses: ['Alive', 'Powered Off'],
    exclude_eol_statuses: ['Decom', 'Not Applicable'],
    include_password_statuses: ['Known', 'Unknown'],
    pivot_by: 'location',
  },
  ext: {
    total_scope_exclude_statuses: [],
    total_scope_exclude_eol_statuses: [],
    me_not_applicable: {
      require_me_not_installed: true,
      include_patching_types: ['Exception', 'Beijing IT Team'],
      include_server_statuses: ['Not Alive'],
      include_eol_statuses: ['Decom', 'Not Applicable'],
    },
    auto_patching_types: ['Auto'],
    manual_patching_types: ['Manual'],
    name_conflict_fields: ['vm_name', 'os_hostname'],
  },
  ops: {
    total_include_server_statuses: [],
    auto_patching_types: ['Auto'],
    manual_patching_types: ['Manual'],
    exception_patching_types: ['Exception'],
    beijing_patching_types: ['Beijing IT Team'],
    eol_patching_types: ['EOL - No Patches'],
    not_applicable_patching_types: ['Not Applicable'],
    onboard_pending_patching_types: ['Onboard Pending'],
    on_hold_patching_types: ['On Hold'],
    uncategorized_patching_types: [],
    powered_off_server_statuses: ['Powered Off'],
    compliance_alive_statuses: ['Alive'],
  },
};

const MSL_PIVOT_OPTIONS = [
  { value: 'location', label: 'Location' },
  { value: 'department', label: 'Department' },
  { value: 'asset_type', label: 'Asset Type' },
  { value: 'server_status', label: 'Server Status' },
  { value: 'eol_status', label: 'EOL Status' },
  { value: 'password_status', label: 'Password Status' },
];

const uniq = (arr) => [...new Set((arr || []).map((x) => String(x || '').trim()).filter(Boolean))];

function ListEditor({ label, value = [], onChange, suggestions = [] }) {
  const [input, setInput] = useState('');
  const add = (raw) => {
    const v = String(raw || '').trim();
    if (!v) return;
    onChange(uniq([...(value || []), v]));
    setInput('');
  };
  const remove = (item) => onChange((value || []).filter((v) => v !== item));
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {(value || []).map((item) => (
          <span key={item} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium">
            {item}
            <button type="button" onClick={() => remove(item)} className="text-blue-500 hover:text-blue-700"><X size={11} /></button>
          </span>
        ))}
        {!value?.length && <span className="text-xs text-gray-400">No values selected</span>}
      </div>
      <div className="flex gap-2">
        <input
          className="input-field text-sm py-1.5"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(input); } }}
          placeholder="Add value"
        />
        <button type="button" className="btn-secondary text-xs py-1.5" onClick={() => add(input)}>
          <Plus size={12} /> Add
        </button>
      </div>
      {!!suggestions.length && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.filter((s) => !(value || []).includes(s)).map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardComplianceConfigPage() {
  const { canWrite } = useAuth();
  const { bumpConfig } = useConfig();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState(DEFAULT_CFG);
  const [dropdowns, setDropdowns] = useState({});
  const [eolOptions, setEolOptions] = useState(['InSupport', 'EOL', 'Decom', 'Not Applicable']);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgR, ddR, btR] = await Promise.all([
        settingsAPI.getDashboardComplianceConfig(),
        dropdownsAPI.getAll().catch(() => ({ data: {} })),
        settingsAPI.getBuiltinFieldTypes('asset').catch(() => ({ data: {} })),
      ]);
      const incoming = cfgR.data || DEFAULT_CFG;
      setCfg({
        ...DEFAULT_CFG,
        ...incoming,
        msl: { ...DEFAULT_CFG.msl, ...(incoming.msl || {}) },
        ext: {
          ...DEFAULT_CFG.ext,
          ...(incoming.ext || {}),
          me_not_applicable: {
            ...DEFAULT_CFG.ext.me_not_applicable,
            ...(incoming.ext?.me_not_applicable || {}),
          },
        },
        ops: {
          ...DEFAULT_CFG.ops,
          ...(incoming.ops || {}),
        },
      });
      setDropdowns(ddR.data || {});
      const options = btR.data?.eol_status?.options;
      if (Array.isArray(options) && options.length) setEolOptions(uniq(options.concat(['Not Applicable'])));
    } catch {
      toast.error('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!canWrite) return;
    setSaving(true);
    try {
      await settingsAPI.saveDashboardComplianceConfig(cfg);
      bumpConfig();
      toast.success('Dashboard compliance config saved');
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => setCfg(DEFAULT_CFG);
  const patch = (path, next) => {
    setCfg((prev) => {
      const draft = JSON.parse(JSON.stringify(prev));
      let obj = draft;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
      obj[path[path.length - 1]] = next;
      return draft;
    });
  };

  const assetTypeNames = useMemo(() => (dropdowns.asset_types || []).map((x) => x.name), [dropdowns.asset_types]);
  const serverStatuses = useMemo(() => (dropdowns.server_status || []).map((x) => x.name), [dropdowns.server_status]);
  const patchingTypes = useMemo(() => (dropdowns.patching_types || []).map((x) => x.name), [dropdowns.patching_types]);

  if (loading) return <div className="card animate-pulse h-40 bg-gray-100" />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Settings size={20} className="text-blue-700" />Dashboard Compliance Config</h1>
        <p className="text-sm text-gray-500 mt-0.5">Background rules for the two custom dashboard compliance cards.</p>
      </div>

      {!canWrite && <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">Read-only access.</div>}

      <div className="card space-y-4">
        <p className="font-semibold text-gray-800">MSL Compliance Scope</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ListEditor label="Include Asset Types" value={cfg.msl.include_asset_types} onChange={(v) => patch(['msl', 'include_asset_types'], v)} suggestions={assetTypeNames} />
          <ListEditor label="Include Server Statuses" value={cfg.msl.include_server_statuses} onChange={(v) => patch(['msl', 'include_server_statuses'], v)} suggestions={serverStatuses} />
          <ListEditor label="Exclude EOL Statuses" value={cfg.msl.exclude_eol_statuses} onChange={(v) => patch(['msl', 'exclude_eol_statuses'], v)} suggestions={eolOptions} />
          <ListEditor label="Include Password Statuses" value={cfg.msl.include_password_statuses} onChange={(v) => patch(['msl', 'include_password_statuses'], v)} suggestions={['Known', 'Unknown']} />
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase">MSL Compliance Pivot</p>
            <select
              className="input-field text-sm"
              value={cfg.msl.pivot_by || 'location'}
              onChange={(e) => patch(['msl', 'pivot_by'], e.target.value)}
            >
              {MSL_PIVOT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400">Controls the breakdown shown inside the "Total Inventory MSL Compliance" dashboard card.</p>
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <p className="font-semibold text-gray-800">Extended Endpoint Compliance Rules</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ListEditor label="Exclude Item Statuses (Total Scope)" value={cfg.ext.total_scope_exclude_statuses} onChange={(v) => patch(['ext', 'total_scope_exclude_statuses'], v)} suggestions={['Active', 'Inactive', 'Decommissioned', 'Maintenance']} />
          <ListEditor label="Exclude EOL Statuses (Total Scope)" value={cfg.ext.total_scope_exclude_eol_statuses} onChange={(v) => patch(['ext', 'total_scope_exclude_eol_statuses'], v)} suggestions={eolOptions} />
          <ListEditor label="ME Not Applicable: Patching Types" value={cfg.ext.me_not_applicable.include_patching_types} onChange={(v) => patch(['ext', 'me_not_applicable', 'include_patching_types'], v)} suggestions={patchingTypes} />
          <ListEditor label="ME Not Applicable: Server Statuses" value={cfg.ext.me_not_applicable.include_server_statuses} onChange={(v) => patch(['ext', 'me_not_applicable', 'include_server_statuses'], v)} suggestions={serverStatuses} />
          <ListEditor label="ME Not Applicable: EOL Statuses" value={cfg.ext.me_not_applicable.include_eol_statuses} onChange={(v) => patch(['ext', 'me_not_applicable', 'include_eol_statuses'], v)} suggestions={eolOptions} />
          <ListEditor label="Auto Patching Types" value={cfg.ext.auto_patching_types} onChange={(v) => patch(['ext', 'auto_patching_types'], v)} suggestions={patchingTypes} />
          <ListEditor label="Manual Patching Types" value={cfg.ext.manual_patching_types} onChange={(v) => patch(['ext', 'manual_patching_types'], v)} suggestions={patchingTypes} />
          <ListEditor label="Name Conflict Fields" value={cfg.ext.name_conflict_fields} onChange={(v) => patch(['ext', 'name_conflict_fields'], v)} suggestions={['vm_name', 'os_hostname', 'asset_name']} />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={!!cfg.ext.me_not_applicable.require_me_not_installed}
            onChange={(e) => patch(['ext', 'me_not_applicable', 'require_me_not_installed'], e.target.checked)}
          />
          ME Not Applicable applies only when `ME Installed = false`
        </label>
      </div>

      <div className="flex gap-2">
        <button type="button" className="btn-secondary text-xs" onClick={resetDefaults} disabled={saving}>
          <RotateCcw size={13} /> Reset to Defaults
        </button>
        <button type="button" className="btn-primary text-xs" onClick={save} disabled={saving || !canWrite}>
          <Save size={13} /> {saving ? 'Saving...' : 'Save Config'}
        </button>
      </div>
    </div>
  );
}

