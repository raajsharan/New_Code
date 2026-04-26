import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { beijingAssetsAPI, dropdownsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDeleteConfirm } from '../context/DeleteConfirmContext';
import toast from 'react-hot-toast';
import {
  PlusCircle, RotateCcw, Download, List, Plus,
  Search, Edit2, Trash2, ChevronLeft, ChevronRight,
  RefreshCw, CheckCircle, AlertTriangle, Info, ArrowRight,
} from 'lucide-react';

const BEIJING_INIT = {
  vm_name: '', os_hostname: '', ip_address: '', asset_type: '',
  os_type: '', os_version: '', assigned_user: '', department: '',
  location: '', business_purpose: '', server_status: '',
  serial_number: '', eol_status: '', asset_tag: '', additional_remarks: '',
};

const EOL_OPTIONS     = ['', 'InSupport', 'EOL', 'Decom', 'Not Applicable'];
const SVRSTATUS_OPTS  = ['', 'Alive', 'Powered Off', 'Not Alive'];

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

function MigratedBadge({ migrated }) {
  return migrated
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle size={10} />Migrated</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><Info size={10} />Pending</span>;
}

// ─── ADD / EDIT TAB ───────────────────────────────────────────────────────────
function AddBeijingTab({ onSaved, editAsset, onClearEdit }) {
  const { isAdmin } = useAuth();
  const [form, setForm]       = useState(BEIJING_INIT);
  const [loading, setLoading] = useState(false);
  const [dupState, setDupState] = useState({ ip: null });
  const [checking, setChecking] = useState({ ip: false });
  const ipTimer = useRef(null);

  useEffect(() => {
    if (editAsset) setForm({ ...BEIJING_INIT, ...editAsset });
    else           setForm(BEIJING_INIT);
  }, [editAsset]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

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
    if (dupState.ip)                  { toast.error('Fix duplicate IP'); return; }
    if (!form.ip_address.trim())      { toast.error('IP address is required'); return; }
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
                className={`input-field ${dupState.ip ? 'border-red-400' : dupState.ip === false ? 'border-green-400' : ''}`}
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
              <input className="input-field" value={form.asset_type} onChange={e => set('asset_type', e.target.value)} placeholder="VM / Physical / Container" />
            </Field>
            <Field label="OS Type">
              <input className="input-field" value={form.os_type} onChange={e => set('os_type', e.target.value)} placeholder="Windows / Linux / ESXi" />
            </Field>
            <Field label="OS Version">
              <input className="input-field" value={form.os_version} onChange={e => set('os_version', e.target.value)} placeholder="Server 2022 / RHEL 9" />
            </Field>

            <SectionTitle title="Ownership" />
            <Field label="Assigned User">
              <input className="input-field" value={form.assigned_user} onChange={e => set('assigned_user', e.target.value)} placeholder="john.doe" />
            </Field>
            <Field label="Department">
              <input className="input-field" value={form.department} onChange={e => set('department', e.target.value)} placeholder="IT / DevOps" />
            </Field>
            <Field label="Location">
              <input className="input-field" value={form.location} onChange={e => set('location', e.target.value)} placeholder="BJS / DC1" />
            </Field>
            <Field label="Business Purpose">
              <input className="input-field" value={form.business_purpose} onChange={e => set('business_purpose', e.target.value)} placeholder="Web server" />
            </Field>
            <Field label="Asset Tag">
              <input className="input-field" value={form.asset_tag} onChange={e => set('asset_tag', e.target.value)} />
            </Field>
            <Field label="Serial Number">
              <input className="input-field" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
            </Field>

            <SectionTitle title="Status" />
            <Field label="Server Status">
              <select className="input-field" value={form.server_status} onChange={e => set('server_status', e.target.value)}>
                {SVRSTATUS_OPTS.map(o => <option key={o} value={o}>{o || 'Select...'}</option>)}
              </select>
            </Field>
            <Field label="EOL Status">
              <select className="input-field" value={form.eol_status} onChange={e => set('eol_status', e.target.value)}>
                {EOL_OPTIONS.map(o => <option key={o} value={o}>{o || 'Select...'}</option>)}
              </select>
            </Field>

            <div className="col-span-full">
              <Field label="Additional Remarks">
                <textarea className="input-field" rows={3} value={form.additional_remarks} onChange={e => set('additional_remarks', e.target.value)} placeholder="Any notes..." />
              </Field>
            </div>

          </div>
        </div>

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

function BeijingListTab({ onEdit, refreshKey }) {
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
  const [migrating,    setMigrating]    = useState(null);
  const [dropdowns,    setDropdowns]    = useState({});

  useEffect(() => {
    dropdownsAPI.getAll().then(r => setDropdowns(r.data)).catch(() => {});
  }, []);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await beijingAssetsAPI.getAll({
        page, limit, search,
        department:    department    || undefined,
        location:      location      || undefined,
        asset_type:    assetType     || undefined,
        server_status: serverStatus  || undefined,
      });
      setAssets(res.data.assets);
      setTotal(res.data.total);
    } catch { toast.error('Failed to load Beijing Asset List'); }
    finally { setLoading(false); }
  }, [page, limit, search, department, location, assetType, serverStatus]);

  useEffect(() => { setPage(1); }, [search, department, location, assetType, serverStatus]); // eslint-disable-line
  useEffect(() => { fetchAssets(); }, [fetchAssets, refreshKey]);

  const handleDelete = (a) => {
    requestDelete(a.vm_name || a.os_hostname || 'this asset', async () => {
      try {
        await beijingAssetsAPI.remove(a.id);
        toast.success('Deleted');
        fetchAssets();
      } catch (err) { toast.error(err.response?.data?.error || 'Delete failed'); }
    });
  };

  const handleMigrate = async (asset) => {
    // eslint-disable-next-line no-alert
    const comment = window.prompt(
      `Migrate "${asset.vm_name || asset.ip_address}" to Asset List?\n\nOptional migration note:`
    );
    if (comment === null) return;
    setMigrating(asset.id);
    try {
      const r = await beijingAssetsAPI.migrate([asset.id], comment);
      if (r.data.migrated?.length) {
        toast.success('Asset migrated to Asset List');
        fetchAssets();
      } else {
        toast.error(r.data.failed?.[0]?.reason || 'Migration failed');
      }
    } catch (err) { toast.error(err.response?.data?.error || 'Migration failed'); }
    finally { setMigrating(null); }
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
        <div className="flex gap-2">
          <button onClick={handleExport} disabled={exporting} className="btn-secondary text-xs">
            <Download size={13} />{exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button onClick={fetchAssets} className="btn-secondary text-xs">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input-field pl-8"
              placeholder="VM name, hostname, IP, dept…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input-field py-1 text-xs" value={department} onChange={e => setDepartment(e.target.value)}>
            <option value="">All Departments</option>
            {(dropdowns.departments || []).map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          <select className="input-field py-1 text-xs" value={location} onChange={e => setLocation(e.target.value)}>
            <option value="">All Locations</option>
            {(dropdowns.locations || []).map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
          </select>
          <select className="input-field py-1 text-xs" value={assetType} onChange={e => setAssetType(e.target.value)}>
            <option value="">All Asset Types</option>
            {(dropdowns.asset_types || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <select className="input-field py-1 text-xs" value={serverStatus} onChange={e => setServerStatus(e.target.value)}>
            <option value="">All Server Status</option>
            {(dropdowns.server_status || []).map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
          {(department || location || assetType || serverStatus) && (
            <button
              onClick={() => { setDepartment(''); setLocation(''); setAssetType(''); setServerStatus(''); }}
              className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[62vh]">
          <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-30">
              <tr>
                <th className="table-th bg-gray-50 dark:bg-slate-800 z-40 border-r border-gray-200 dark:border-slate-700"
                    style={{ position: 'sticky', left: 0, minWidth: COL_VM }}>VM Name</th>
                <th className="table-th bg-gray-50 dark:bg-slate-800 z-40 border-r border-gray-200 dark:border-slate-700"
                    style={{ position: 'sticky', left: COL_VM, minWidth: COL_IP }}>IP Address</th>
                <th className="table-th bg-gray-50 dark:bg-slate-800">Hostname</th>
                <th className="table-th bg-gray-50 dark:bg-slate-800">Asset Type</th>
                <th className="table-th bg-gray-50 dark:bg-slate-800">OS</th>
                <th className="table-th bg-gray-50 dark:bg-slate-800">Department</th>
                <th className="table-th bg-gray-50 dark:bg-slate-800">Location</th>
                <th className="table-th bg-gray-50 dark:bg-slate-800">Serial No.</th>
                <th className="table-th bg-gray-50 dark:bg-slate-800">Status</th>
                <th className="table-th bg-gray-50 dark:bg-slate-800">Migrated By</th>
                <th className="table-th bg-gray-50 dark:bg-slate-800 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="table-td bg-white dark:bg-slate-900" style={{ position: 'sticky', left: 0 }}>
                      <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded" />
                    </td>
                    <td className="table-td bg-white dark:bg-slate-900" style={{ position: 'sticky', left: COL_VM }}>
                      <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded" />
                    </td>
                    {Array(9).fill(0).map((_, j) => (
                      <td key={j} className="table-td"><div className="h-4 bg-gray-100 dark:bg-slate-700 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : assets.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-16 text-gray-400">
                    <AlertTriangle size={20} className="mx-auto mb-2 text-amber-400" />
                    <p className="font-medium">No assets found</p>
                  </td>
                </tr>
              ) : assets.map(a => (
                <tr key={a.id} className={`hover:bg-blue-50/20 dark:hover:bg-blue-900/10 ${a.is_migrated ? 'opacity-60' : ''}`}>
                  <td className="table-td font-mono text-xs font-semibold text-blue-800 dark:text-blue-400 bg-white dark:bg-slate-900 border-r border-gray-100 dark:border-slate-700"
                      style={{ position: 'sticky', left: 0, minWidth: COL_VM }}>
                    {a.vm_name
                      ? <button onClick={() => navigate(`/beijing-asset/${a.id}`)} className="hover:underline text-blue-800 dark:text-blue-400 text-left w-full">{a.vm_name}</button>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="table-td font-mono text-xs bg-white dark:bg-slate-900 border-r border-gray-100 dark:border-slate-700"
                      style={{ position: 'sticky', left: COL_VM, minWidth: COL_IP }}>
                    <button onClick={() => navigate(`/beijing-asset/${a.id}`)} className="hover:underline text-blue-700 dark:text-blue-400 font-medium">
                      {a.ip_address}
                    </button>
                  </td>
                  <td className="table-td font-mono text-xs text-gray-600 dark:text-slate-400 max-w-[140px] truncate">{a.os_hostname || '—'}</td>
                  <td className="table-td text-xs text-gray-600 dark:text-slate-400">{a.asset_type || '—'}</td>
                  <td className="table-td text-xs text-gray-600 dark:text-slate-400 whitespace-nowrap">{[a.os_type, a.os_version].filter(Boolean).join(' ') || '—'}</td>
                  <td className="table-td text-xs text-gray-600 dark:text-slate-400">{a.department || '—'}</td>
                  <td className="table-td text-xs text-gray-600 dark:text-slate-400">{a.location || '—'}</td>
                  <td className="table-td font-mono text-xs text-gray-500 dark:text-slate-500">{a.serial_number || '—'}</td>
                  <td className="table-td whitespace-nowrap"><MigratedBadge migrated={a.is_migrated} /></td>
                  <td className="table-td text-xs text-gray-500 dark:text-slate-500">
                    {a.is_migrated ? (
                      <div>
                        <p className="font-medium text-gray-700 dark:text-slate-300">{a.migrated_by}</p>
                        <p className="text-gray-400">{a.migrated_at ? new Date(a.migrated_at).toLocaleDateString() : ''}</p>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="table-td">
                    <div className="flex gap-1 justify-center">
                      {isAdmin && !a.is_migrated && (
                        <>
                          <button
                            onClick={() => onEdit(a)}
                            className="p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleMigrate(a)}
                            disabled={migrating === a.id}
                            className="p-1.5 text-violet-600 hover:bg-violet-100 dark:hover:bg-violet-900/30 rounded transition-colors disabled:opacity-40"
                            title="Migrate to Asset List"
                          >
                            {migrating === a.id ? <RefreshCw size={13} className="animate-spin" /> : <ArrowRight size={13} />}
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

// ─── COMBINED PAGE ────────────────────────────────────────────────────────────
export default function BeijingAssetCombinedPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'list';
  const [activeTab,  setActiveTab]  = useState(requestedTab);
  const [editAsset,  setEditAsset]  = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const TABS = [
    { key: 'add',  label: 'Add New Asset',      icon: Plus },
    { key: 'list', label: 'Beijing Asset List',  icon: List },
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
          onEdit={handleEdit}
          refreshKey={refreshKey}
        />
      )}
    </div>
  );
}
