import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { beijingAssetsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  Download, Search, Trash2, ChevronLeft, ChevronRight,
  RefreshCw, CheckCircle, AlertTriangle, Info, Filter
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

export default function BeijingAssetListPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [assets,   setAssets]   = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState('');
  const [status,   setStatus]   = useState('');
  const [exporting, setExporting] = useState(false);

  const LIMIT = 15;

  const fetchAssets = useCallback(async (pg = page) => {
    setLoading(true);
    try {
      const res = await beijingAssetsAPI.getAll({ page: pg, limit: LIMIT, search, status });
      setAssets(res.data.assets);
      setTotal(res.data.total);
    } catch {
      toast.error('Failed to load Beijing Asset List');
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { fetchAssets(1); setPage(1); }, [search, status]); // eslint-disable-line
  useEffect(() => { fetchAssets(page); }, [page]);                      // eslint-disable-line

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
                <tr><td colSpan={isAdmin ? 12 : 11} className="py-16 text-center text-gray-400">
                  <RefreshCw size={20} className="animate-spin mx-auto mb-2" />Loading…
                </td></tr>
              ) : assets.length === 0 ? (
                <tr><td colSpan={isAdmin ? 12 : 11} className="py-16 text-center text-gray-400">
                  <AlertTriangle size={20} className="mx-auto mb-2 text-amber-400" />
                  No assets found. Import an Excel file via Beijing Asset Import to get started.
                </td></tr>
              ) : assets.map(a => (
                <tr
                  key={a.id}
                  className={`hover:bg-gray-50 transition-colors cursor-pointer ${a.is_migrated ? 'opacity-60' : ''}`}
                  onClick={() => navigate(`/beijing-asset/${a.id}`)}
                >
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
                        {a.migration_comment && (
                          <p className="text-gray-400 italic truncate max-w-[120px]" title={a.migration_comment}>{a.migration_comment}</p>
                        )}
                      </div>
                    ) : '—'}
                  </td>
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
          <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
        </div>
      </div>
    </div>
  );
}
