import React, { useState, useEffect, useCallback, useRef } from 'react';
import { beijingAssetsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  Upload, Download, Search, Trash2, ChevronLeft, ChevronRight,
  RefreshCw, ArrowRightCircle, CheckSquare, Square, FileUp,
  AlertTriangle, CheckCircle, XCircle, Info, Filter
} from 'lucide-react';

const STATUS_LABELS = { '': 'All', pending: 'Pending', migrated: 'Migrated' };

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

// ── Import Result Panel ──────────────────────────────────────────────────────
function ImportResult({ result, onClose }) {
  if (!result) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-gray-800">Import Complete</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XCircle size={16} /></button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{result.added}</p>
          <p className="text-xs text-green-600 mt-0.5">Added</p>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{result.skipped}</p>
          <p className="text-xs text-amber-600 mt-0.5">Skipped (exist in Asset/Ext. List)</p>
        </div>
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{result.already_in_beijing}</p>
          <p className="text-xs text-blue-600 mt-0.5">Already in Beijing List</p>
        </div>
      </div>
      {result.skipped_details?.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-amber-600 font-medium">
            {result.skipped_details.length} skipped IP{result.skipped_details.length !== 1 ? 's' : ''} (click to expand)
          </summary>
          <div className="mt-2 max-h-40 overflow-y-auto space-y-1 pl-2">
            {result.skipped_details.map((s, i) => (
              <p key={i} className="text-gray-500"><span className="font-mono text-gray-700">{s.ip}</span> — {s.reason}</p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Migrate Modal ────────────────────────────────────────────────────────────
function MigrateModal({ selected, onConfirm, onClose, loading }) {
  const [comment, setComment] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <ArrowRightCircle size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Migrate to Asset List</p>
            <p className="text-sm text-gray-500">{selected.length} asset{selected.length !== 1 ? 's' : ''} selected</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Migration Comment <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="e.g. Verified by network team, approved for production inventory..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <p className="text-xs text-gray-400 mt-1">
            This comment, along with the timestamp and your username, will be recorded on the migrated asset.
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={() => onConfirm(comment)} disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <ArrowRightCircle size={14} />}
            Migrate
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function BeijingAssetListPage() {
  const { isAdmin } = useAuth();
  const fileRef = useRef();

  const [assets,   setAssets]   = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState('');
  const [status,   setStatus]   = useState('');
  const [selected, setSelected] = useState(new Set());

  const [activeTab,      setActiveTab]      = useState('list');
  const [importFile,     setImportFile]     = useState(null);
  const [importing,      setImporting]      = useState(false);
  const [importResult,   setImportResult]   = useState(null);
  const [migrateOpen,    setMigrateOpen]    = useState(false);
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [exporting,      setExporting]      = useState(false);

  const LIMIT = 15;

  const fetchAssets = useCallback(async (pg = page) => {
    setLoading(true);
    try {
      const res = await beijingAssetsAPI.getAll({ page: pg, limit: LIMIT, search, status });
      setAssets(res.data.assets);
      setTotal(res.data.total);
      setSelected(new Set());
    } catch {
      toast.error('Failed to load Beijing Asset List');
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { fetchAssets(1); setPage(1); }, [search, status]); // eslint-disable-line
  useEffect(() => { fetchAssets(page); }, [page]);                      // eslint-disable-line

  // ── Selection helpers ──────────────────────────────────────────────────────
  const pendingAssets = assets.filter(a => !a.is_migrated);
  const allPendingSelected = pendingAssets.length > 0 && pendingAssets.every(a => selected.has(a.id));

  function toggleSelectAll() {
    if (allPendingSelected) setSelected(new Set());
    else setSelected(new Set(pendingAssets.map(a => a.id)));
  }

  function toggleOne(id, migrated) {
    if (migrated) return;
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  // ── Import ─────────────────────────────────────────────────────────────────
  async function handleImport() {
    if (!importFile) return toast.error('Please select a file');
    setImporting(true);
    try {
      const res = await beijingAssetsAPI.importFile(importFile);
      setImportResult(res.data);
      toast.success(`Import done — ${res.data.added} asset(s) added`);
      if (res.data.added > 0) fetchAssets(1);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
      setImportFile(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // ── Migrate ────────────────────────────────────────────────────────────────
  async function handleMigrate(comment) {
    setMigrateLoading(true);
    try {
      const res = await beijingAssetsAPI.migrate([...selected], comment);
      const { migrated, failed } = res.data;
      if (migrated.length) toast.success(`${migrated.length} asset(s) migrated to Asset List`);
      if (failed.length)   toast.error(`${failed.length} asset(s) failed — check console`);
      setMigrateOpen(false);
      fetchAssets(page);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Migration failed');
    } finally {
      setMigrateLoading(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
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

  // ── Export ─────────────────────────────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    try {
      const res = await beijingAssetsAPI.exportCSV({ status });
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass-panel px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Beijing Asset List</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Assets imported from Excel that are not present in Asset List or Ext. Asset List
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && selected.size > 0 && (
            <button onClick={() => setMigrateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
              <ArrowRightCircle size={15} />
              Migrate Selected ({selected.size})
            </button>
          )}
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 px-1">
        {['list', 'import'].map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
              activeTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}>
            {t === 'list' ? 'Asset List' : 'Import from Excel'}
          </button>
        ))}
      </div>

      {/* ── LIST TAB ────────────────────────────────────────────────────────── */}
      {activeTab === 'list' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="glass-panel px-4 py-3 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search IP, name, hostname, dept…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-gray-400" />
              {Object.entries(STATUS_LABELS).map(([val, lbl]) => (
                <button key={val} onClick={() => setStatus(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    status === val ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {lbl}
                </button>
              ))}
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
                        <button onClick={toggleSelectAll} className="text-gray-400 hover:text-blue-600">
                          {allPendingSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                        </button>
                      </th>
                    )}
                    <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">IP Address</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">VM Name</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Hostname</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Asset Type</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">OS</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Department</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Location</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Serial No.</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Import Source</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Status</th>
                    <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Migrated By</th>
                    {isAdmin && <th className="px-3 py-3 w-16"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={isAdmin ? 13 : 11} className="py-16 text-center text-gray-400">
                      <RefreshCw size={20} className="animate-spin mx-auto mb-2" />Loading…
                    </td></tr>
                  ) : assets.length === 0 ? (
                    <tr><td colSpan={isAdmin ? 13 : 11} className="py-16 text-center text-gray-400">
                      <AlertTriangle size={20} className="mx-auto mb-2 text-amber-400" />
                      No assets found. Import an Excel file to get started.
                    </td></tr>
                  ) : assets.map(a => (
                    <tr key={a.id}
                      className={`hover:bg-gray-50 transition-colors ${a.is_migrated ? 'opacity-60' : ''} ${selected.has(a.id) ? 'bg-blue-50' : ''}`}>
                      {isAdmin && (
                        <td className="px-3 py-2.5">
                          <button onClick={() => toggleOne(a.id, a.is_migrated)}
                            className={a.is_migrated ? 'cursor-not-allowed text-gray-300' : 'text-gray-400 hover:text-blue-600'}>
                            {selected.has(a.id) ? <CheckSquare size={15} className="text-blue-600" /> : <Square size={15} />}
                          </button>
                        </td>
                      )}
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-800 whitespace-nowrap">{a.ip_address}</td>
                      <td className="px-3 py-2.5 text-gray-700 max-w-[140px] truncate">{a.vm_name || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 max-w-[140px] truncate">{a.os_hostname || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{a.asset_type || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{[a.os_type, a.os_version].filter(Boolean).join(' ') || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{a.department || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{a.location || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-500 font-mono text-xs">{a.serial_number || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs max-w-[140px] truncate" title={a.import_source}>{a.import_source || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap"><Badge migrated={a.is_migrated} /></td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {a.is_migrated ? (
                          <div>
                            <p className="font-medium text-gray-700">{a.migrated_by}</p>
                            <p className="text-gray-400">{a.migrated_at ? new Date(a.migrated_at).toLocaleDateString() : ''}</p>
                            {a.migration_comment && <p className="text-gray-400 italic truncate max-w-[120px]" title={a.migration_comment}>{a.migration_comment}</p>}
                          </div>
                        ) : '—'}
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-2.5">
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
            <div className="px-4 py-3 border-t border-gray-100 flex justify-between items-center">
              {selected.size > 0 && isAdmin && (
                <p className="text-xs text-blue-600 font-medium">{selected.size} asset{selected.size !== 1 ? 's' : ''} selected</p>
              )}
              {selected.size === 0 && <div />}
              <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
            </div>
          </div>
        </div>
      )}

      {/* ── IMPORT TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'import' && (
        <div className="max-w-xl space-y-4">
          <div className="glass-panel p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-800">Import from Excel / CSV</h2>
              <p className="text-sm text-gray-500 mt-1">
                Upload an Excel (.xlsx) or CSV file. Only IPs <strong>not found</strong> in the
                Asset List or Ext. Asset List will be added here.
              </p>
            </div>

            <div className="rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors p-6 text-center cursor-pointer"
              onClick={() => fileRef.current?.click()}>
              <FileUp size={28} className="mx-auto text-gray-400 mb-2" />
              {importFile
                ? <p className="text-sm font-medium text-blue-600">{importFile.name}</p>
                : <><p className="text-sm text-gray-600">Click to select a file</p>
                    <p className="text-xs text-gray-400 mt-1">Supports .xlsx, .xls, .csv (max 10 MB)</p></>}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { setImportFile(e.target.files[0] || null); setImportResult(null); }} />
            </div>

            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">Expected columns (flexible naming):</p>
              <p>IP Address · VM Name · Hostname · Asset Type · OS Type · OS Version</p>
              <p>Assigned User · Department · Location · Server Status · Serial Number</p>
              <p>EOL Status · Asset Tag · Business Purpose · Additional Remarks</p>
            </div>

            <div className="flex gap-3">
              {importFile && (
                <button onClick={() => { setImportFile(null); setImportResult(null); if (fileRef.current) fileRef.current.value = ''; }}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
                  Clear
                </button>
              )}
              <button onClick={handleImport} disabled={!importFile || importing || !isAdmin}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {importing ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                {importing ? 'Importing…' : 'Import File'}
              </button>
            </div>

            {!isAdmin && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle size={12} /> Admin access required to import
              </p>
            )}
          </div>

          <ImportResult result={importResult} onClose={() => setImportResult(null)} />
        </div>
      )}

      {/* ── Migrate Modal ────────────────────────────────────────────────────── */}
      {migrateOpen && (
        <MigrateModal
          selected={[...selected]}
          loading={migrateLoading}
          onConfirm={handleMigrate}
          onClose={() => setMigrateOpen(false)}
        />
      )}
    </div>
  );
}
