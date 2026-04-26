import React, { useState, useEffect, useCallback } from 'react';
import { deletedItemsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  Trash2, RotateCcw, RefreshCw, AlertTriangle,
  ChevronLeft, ChevronRight, Search, X, Eye,
} from 'lucide-react';

const SOURCES = [
  {
    key: 'assets',
    label: 'Asset List',
    cols: [['vm_name','VM Name'],['ip_address','IP Address'],['department','Department'],['location','Location']],
  },
  {
    key: 'extended_inventory',
    label: 'Extended Inventory',
    cols: [['vm_name','VM Name'],['ip_address','IP Address'],['department','Department'],['location','Location']],
  },
  {
    key: 'beijing_assets',
    label: 'Beijing Assets',
    cols: [['vm_name','VM Name'],['ip_address','IP Address'],['department','Department'],['location','Location'],['server_status','Status']],
  },
  {
    key: 'physical_assets',
    label: 'Physical Servers',
    cols: [['hosted_ip','Hosted IP'],['vm_name','Device Name'],['serial_number','Serial No.'],['rack_number','Rack']],
  },
];

function RestoreDiffModal({ item, onConfirm, onCancel }) {
  if (!item) return null;
  const data = item.original_data || {};
  const entries = Object.entries(data).filter(([k]) => !['id','created_at','updated_at'].includes(k));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Restore Item Preview</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-3 overflow-y-auto flex-1">
          <p className="text-xs text-gray-500 mb-3">
            The following data will be restored. Verify before confirming.
          </p>
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 w-1/3">Field</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map(([k, v]) => {
                  const display = v === null || v === undefined || v === '' ? <span className="text-gray-300 italic">empty</span>
                    : typeof v === 'object' ? <span className="font-mono text-gray-500">{JSON.stringify(v)}</span>
                    : typeof v === 'boolean' ? <span>{v ? 'Yes' : 'No'}</span>
                    : <span>{String(v)}</span>;
                  return (
                    <tr key={k} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-medium text-gray-600 align-top">{k}</td>
                      <td className="px-3 py-1.5 text-gray-800 break-all">{display}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-xs text-gray-400">
            Deleted by <span className="font-medium text-gray-600">{item.deleted_by || 'unknown'}</span> on{' '}
            {new Date(item.deleted_at).toLocaleString()}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700 flex items-center gap-1.5">
            <RotateCcw size={13} /> Restore
          </button>
        </div>
      </div>
    </div>
  );
}

function DeletedTab({ source, cols }) {
  const { isSuperAdmin, isAdmin } = useAuth();
  const [items,    setItems]    = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [restoreItem, setRestoreItem] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const LIMIT = 20;

  const fetchItems = useCallback(async (pg = page) => {
    setLoading(true);
    try {
      const res = await deletedItemsAPI.getAll({ source, page: pg, limit: LIMIT, search });
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch { toast.error('Failed to load deleted items'); }
    finally { setLoading(false); }
  }, [source, page, search]); // eslint-disable-line

  useEffect(() => { fetchItems(1); setPage(1); }, [source, search]); // eslint-disable-line
  useEffect(() => { fetchItems(page); }, [page]); // eslint-disable-line

  const handleHardDelete = async (id) => {
    if (!window.confirm('Permanently delete this record? This cannot be undone.')) return;
    try {
      await deletedItemsAPI.hardDelete(id);
      toast.success('Permanently deleted');
      fetchItems(page);
    } catch { toast.error('Delete failed'); }
  };

  const handleRestoreConfirm = async () => {
    if (!restoreItem) return;
    try {
      await deletedItemsAPI.restore(restoreItem.id);
      toast.success('Restored successfully');
      setRestoreItem(null);
      fetchItems(page);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Restore failed');
      setRestoreItem(null);
    }
  };

  const pages = Math.ceil(total / LIMIT) || 1;
  const colSpan = cols.length + 3;

  return (
    <div className="space-y-4">
      {restoreItem && (
        <RestoreDiffModal
          item={restoreItem}
          onConfirm={handleRestoreConfirm}
          onCancel={() => setRestoreItem(null)}
        />
      )}
      {previewItem && (
        <RestoreDiffModal
          item={previewItem}
          onConfirm={() => setPreviewItem(null)}
          onCancel={() => setPreviewItem(null)}
        />
      )}

      {/* Search + refresh */}
      <div className="glass-panel px-4 py-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, IP, deleted by…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button onClick={() => fetchItems(page)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {cols.map(([k, l]) => (
                  <th key={k} className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{l}</th>
                ))}
                <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Deleted By</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Deleted At</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-600 w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={colSpan} className="py-16 text-center text-gray-400">
                  <RefreshCw size={20} className="animate-spin mx-auto mb-2" />Loading…
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={colSpan} className="py-16 text-center text-gray-400">
                  <AlertTriangle size={20} className="mx-auto mb-2 text-amber-400" />
                  No deleted items in this category
                </td></tr>
              ) : items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  {cols.map(([k]) => (
                    <td key={k} className="px-3 py-2.5 text-gray-700 max-w-[160px] truncate">
                      {item.original_data[k] ?? '—'}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-gray-600 text-xs">{item.deleted_by || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(item.deleted_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => setPreviewItem(item)}
                        className="p-1.5 text-gray-400 hover:bg-gray-100 rounded transition-colors"
                        title="Preview data">
                        <Eye size={13} />
                      </button>
                      {isAdmin && (
                        <button onClick={() => setRestoreItem(item)}
                          className="p-1.5 text-green-600 hover:bg-green-100 rounded transition-colors"
                          title="Restore to original list">
                          <RotateCcw size={13} />
                        </button>
                      )}
                      {isSuperAdmin && (
                        <button onClick={() => handleHardDelete(item.id)}
                          className="p-1.5 text-red-500 hover:bg-red-100 rounded transition-colors"
                          title="Permanently delete — superadmin only">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>{total} record{total !== 1 ? 's' : ''}</span>
            <button onClick={() => setPage(p => p - 1)} disabled={page <= 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
            <span className="font-medium">{page} / {pages}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= pages}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DeletedListPage() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('assets');

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <AlertTriangle size={40} className="text-amber-400" />
        <p className="text-lg font-semibold text-gray-700">Admin Access Required</p>
        <p className="text-sm text-gray-500">Only admins and superadmins can view deleted items.</p>
      </div>
    );
  }

  const activeSource = SOURCES.find(s => s.key === activeTab);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass-panel px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Deleted Items</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Items deleted from any inventory page — admins can restore, only Superadmin can permanently remove.
        </p>
      </div>

      {/* Tabs */}
      <div className="glass-panel px-6 pt-3 pb-0">
        <div className="flex gap-1 border-b border-gray-200">
          {SOURCES.map(s => (
            <button key={s.key} onClick={() => setActiveTab(s.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === s.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {activeSource && <DeletedTab key={activeTab} source={activeSource.key} cols={activeSource.cols} />}
    </div>
  );
}
