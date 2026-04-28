import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { beijingAssetsAPI, dropdownsAPI, settingsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDeleteConfirm } from '../context/DeleteConfirmContext';
import AssetTagWidget from '../components/AssetTagWidget';
import toast from 'react-hot-toast';
import {
  PlusCircle, RotateCcw, Download, List, Plus,
  Search, Edit2, Trash2, ChevronLeft, ChevronRight,
  RefreshCw, CheckCircle, AlertTriangle, Eye, History,
  EyeOff, Zap, HardDrive, Key, Tag,
} from 'lucide-react';

const BEIJING_INIT = {
  vm_name: '', os_hostname: '', ip_address: '', asset_type: '',
  os_type: '', os_version: '', assigned_user: '', department: '',
  location: '', business_purpose: '', server_status: '',
  serial_number: '', eol_status: '', asset_tag: '', additional_remarks: '',
  idrac_enabled: false, idrac_ip: '', oem_status: '',
  hosted_ip: '', asset_username: '', asset_password: '',
  me_installed_status: false, tenable_installed_status: false,
  patching_type: '', server_patch_type: '', patching_schedule: '',
  custom_field_values: {},
};

const EOL_OPTIONS = ['', 'InSupport', 'EOL', 'Decom', 'Not Applicable'];

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionTitle({ title }) {
  return (
    <div className="col-span-full pt-2 pb-1 border-b border-gray-100 dark:border-slate-700">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
    </div>
  );
}

