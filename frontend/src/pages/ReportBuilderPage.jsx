import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { reportAPI, settingsAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
  BarChart2, PieChart, Table, TrendingUp, RefreshCw,
  Download, Filter, X, ChevronDown, ChevronUp, Plus,
  FileText, Settings, Play, RotateCcw, Circle, Grid
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, ArcElement,
  LineElement, PointElement, Title, Tooltip, Legend,
} from 'chart.js';
import { Bar, Pie, Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement,
  LineElement, PointElement, Title, Tooltip, Legend
);

// ─────────────────────────────────────────────────────────────────────────────
// Field definitions for Asset List and Ext Asset List
// ─────────────────────────────────────────────────────────────────────────────
const ASSET_FIELDS = [
  { key: 'vm_name',          label: 'VM Name',           type: 'text'   },
  { key: 'os_hostname',      label: 'OS Hostname',       type: 'text'   },
  { key: 'ip_address',       label: 'IP Address',        type: 'text'   },
  { key: 'asset_type',       label: 'Asset Type',        type: 'category' },
  { key: 'os_type',          label: 'OS Type',           type: 'category' },
  { key: 'os_version',       label: 'OS Version',        type: 'category' },
  { key: 'assigned_user',    label: 'Assigned User',     type: 'text'   },
  { key: 'department',       label: 'Department',        type: 'category' },
  { key: 'business_purpose', label: 'Business Purpose',  type: 'text'   },
  { key: 'server_status',    label: 'Server Status',     type: 'category' },
  { key: 'patching_type',    label: 'Patching Type',     type: 'category' },
  { key: 'server_patch_type',label: 'Server Patch Type', type: 'category' },
  { key: 'patching_schedule',label: 'Patching Schedule', type: 'category' },
  { key: 'location',         label: 'Location',          type: 'category' },
  { key: 'eol_status',       label: 'EOL Status',        type: 'category' },
  { key: 'serial_number',    label: 'Serial Number',     type: 'text'   },
  { key: 'oem_status',       label: 'OME Status',        type: 'category' },
  { key: 'hosted_ip',        label: 'Hosted IP',         type: 'text'   },
  { key: 'asset_tag',        label: 'Asset Tag',         type: 'text'   },
  { key: 'asset_username',   label: 'Asset Username',    type: 'text'   },
  { key: 'asset_password',   label: 'Asset Password',    type: 'text'   },  
  { key: 'additional_remarks', label: 'Additional Remarks', type: 'text' },
  { key: 'submitted_by',     label: 'Submitted By',      type: 'text'   },
  { key: 'me_installed_status',     label: 'ManageEngine Installed', type: 'boolean' },
  { key: 'tenable_installed_status',label: 'Tenable Installed',      type: 'boolean' },
  { key: 'idrac_enabled',    label: 'iDRAC Enabled',     type: 'boolean' },
  { key: 'updated_at',       label: 'Last Modified',     type: 'date'   },
  { key: 'created_at',       label: 'Date Added',        type: 'date'   },
];

const EXT_FIELDS = [
  { key: 'vm_name',          label: 'VM Name',           type: 'text'   },
  { key: 'asset_name',       label: 'Asset Name',        type: 'text'   },
  { key: 'os_hostname',      label: 'OS Hostname',       type: 'text'   },
  { key: 'ip_address',       label: 'IP Address',        type: 'text'   },
  { key: 'asset_type',       label: 'Asset Type',        type: 'category' },
  { key: 'os_type',          label: 'OS Type',           type: 'category' },
  { key: 'os_version',       label: 'OS Version',        type: 'category' },
  { key: 'assigned_user',    label: 'Assigned User',     type: 'text'   },
  { key: 'department',       label: 'Department',        type: 'category' },
  { key: 'business_purpose', label: 'Business Purpose',  type: 'text'   },
  { key: 'server_status',    label: 'Server Status',     type: 'category' },
  { key: 'status',           label: 'Record Status',     type: 'category' },
  { key: 'patching_type',    label: 'Patching Type',     type: 'category' },
  { key: 'server_patch_type',label: 'Server Patch Type', type: 'category' },
  { key: 'patching_schedule',label: 'Patching Schedule', type: 'category' },
  { key: 'location',         label: 'Location',          type: 'category' },
  { key: 'eol_status',       label: 'EOL Status',        type: 'category' },
  { key: 'serial_number',    label: 'Serial Number',     type: 'text'   },
  { key: 'hosted_ip',        label: 'Hosted IP',         type: 'text'   },
  { key: 'asset_tag',        label: 'Asset Tag',         type: 'text'   },
  { key: 'additional_remarks', label: 'Additional Remarks', type: 'text' },
  { key: 'submitted_by',     label: 'Submitted By',      type: 'text'   },
  { key: 'me_installed_status',     label: 'ManageEngine Installed', type: 'boolean' },
  { key: 'tenable_installed_status',label: 'Tenable Installed',      type: 'boolean' },
  { key: 'idrac_enabled',    label: 'iDRAC Enabled',     type: 'boolean' },
  { key: 'updated_at',       label: 'Last Modified',     type: 'date'   },
  { key: 'created_at',       label: 'Date Added',        type: 'date'   },
];

