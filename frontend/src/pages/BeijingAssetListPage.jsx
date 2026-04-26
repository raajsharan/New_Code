import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { beijingAssetsAPI, dropdownsAPI, settingsAPI, savedViewsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  Download, Search, Trash2, ChevronLeft, ChevronRight,
  RefreshCw, CheckCircle, AlertTriangle, Info, Filter,
  Eye, EyeOff, Bookmark, BookmarkCheck, X, Plus,
} from 'lucide-react';

const ROW_LIMIT_OPTS = [15, 30, 50, 80, 100];

const BEIJING_COL_DEFAULTS = [
  { key: 'ip_address',    label: 'IP Address',    visible: true  },
  { key: 'vm_name',       label: 'VM Name',       visible: true  },
  { key: 'os_hostname',   label: 'Hostname',      visible: true  },
  { key: 'asset_type',    label: 'Asset Type',    visible: true  },
  { key: 'os',            label: 'OS',            visible: true  },
  { key: 'department',    label: 'Department',    visible: true  },
  { key: 'location',      label: 'Location',      visible: true  },
  { key: 'serial_number', label: 'Serial No.',    visible: true  },
  { key: 'import_source', label: 'Import Source', visible: true  },
  { key: 'status',        label: 'Status',        visible: true  },
  { key: 'migrated_by',   label: 'Migrated By',   visible: true  },
];

function mergeColConfig(saved) {
  if (!saved || !saved.length) return BEIJING_COL_DEFAULTS;
  const savedMap = Object.fromEntries(saved.map((s, i) => [s.key, { ...s, order: i }]));
  const merged = BEIJING_COL_DEFAULTS.map((d, i) => ({
    ...d,
    visible: savedMap[d.key] !== undefined ? savedMap[d.key].visible : d.visible,
    order: savedMap[d.key] !== undefined ? savedMap[d.key].order : 999 + i,
  }));
  return merged.sort((a, b) => a.order - b.order);
}

function Badge({ migrated }) {
  return migrated
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><CheckCircle size={10} />Migrated</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"><Info size={10} />Pending</span>;
}

function Pagination({ page, total, limit, onChange }) {
  const pages = Math.ceil(total / limit) || 1;
  return (
    <div className="flex items-center gap-2 text-sm text-gray-600">
      <span>{total} record{total !== 1 ? 's' : ''}</span>
      <button onClick={() => onChange(page - 1)} disabled={page <= 1}
        className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
      <span className="font-medium">{page} / {pages}</span>
      <button onClick={() => onChange(page + 1)} disabled={page >= pages}
        className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
    </div>
  );
}

