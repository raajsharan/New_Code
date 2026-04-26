import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { auditAPI } from '../services/api';
import toast from 'react-hot-toast';
import { Search, RefreshCw, Shield, ChevronLeft, ChevronRight } from 'lucide-react';

const ENTITY_TYPES = ['', 'asset', 'ext_item', 'user', 'transfer', 'beijing_asset'];
const STORAGE_KEY = 'audit_explorer_state_v1';

function toDisplay(v) {
  if (v === null || v === undefined || v === '') return '-';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function buildDiffRows(log) {
  const before = log.before_json && typeof log.before_json === 'object' ? log.before_json : {};
  const after = log.after_json && typeof log.after_json === 'object' ? log.after_json : {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();

  return keys.map((key) => {
    const beforeVal = before[key];
    const afterVal = after[key];
    const changed = JSON.stringify(beforeVal) !== JSON.stringify(afterVal);
    const beforeEmpty = beforeVal === null || beforeVal === undefined || beforeVal === '';
    const afterEmpty = afterVal === null || afterVal === undefined || afterVal === '';
    let changeType = 'unchanged';
    if (changed) {
      if (beforeEmpty && !afterEmpty) changeType = 'added';
      else if (!beforeEmpty && afterEmpty) changeType = 'removed';
      else changeType = 'modified';
    }
    return {
      key,
      before: toDisplay(beforeVal),
      after: toDisplay(afterVal),
      changed,
      changeType,
    };
  });
}

export default function AuditExplorerPage() {
  const [searchParams] = useSearchParams();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [filters, setFilters] = useState(() => {
    // URL params take priority (used for "Audit Trail" links from detail pages)
    const urlQ = searchParams.get('q') || '';
    const urlEntity = searchParams.get('entity_type') || '';
    if (urlQ || urlEntity) {
      return { q: urlQ, entity_type: urlEntity, action: '', actor: '', from: '', to: '' };
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { q: '', entity_type: '', action: '', actor: '', from: '', to: '' };
      }
      const parsed = JSON.parse(raw);
      return {
        q: parsed?.filters?.q || '',
        entity_type: parsed?.filters?.entity_type || '',
        action: parsed?.filters?.action || '',
        actor: parsed?.filters?.actor || '',
        from: parsed?.filters?.from || '',
        to: parsed?.filters?.to || '',
      };
    } catch {
      return { q: '', entity_type: '', action: '', actor: '', from: '', to: '' };
    }
  });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return 25;
      const parsed = JSON.parse(raw);
      const n = parseInt(parsed?.limit, 10);
      return [10, 25, 50, 100].includes(n) ? n : 25;
    } catch {
      return 25;
    }
  });
  const [order, setOrder] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return 'desc';
      const parsed = JSON.parse(raw);
      return parsed?.order === 'asc' ? 'asc' : 'desc';
    } catch {
      return 'desc';
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.onlyChanged === 'boolean') setOnlyChanged(parsed.onlyChanged);
    } catch {}
  }, []);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const setFilter = (k, v) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [k]: v }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters({
      q: '',
      entity_type: '',
      action: '',
      actor: '',
      from: '',
      to: '',
    });
  };

  const resetSavedPreferences = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setPage(1);
    setFilters({ q: '', entity_type: '', action: '', actor: '', from: '', to: '' });
    setLimit(25);
    setOrder('desc');
    setOnlyChanged(true);
    setExpandedId(null);
    toast.success('Saved preferences reset');
  };

  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (filters.q) chips.push({ key: 'q', label: `Search: ${filters.q}` });
    if (filters.entity_type) chips.push({ key: 'entity_type', label: `Entity: ${filters.entity_type}` });
    if (filters.action) chips.push({ key: 'action', label: `Action: ${filters.action}` });
    if (filters.actor) chips.push({ key: 'actor', label: `Actor: ${filters.actor}` });
    if (filters.from) chips.push({ key: 'from', label: `From: ${filters.from}` });
    if (filters.to) chips.push({ key: 'to', label: `To: ${filters.to}` });
    return chips;
  }, [filters]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...filters, page, limit };
      params.order = order;
      const r = await auditAPI.getLogs(params);
      setLogs(r.data.logs || []);
      setTotal(r.data.total || 0);
      setExpandedId(null);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to load audit logs');
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters, page, limit, order]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ filters, limit, order, onlyChanged })
      );
    } catch {}
  }, [filters, limit, order, onlyChanged]);

  const copyDiffJson = async (log, rows) => {
    try {
      const payload = {
        audit_id: log.id,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        action: log.action,
        actor: log.actor_username || 'system',
        created_at: log.created_at,
        fields: rows.map((r) => ({
          field: r.key,
          before: r.before,
          after: r.after,
          changed: r.changed,
        })),
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast.success('Diff JSON copied');
    } catch {
      toast.error('Failed to copy diff JSON');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Shield size={22} className="text-blue-700" /> Audit Explorer
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Search and inspect all audit events across entities</p>
        </div>
        <button onClick={fetchLogs} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
      <div className="flex justify-end">
        <button className="btn-secondary text-xs py-1 px-2" onClick={resetSavedPreferences}>
          Reset saved preferences
        </button>
      </div>

      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="relative xl:col-span-2">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input-field pl-8" placeholder="Search by entity, action, actor, id..."
              value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
          </div>
          <select className="input-field" value={filters.entity_type} onChange={(e) => setFilter('entity_type', e.target.value)}>
            {ENTITY_TYPES.map((t) => <option key={t || 'all'} value={t}>{t || 'All Entities'}</option>)}
          </select>
          <input className="input-field" placeholder="Action (e.g. update)"
            value={filters.action} onChange={(e) => setFilter('action', e.target.value)} />
          <input className="input-field" placeholder="Actor username"
            value={filters.actor} onChange={(e) => setFilter('actor', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className="input-field" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
            <input type="date" className="input-field" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100"
                onClick={() => setFilter(chip.key, '')}
                title="Remove filter"
              >
                {chip.label} ×
              </button>
            ))}
            {activeFilterChips.length === 0 && (
              <span className="text-xs text-gray-400">No active filters</span>
            )}
          </div>
          <button
            className="btn-secondary text-xs py-1 px-2"
            onClick={clearFilters}
            disabled={activeFilterChips.length === 0}
          >
            Clear filters
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-500">{total} result{total !== 1 ? 's' : ''}</p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                className="accent-blue-600"
                checked={onlyChanged}
                onChange={(e) => setOnlyChanged(e.target.checked)}
              />
              Only changed fields
            </label>
            <span className="text-xs text-gray-500">Sort</span>
            <select className="input-field py-1 text-xs w-28" value={order} onChange={(e) => { setPage(1); setOrder(e.target.value); }}>
              <option value="desc">Newest</option>
              <option value="asc">Oldest</option>
            </select>
            <span className="text-xs text-gray-500">Rows</span>
            <select className="input-field py-1 text-xs w-20" value={limit} onChange={(e) => { setPage(1); setLimit(parseInt(e.target.value, 10)); }}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading audit logs...</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-400">No audit logs found for current filters.</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-thick">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-2 font-semibold text-gray-500">Time</th>
                  <th className="text-left py-2 px-2 font-semibold text-gray-500">Entity</th>
                  <th className="text-left py-2 px-2 font-semibold text-gray-500">Entity ID</th>
                  <th className="text-left py-2 px-2 font-semibold text-gray-500">Action</th>
                  <th className="text-left py-2 px-2 font-semibold text-gray-500">Actor</th>
                  <th className="text-left py-2 px-2 font-semibold text-gray-500">IP</th>
                  <th className="text-right py-2 px-2 font-semibold text-gray-500">Diff</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isOpen = expandedId === log.id;
                  const diffRows = buildDiffRows(log);
                  const changedCount = diffRows.filter((r) => r.changed).length;
                  const visibleRows = onlyChanged ? diffRows.filter((r) => r.changed) : diffRows;
                  return (
                    <React.Fragment key={log.id}>
                      <tr className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-2 text-gray-500 whitespace-nowrap">
                          {log.created_at ? new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td className="py-2 px-2">
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{log.entity_type}</span>
                        </td>
                        <td className="py-2 px-2 font-mono text-gray-700">{log.entity_id}</td>
                        <td className="py-2 px-2 text-gray-700">{log.action}</td>
                        <td className="py-2 px-2 text-gray-700">{log.actor_username || 'system'}</td>
                        <td className="py-2 px-2 font-mono text-gray-500">{log.ip_address || '-'}</td>
                        <td className="py-2 px-2 text-right">
                          <button
                            className="text-xs text-blue-700 hover:underline"
                            onClick={() => setExpandedId((prev) => (prev === log.id ? null : log.id))}
                          >
                            {isOpen ? 'Hide' : `View (${changedCount})`}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <td colSpan={7} className="p-3">
                            {visibleRows.length === 0 ? (
                              <p className="text-xs text-gray-400">No before/after payload for this event.</p>
                            ) : (
                              <div className="overflow-x-auto scrollbar-x-thick space-y-2">
                                <div className="flex justify-end">
                                  <button
                                    className="btn-secondary text-xs py-1 px-2"
                                    onClick={() => copyDiffJson(log, visibleRows)}
                                  >
                                    Copy diff JSON
                                  </button>
                                </div>
                                <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                                  <thead>
                                    <tr className="bg-gray-100">
                                      <th className="text-left py-1.5 px-2 font-semibold text-gray-600">Type</th>
                                      <th className="text-left py-1.5 px-2 font-semibold text-gray-600">Field</th>
                                      <th className="text-left py-1.5 px-2 font-semibold text-gray-600">Before</th>
                                      <th className="text-left py-1.5 px-2 font-semibold text-gray-600">After</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {visibleRows.map((r) => (
                                      <tr key={r.key} className={`border-t border-gray-100 ${r.changed ? 'bg-amber-50' : ''}`}>
                                        <td className="py-1.5 px-2">
                                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                                            r.changeType === 'added'
                                              ? 'bg-emerald-100 text-emerald-700'
                                              : r.changeType === 'removed'
                                                ? 'bg-rose-100 text-rose-700'
                                                : r.changeType === 'modified'
                                                  ? 'bg-amber-100 text-amber-700'
                                                  : 'bg-gray-100 text-gray-600'
                                          }`}>
                                            {r.changeType === 'added'
                                              ? '+'
                                              : r.changeType === 'removed'
                                                ? '-'
                                                : r.changeType === 'modified'
                                                  ? '~'
                                                  : '='}
                                          </span>
                                        </td>
                                        <td className="py-1.5 px-2 font-mono text-gray-700">{r.key}</td>
                                        <td className="py-1.5 px-2 text-gray-600 break-all">{r.before}</td>
                                        <td className="py-1.5 px-2 text-gray-700 break-all">{r.after}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-3">
          <button
            className="btn-secondary text-xs py-1.5 px-2 disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={13} /> Prev
          </button>
          <span className="text-xs text-gray-500">Page {page} / {totalPages}</span>
          <button
            className="btn-secondary text-xs py-1.5 px-2 disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
