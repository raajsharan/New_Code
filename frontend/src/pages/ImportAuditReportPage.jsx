import React, { useCallback, useEffect, useState } from 'react';
import { importAuditAPI } from '../services/api';
import toast from 'react-hot-toast';
import { FileSpreadsheet, RefreshCw, AlertCircle } from 'lucide-react';

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'excel-smart-import', label: 'Excel Smart Import' },
  { value: 'new-asset-import', label: 'New Asset Import' },
];

const TARGET_OPTIONS = [
  { value: '', label: 'All Targets' },
  { value: 'assets', label: 'Assets' },
  { value: 'extended-inventory', label: 'Extended Inventory' },
];

export default function ImportAuditReportPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(25);
  const [sourcePage, setSourcePage] = useState('');
  const [targetScope, setTargetScope] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await importAuditAPI.getReports({
        page,
        limit,
        source_page: sourcePage || undefined,
        target_scope: targetScope || undefined,
      });
      setRows(r.data?.reports || []);
      setTotal(r.data?.total || 0);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to load import audit report');
    } finally {
      setLoading(false);
    }
  }, [page, limit, sourcePage, targetScope]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
          <FileSpreadsheet size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Import Audit Report</h1>
          <p className="text-sm text-gray-500">Track import outcomes from Excel Smart Import and New Asset Import.</p>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Source Page</label>
            <select className="input-field" value={sourcePage} onChange={(e) => { setPage(1); setSourcePage(e.target.value); }}>
              {SOURCE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Target</label>
            <select className="input-field" value={targetScope} onChange={(e) => { setPage(1); setTargetScope(e.target.value); }}>
              {TARGET_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button className="btn-secondary text-sm" onClick={load}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p className="text-sm text-gray-400">Loading import audit report...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400">No import audit records found.</p>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => (
              <div key={r.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">{r.source_page}</span>
                  <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">{r.target_scope}</span>
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700">{r.import_mode}</span>
                  <span className="text-gray-400 ml-auto">{new Date(r.created_at).toLocaleString()}</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <StatBox label="Total" value={r.total_count || 0} cls="bg-gray-50 text-gray-800 border-gray-200" />
                  <StatBox label="Success" value={r.success_count || 0} cls="bg-green-50 text-green-800 border-green-200" />
                  <StatBox label="Skipped" value={r.skipped_count || 0} cls="bg-amber-50 text-amber-800 border-amber-200" />
                  <StatBox label="Failed" value={r.failed_count || 0} cls="bg-red-50 text-red-800 border-red-200" />
                  <StatBox label="User" value={r.created_by_username || '-'} cls="bg-blue-50 text-blue-800 border-blue-200" />
                </div>

                {(r.skipped_count > 0 || r.failed_count > 0) && (
                  <div className="border border-red-200 bg-red-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-red-700 uppercase mb-2 flex items-center gap-1">
                      <AlertCircle size={12} /> Failure / Skip Reasons
                    </p>
                    {Array.isArray(r.reasons) && r.reasons.length ? (
                      <ul className="space-y-1">
                        {r.reasons.slice(0, 25).map((msg, idx) => (
                          <li key={idx} className="text-xs text-red-700">{msg}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-red-600">No reason details recorded.</p>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-400">Total records: {total}</p>
              <div className="flex items-center gap-2">
                <button className="btn-secondary text-xs" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                <span className="text-xs text-gray-500">Page {page} / {pages}</span>
                <button className="btn-secondary text-xs" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, cls }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <p className="text-xs">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