export default function BeijingAssetListPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [assets,       setAssets]       = useState([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [limit,        setLimit]        = useState(15);
  const [loading,      setLoading]      = useState(false);
  const [search,       setSearch]       = useState('');
  const [status,       setStatus]       = useState('');
  const [department,   setDepartment]   = useState('');
  const [location,     setLocation]     = useState('');
  const [assetType,    setAssetType]    = useState('');
  const [serverStatus, setServerStatus] = useState('');
  const [exporting,    setExporting]    = useState(false);
  const [dropdowns,    setDropdowns]    = useState({});

  // Column visibility
  const [colConfig,       setColConfig]       = useState(BEIJING_COL_DEFAULTS);
  const [showColMenu,     setShowColMenu]      = useState(false);
  const colMenuRef = useRef(null);

  // Bulk delete
  const [selected,     setSelected]     = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Saved filter presets
  const [savedViews,       setSavedViews]       = useState([]);
  const [showPresetMenu,   setShowPresetMenu]    = useState(false);
  const [newPresetName,    setNewPresetName]     = useState('');
  const [savingPreset,     setSavingPreset]      = useState(false);
  const presetMenuRef = useRef(null);

  useEffect(() => {
    dropdownsAPI.getAll().then(r => setDropdowns(r.data)).catch(() => {});
    settingsAPI.getColumnConfig('beijing').then(r => setColConfig(mergeColConfig(r.data))).catch(() => {});
    savedViewsAPI.getAll('beijing').then(r => setSavedViews(r.data.views || [])).catch(() => {});
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setShowColMenu(false);
      if (presetMenuRef.current && !presetMenuRef.current.contains(e.target)) setShowPresetMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchAssets = useCallback(async (pg = page) => {
    setLoading(true);
    try {
      const res = await beijingAssetsAPI.getAll({
        page: pg, limit, search, status,
        department:    department    || undefined,
        location:      location      || undefined,
        asset_type:    assetType     || undefined,
        server_status: serverStatus  || undefined,
      });
      setAssets(res.data.assets);
      setTotal(res.data.total);
      setSelected(new Set());
    } catch {
      toast.error('Failed to load Beijing Asset List');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, status, department, location, assetType, serverStatus]);

  useEffect(() => { fetchAssets(1); setPage(1); }, [search, status, limit, department, location, assetType, serverStatus]); // eslint-disable-line
  useEffect(() => { fetchAssets(page); }, [page]); // eslint-disable-line

  async function handleDelete(id) {
    if (!window.confirm('Delete this asset from Beijing Asset List?')) return;
    try {
      await beijingAssetsAPI.remove(id);
      toast.success('Deleted');
      fetchAssets(page);
    } catch {
      toast.error('Delete failed');
    }
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`Permanently delete ${ids.length} selected asset${ids.length > 1 ? 's' : ''}? They will be moved to Deleted Items.`)) return;
    setBulkDeleting(true);
    try {
      const res = await beijingAssetsAPI.bulkDelete(ids);
      toast.success(`Deleted ${res.data.deleted} asset${res.data.deleted !== 1 ? 's' : ''}`);
      fetchAssets(page);
    } catch {
      toast.error('Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await beijingAssetsAPI.exportCSV({
        status,
        department:    department    || undefined,
        location:      location      || undefined,
        asset_type:    assetType     || undefined,
        server_status: serverStatus  || undefined,
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = `beijing-assets-${Date.now()}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  }

  function toggleColumn(key) {
    const next = colConfig.map(c => c.key === key ? { ...c, visible: !c.visible } : c);
    setColConfig(next);
    settingsAPI.saveColumnConfig('beijing', next).catch(() => {});
  }

  async function savePreset() {
    if (!newPresetName.trim()) return;
    setSavingPreset(true);
    try {
      const config_json = { search, status, department, location, assetType, serverStatus };
      const r = await savedViewsAPI.create({ scope: 'beijing', name: newPresetName.trim(), config_json });
      setSavedViews(prev => [r.data, ...prev]);
      setNewPresetName('');
      toast.success('Preset saved');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Save failed');
    } finally {
      setSavingPreset(false);
    }
  }

  function applyPreset(view) {
    const c = view.config_json || {};
    setSearch(c.search || '');
    setStatus(c.status || '');
    setDepartment(c.department || '');
    setLocation(c.location || '');
    setAssetType(c.assetType || '');
    setServerStatus(c.serverStatus || '');
    setShowPresetMenu(false);
    toast.success(`Applied: ${view.name}`);
  }

  async function deletePreset(e, id) {
    e.stopPropagation();
    try {
      await savedViewsAPI.remove(id);
      setSavedViews(prev => prev.filter(v => v.id !== id));
    } catch {
      toast.error('Delete failed');
    }
  }

  const hasActiveFilters = !!(department || location || assetType || serverStatus || status);
  const visibleCols = colConfig.filter(c => c.visible);
  const allSelected = assets.length > 0 && assets.every(a => selected.has(a.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(assets.map(a => a.id)));
    }
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const colSpan = visibleCols.length + 1 + (isAdmin ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass-panel px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Beijing Asset List</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Standalone Beijing asset inventory — add, import, and manage assets independently
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Bulk delete */}
          {isAdmin && selected.size > 0 && (
            <button onClick={handleBulkDelete} disabled={bulkDeleting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50">
              <Trash2 size={15} />
              {bulkDeleting ? 'Deleting…' : `Delete ${selected.size}`}
            </button>
          )}
          {/* Column visibility */}
          <div className="relative" ref={colMenuRef}>
            <button onClick={() => setShowColMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">
              <Eye size={15} /> Columns
            </button>
            {showColMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 p-3 min-w-[160px]">
                {colConfig.map(col => (
                  <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer hover:text-gray-900 text-sm text-gray-700">
                    <input type="checkbox" checked={col.visible} onChange={() => toggleColumn(col.key)} className="accent-blue-600" />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          {/* Saved presets */}
          <div className="relative" ref={presetMenuRef}>
            <button onClick={() => setShowPresetMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">
              <Bookmark size={15} /> Presets
            </button>
            {showPresetMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 p-3 min-w-[220px]">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Save Current Filters</p>
                <div className="flex gap-1 mb-3">
                  <input
                    className="flex-1 text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Preset name…"
                    value={newPresetName}
                    onChange={e => setNewPresetName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && savePreset()}
                  />
                  <button onClick={savePreset} disabled={savingPreset || !newPresetName.trim()}
                    className="px-2 py-1 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 disabled:opacity-50">
                    <Plus size={12} />
                  </button>
                </div>
                {savedViews.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">No saved presets</p>
                ) : (
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Load Preset</p>
                    {savedViews.map(v => (
                      <div key={v.id} className="flex items-center justify-between gap-1 rounded-lg px-2 py-1.5 hover:bg-gray-50 cursor-pointer" onClick={() => applyPreset(v)}>
                        <span className="text-sm text-gray-700 truncate flex-1">{v.name}</span>
                        <button onClick={e => deletePreset(e, v.id)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">Rows</label>
            <select
              className="py-1 px-2 text-xs border border-gray-300 rounded-lg"
              value={limit}
              onChange={e => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}
            >
              {ROW_LIMIT_OPTS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50">
            <Download size={15} />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button onClick={() => fetchAssets(page)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-panel px-4 py-3 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search IP, name, hostname, dept…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={14} className="text-gray-400" />
            {[['', 'All'], ['pending', 'Pending'], ['migrated', 'Migrated']].map(([val, lbl]) => (
              <button key={val} onClick={() => setStatus(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  status === val ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="py-1.5 px-3 text-xs border border-gray-300 rounded-lg" value={department} onChange={e => setDepartment(e.target.value)}>
            <option value="">All Departments</option>
            {(dropdowns.departments || []).map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          <select className="py-1.5 px-3 text-xs border border-gray-300 rounded-lg" value={location} onChange={e => setLocation(e.target.value)}>
            <option value="">All Locations</option>
            {(dropdowns.locations || []).map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
          </select>
          <select className="py-1.5 px-3 text-xs border border-gray-300 rounded-lg" value={assetType} onChange={e => setAssetType(e.target.value)}>
            <option value="">All Asset Types</option>
            {(dropdowns.asset_types || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <select className="py-1.5 px-3 text-xs border border-gray-300 rounded-lg" value={serverStatus} onChange={e => setServerStatus(e.target.value)}>
            <option value="">All Server Status</option>
            {(dropdowns.server_status || []).map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
          {hasActiveFilters && (
            <button
              onClick={() => { setStatus(''); setDepartment(''); setLocation(''); setAssetType(''); setServerStatus(''); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {isAdmin && (
                  <th className="px-3 py-3 w-10">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="accent-blue-600" />
                  </th>
                )}
                {visibleCols.map(col => (
                  <th key={col.key} className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{col.label}</th>
                ))}
                {isAdmin && <th className="px-3 py-3 w-16"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={colSpan} className="py-16 text-center text-gray-400">
                  <RefreshCw size={20} className="animate-spin mx-auto mb-2" />Loading…
                </td></tr>
              ) : assets.length === 0 ? (
                <tr><td colSpan={colSpan} className="py-16 text-center text-gray-400">
                  <AlertTriangle size={20} className="mx-auto mb-2 text-amber-400" />
                  No assets found. Adjust filters or import via Beijing Asset Import.
                </td></tr>
              ) : assets.map(a => (
                <tr
                  key={a.id}
                  className={`hover:bg-gray-50 transition-colors cursor-pointer ${a.is_migrated ? 'opacity-60' : ''} ${selected.has(a.id) ? 'bg-blue-50' : ''}`}
                  onClick={() => navigate(`/beijing-asset/${a.id}`)}
                >
                  {isAdmin && (
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} className="accent-blue-600" />
                    </td>
                  )}
                  {visibleCols.map(col => {
                    switch (col.key) {
                      case 'ip_address':    return <td key={col.key} className="px-3 py-2.5 font-mono text-xs text-gray-800 whitespace-nowrap">{a.ip_address}</td>;
                      case 'vm_name':       return <td key={col.key} className="px-3 py-2.5 text-gray-700 max-w-[140px] truncate">{a.vm_name || '—'}</td>;
                      case 'os_hostname':   return <td key={col.key} className="px-3 py-2.5 text-gray-600 max-w-[140px] truncate">{a.os_hostname || '—'}</td>;
                      case 'asset_type':    return <td key={col.key} className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{a.asset_type || '—'}</td>;
                      case 'os':            return <td key={col.key} className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{[a.os_type, a.os_version].filter(Boolean).join(' ') || '—'}</td>;
                      case 'department':    return <td key={col.key} className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{a.department || '—'}</td>;
                      case 'location':      return <td key={col.key} className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{a.location || '—'}</td>;
                      case 'serial_number': return <td key={col.key} className="px-3 py-2.5 text-gray-500 font-mono text-xs">{a.serial_number || '—'}</td>;
                      case 'import_source': return <td key={col.key} className="px-3 py-2.5 text-gray-500 text-xs max-w-[140px] truncate" title={a.import_source}>{a.import_source || '—'}</td>;
                      case 'status':        return <td key={col.key} className="px-3 py-2.5 whitespace-nowrap"><Badge migrated={a.is_migrated} /></td>;
                      case 'migrated_by':   return (
                        <td key={col.key} className="px-3 py-2.5 text-xs text-gray-500">
                          {a.is_migrated ? (
                            <div>
                              <p className="font-medium text-gray-700">{a.migrated_by}</p>
                              <p className="text-gray-400">{a.migrated_at ? new Date(a.migrated_at).toLocaleDateString() : ''}</p>
                            </div>
                          ) : '—'}
                        </td>
                      );
                      default: return <td key={col.key} className="px-3 py-2.5 text-gray-600">—</td>;
                    }
                  })}
                  {isAdmin && (
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      {!a.is_migrated && (
                        <button onClick={() => handleDelete(a.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
          <Pagination page={page} total={total} limit={limit} onChange={setPage} />
        </div>
      </div>
    </div>
  );
}