const VIEW_TYPES = [
  { key: 'table',   label: 'Data Table',    icon: Table },
  { key: 'bar',     label: 'Bar Chart',     icon: BarChart2 },
  { key: 'pie',     label: 'Pie Chart',     icon: PieChart },
  { key: 'doughnut',label: 'Doughnut Chart',icon: Circle },
  { key: 'line',    label: 'Line Chart',    icon: TrendingUp },
  { key: 'pivot',   label: 'Pivot Table',   icon: Grid },
];

const PALETTE = [
  '#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6',
  '#06B6D4','#F97316','#84CC16','#EC4899','#6366F1',
  '#14B8A6','#D97706','#DC2626','#7C3AED','#0891B2',
  '#65A30D','#DB2777','#4F46E5','#0D9488','#B45309',
];

function getColor(i) { return PALETTE[i % PALETTE.length]; }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function displayVal(row, key) {
  const v = row[key];
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (key === 'updated_at' || key === 'created_at') {
    try { return new Date(v).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); }
    catch { return v; }
  }
  return String(v);
}

function groupByField(rows, fieldKey) {
  const counts = {};
  rows.forEach(r => {
    const v = r[fieldKey];
    const k = (v === null || v === undefined || v === '') ? '(blank)' : String(v);
    counts[k] = (counts[k] || 0) + 1;
  });
  return counts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart views
// ─────────────────────────────────────────────────────────────────────────────
function BarChartView({ data, groupField, fieldLabel }) {
  const counts = useMemo(() => groupByField(data, groupField), [data, groupField]);
  const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([,v]) => v);

  const chartData = {
    labels,
    datasets: [{
      label: 'Count',
      data: values,
      backgroundColor: labels.map((_,i) => getColor(i) + 'CC'),
      borderColor: labels.map((_,i) => getColor(i)),
      borderWidth: 1.5,
      borderRadius: 4,
    }],
  };
  const options = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: true, text: `Count by ${fieldLabel}`, font: { size: 13 }, color: '#374151' },
      tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} record${ctx.parsed.y !== 1 ? 's' : ''}` } },
    },
    scales: {
      x: { ticks: { maxRotation: 45, font: { size: 11 } } },
      y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } } },
    },
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <Bar data={chartData} options={options} />
      <p className="text-xs text-gray-400 text-center mt-2">{data.length} total records · grouped by {fieldLabel}</p>
    </div>
  );
}

function PieChartView({ data, groupField, fieldLabel, doughnut }) {
  const counts = useMemo(() => groupByField(data, groupField), [data, groupField]);
  const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([,v]) => v);

  const chartData = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: labels.map((_,i) => getColor(i) + 'DD'),
      borderColor: '#fff',
      borderWidth: 2,
    }],
  };
  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'right', labels: { font: { size: 11 }, padding: 12 } },
      title: { display: true, text: `Distribution by ${fieldLabel}`, font: { size: 13 }, color: '#374151' },
      tooltip: {
        callbacks: {
          label: ctx => {
            const total = ctx.dataset.data.reduce((a,b) => a+b, 0);
            const pct = ((ctx.parsed / total) * 100).toFixed(1);
            return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
          },
        },
      },
    },
  };
  const Comp = doughnut ? Doughnut : Pie;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col items-center">
      <div style={{ maxWidth: 520, width: '100%' }}>
        <Comp data={chartData} options={options} />
      </div>
      <p className="text-xs text-gray-400 text-center mt-2">{data.length} total records · {labels.length} categories</p>
    </div>
  );
}

function LineChartView({ data, groupField, fieldLabel }) {
  const counts = useMemo(() => {
    if (groupField === 'created_at' || groupField === 'updated_at') {
      // Group by month
      const monthly = {};
      data.forEach(r => {
        const v = r[groupField];
        if (!v) return;
        const d = new Date(v);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        monthly[key] = (monthly[key] || 0) + 1;
      });
      return monthly;
    }
    return groupByField(data, groupField);
  }, [data, groupField]);

  const sorted = Object.entries(counts).sort((a,b) => a[0].localeCompare(b[0]));
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([,v]) => v);

  const chartData = {
    labels,
    datasets: [{
      label: 'Count',
      data: values,
      borderColor: '#3B82F6',
      backgroundColor: '#3B82F620',
      pointBackgroundColor: '#3B82F6',
      pointRadius: 4,
      tension: 0.35,
      fill: true,
    }],
  };
  const options = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: true, text: `Trend by ${fieldLabel}`, font: { size: 13 }, color: '#374151' },
    },
    scales: {
      x: { ticks: { maxRotation: 45, font: { size: 11 } } },
      y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } } },
    },
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <Line data={chartData} options={options} />
      <p className="text-xs text-gray-400 text-center mt-2">{data.length} total records · {labels.length} points</p>
    </div>
  );
}

function PivotTableView({ data, rowField, colField, rowLabel, colLabel }) {
  const pivotData = useMemo(() => {
    const rows = {}, cols = new Set();
    data.forEach(r => {
      const rv = displayVal(r, rowField);
      const cv = displayVal(r, colField);
      cols.add(cv);
      if (!rows[rv]) rows[rv] = {};
      rows[rv][cv] = (rows[rv][cv] || 0) + 1;
    });
    const colList = [...cols].sort();
    const rowList = Object.keys(rows).sort();
    return { rows, colList, rowList };
  }, [data, rowField, colField]);

  const { rows, colList, rowList } = pivotData;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <Grid size={14} className="text-blue-700" />
        <span className="font-semibold text-sm text-gray-700">Pivot: {rowLabel} × {colLabel}</span>
        <span className="ml-2 text-xs text-gray-400">{rowList.length} rows · {colList.length} columns</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-blue-50 border-b border-blue-100">
            <tr>
              <th className="table-th font-semibold text-blue-800 bg-blue-50 sticky left-0 min-w-[160px]">{rowLabel} \ {colLabel}</th>
              {colList.map(c => <th key={c} className="table-th text-blue-700 whitespace-nowrap">{c}</th>)}
              <th className="table-th font-semibold text-blue-800 bg-blue-50">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rowList.map(rv => {
              const rowTotal = colList.reduce((s,cv) => s + (rows[rv]?.[cv] || 0), 0);
              return (
                <tr key={rv} className="hover:bg-blue-50/30">
                  <td className="table-td font-medium text-gray-700 bg-white sticky left-0 border-r border-gray-100">{rv}</td>
                  {colList.map(cv => {
                    const val = rows[rv]?.[cv] || 0;
                    return (
                      <td key={cv} className={`table-td text-center ${val > 0 ? 'font-semibold text-blue-800' : 'text-gray-300'}`}>
                        {val > 0 ? val : '—'}
                      </td>
                    );
                  })}
                  <td className="table-td text-center font-bold text-gray-800 bg-gray-50">{rowTotal}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-gray-200 bg-gray-50">
            <tr>
              <td className="table-td font-bold text-gray-700 bg-gray-50 sticky left-0">Total</td>
              {colList.map(cv => {
                const colTotal = rowList.reduce((s,rv) => s + (rows[rv]?.[cv] || 0), 0);
                return <td key={cv} className="table-td text-center font-bold text-gray-800">{colTotal}</td>;
              })}
              <td className="table-td text-center font-bold text-gray-900">{data.length}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function DataTableView({ data, columns, allFields }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const perPage = 25;

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = displayVal(a, sortKey);
      const bv = displayVal(b, sortKey);
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [data, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / perPage);
  const paged = sorted.slice((page-1)*perPage, page*perPage);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const colDefs = allFields.filter(f => columns.includes(f.key));

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Table size={14} className="text-blue-700" />
          <span className="font-semibold text-sm text-gray-700">Data Table</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{data.length} records</span>
        </div>
        <span className="text-xs text-gray-400">Click column header to sort</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-th w-10 text-center text-gray-400">#</th>
              {colDefs.map(f => (
                <th key={f.key} className="table-th cursor-pointer hover:bg-blue-50 select-none" onClick={() => toggleSort(f.key)}>
                  <div className="flex items-center gap-1">
                    {f.label}
                    {sortKey === f.key
                      ? (sortDir === 'asc' ? <ChevronUp size={11} className="text-blue-600"/> : <ChevronDown size={11} className="text-blue-600"/>)
                      : <ChevronDown size={11} className="text-gray-300"/>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paged.length === 0 && (
              <tr><td colSpan={colDefs.length+1} className="text-center py-10 text-gray-400">No records match your filters</td></tr>
            )}
            {paged.map((row, i) => (
              <tr key={row.id || i} className="hover:bg-blue-50/20">
                <td className="table-td text-gray-400 text-center">{(page-1)*perPage + i + 1}</td>
                {colDefs.map(f => (
                  <td key={f.key} className="table-td text-gray-700 max-w-[200px] truncate" title={displayVal(row, f.key)}>
                    {displayVal(row, f.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between bg-gray-50">
          <span className="text-xs text-gray-500">
            Showing {(page-1)*perPage+1}–{Math.min(page*perPage, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
              className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100">←</button>
            {Array.from({length: Math.min(totalPages, 7)}, (_, i) => {
              const pg = totalPages <= 7 ? i+1 : page <= 4 ? i+1 : page >= totalPages-3 ? totalPages-6+i : page-3+i;
              return (
                <button key={pg} onClick={() => setPage(pg)}
                  className={`px-2.5 py-1 text-xs border rounded ${pg===page ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-300 hover:bg-gray-100'}`}>
                  {pg}
                </button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
              className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100">→</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter panel
// ─────────────────────────────────────────────────────────────────────────────
function FilterRow({ filter, allFields, onChange, onRemove }) {
  const field = allFields.find(f => f.key === filter.field);
  return (
    <div className="flex items-center gap-2 p-2.5 bg-gray-50 border border-gray-200 rounded-lg flex-wrap">
      <select className="input-field py-1 text-xs w-44" value={filter.field}
        onChange={e => onChange({ ...filter, field: e.target.value, value: '' })}>
        {allFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>

      <select className="input-field py-1 text-xs w-32" value={filter.op}
        onChange={e => onChange({ ...filter, op: e.target.value })}>
        <option value="eq">equals</option>
        <option value="neq">not equals</option>
        <option value="contains">contains</option>
        <option value="starts">starts with</option>
        <option value="empty">is empty</option>
        <option value="notempty">is not empty</option>
      </select>

      {!['empty','notempty'].includes(filter.op) && (
        field?.type === 'boolean' ? (
          <select className="input-field py-1 text-xs w-24" value={filter.value}
            onChange={e => onChange({ ...filter, value: e.target.value })}>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        ) : (
          <input className="input-field py-1 text-xs w-36" placeholder="Value…"
            value={filter.value} onChange={e => onChange({ ...filter, value: e.target.value })} />
        )
      )}

      <button onClick={onRemove} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
        <X size={13} />
      </button>
    </div>
  );
}

function applyFilters(rows, filters) {
  return rows.filter(row => {
    return filters.every(f => {
      const raw = row[f.field];
      const val = raw === null || raw === undefined ? '' : String(raw);
      const fv  = (f.value || '').toLowerCase();
      switch (f.op) {
        case 'eq':       return val.toLowerCase() === fv;
        case 'neq':      return val.toLowerCase() !== fv;
        case 'contains': return val.toLowerCase().includes(fv);
        case 'starts':   return val.toLowerCase().startsWith(fv);
        case 'empty':    return val === '' || val === 'null' || val === 'undefined';
        case 'notempty': return val !== '' && val !== 'null' && val !== 'undefined';
        default:         return true;
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary bar
// ─────────────────────────────────────────────────────────────────────────────
function SummaryBar({ data, groupField, allFields }) {
  const field = allFields.find(f => f.key === groupField);
  if (!field || !['category','boolean'].includes(field.type)) return null;
  const counts = groupByField(data, groupField);
  const top = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 5);
  const total = data.length;
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {top.map(([k, v], i) => (
        <div key={k} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: getColor(i) }} />
          <span className="text-xs font-medium text-gray-700">{k}</span>
          <span className="text-xs text-gray-400">{v}</span>
          <span className="text-xs text-gray-300">({((v/total)*100).toFixed(0)}%)</span>
        </div>
      ))}
      {Object.keys(counts).length > 5 && (
        <div className="flex items-center px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
          <span className="text-xs text-gray-400">+{Object.keys(counts).length - 5} more</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Export helpers
// ─────────────────────────────────────────────────────────────────────────────
function exportCSV(data, columns, allFields) {
  const colDefs = allFields.filter(f => columns.includes(f.key));
  const header  = colDefs.map(f => f.label).join(',');
  const rows    = data.map(r => colDefs.map(f => {
    const v = displayVal(r, f.key);
    return `"${v.replace(/"/g,'""')}"`;
  }).join(','));
  const csv  = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url;
  a.download = `report-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function ReportBuilderPage() {
  // ── Data source ─────────────────────────────────────────────────────────
  const [source,    setSource]    = useState('asset');  // 'asset' | 'ext'
  const [rawData,   setRawData]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [generated, setGenerated] = useState(false);

  // ── Report config ────────────────────────────────────────────────────────
  const [viewType,    setViewType]    = useState('table');
  const [groupField,  setGroupField]  = useState('department');
  const [colField,    setColField]    = useState('asset_type');  // pivot second axis
  const [tableColumns,setTableColumns]= useState(['vm_name','ip_address','department','asset_type','server_status','eol_status','location']);
  const [filters,     setFilters]     = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showColPicker,setShowColPicker] = useState(false);

  const allFields = source === 'asset' ? ASSET_FIELDS : EXT_FIELDS;
  const categoryFields = allFields.filter(f => f.type === 'category' || f.type === 'boolean');

  // ── Derived filtered data ────────────────────────────────────────────────
  const filteredData = useMemo(() => applyFilters(rawData, filters), [rawData, filters]);
  const groupFieldLabel = allFields.find(f => f.key === groupField)?.label || groupField;
  const colFieldLabel   = allFields.find(f => f.key === colField)?.label   || colField;

  // ── Load data ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setGenerated(false);
    try {
      const r = source === 'asset'
        ? await reportAPI.getAssets()
        : await reportAPI.getExtAssets();
      setRawData(r.data);
      setGenerated(true);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to load data');
    } finally { setLoading(false); }
  }, [source]);

  // ── Filter helpers ───────────────────────────────────────────────────────
  const addFilter = () => setFilters(p => [...p, { id: Date.now(), field: allFields[0].key, op: 'eq', value: '' }]);
  const updateFilter = (id, upd) => setFilters(p => p.map(f => f.id === id ? { ...f, ...upd } : f));
  const removeFilter = (id) => setFilters(p => p.filter(f => f.id !== id));

  // ── Column toggle ────────────────────────────────────────────────────────
  const toggleCol = (key) => setTableColumns(p =>
    p.includes(key) ? p.filter(k => k !== key) : [...p, key]
  );

  // Reset on source change
  useEffect(() => {
    setGenerated(false);
    setRawData([]);
    setFilters([]);
    setGroupField('department');
    setColField('asset_type');
    setTableColumns(['vm_name','ip_address','department','asset_type','server_status','eol_status','location']);
  }, [source]);

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-800 rounded-xl flex items-center justify-center">
            <BarChart2 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Report Builder</h1>
            <p className="text-sm text-gray-500 mt-0.5">Customize, visualize and export reports from Asset or Extended Inventory data</p>
          </div>
        </div>
        {generated && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportCSV(filteredData, tableColumns, allFields)}
              className="btn-secondary text-xs"
            >
              <Download size={13} /> Export CSV
            </button>
          </div>
        )}
      </div>

      {/* ── Config panel ── */}
      <div className="card mb-5 space-y-5">

        {/* Row 1: Source + View Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Data source */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Data Source</p>
            <div className="flex gap-2">
              {[['asset','Asset Inventory'],['ext','Extended Inventory']].map(([k,l]) => (
                <button key={k} onClick={() => setSource(k)}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border transition-all ${
                    source === k
                      ? 'bg-blue-700 text-white border-blue-700 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* View type */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Visualization Type</p>
            <div className="flex flex-wrap gap-1.5">
              {VIEW_TYPES.map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setViewType(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    viewType === key
                      ? 'bg-blue-700 text-white border-blue-700'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700'
                  }`}>
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Group field (charts) / column picker (table) / row+col (pivot) */}
        {viewType === 'table' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Visible Columns</p>
              <button onClick={() => setShowColPicker(p => !p)}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Settings size={11} /> {showColPicker ? 'Hide picker' : 'Customize columns'} ({tableColumns.length} selected)
              </button>
            </div>
            {showColPicker && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                {allFields.map(f => (
                  <label key={f.key} className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 hover:text-blue-700">
                    <input type="checkbox" className="accent-blue-600 w-3.5 h-3.5"
                      checked={tableColumns.includes(f.key)}
                      onChange={() => toggleCol(f.key)} />
                    {f.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {viewType === 'pivot' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Row Field</label>
              <select className="input-field" value={groupField} onChange={e => setGroupField(e.target.value)}>
                {allFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Column Field</label>
              <select className="input-field" value={colField} onChange={e => setColField(e.target.value)}>
                {allFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
          </div>
        ) : viewType !== 'table' && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Group / Categorize By</label>
            <select className="input-field max-w-sm" value={groupField} onChange={e => setGroupField(e.target.value)}>
              {allFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
        )}

        {/* Row 3: Filters */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Filters {filters.length > 0 && <span className="text-blue-600 normal-case font-normal ml-1">({filters.length} active)</span>}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowFilters(p => !p)}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Filter size={11} /> {showFilters ? 'Hide filters' : 'Show filters'}
              </button>
              {filters.length > 0 && (
                <button onClick={() => setFilters([])} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                  <RotateCcw size={11} /> Clear all
                </button>
              )}
            </div>
          </div>
          {showFilters && (
            <div className="space-y-2">
              {filters.map(f => (
                <FilterRow key={f.id} filter={f} allFields={allFields}
                  onChange={upd => updateFilter(f.id, upd)}
                  onRemove={() => removeFilter(f.id)} />
              ))}
              <button onClick={addFilter}
                className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg font-medium transition-colors">
                <Plus size={12} /> Add Filter
              </button>
            </div>
          )}
        </div>

        {/* Generate button */}
        <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
          <button onClick={fetchData} disabled={loading}
            className="btn-primary">
            <Play size={14} /> {loading ? 'Loading data…' : generated ? 'Refresh Data' : 'Generate Report'}
          </button>
          {generated && (
            <span className="text-xs text-gray-400">
              {filteredData.length} record{filteredData.length !== 1 ? 's' : ''}
              {filters.length > 0 && ` (filtered from ${rawData.length})`}
              {' '}· {source === 'asset' ? 'Asset Inventory' : 'Extended Inventory'}
            </span>
          )}
        </div>
      </div>

      {/* ── Output ── */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400 animate-pulse">
          <RefreshCw size={18} className="mr-2 animate-spin" /> Loading all records…
        </div>
      )}

      {generated && !loading && (
        <div>
          {/* Summary bar for categorical charts */}
          {viewType !== 'table' && viewType !== 'pivot' && (
            <SummaryBar data={filteredData} groupField={groupField} allFields={allFields} />
          )}

          {/* Render selected view */}
          {viewType === 'table'    && <DataTableView  data={filteredData} columns={tableColumns}  allFields={allFields} />}
          {viewType === 'bar'      && <BarChartView   data={filteredData} groupField={groupField}  fieldLabel={groupFieldLabel} />}
          {viewType === 'pie'      && <PieChartView   data={filteredData} groupField={groupField}  fieldLabel={groupFieldLabel} doughnut={false} />}
          {viewType === 'doughnut' && <PieChartView   data={filteredData} groupField={groupField}  fieldLabel={groupFieldLabel} doughnut={true} />}
          {viewType === 'line'     && <LineChartView  data={filteredData} groupField={groupField}  fieldLabel={groupFieldLabel} />}
          {viewType === 'pivot'    && colField !== groupField && (
            <PivotTableView data={filteredData} rowField={groupField} colField={colField}
              rowLabel={groupFieldLabel} colLabel={colFieldLabel} />
          )}
          {viewType === 'pivot'    && colField === groupField && (
            <div className="card text-center py-8 text-gray-400 text-sm">
              Row field and column field must be different for a pivot table.
            </div>
          )}

          {filteredData.length === 0 && !loading && (
            <div className="card text-center py-12 text-gray-400">
              <FileText size={32} className="mx-auto mb-2 opacity-20" />
              <p className="font-medium">No records match the current filters.</p>
            </div>
          )}
        </div>
      )}

      {!generated && !loading && (
        <div className="card text-center py-16 text-gray-400">
          <BarChart2 size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium text-gray-500 text-base">Configure your report above and click Generate</p>
          <p className="text-xs mt-1 text-gray-400">Choose a data source, select a visualization type, add filters, then generate.</p>
        </div>
      )}
    </div>
  );
}
