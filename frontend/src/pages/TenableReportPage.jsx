import React, { useState, useEffect, useMemo } from 'react';
import { Search, Download, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { tenableAPI } from '../services/api';

const TABS = [
  { id: 'matched',        label: 'Matched',        desc: 'Found in both Tenable & Inventory' },
  { id: 'not_in_tenable', label: 'Not in Tenable', desc: 'Inventory IPs missing from Tenable' },
  { id: 'tenable_only',   label: 'Tenable Only',   desc: 'Tenable IPs not in any inventory'  },
];

const PAGE_SIZE = 50;

const SOURCE_BADGE = {
  'Asset Inventory':      'bg-blue-50 text-blue-700',
  'Ext. Asset Inventory': 'bg-purple-50 text-purple-700',
};

export default function TenableReportPage() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('matched');
  const [search, setSearch]     = useState('');
  const [source, setSource]     = useState('');
  const [page, setPage]         = useState(1);
  const [lastImport, setLastImport] = useState(null);

  useEffect(() => { fetchReport(); fetchMeta(); }, []);

  const fetchReport = async () => {
    setLoading(true);
    try { const r = await tenableAPI.getReport(); setData(r.data); }
    catch (err) { toast.error(err?.response?.data?.error || 'Failed to load report'); }
    finally { setLoading(false); }
  };

  const fetchMeta = async () => {
    try { const r = await tenableAPI.getTotalIPs(); setLastImport(r.data); } catch {}
  };

  const rawRows = useMemo(() => {
    if (!data) return [];
    if (tab === 'matched')        return data.matched        || [];
    if (tab === 'not_in_tenable') return data.not_in_tenable || [];
    return data.tenable_only || [];
  }, [data, tab]);

  const activeRows = useMemo(() => {
    const q = search.toLowerCase();
    return rawRows.filter(r => {
      if (source && r.source && r.source !== source) return false;
      if (!q) return true;
      const fields = tab === 'tenable_only'
        ? [r.ip_address, r.host_name, r.name, r.operating_systems, r.display_mac_address]
        : [r.name, r.matched_ip || r.ip_address, r.raw_ips, r.source, r.asset_type,
           r.tenable_host_name, r.tenable_os, r.location, r.department];
      return fields.some(f => String(f || '').toLowerCase().includes(q));
    });
  }, [rawRows, search, source, tab]);

  const totalPages = Math.ceil(activeRows.length / PAGE_SIZE);
  const pageRows   = activeRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const switchTab = (t) => { setTab(t); setPage(1); setSearch(''); setSource(''); };

  const exportCSV = () => {
    let headers, lines;
    if (tab === 'matched') {
      headers = ['Source','Asset Name','Matched IP','All IPs','Asset Type','Location','Department','Tenable Host','Tenable Name','MAC Address','Last Observed','OS'];
      lines   = rawRows.map(r => [r.source,r.name,r.matched_ip,r.raw_ips,r.asset_type,r.location,r.department,r.tenable_host_name,r.tenable_name,r.tenable_mac,r.tenable_last_observed,r.tenable_os]);
    } else if (tab === 'not_in_tenable') {
      headers = ['Source','Asset Name','IP Address','All IPs','Asset Type','Location','Department'];
      lines   = rawRows.map(r => [r.source,r.name,r.ip_address,r.raw_ips,r.asset_type,r.location,r.department]);
    } else {
      headers = ['IP Address','Host Name','Name','MAC Address','All IPs','Last Observed','Operating System'];
      lines   = rawRows.map(r => [r.ip_address,r.host_name,r.name,r.display_mac_address,r.ipv4_addresses,r.last_observed,r.operating_systems]);
    }
    const csv  = [headers, ...lines].map(row => row.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `tenable-${tab}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const tabCount = (id) => {
    if (!data) return 0;
    if (id === 'matched')        return (data.matched        || []).length;
    if (id === 'not_in_tenable') return (data.not_in_tenable || []).length;
    return (data.tenable_only || []).length;
  };

  const s = data?.summary || {};

  const STAT_CARDS = [
    { label: 'Total Tenable IPs', value: s.total_tenable_ips    || 0, cls: 'bg-blue-50   border-blue-200   text-blue-700'   },
    { label: 'Matched',           value: s.matched_count         || 0, cls: 'bg-green-50  border-green-200  text-green-700'  },
    { label: 'Not in Tenable',    value: s.not_in_tenable_count  || 0, cls: 'bg-orange-50 border-orange-200 text-orange-700' },
    { label: 'Tenable Only',      value: s.tenable_only_count    || 0, cls: 'bg-red-50    border-red-200    text-red-700'    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tenable Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Comparing <span className="font-medium">192.168.x.x</span> &amp; <span className="font-medium">10.x.x.x</span> IPs
            against Asset Inventory &amp; Ext. Asset Inventory
            {lastImport?.latest_import && (
              <span className="ml-2 text-xs text-gray-400">
                · Last import: {new Date(lastImport.latest_import.imported_at).toLocaleDateString()}
                ({lastImport.latest_import.filename})
              </span>
            )}
            {!lastImport?.latest_import && !loading && (
              <span className="ml-2 text-xs text-orange-500">· No Tenable data imported yet</span>
            )}
          </p>
        </div>
        <button onClick={() => { fetchReport(); fetchMeta(); }} disabled={loading} className="btn-secondary text-xs flex-shrink-0">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STAT_CARDS.map(c => (
            <div key={c.label} className={`${c.cls} border rounded-xl p-3`}>
              <p className="text-xs text-gray-500 mb-0.5">{c.label}</p>
              <p className={`text-2xl font-bold ${c.cls.split(' ').find(x => x.startsWith('text-'))}`}>{c.value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0">
          {TABS.map(t => {
            const active = tab === t.id;
            const count  = tabCount(t.id);
            return (
              <button key={t.id} onClick={() => switchTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2
                  ${active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {t.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold
                  ${active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input-field pl-8 text-sm" placeholder="Search…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        {tab !== 'tenable_only' && (
          <select className="input-field text-sm w-auto" value={source}
            onChange={e => { setSource(e.target.value); setPage(1); }}>
            <option value="">All Sources</option>
            <option>Asset Inventory</option>
            <option>Ext. Asset Inventory</option>
          </select>
        )}
        <button onClick={exportCSV} disabled={!data} className="btn-secondary text-xs">
          <Download size={13} /> Export CSV
        </button>
        <span className="text-xs text-gray-400">{activeRows.length.toLocaleString()} records</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading report…</div>
      ) : activeRows.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
          <p className="font-medium">{data ? 'No records match filters' : 'No data yet'}</p>
          <p className="text-xs mt-1">{!data ? 'Ask an admin to import a Tenable export first' : 'Try clearing the search'}</p>
        </div>
      ) : (
        <>
          <div className="border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {tab === 'matched' && <>
                    <th className="table-th">Source</th>
                    <th className="table-th">Asset Name</th>
                    <th className="table-th">Matched IP</th>
                    <th className="table-th">All IPs</th>
                    <th className="table-th">Asset Type</th>
                    <th className="table-th">Tenable Host</th>
                    <th className="table-th">Tenable Name</th>
                    <th className="table-th">MAC Address</th>
                    <th className="table-th">Last Observed</th>
                    <th className="table-th">OS</th>
                  </>}
                  {tab === 'not_in_tenable' && <>
                    <th className="table-th">Source</th>
                    <th className="table-th">Asset Name</th>
                    <th className="table-th">IP Address</th>
                    <th className="table-th">All IPs</th>
                    <th className="table-th">Asset Type</th>
                    <th className="table-th">Location</th>
                    <th className="table-th">Department</th>
                  </>}
                  {tab === 'tenable_only' && <>
                    <th className="table-th">IP Address</th>
                    <th className="table-th">Host Name</th>
                    <th className="table-th">Name</th>
                    <th className="table-th">MAC Address</th>
                    <th className="table-th">All IPs (raw)</th>
                    <th className="table-th">Last Observed</th>
                    <th className="table-th">Operating System</th>
                  </>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pageRows.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {tab === 'matched' && <>
                      <td className="table-td">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${SOURCE_BADGE[r.source] || 'bg-gray-100 text-gray-600'}`}>{r.source}</span>
                      </td>
                      <td className="table-td font-medium text-gray-800">{r.name || '—'}</td>
                      <td className="table-td">
                        <span className="font-mono text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded">{r.matched_ip}</span>
                      </td>
                      <td className="table-td text-xs text-gray-400 max-w-[160px] truncate" title={r.raw_ips}>{r.raw_ips}</td>
                      <td className="table-td text-xs text-gray-600">{r.asset_type || '—'}</td>
                      <td className="table-td text-xs text-gray-700">{r.tenable_host_name || '—'}</td>
                      <td className="table-td text-xs text-gray-700">{r.tenable_name || '—'}</td>
                      <td className="table-td font-mono text-xs text-gray-500">{r.tenable_mac || '—'}</td>
                      <td className="table-td text-xs text-gray-500">{r.tenable_last_observed || '—'}</td>
                      <td className="table-td text-xs text-gray-600 max-w-[140px] truncate" title={r.tenable_os}>{r.tenable_os || '—'}</td>
                    </>}
                    {tab === 'not_in_tenable' && <>
                      <td className="table-td">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${SOURCE_BADGE[r.source] || 'bg-gray-100 text-gray-600'}`}>{r.source}</span>
                      </td>
                      <td className="table-td font-medium text-gray-800">{r.name || '—'}</td>
                      <td className="table-td">
                        <span className="font-mono text-xs text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">{r.ip_address}</span>
                      </td>
                      <td className="table-td text-xs text-gray-400 max-w-[160px] truncate" title={r.raw_ips}>{r.raw_ips}</td>
                      <td className="table-td text-xs text-gray-600">{r.asset_type || '—'}</td>
                      <td className="table-td text-xs text-gray-600">{r.location || '—'}</td>
                      <td className="table-td text-xs text-gray-600">{r.department || '—'}</td>
                    </>}
                    {tab === 'tenable_only' && <>
                      <td className="table-td">
                        <span className="font-mono text-xs text-red-700 bg-red-50 px-1.5 py-0.5 rounded">{r.ip_address}</span>
                      </td>
                      <td className="table-td text-xs text-gray-700">{r.host_name || '—'}</td>
                      <td className="table-td text-xs text-gray-700">{r.name || '—'}</td>
                      <td className="table-td font-mono text-xs text-gray-500">{r.display_mac_address || '—'}</td>
                      <td className="table-td text-xs text-gray-400 max-w-[160px] truncate" title={r.ipv4_addresses}>{r.ipv4_addresses || '—'}</td>
                      <td className="table-td text-xs text-gray-500">{r.last_observed || '—'}</td>
                      <td className="table-td text-xs text-gray-600 max-w-[150px] truncate" title={r.operating_systems}>{r.operating_systems || '—'}</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">Page {page} of {totalPages} · {activeRows.length.toLocaleString()} records</p>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="btn-secondary text-xs px-2 py-1">Prev</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                  const p = page <= 3 ? idx + 1 : page >= totalPages - 2 ? totalPages - 4 + idx : page - 2 + idx;
                  if (p < 1 || p > totalPages) return null;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`text-xs px-2.5 py-1 rounded ${p === page ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {p}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="btn-secondary text-xs px-2 py-1">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