// ─── ADD / EDIT TAB ───────────────────────────────────────────────────────────
function AddBeijingTab({ onSaved, editAsset, onClearEdit }) {
  const { isAdmin } = useAuth();
  const [form, setForm]         = useState(BEIJING_INIT);
  const [loading, setLoading]       = useState(false);
  const [dupState, setDupState]     = useState({ ip: null });
  const [checking, setChecking]     = useState({ ip: false });
  const [showPw, setShowPw]         = useState(false);
  const [tagValidation, setTagValidation] = useState(null);
  const [dropdowns, setDropdowns]         = useState({});
  const [customFields, setCustomFields]   = useState([]);
  const ipTimer = useRef(null);

  useEffect(() => {
    dropdownsAPI.getAll().then(r => setDropdowns(r.data)).catch(() => {});
    beijingAssetsAPI.getCustomFields().then(r => setCustomFields(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (editAsset) setForm({ ...BEIJING_INIT, ...editAsset, custom_field_values: editAsset.custom_field_values || {} });
    else           setForm(BEIJING_INIT);
  }, [editAsset]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setCustom = (k, v) => setForm(p => ({ ...p, custom_field_values: { ...p.custom_field_values, [k]: v } }));

  const checkIP = async (ip) => {
    if (!ip?.trim()) { setDupState({ ip: null }); return; }
    setChecking({ ip: true });
    try {
      const r = await beijingAssetsAPI.checkDuplicate({ ip, exclude_id: editAsset?.id });
      setDupState({ ip: r.data.duplicate ? r.data.message : false });
    } catch { setDupState({ ip: null }); }
    finally { setChecking({ ip: false }); }
  };

  const handleIPChange = (v) => {
    set('ip_address', v);
    clearTimeout(ipTimer.current);
    ipTimer.current = setTimeout(() => checkIP(v), 700);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (dupState.ip)             { toast.error('Fix duplicate IP'); return; }
    if (!form.ip_address.trim()) { toast.error('IP address is required'); return; }
    if (tagValidation)           { toast.error('Fix asset tag: ' + tagValidation); return; }
    setLoading(true);
    try {
      if (editAsset) {
        await beijingAssetsAPI.update(editAsset.id, form);
        toast.success('Asset updated');
      } else {
        await beijingAssetsAPI.create(form);
        toast.success('Asset added');
      }
      setForm(BEIJING_INIT);
      setDupState({ ip: null });
      onSaved();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed';
      if (err.response?.data?.duplicate) toast.error('Duplicate IP: ' + msg, { duration: 6000 });
      else toast.error(msg);
    } finally { setLoading(false); }
  };

  const activeCustomFields = customFields.filter(cf => cf.is_active !== false);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          {editAsset
            ? `Editing: ${editAsset.vm_name || editAsset.os_hostname || 'Asset #' + editAsset.id}`
            : 'Fill in the details below to add a new Beijing asset'}
        </p>
        {editAsset && (
          <button onClick={() => { setForm(BEIJING_INIT); onClearEdit(); }} className="btn-secondary text-xs">
            <RotateCcw size={13} /> Cancel Edit
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-700 dark:text-amber-300">
          Admin access required to add or edit assets.
        </div>
      )}
      {dupState.ip && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle size={16} /> {dupState.ip}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

            <SectionTitle title="Basic Information" />
            <Field label="VM Name">
              <input className="input-field" value={form.vm_name} onChange={e => set('vm_name', e.target.value)} placeholder="SERVER-01" />
            </Field>
            <Field label="OS Hostname">
              <input className="input-field" value={form.os_hostname} onChange={e => set('os_hostname', e.target.value)} placeholder="server-01.local" />
            </Field>
            <Field label="IP Address" required>
              <input
                className={`input-field font-mono ${dupState.ip ? 'border-red-400' : dupState.ip === false ? 'border-green-400' : ''}`}
                value={form.ip_address}
                onChange={e => handleIPChange(e.target.value)}
                placeholder="192.168.1.10"
              />
              {checking.ip && (
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  <span className="inline-block w-3 h-3 border border-t-transparent rounded-full animate-spin border-gray-400" />
                  Checking...
                </p>
              )}
              {dupState.ip === false && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle size={11} /> Available</p>
              )}
            </Field>
            <Field label="Asset Type">
              <select className="input-field" value={form.asset_type} onChange={e => set('asset_type', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.asset_types || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="OS Type">
              <select className="input-field" value={form.os_type} onChange={e => { set('os_type', e.target.value); set('os_version', ''); }}>
                <option value="">Select...</option>
                {(dropdowns.os_types || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="OS Version">
              <select className="input-field" value={form.os_version} onChange={e => set('os_version', e.target.value)}>
                <option value="">{form.os_type ? 'Select version...' : 'Select OS Type first'}</option>
                {(dropdowns.os_versions || [])
                  .filter(v => !form.os_type || (dropdowns.os_types || []).find(t => t.name === form.os_type)?.id === v.os_type_id)
                  .map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
              </select>
            </Field>

            <SectionTitle title="Ownership" />
            <Field label="Assigned User">
              <input className="input-field" value={form.assigned_user} onChange={e => set('assigned_user', e.target.value)} placeholder="john.doe" />
            </Field>
            <Field label="Department">
              <select className="input-field" value={form.department} onChange={e => set('department', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.departments || []).map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Location">
              <select className="input-field" value={form.location} onChange={e => set('location', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.locations || []).map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="Business Purpose">
              <input className="input-field" value={form.business_purpose} onChange={e => set('business_purpose', e.target.value)} placeholder="Web server" />
            </Field>
            <div className="col-span-full">
              <AssetTagWidget
                departmentId={(dropdowns.departments || []).find(d => d.name === form.department)?.id}
                departments={dropdowns.departments || []}
                value={form.asset_tag}
                onChange={tag => set('asset_tag', tag)}
                onValidation={setTagValidation}
                excludeAssetId={editAsset?.id}
                disabled={!isAdmin}
              />
            </div>
            <Field label="Serial Number">
              <input className="input-field" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
            </Field>

            <SectionTitle title="Status & Patching" />
            <Field label="Server Status">
              <select className="input-field" value={form.server_status} onChange={e => set('server_status', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.server_status || []).map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="EOL Status">
              <select className="input-field" value={form.eol_status} onChange={e => set('eol_status', e.target.value)}>
                {EOL_OPTIONS.map(o => <option key={o} value={o}>{o || 'Select...'}</option>)}
              </select>
            </Field>
            <Field label="Patching Type">
              <select className="input-field" value={form.patching_type} onChange={e => set('patching_type', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.patching_types || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Server Patch Type">
              <select className="input-field" value={form.server_patch_type} onChange={e => set('server_patch_type', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.server_patch_types || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Patching Schedule">
              <select className="input-field" value={form.patching_schedule} onChange={e => set('patching_schedule', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.patching_schedules || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </Field>

            <SectionTitle title="Agent Status" />
            <Field label="ManageEngine Installed">
              <div className="flex items-center gap-3 h-9">
                <Toggle checked={form.me_installed_status} onChange={v => set('me_installed_status', v)} />
                <span className="text-sm text-gray-600 dark:text-slate-400">{form.me_installed_status ? 'Installed' : 'Not Installed'}</span>
              </div>
            </Field>
            <Field label="Tenable Installed">
              <div className="flex items-center gap-3 h-9">
                <Toggle checked={form.tenable_installed_status} onChange={v => set('tenable_installed_status', v)} />
                <span className="text-sm text-gray-600 dark:text-slate-400">{form.tenable_installed_status ? 'Installed' : 'Not Installed'}</span>
              </div>
            </Field>

            <SectionTitle title="Host Details" />
            <Field label="iDRAC">
              <div className="flex items-center gap-3 h-9">
                <Toggle checked={form.idrac_enabled} onChange={v => set('idrac_enabled', v)} />
                <span className="text-sm text-gray-600 dark:text-slate-400">{form.idrac_enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </Field>
            {form.idrac_enabled && (
              <Field label="iDRAC IP Address">
                <input className="input-field font-mono" value={form.idrac_ip} onChange={e => set('idrac_ip', e.target.value)} placeholder="10.0.0.100" />
              </Field>
            )}
            {form.idrac_enabled && (
              <Field label="OME Status">
                <input className="input-field" value={form.oem_status} onChange={e => set('oem_status', e.target.value)} placeholder="Managed / Discovered" />
              </Field>
            )}
            <Field label="Hosted IP (Physical Host)">
              <input className="input-field font-mono" value={form.hosted_ip} onChange={e => set('hosted_ip', e.target.value)} placeholder="10.0.0.1" />
            </Field>

            <SectionTitle title="Credentials" />
            <Field label="Asset Username">
              <input className="input-field" value={form.asset_username} onChange={e => set('asset_username', e.target.value)} placeholder="admin" />
            </Field>
            <Field label="Asset Password">
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input-field pr-10"
                  value={form.asset_password}
                  onChange={e => set('asset_password', e.target.value)}
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>

            <div className="col-span-full">
              <Field label="Additional Remarks">
                <textarea className="input-field" rows={3} value={form.additional_remarks} onChange={e => set('additional_remarks', e.target.value)} placeholder="Any notes..." />
              </Field>
            </div>

          </div>
        </div>

        {activeCustomFields.length > 0 && (
          <div className="card mb-4">
            <h3 className="font-semibold text-gray-700 dark:text-slate-300 mb-3 flex items-center gap-2 text-sm">
              <Tag size={14} className="text-purple-600" /> Custom Fields
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeCustomFields.map(cf => (
                <Field key={cf.id} label={cf.field_label}>
                  {cf.field_type === 'dropdown' ? (
                    <select className="input-field" value={form.custom_field_values[cf.field_key] ?? ''} onChange={e => setCustom(cf.field_key, e.target.value)}>
                      <option value="">Select…</option>
                      {(cf.field_options || []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input className="input-field" value={form.custom_field_values[cf.field_key] ?? ''} onChange={e => setCustom(cf.field_key, e.target.value)} />
                  )}
                </Field>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={loading || !isAdmin || !!dupState.ip} className="btn-primary">
            <PlusCircle size={16} />
            {loading ? 'Saving...' : editAsset ? 'Update Asset' : 'Add Asset'}
          </button>
          <button
            type="button"
            onClick={() => { setForm(BEIJING_INIT); setDupState({ ip: null }); if (editAsset) onClearEdit(); }}
            className="btn-secondary"
          >
            <RotateCcw size={16} /> Clear
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── LIST TAB ─────────────────────────────────────────────────────────────────
const ROW_LIMIT_OPTS = [15, 30, 50, 80, 100];
const COL_VM = 140, COL_IP = 120;

const BEIJING_COMBINED_COL_DEFAULTS = [
  { key: 'os_hostname',        label: 'Hostname',         visible: true  },
  { key: 'asset_type',         label: 'Asset Type',       visible: true  },
  { key: 'os',                 label: 'OS',               visible: true  },
  { key: 'os_version',         label: 'OS Version',       visible: false },
  { key: 'department',         label: 'Dept',             visible: true  },
  { key: 'location',           label: 'Location',         visible: true  },
  { key: 'assigned_user',      label: 'Assigned User',    visible: false },
  { key: 'asset_tag',          label: 'Asset Tag',        visible: false },
  { key: 'server_status',      label: 'Status',           visible: true  },
  { key: 'eol_status',         label: 'EOL',              visible: false },
  { key: 'patching_type',      label: 'Patch Type',       visible: false },
  { key: 'server_patch_type',  label: 'Ser. Patch Type',  visible: false },
  { key: 'patching_schedule',  label: 'Schedule',         visible: false },
  { key: 'me_installed',       label: 'ME',               visible: false },
  { key: 'tenable_installed',  label: 'Tenable',          visible: false },
  { key: 'serial_number',      label: 'Serial',           visible: false },
  { key: 'idrac',              label: 'iDRAC',            visible: false },
  { key: 'oem_status',         label: 'OME',              visible: false },
  { key: 'hosted_ip',          label: 'Hosted IP',        visible: false },
  { key: 'business_purpose',   label: 'Business Purpose', visible: false },
  { key: 'asset_username',     label: 'Username',         visible: false },
  { key: 'asset_password',     label: 'Password',         visible: false },
  { key: 'additional_remarks', label: 'Add. Remark',      visible: false },
];

function mergeCombinedColConfig(saved) {
  if (!saved || !saved.length) return BEIJING_COMBINED_COL_DEFAULTS;
  const savedMap = Object.fromEntries(saved.map((s, i) => [s.key, { ...s, order: i }]));
  return BEIJING_COMBINED_COL_DEFAULTS.map((d, i) => ({
    ...d,
    visible: savedMap[d.key] !== undefined ? savedMap[d.key].visible : d.visible,
    order:   savedMap[d.key] !== undefined ? savedMap[d.key].order   : 999 + i,
  })).sort((a, b) => a.order - b.order);
}

function BeijingListTab({ onEdit, refreshKey, initialBatchFilter = '' }) {
  const { isAdmin } = useAuth();
  const { requestDelete } = useDeleteConfirm();
  const navigate = useNavigate();

  const [assets,       setAssets]       = useState([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [limit,        setLimit]        = useState(50);
  const [loading,      setLoading]      = useState(true);
  const [exporting,    setExporting]    = useState(false);
  const [search,       setSearch]       = useState('');
  const [department,   setDepartment]   = useState('');
  const [location,     setLocation]     = useState('');
  const [assetType,    setAssetType]    = useState('');
  const [serverStatus, setServerStatus] = useState('');
  const [dropdowns,    setDropdowns]    = useState({});
  const [batchFilter,  setBatchFilter]  = useState(initialBatchFilter);
  const [selected,     setSelected]     = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [colConfig,    setColConfig]    = useState(BEIJING_COMBINED_COL_DEFAULTS);
  const [showColMenu,  setShowColMenu]  = useState(false);
  const colMenuRef = useRef(null);

  useEffect(() => {
    dropdownsAPI.getAll().then(r => setDropdowns(r.data)).catch(() => {});
    settingsAPI.getColumnConfig('beijing').then(r => setColConfig(mergeCombinedColConfig(r.data))).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e) => { if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setShowColMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await beijingAssetsAPI.getAll({
        page, limit, search,
        department:       department    || undefined,
        location:         location      || undefined,
        asset_type:       assetType     || undefined,
        server_status:    serverStatus  || undefined,
        import_batch_id:  batchFilter   || undefined,
      });
      setAssets(res.data.assets);
      setTotal(res.data.total);
      setSelected(new Set());
    } catch { toast.error('Failed to load Beijing Asset List'); }
    finally { setLoading(false); }
  }, [page, limit, search, department, location, assetType, serverStatus, batchFilter]);

  useEffect(() => { setPage(1); }, [search, department, location, assetType, serverStatus, batchFilter]); // eslint-disable-line
  useEffect(() => { fetchAssets(); }, [fetchAssets, refreshKey]);

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} selected asset${ids.length > 1 ? 's' : ''}? They will be moved to Deleted Items.`)) return;
    setBulkDeleting(true);
    try {
      const r = await beijingAssetsAPI.bulkDelete(ids);
      toast.success(`Deleted ${r.data.deleted} asset${r.data.deleted !== 1 ? 's' : ''}`);
      fetchAssets();
    } catch { toast.error('Bulk delete failed'); }
    finally { setBulkDeleting(false); }
  };

  const allPageSelected = assets.length > 0 && assets.every(a => selected.has(a.id));
  const toggleSelectAll = () => { if (allPageSelected) setSelected(new Set()); else setSelected(new Set(assets.map(a => a.id))); };
  const toggleSelect = (id) => { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); };

  function toggleColumn(key) {
    const next = colConfig.map(c => c.key === key ? { ...c, visible: !c.visible } : c);
    setColConfig(next);
    settingsAPI.saveColumnConfig('beijing', next).catch(() => {});
  }

  const handleDelete = (a) => {
    requestDelete(a.vm_name || a.os_hostname || 'this asset', async () => {
      try {
        await beijingAssetsAPI.remove(a.id);
        toast.success('Deleted');
        fetchAssets();
      } catch (err) { toast.error(err.response?.data?.error || 'Delete failed'); }
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await beijingAssetsAPI.exportCSV({});
      const url = URL.createObjectURL(new Blob([res.data]));
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `beijing-assets-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500 dark:text-slate-400">{total} total assets</p>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 dark:text-slate-400">Rows</label>
            <select
              className="input-field py-1 text-xs min-w-[88px]"
              value={limit}
              onChange={e => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}
            >
              {ROW_LIMIT_OPTS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && selected.size > 0 && (
            <button onClick={handleBulkDelete} disabled={bulkDeleting} className="btn-secondary text-xs bg-red-50 border-red-200 text-red-700 hover:bg-red-100">
              <Trash2 size={13} />{bulkDeleting ? 'Deleting…' : `Delete ${selected.size}`}
            </button>
          )}
          <div className="relative" ref={colMenuRef}>
            <button onClick={() => setShowColMenu(v => !v)} className="btn-secondary text-xs">
              <Eye size={13} /> Columns
            </button>
            {showColMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-3 min-w-[160px]">
                {colConfig.map(col => (
                  <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer text-sm text-gray-700">
                    <input type="checkbox" checked={col.visible} onChange={() => toggleColumn(col.key)} className="accent-blue-600" />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button onClick={handleExport} disabled={exporting} className="btn-secondary text-xs">
            <Download size={13} />{exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button onClick={fetchAssets} className="btn-secondary text-xs">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="relative xl:col-span-2"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input className="input-field pl-8" placeholder="VM name, hostname, IP, dept…" value={search} onChange={e => setSearch(e.target.value)}/></div>
          <select className="input-field" value={location} onChange={e => setLocation(e.target.value)}><option value="">All Locations</option>{(dropdowns.locations||[]).map(l=><option key={l.id} value={l.name}>{l.name}</option>)}</select>
          <select className="input-field" value={department} onChange={e => setDepartment(e.target.value)}><option value="">All Departments</option>{(dropdowns.departments||[]).map(d=><option key={d.id} value={d.name}>{d.name}</option>)}</select>
          <select className="input-field" value={serverStatus} onChange={e => setServerStatus(e.target.value)}><option value="">All Statuses</option>{(dropdowns.server_status||[]).map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</select>
          <select className="input-field" value={assetType} onChange={e => setAssetType(e.target.value)}><option value="">All Types</option>{(dropdowns.asset_types||[]).map(t=><option key={t.id} value={t.name}>{t.name}</option>)}</select>
        </div>
        {batchFilter && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-mono">
              Batch: {batchFilter.slice(0, 12)}…
              <button onClick={() => setBatchFilter('')} className="text-blue-400 hover:text-blue-600 ml-1">×</button>
            </span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[62vh]">
          <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-30">
              <tr>
                {isAdmin && <th className="table-th bg-gray-50 dark:bg-slate-800 z-40 w-8 px-2" style={{ position: 'sticky', left: 0 }}><input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} className="accent-blue-600"/></th>}
                <th className="table-th bg-gray-50 dark:bg-slate-800 z-40 border-r border-gray-200 dark:border-slate-700"
                    style={{ position: 'sticky', left: isAdmin ? 32 : 0, minWidth: COL_VM }}>VM Name</th>
                <th className="table-th bg-gray-50 dark:bg-slate-800 z-40 border-r border-gray-200 dark:border-slate-700"
                    style={{ position: 'sticky', left: (isAdmin ? 32 : 0) + COL_VM, minWidth: COL_IP }}>IP Address</th>
                {colConfig.filter(c => c.visible).map(c => (
                  <th key={c.key} className="table-th bg-gray-50 dark:bg-slate-800">{c.label}</th>
                ))}
                <th className="table-th bg-gray-50 dark:bg-slate-800 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {isAdmin && <td className="table-td bg-white dark:bg-slate-900 w-8" style={{ position: 'sticky', left: 0 }}><div className="h-4 bg-gray-100 dark:bg-slate-700 rounded" /></td>}
                    <td className="table-td bg-white dark:bg-slate-900" style={{ position: 'sticky', left: isAdmin ? 32 : 0 }}>
                      <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded" />
                    </td>
                    <td className="table-td bg-white dark:bg-slate-900" style={{ position: 'sticky', left: (isAdmin ? 32 : 0) + COL_VM }}>
                      <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded" />
                    </td>
                    {colConfig.filter(c => c.visible).map((_, j) => (
                      <td key={j} className="table-td"><div className="h-4 bg-gray-100 dark:bg-slate-700 rounded" /></td>
                    ))}
                    <td className="table-td"><div className="h-4 bg-gray-100 dark:bg-slate-700 rounded" /></td>
                  </tr>
                ))
              ) : assets.length === 0 ? (
                <tr>
                  <td colSpan={2 + colConfig.filter(c => c.visible).length + (isAdmin ? 2 : 1)} className="text-center py-16 text-gray-400">
                    <AlertTriangle size={20} className="mx-auto mb-2 text-amber-400" />
                    <p className="font-medium">No assets found</p>
                  </td>
                </tr>
              ) : assets.map(a => (
                <tr key={a.id} className={`hover:bg-blue-50/20 dark:hover:bg-blue-900/10 ${selected.has(a.id) ? 'bg-blue-50' : ''}`}>
                  {isAdmin && (
                    <td className="table-td bg-white dark:bg-slate-900 w-8 px-2" style={{ position: 'sticky', left: 0 }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} className="accent-blue-600" />
                    </td>
                  )}
                  <td className="table-td font-mono text-xs font-semibold text-blue-800 dark:text-blue-400 bg-white dark:bg-slate-900 border-r border-gray-100 dark:border-slate-700"
                      style={{ position: 'sticky', left: isAdmin ? 32 : 0, minWidth: COL_VM }}>
                    {a.vm_name
                      ? <button onClick={() => navigate(`/beijing-asset/${a.id}`)} className="hover:underline text-blue-800 dark:text-blue-400 text-left w-full">{a.vm_name}</button>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="table-td font-mono text-xs bg-white dark:bg-slate-900 border-r border-gray-100 dark:border-slate-700"
                      style={{ position: 'sticky', left: (isAdmin ? 32 : 0) + COL_VM, minWidth: COL_IP }}>
                    <button onClick={() => navigate(`/beijing-asset/${a.id}`)} className="hover:underline text-blue-700 dark:text-blue-400 font-medium">
                      {a.ip_address}
                    </button>
                  </td>
                  {colConfig.filter(c => c.visible).map(col => {
                    switch (col.key) {
                      case 'os_hostname':       return <td key={col.key} className="table-td font-mono text-xs text-gray-600 dark:text-slate-400 max-w-[140px] truncate">{a.os_hostname || '—'}</td>;
                      case 'asset_type':        return <td key={col.key} className="table-td text-xs text-gray-600 dark:text-slate-400">{a.asset_type || '—'}</td>;
                      case 'os':                return <td key={col.key} className="table-td text-xs text-gray-600 dark:text-slate-400 whitespace-nowrap">{a.os_type || '—'}</td>;
                      case 'os_version':        return <td key={col.key} className="table-td text-xs text-gray-600 dark:text-slate-400">{a.os_version || '—'}</td>;
                      case 'department':        return <td key={col.key} className="table-td text-xs text-gray-600 dark:text-slate-400">{a.department || '—'}</td>;
                      case 'location':          return <td key={col.key} className="table-td text-xs text-gray-600 dark:text-slate-400">{a.location || '—'}</td>;
                      case 'assigned_user':     return <td key={col.key} className="table-td text-xs text-gray-600 dark:text-slate-400">{a.assigned_user || '—'}</td>;
                      case 'asset_tag':         return <td key={col.key} className="table-td font-mono text-xs text-gray-600 dark:text-slate-400">{a.asset_tag || '—'}</td>;
                      case 'server_status': {
                        const ssCls = { Alive: 'bg-green-100 text-green-700', 'Powered Off': 'bg-orange-100 text-orange-700', 'Not Alive': 'bg-red-100 text-red-700' }[a.server_status] || 'bg-gray-100 text-gray-500';
                        return <td key={col.key} className="table-td whitespace-nowrap">{a.server_status ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ssCls}`}>{a.server_status}</span> : <span className="text-gray-400">—</span>}</td>;
                      }
                      case 'eol_status': {
                        const eolCls = { InSupport: 'bg-green-100 text-green-700', EOL: 'bg-orange-100 text-orange-700', Decom: 'bg-red-100 text-red-700' }[a.eol_status] || 'bg-gray-100 text-gray-500';
                        return <td key={col.key} className="table-td whitespace-nowrap">{a.eol_status ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${eolCls}`}>{a.eol_status}</span> : <span className="text-gray-400">—</span>}</td>;
                      }
                      case 'patching_type':     return <td key={col.key} className="table-td text-xs text-gray-600 dark:text-slate-400">{a.patching_type || '—'}</td>;
                      case 'server_patch_type': return <td key={col.key} className="table-td text-xs text-gray-600 dark:text-slate-400">{a.server_patch_type || '—'}</td>;
                      case 'patching_schedule': return <td key={col.key} className="table-td text-xs text-gray-600 dark:text-slate-400">{a.patching_schedule || '—'}</td>;
                      case 'me_installed':      return <td key={col.key} className="table-td text-xs whitespace-nowrap">{a.me_installed_status ? <span className="text-green-700 font-medium">✓ Yes</span> : <span className="text-gray-400">—</span>}</td>;
                      case 'tenable_installed': return <td key={col.key} className="table-td text-xs whitespace-nowrap">{a.tenable_installed_status ? <span className="text-green-700 font-medium">✓ Yes</span> : <span className="text-gray-400">—</span>}</td>;
                      case 'serial_number':     return <td key={col.key} className="table-td font-mono text-xs text-gray-500 dark:text-slate-500">{a.serial_number || '—'}</td>;
                      case 'idrac':             return <td key={col.key} className="table-td text-xs whitespace-nowrap">{a.idrac_enabled ? <span className="text-blue-700 font-mono">{a.idrac_ip || 'Enabled'}</span> : <span className="text-gray-400">—</span>}</td>;
                      case 'oem_status':        return <td key={col.key} className="table-td text-xs text-gray-600 dark:text-slate-400">{a.oem_status || '—'}</td>;
                      case 'hosted_ip':         return <td key={col.key} className="table-td font-mono text-xs text-gray-600 dark:text-slate-400">{a.hosted_ip || '—'}</td>;
                      case 'business_purpose':  return <td key={col.key} className="table-td text-xs text-gray-600 dark:text-slate-400 max-w-[160px] truncate">{a.business_purpose || '—'}</td>;
                      case 'asset_username':    return <td key={col.key} className="table-td font-mono text-xs text-gray-600 dark:text-slate-400">{a.asset_username || '—'}</td>;
                      case 'asset_password':    return <td key={col.key} className="table-td text-xs text-gray-400 tracking-widest">{a.asset_password ? '••••••••' : '—'}</td>;
                      case 'additional_remarks':return <td key={col.key} className="table-td text-xs text-gray-500 dark:text-slate-500 max-w-[180px] truncate">{a.additional_remarks || '—'}</td>;
                      default: return <td key={col.key} className="table-td text-gray-400">—</td>;
                    }
                  })}
                  <td className="table-td">
                    <div className="flex gap-1 justify-center">
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => onEdit(a)}
                            className="p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(a)}
                            className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="border-t border-gray-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-slate-800/50">
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded border border-gray-300 dark:border-slate-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-slate-700">
                <ChevronLeft size={13} />
              </button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const pg = page <= 4 ? i + 1 : page - 3 + i;
                if (pg < 1 || pg > totalPages) return null;
                return (
                  <button key={pg} onClick={() => setPage(pg)}
                    className={`px-3 py-1 text-xs rounded border ${
                      pg === page
                        ? 'bg-blue-800 text-white border-blue-800'
                        : 'border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700 dark:text-slate-300'
                    }`}>{pg}</button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded border border-gray-300 dark:border-slate-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-slate-700">
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BATCH HISTORY TAB ───────────────────────────────────────────────────────
function BatchHistoryTab({ onFilterByBatch }) {
  const [batches,  setBatches]  = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    setLoading(true);
    beijingAssetsAPI.getBatches()
      .then(r => setBatches(r.data.batches || []))
      .catch(() => toast.error('Failed to load batch history'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="card py-16 text-center text-gray-400">
      <RefreshCw size={20} className="animate-spin mx-auto mb-2" />Loading batch history…
    </div>
  );

  if (!batches.length) return (
    <div className="card py-16 text-center text-gray-400">
      <AlertTriangle size={20} className="mx-auto mb-2 text-amber-400" />
      No import batches found. Import assets to see batch history.
    </div>
  );

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-3 text-left font-semibold text-gray-600">Batch ID</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">Import Source</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">Total Assets</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">Migrated</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">Imported At</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">Submitted By</th>
            <th className="px-4 py-3 w-24 text-center font-semibold text-gray-600">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {batches.map(b => (
            <tr key={b.import_batch_id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-2.5 font-mono text-xs text-blue-700">{b.import_batch_id}</td>
              <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[200px] truncate">{b.import_source || '—'}</td>
              <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{b.total_assets}</td>
              <td className="px-4 py-2.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.migrated > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {b.migrated}
                </span>
              </td>
              <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                {b.imported_at ? new Date(b.imported_at).toLocaleString() : '—'}
              </td>
              <td className="px-4 py-2.5 text-xs text-gray-600">{b.submitted_by || '—'}</td>
              <td className="px-4 py-2.5 text-center">
                <button
                  onClick={() => onFilterByBatch(b.import_batch_id)}
                  className="px-2 py-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-medium transition-colors"
                >
                  View Assets
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── COMBINED PAGE ────────────────────────────────────────────────────────────
export default function BeijingAssetCombinedPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'list';
  const [activeTab,   setActiveTab]   = useState(requestedTab);
  const [editAsset,   setEditAsset]   = useState(null);
  const [refreshKey,  setRefreshKey]  = useState(0);
  const [listBatch,   setListBatch]   = useState('');

  const switchTab = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const handleEdit = (asset) => {
    setEditAsset(asset);
    switchTab('add');
  };

  const handleSaved = () => {
    setEditAsset(null);
    setRefreshKey(k => k + 1);
    switchTab('list');
  };

  const handleFilterByBatch = (batchId) => {
    setListBatch(batchId);
    switchTab('list');
  };

  const TABS = [
    { key: 'add',     label: 'Add New Asset',      icon: Plus    },
    { key: 'list',    label: 'Beijing Asset List',  icon: List    },
  ];

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Beijing Asset List</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
          Standalone Beijing asset inventory — add, import, and manage assets independently
        </p>
      </div>

      <div className="flex gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl mb-6 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key
                ? 'bg-white dark:bg-slate-700 text-blue-800 dark:text-blue-300 shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'add' && (
        <AddBeijingTab
          editAsset={editAsset}
          onSaved={handleSaved}
          onClearEdit={() => setEditAsset(null)}
        />
      )}
      {activeTab === 'list' && (
        <BeijingListTab
          key={listBatch}
          onEdit={handleEdit}
          refreshKey={refreshKey}
          initialBatchFilter={listBatch}
        />
      )}
    </div>
  );
}
