import React, { useEffect, useState, useCallback, useRef } from 'react';
import { dashboardAPI, settingsAPI } from '../services/api';
import { useConfig } from '../context/ConfigContext';
import WeeklyReportPage from './WeeklyReportPage';
import { Pie, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement, Title
} from 'chart.js';
import {
  Server, Monitor, ShieldCheck, Zap, Hand,
  CheckCircle, Power, AlertCircle, RefreshCw, AlertTriangle, Gauge,
  TrendingUp, MapPin, Building2, Activity, Layers,
  Database, Globe, Cpu, HardDrive, Network, Shield, Lock,
  Cloud, Box, BarChart2, Wifi, Radio, Smartphone, Laptop,
  Package, Wrench, Settings, Tag, Users, Eye, Search,
  Star, Circle, Square, Heart, Home, Key,
  Archive, Flag, Bell, Clock, Calendar, Filter, Hash
} from 'lucide-react';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

const ICON_MAP = {
  Server, Monitor, ShieldCheck, Zap, Hand, CheckCircle, Power, AlertCircle,
  Activity, Database, Layers, Globe, Cpu, HardDrive, Network, Shield, Lock,
  Cloud, Box, BarChart2, TrendingUp, Wifi, Radio, Smartphone, Laptop,
  Package, Wrench, Settings, Tag, MapPin, Building2, Users, Eye, Search,
  Star, Bolt: Zap, Circle, Square, Heart, Home, Key, Archive, Flag,
  Bell, Clock, Calendar, Filter, Hash
};

const DEFAULT_ICONS = {
  total_assets:            { icon: 'Server',       color: 'bg-blue-800' },
  vm_count:                { icon: 'Monitor',      color: 'bg-indigo-600' },
  physical_server_count:   { icon: 'Server',       color: 'bg-violet-600' },
  me_installed_count:      { icon: 'ShieldCheck',  color: 'bg-teal-600' },
  tenable_installed_count: { icon: 'ShieldCheck',  color: 'bg-cyan-600' },
  auto_patch_count:        { icon: 'Zap',          color: 'bg-green-600' },
  manual_patch_count:      { icon: 'Hand',         color: 'bg-blue-500' },
  exception_count:         { icon: 'AlertCircle',  color: 'bg-amber-500' },
  beijing_count:           { icon: 'Server',       color: 'bg-purple-600' },
  eol_no_patch_count:      { icon: 'AlertCircle',  color: 'bg-red-600' },
  onboard_pending_count:   { icon: 'Activity',     color: 'bg-sky-500' },
  on_hold_count:           { icon: 'Power',        color: 'bg-gray-500' },
  alive_servers:           { icon: 'CheckCircle',  color: 'bg-emerald-600' },
  powered_off_servers:     { icon: 'Power',        color: 'bg-orange-500' },
  not_alive_servers:       { icon: 'AlertCircle',  color: 'bg-red-700' },
  ext_total:               { icon: 'Layers',       color: 'bg-indigo-600' },
  ext_active:              { icon: 'CheckCircle',  color: 'bg-emerald-600' },
  ext_inactive:            { icon: 'Power',        color: 'bg-gray-500' },
  ext_me:                  { icon: 'ShieldCheck',  color: 'bg-teal-600' },
  ext_tenable:             { icon: 'ShieldCheck',  color: 'bg-cyan-600' },
};

const DEFAULT_SECTION_CONFIG = {
  section_dept_endpoint_distribution: { label: 'Department-wise Endpoint Distribution', icon: 'Building2', color: 'bg-blue-800' },
  section_patching_compliance: { label: 'Patching Compliance', icon: 'TrendingUp', color: 'bg-blue-800' },
  section_location_wise_patching_distribution: { label: 'Location-wise Patching Distribution', icon: 'MapPin', color: 'bg-blue-800' },
};

function getIconCfg(key, saved) {
  const found = saved.find(c => c.key === key);
  if (found) return { icon: found.icon, color: found.color, customIconUrl: found.customIconUrl || '' };
  return { ...(DEFAULT_ICONS[key] || { icon: 'Server', color: 'bg-blue-800' }), customIconUrl: '' };
}

function getSectionCfg(key, saved) {
  const found = saved.find(c => c.key === key);
  return { ...(DEFAULT_SECTION_CONFIG[key] || { label: key, icon: 'BarChart2', color: 'bg-blue-800' }), ...(found || {}) };
}

const StatCard = ({ label, value, statKey, iconConfig }) => {
  const cfg = getIconCfg(statKey, iconConfig);
  const Icon = ICON_MAP[cfg.icon] || Server;
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden ${cfg.customIconUrl ? 'bg-transparent' : cfg.color}`}>
        {cfg.customIconUrl
          ? <img src={cfg.customIconUrl} alt={label} className="w-full h-full object-contain rounded-xl" />
          : <Icon size={18} className="text-white" />}
      </div>
      <div>
        <p className="text-xl font-bold text-gray-800 leading-none">{parseInt(value) || 0}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</p>
      </div>
    </div>
  );
};

const SectionHeader = ({ icon: Icon, title, subtitle, color }) => (
  <div className="flex items-center gap-3 mb-4">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color || 'bg-blue-50'}`}>
      <Icon size={16} className={color ? 'text-white' : 'text-blue-800'} />
    </div>
    <div>
      <h2 className="text-base font-bold text-gray-800">{title}</h2>
      {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
    </div>
  </div>
);

const B = ({ cls, val }) => (
  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${cls}`}>{parseInt(val) || 0}</span>
);

const chartOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 10 } } } };
const barOpts   = { ...chartOpts, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } };
const stackOpts = { ...barOpts, plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 10 }, padding: 8 } } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } };
const fmtPct = (v) => `${Number(v || 0).toFixed(2)}%`;
const REFRESH_OPTIONS = [30, 60, 120, 300];
const VIEW_TABS = [
  { key: 'executive', label: 'Executive Overview' },
  { key: 'operations', label: 'Asset Inventory' },
  { key: 'extended', label: 'Extended Inventory' },
  { key: 'weekly', label: 'Weekly Report' },
];

function getScoreClass(score) {
  if (score >= 90) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (score >= 75) return 'text-blue-700 bg-blue-50 border-blue-200';
  if (score >= 60) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-red-700 bg-red-50 border-red-200';
}

function StatusBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-800">Dashboard data unavailable</p>
          <p className="text-xs text-red-700 mt-0.5">{message}</p>
        </div>
      </div>
      <button onClick={onRetry} className="btn-secondary !px-3 !py-1.5 !text-xs">Retry</button>
    </div>
  );
}

function ExecutiveKpiStrip({ stats }) {
  if (!stats) return null;
  const totalAssets = parseInt(stats.total_assets) || 0;
  const alive = parseInt(stats.alive_servers) || 0;
  const pending = parseInt(stats.onboard_pending_count) || 0;
  const onHold = parseInt(stats.on_hold_count) || 0;
  const unmanaged = pending + onHold;
  const compliance = Number(stats.compliance?.compliance_pct || 0);
  const readiness = alive > 0 ? Math.max(0, ((alive - unmanaged) / alive) * 100) : 0;
  const healthScore = Math.round((compliance * 0.6) + (readiness * 0.4));
  const scoreCls = getScoreClass(healthScore);

  const cards = [
    { label: 'Total Inventory', value: totalAssets, hint: 'Assets under management', icon: Layers },
    { label: 'Patching Compliance', value: `${compliance}%`, hint: 'Current compliance level', icon: ShieldCheck },
    { label: 'Operational Readiness', value: `${readiness.toFixed(2)}%`, hint: `${unmanaged} assets pending actions`, icon: Activity },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 font-medium">{card.label}</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.hint}</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center">
              <card.icon size={16} className="text-white" />
            </div>
          </div>
        </div>
      ))}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-gray-500 font-medium">Infrastructure Health Score</p>
          <Gauge size={15} className="text-gray-500" />
        </div>
        <div className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xl font-bold ${scoreCls}`}>
          {healthScore}
        </div>
        <p className="text-xs text-gray-400 mt-2">Weighted from compliance and readiness</p>
      </div>
    </div>
  );
}

// ── Main inventory sections ───────────────────────────────────────────────────
function DeptSection({ rows, iconConfig = [], refreshedAt }) {
  if (!rows?.length) return null;
  const sec = getSectionCfg('section_dept_endpoint_distribution', iconConfig);
  const SecIcon = ICON_MAP[sec.icon] || Building2;
  const keys  = ['total','auto_count','manual_count','exception_count','beijing_count','eol_count','onboard_pending_count','on_hold_count','alive_powered_off_count'];
  const heads = ['Total','Auto','Manual','Exception','Beijing IT','EOL','Pending','On Hold','Powered Off'];
  const cls   = ['font-bold text-gray-800','bg-green-100 text-green-700','bg-blue-100 text-blue-700','bg-amber-100 text-amber-700','bg-purple-100 text-purple-700','bg-red-100 text-red-700','bg-cyan-100 text-cyan-700','bg-gray-100 text-gray-600','bg-orange-100 text-orange-700'];
  const refreshedLabel = refreshedAt ? new Date(refreshedAt).toLocaleTimeString() : '';
  const chartData = {
    labels: rows.map(r => r.department),
    datasets: [
      { label:'Auto',   data:rows.map(r=>parseInt(r.auto_count)||0),   backgroundColor:'#16a34a', borderRadius:4 },
      { label:'Manual', data:rows.map(r=>parseInt(r.manual_count)||0), backgroundColor:'#2563eb', borderRadius:4 },
      { label:'EOL',    data:rows.map(r=>parseInt(r.eol_count)||0),    backgroundColor:'#dc2626', borderRadius:4 },
    ]
  };
  return (
    <div className="card">
      <SectionHeader
        icon={SecIcon}
        title={sec.label || 'Department-wise Endpoint Distribution'}
        subtitle={refreshedLabel
          ? `Live asset counts by department, patching type, and powered-off status. Updated ${refreshedLabel}`
          : 'Live asset counts by department, patching type, and powered-off status'}
        color={sec.color}
      />
      <div className="overflow-x-auto mb-5">
        <table key={refreshedLabel} className="w-full text-xs">
          <thead><tr className="border-b border-gray-100"><th className="text-left py-2 px-3 font-semibold text-gray-500">Department</th>{heads.map(h=><th key={h} className="text-center py-2 px-2 font-semibold text-gray-500">{h}</th>)}</tr></thead>
          <tbody>{rows.map(r=><tr key={r.department} className="border-b border-gray-50 hover:bg-gray-50"><td className="py-2 px-3 font-medium text-gray-700">{r.department}</td>{keys.map((k,i)=><td key={k} className="py-2 px-2 text-center"><B cls={cls[i]} val={r[k]}/></td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="h-52"><Bar data={chartData} options={stackOpts}/></div>
    </div>
  );
}

function ComplianceSection({ c, iconConfig = [] }) {
  if (!c) return null;
  const sec = getSectionCfg('section_patching_compliance', iconConfig);
  const SecIcon = ICON_MAP[sec.icon] || TrendingUp;
  const pct = c.compliance_pct || 0;
  const ring = { labels:['Compliant','Non-Compliant'], datasets:[{data:[pct,100-pct],backgroundColor:['#16a34a','#e5e7eb'],borderWidth:0}] };
  const mini = [
    {label:'Auto (Alive)',     val:c.auto_alive,            cls:'bg-green-100 text-green-700'},
    {label:'Manual (Alive)',   val:c.manual_alive,          cls:'bg-blue-100 text-blue-700'},
    {label:'EOL - No Patches', val:c.eol_count,             cls:'bg-red-100 text-red-700'},
    {label:'Exception',        val:c.exception_count,       cls:'bg-amber-100 text-amber-700'},
    {label:'Beijing IT Team',  val:c.beijing_count,         cls:'bg-purple-100 text-purple-700'},
    {label:'Onboard Pending',  val:c.onboard_pending_count, cls:'bg-cyan-100 text-cyan-700'},
    {label:'On Hold',          val:c.on_hold_count,         cls:'bg-gray-100 text-gray-600'},
  ];
  return (
    <div className="card">
      <SectionHeader icon={SecIcon} title={sec.label || 'Patching Compliance'} subtitle="(Auto + Manual) ÷ Alive servers" color={sec.color} />
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex flex-col items-center w-48 flex-shrink-0">
          <div className="relative h-36 w-36">
            <Doughnut data={ring} options={{...chartOpts,cutout:'72%',plugins:{legend:{display:false}}}}/>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-black text-gray-800">{pct}%</p>
              <p className="text-xs text-gray-400">Compliant</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">{parseInt(c.total_alive)||0} alive servers</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 flex-1">
          {mini.map(m=><div key={m.label} className={`rounded-xl p-3 ${m.cls}`}><p className="text-lg font-bold leading-none">{parseInt(m.val)||0}</p><p className="text-xs mt-1 opacity-80">{m.label}</p></div>)}
        </div>
      </div>
    </div>
  );
}

function LocationSection({ rows, iconConfig = [] }) {
  if (!rows?.length) return null;
  const sec = getSectionCfg('section_location_wise_patching_distribution', iconConfig);
  const SecIcon = ICON_MAP[sec.icon] || MapPin;
  const keys  = ['total','auto_count','manual_count','eol_count','exception_count','beijing_count','onboard_pending_count','on_hold_count','alive_count'];
  const heads = ['Total','Auto','Manual','EOL','Excptn','Beijing IT','Pending','On Hold','Alive'];
  const cls   = ['font-bold text-gray-800','bg-green-100 text-green-700','bg-blue-100 text-blue-700','bg-red-100 text-red-700','bg-amber-100 text-amber-700','bg-purple-100 text-purple-700','bg-cyan-100 text-cyan-700','bg-gray-100 text-gray-600','bg-emerald-100 text-emerald-700'];
  const top5  = [...rows].sort((a,b)=>parseInt(b.total)-parseInt(a.total)).slice(0,6);
  const chartData = {
    labels: top5.map(r=>r.location),
    datasets: [
      {label:'Auto',   data:top5.map(r=>parseInt(r.auto_count)||0),   backgroundColor:'#16a34a',borderRadius:4},
      {label:'Manual', data:top5.map(r=>parseInt(r.manual_count)||0), backgroundColor:'#2563eb',borderRadius:4},
      {label:'EOL',    data:top5.map(r=>parseInt(r.eol_count)||0),    backgroundColor:'#dc2626',borderRadius:4},
      {label:'Other',  data:top5.map(r=>Math.max(0,parseInt(r.total)-(parseInt(r.auto_count)||0)-(parseInt(r.manual_count)||0)-(parseInt(r.eol_count)||0))),backgroundColor:'#9ca3af',borderRadius:4},
    ]
  };
  return (
    <div className="card">
      <SectionHeader icon={SecIcon} title={sec.label || 'Location-wise Patching Distribution'} subtitle="Asset breakdown by location and patching type" color={sec.color} />
      <div className="overflow-x-auto mb-5">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-gray-100"><th className="text-left py-2 px-3 font-semibold text-gray-500">Location</th>{heads.map(h=><th key={h} className="text-center py-2 px-2 font-semibold text-gray-500">{h}</th>)}</tr></thead>
          <tbody>{rows.map(r=><tr key={r.location} className="border-b border-gray-50 hover:bg-gray-50"><td className="py-2 px-3 font-medium text-gray-700">{r.location}</td>{keys.map((k,i)=><td key={k} className="py-2 px-2 text-center"><B cls={cls[i]} val={r[k]}/></td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="h-52"><Bar data={chartData} options={stackOpts}/></div>
    </div>
  );
}

function AssetInventoryMatrixSection({ rows, cfg, refreshedAt }) {
  if (!rows?.length) return null;
  const labels = cfg?.labels || {};
  const refreshedLabel = refreshedAt ? new Date(refreshedAt).toLocaleTimeString() : '';
  const columns = [
    { key: 'auto_count', label: labels.auto || 'Auto' },
    { key: 'manual_count', label: labels.manual || 'Manual' },
    { key: 'alive_powered_off_count', label: labels.alive_powered_off || 'Alive but Powered Off' },
    { key: 'beijing_count', label: labels.beijing || 'Beijing IT Team' },
    { key: 'on_hold_count', label: labels.on_hold || 'On Hold' },
    { key: 'onboard_pending_count', label: labels.onboard_pending || 'Onboard Pending' },
    { key: 'exception_count', label: labels.exception || 'Exception' },
  ];

  return (
    <div className="card">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Row Field</p>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-2.5 text-slate-800 font-medium">
            Department
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Column Field</p>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-2.5 text-slate-800 font-medium">
            Patching Type
          </div>
        </div>
      </div>
      <SectionHeader
        icon={Building2}
        title="Pivot: Department × Patching Type"
        subtitle={refreshedLabel ? `${rows.length} rows · ${columns.length} columns · VM inventory only · Updated ${refreshedLabel}` : `${rows.length} rows · ${columns.length} columns · VM inventory only`}
        color="bg-blue-800"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1180px]">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200">
              <th className="text-left py-3 px-3 font-bold text-blue-700 uppercase whitespace-nowrap">Department \ Patching Type</th>
              {columns.map((col) => (
                <th key={col.key} className="text-center py-3 px-3 font-bold text-blue-700 uppercase whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.department} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-3 px-3 font-medium text-slate-800 whitespace-nowrap">{row.department}</td>
                {columns.map((col) => {
                  const val = parseInt(row[col.key]) || 0;
                  return (
                    <td key={`${row.department}-${col.key}`} className="py-3 px-3 text-center font-semibold text-blue-700">
                      {val > 0 ? val : <span className="text-slate-300">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Extended inventory sections ───────────────────────────────────────────────
function VmCountBreakdownSection({ title, subtitle, rows, loading, error, icon: Icon = BarChart2, color = '#2563eb' }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const chartData = {
    labels: safeRows.map((row) => row?.name || 'Unknown'),
    datasets: [
      {
        label: 'Count',
        data: safeRows.map((row) => parseInt(row?.count, 10) || 0),
        backgroundColor: color,
        borderRadius: 6,
      },
    ],
  };

  return (
    <div className="card">
      <SectionHeader icon={Icon} title={title} subtitle={subtitle} color="bg-blue-800" />
      {loading ? (
        <div className="flex min-h-[220px] items-center justify-center text-sm text-gray-500">
          <RefreshCw size={16} className="mr-2 animate-spin" /> Loading...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">
          {error}
        </div>
      ) : safeRows.length === 0 ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm font-medium text-slate-500">
          No Data
        </div>
      ) : (
        <>
          <div className="h-56">
            <Bar
              data={chartData}
              options={{
                ...barOpts,
                indexAxis: 'y',
                plugins: { legend: { display: false } },
              }}
            />
          </div>
          <div className="mt-4 space-y-2">
            {safeRows.map((row) => (
              <div key={`${title}-${row.name}`} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="text-sm font-medium text-slate-700">{row.name || 'Unknown'}</span>
                <span className="text-sm font-bold text-blue-700">{parseInt(row.count, 10) || 0}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ExtDeptSection({ rows, refreshedAt }) {
  if (!rows?.length) return null;
  const keys  = [
    'total', 'active_count', 'inactive_count', 'decommissioned_count', 'maintenance_count',
    'auto_count', 'manual_count', 'exception_count', 'beijing_count', 'eol_count',
    'not_applicable_count', 'onboard_pending_count', 'on_hold_count',
    'alive_count', 'powered_off_count', 'not_alive_count',
    'me_count', 'tenable_count',
  ];
  const heads = [
    'Total', 'Active', 'Inactive', 'Decommissioned', 'Maintenance',
    'Auto', 'Manual', 'Exception', 'Beijing IT', 'EOL', 'Not Applicable',
    'Pending', 'On Hold', 'Alive', 'Powered Off', 'Not Alive', 'ME', 'Tenable',
  ];
  const cls   = [
    'font-bold text-gray-800',
    'bg-green-100 text-green-700',
    'bg-gray-100 text-gray-600',
    'bg-red-100 text-red-700',
    'bg-amber-100 text-amber-700',
    'bg-emerald-100 text-emerald-700',
    'bg-blue-100 text-blue-700',
    'bg-orange-100 text-orange-700',
    'bg-purple-100 text-purple-700',
    'bg-rose-100 text-rose-700',
    'bg-slate-100 text-slate-700',
    'bg-cyan-100 text-cyan-700',
    'bg-zinc-100 text-zinc-700',
    'bg-lime-100 text-lime-700',
    'bg-yellow-100 text-yellow-700',
    'bg-pink-100 text-pink-700',
    'bg-teal-100 text-teal-700',
    'bg-sky-100 text-sky-700',
  ];
  const refreshedLabel = refreshedAt ? new Date(refreshedAt).toLocaleTimeString() : '';
  const chartData = {
    labels: rows.map(r=>r.department),
    datasets: [
      {label:'Active',   data:rows.map(r=>parseInt(r.active_count)||0),   backgroundColor:'#059669',borderRadius:4},
      {label:'Inactive', data:rows.map(r=>parseInt(r.inactive_count)||0), backgroundColor:'#9ca3af',borderRadius:4},
      {label:'Decommissioned', data:rows.map(r=>parseInt(r.decommissioned_count)||0), backgroundColor:'#dc2626', borderRadius:4},
      {label:'Maintenance', data:rows.map(r=>parseInt(r.maintenance_count)||0), backgroundColor:'#d97706', borderRadius:4},
    ]
  };
  return (
    <div className="card">
      <SectionHeader
        icon={Building2}
        title="Ext. Dept-wise Endpoint Distribution"
        subtitle={refreshedLabel
          ? `Extended inventory assets by department with status, patching, agent, and server-state details. Updated ${refreshedLabel}`
          : 'Extended inventory assets by department with status, patching, agent, and server-state details'}
      />
      <div className="overflow-x-auto mb-5">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-gray-100"><th className="text-left py-2 px-3 font-semibold text-gray-500">Department</th>{heads.map(h=><th key={h} className="text-center py-2 px-2 font-semibold text-gray-500">{h}</th>)}</tr></thead>
          <tbody>{rows.map(r=><tr key={r.department} className="border-b border-gray-50 hover:bg-gray-50"><td className="py-2 px-3 font-medium text-gray-700">{r.department}</td>{keys.map((k,i)=><td key={k} className="py-2 px-2 text-center"><B cls={cls[i]} val={r[k]}/></td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="h-48"><Bar data={chartData} options={stackOpts}/></div>
    </div>
  );
}

function ExtComplianceSection({ extStats }) {
  if (!extStats) return null;
  const total  = parseInt(extStats.total) || 0;
  const active = parseInt(extStats.active) || 0;
  const pct    = total > 0 ? Math.round((active / total) * 100) : 0;
  const ring   = { labels:['Active','Other'], datasets:[{data:[active,Math.max(0,total-active)],backgroundColor:['#059669','#e5e7eb'],borderWidth:0}] };
  const mini   = [
    {label:'Active',         val:extStats.active,        cls:'bg-green-100 text-green-700'},
    {label:'Inactive',       val:extStats.inactive,      cls:'bg-gray-100 text-gray-600'},
    {label:'Decommissioned', val:extStats.decommissioned,cls:'bg-red-100 text-red-700'},
    {label:'Maintenance',    val:extStats.maintenance,   cls:'bg-amber-100 text-amber-700'},
    {label:'ME Installed',   val:extStats.me_count,      cls:'bg-teal-100 text-teal-700'},
    {label:'Tenable',        val:extStats.tenable_count, cls:'bg-cyan-100 text-cyan-700'},
  ];
  return (
    <div className="card">
      <SectionHeader icon={TrendingUp} title="Ext. Inventory Active Status" subtitle="Active vs non-active extended inventory records" />
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex flex-col items-center w-48 flex-shrink-0">
          <div className="relative h-36 w-36">
            <Doughnut data={ring} options={{...chartOpts,cutout:'72%',plugins:{legend:{display:false}}}}/>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-black text-gray-800">{pct}%</p>
              <p className="text-xs text-gray-400">Active</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">{total} total records</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1">
          {mini.map(m=><div key={m.label} className={`rounded-xl p-3 ${m.cls}`}><p className="text-lg font-bold leading-none">{parseInt(m.val)||0}</p><p className="text-xs mt-1 opacity-80">{m.label}</p></div>)}
        </div>
      </div>
    </div>
  );
}

function ExtPatchingStatusSection({ rows }) {
  if (!rows?.length) return null;
  const totals = rows.reduce((acc, row) => {
    acc.auto += parseInt(row.auto_count) || 0;
    acc.manual += parseInt(row.manual_count) || 0;
    acc.exception += parseInt(row.exception_count) || 0;
    acc.beijing += parseInt(row.beijing_count) || 0;
    acc.eol += parseInt(row.eol_count) || 0;
    acc.notApplicable += parseInt(row.not_applicable_count) || 0;
    acc.pending += parseInt(row.onboard_pending_count) || 0;
    acc.onHold += parseInt(row.on_hold_count) || 0;
    acc.alivePoweredOff += parseInt(row.powered_off_count) || 0;
    return acc;
  }, {
    auto: 0,
    manual: 0,
    exception: 0,
    beijing: 0,
    eol: 0,
    notApplicable: 0,
    pending: 0,
    onHold: 0,
    alivePoweredOff: 0,
  });

  const managed = totals.auto + totals.manual;
  const denominator = totals.auto + totals.manual + totals.pending + totals.onHold + totals.alivePoweredOff;
  const pct = denominator > 0 ? Math.round((managed / denominator) * 100) : 0;
  const ring = {
    labels: ['Auto + Manual', 'Other'],
    datasets: [{
      data: [managed, Math.max(0, denominator - managed)],
      backgroundColor: ['#2563eb', '#e5e7eb'],
      borderWidth: 0,
    }],
  };
  const mini = [
    { label: 'Auto', val: totals.auto, cls: 'bg-green-100 text-green-700' },
    { label: 'Manual', val: totals.manual, cls: 'bg-blue-100 text-blue-700' },
    { label: 'Exception', val: totals.exception, cls: 'bg-amber-100 text-amber-700' },
    { label: 'Beijing IT', val: totals.beijing, cls: 'bg-purple-100 text-purple-700' },
    { label: 'EOL', val: totals.eol, cls: 'bg-red-100 text-red-700' },
    { label: 'Not Applicable', val: totals.notApplicable, cls: 'bg-slate-100 text-slate-700' },
    { label: 'Pending', val: totals.pending, cls: 'bg-cyan-100 text-cyan-700' },
    { label: 'On Hold', val: totals.onHold, cls: 'bg-gray-100 text-gray-700' },
    { label: 'Alive Powered Off', val: totals.alivePoweredOff, cls: 'bg-orange-100 text-orange-700' },
  ];

  return (
    <div className="card">
      <SectionHeader icon={Zap} title="Ext. Inventory Patching Status" subtitle="Patching type distribution across extended inventory records" />
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex flex-col items-center w-48 flex-shrink-0">
          <div className="relative h-36 w-36">
            <Doughnut data={ring} options={{...chartOpts,cutout:'72%',plugins:{legend:{display:false}}}}/>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-black text-gray-800">{pct}%</p>
              <p className="text-xs text-gray-400">Auto + Manual</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">{denominator} total records</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1">
          {mini.map(m => <div key={m.label} className={`rounded-xl p-3 ${m.cls}`}><p className="text-lg font-bold leading-none">{parseInt(m.val)||0}</p><p className="text-xs mt-1 opacity-80">{m.label}</p></div>)}
        </div>
      </div>
    </div>
  );
}

function AssetInventoryActiveStatus({ stats }) {
  const data = stats?.asset_inventory_active_status;
  if (!data) return null;
  const active = parseInt(data.active) || 0;
  const nonActive = parseInt(data.non_active) || 0;
  const pending = parseInt(data.pending) || 0;
  const onHold = parseInt(data.on_hold) || 0;
  const uncategorized = parseInt(data.uncategorized) || 0;
  const total = parseInt(data.total) || 0;
  const pct = total > 0 ? Math.round((active / total) * 100) : 0;
  const ring = {
    labels: ['Active', 'Other'],
    datasets: [{
      data: [active, Math.max(0, nonActive)],
      backgroundColor: ['#059669', '#e5e7eb'],
      borderWidth: 0,
    }],
  };
  const mini = [
    { label: 'Active', val: active, cls: 'bg-green-100 text-green-700' },
    { label: 'Non-Active', val: nonActive, cls: 'bg-orange-100 text-orange-700' },
    { label: 'Pending', val: pending, cls: 'bg-cyan-100 text-cyan-700' },
    { label: 'On Hold', val: onHold, cls: 'bg-gray-100 text-gray-700' },
    { label: 'Uncategorized', val: uncategorized, cls: 'bg-slate-100 text-slate-700' },
    { label: 'Total', val: total, cls: 'bg-slate-100 text-slate-700' },
  ];

  return (
    <div className="card">
      <SectionHeader icon={TrendingUp} title="Asset Inventory Active Status" subtitle="VM and Physical Server records on Windows/Linux, based on patching type and excluding VMware" />
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex flex-col items-center w-48 flex-shrink-0">
          <div className="relative h-36 w-36">
            <Doughnut data={ring} options={{ ...chartOpts, cutout: '72%', plugins: { legend: { display: false } } }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-black text-gray-800">{pct}%</p>
              <p className="text-xs text-gray-400">Active</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">{total} total records</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1">
          {mini.map((m) => (
            <div key={m.label} className={`rounded-xl p-3 ${m.cls}`}>
              <p className="text-lg font-bold leading-none">{parseInt(m.val) || 0}</p>
              <p className="text-xs mt-1 opacity-80">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AssetInventoryPatchingStatus({ stats }) {
  const data = stats?.asset_inventory_patching_status;
  if (!data) return null;
  const auto = parseInt(data.auto) || 0;
  const manual = parseInt(data.manual) || 0;
  const exception = parseInt(data.exception) || 0;
  const beijing = parseInt(data.beijing) || 0;
  const eol = parseInt(data.eol) || 0;
  const pending = parseInt(data.pending) || 0;
  const onHold = parseInt(data.on_hold) || 0;
  const alivePoweredOff = parseInt(data.alive_powered_off) || 0;
  const managed = auto + manual;
  const denominator = auto + manual + pending + onHold + alivePoweredOff;
  const pct = denominator > 0 ? Math.round((managed / denominator) * 100) : 0;
  const ring = {
    labels: ['Auto + Manual', 'Other'],
    datasets: [{
      data: [managed, Math.max(0, denominator - managed)],
      backgroundColor: ['#2563eb', '#e5e7eb'],
      borderWidth: 0,
    }],
  };
  const mini = [
    { label: 'Auto', val: auto, cls: 'bg-green-100 text-green-700' },
    { label: 'Manual', val: manual, cls: 'bg-blue-100 text-blue-700' },
    { label: 'Exception', val: exception, cls: 'bg-amber-100 text-amber-700' },
    { label: 'Beijing IT', val: beijing, cls: 'bg-purple-100 text-purple-700' },
    { label: 'EOL', val: eol, cls: 'bg-red-100 text-red-700' },
    { label: 'Pending', val: pending, cls: 'bg-cyan-100 text-cyan-700' },
    { label: 'On Hold', val: onHold, cls: 'bg-gray-100 text-gray-700' },
    { label: 'Alive Powered Off', val: alivePoweredOff, cls: 'bg-orange-100 text-orange-700' },
  ];

  return (
    <div className="card">
      <SectionHeader icon={Zap} title="Asset Inventory Patching Status" subtitle="Patching type distribution across VM, Physical Server, and Bare Metal Server inventory" />
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex flex-col items-center w-48 flex-shrink-0">
          <div className="relative h-36 w-36">
            <Doughnut data={ring} options={{ ...chartOpts, cutout: '72%', plugins: { legend: { display: false } } }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-black text-gray-800">{pct}%</p>
              <p className="text-xs text-gray-400">Auto + Manual</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">{denominator} total records</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1">
          {mini.map((m) => (
            <div key={m.label} className={`rounded-xl p-3 ${m.cls}`}>
              <p className="text-lg font-bold leading-none">{parseInt(m.val) || 0}</p>
              <p className="text-xs mt-1 opacity-80">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExtLocationSection({ rows }) {
  if (!rows?.length) return null;
  const keys  = ['total','active_count','inactive_count','me_count','tenable_count'];
  const heads = ['Total','Active','Inactive','ME','Tenable'];
  const cls   = ['font-bold text-gray-800','bg-green-100 text-green-700','bg-gray-100 text-gray-600','bg-teal-100 text-teal-700','bg-cyan-100 text-cyan-700'];
  const top5  = [...rows].sort((a,b)=>parseInt(b.total)-parseInt(a.total)).slice(0,6);
  const chartData = {
    labels: top5.map(r=>r.location),
    datasets: [
      {label:'Active',   data:top5.map(r=>parseInt(r.active_count)||0),   backgroundColor:'#059669',borderRadius:4},
      {label:'Inactive', data:top5.map(r=>parseInt(r.inactive_count)||0), backgroundColor:'#9ca3af',borderRadius:4},
      {label:'ME',       data:top5.map(r=>parseInt(r.me_count)||0),       backgroundColor:'#0d9488',borderRadius:4},
    ]
  };
  return (
    <div className="card">
      <SectionHeader icon={MapPin} title="Ext. Location-wise Distribution" subtitle="Extended inventory assets by location" />
      <div className="overflow-x-auto mb-5">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-gray-100"><th className="text-left py-2 px-3 font-semibold text-gray-500">Location</th>{heads.map(h=><th key={h} className="text-center py-2 px-2 font-semibold text-gray-500">{h}</th>)}</tr></thead>
          <tbody>{rows.map(r=><tr key={r.location} className="border-b border-gray-50 hover:bg-gray-50"><td className="py-2 px-3 font-medium text-gray-700">{r.location}</td>{keys.map((k,i)=><td key={k} className="py-2 px-2 text-center"><B cls={cls[i]} val={r[k]}/></td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="h-48"><Bar data={chartData} options={stackOpts}/></div>
    </div>
  );
}

function InventoryComplianceCard({ data, locationRows = [] }) {
  if (!data) return null;
  return (
    <div className="card">
      <SectionHeader icon={TrendingUp} title="Total Inventory MSL Compliance" subtitle="MSL includes VMs in Alive/Powered Off scope and excludes Decom/Not Applicable" />
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
          <span className="font-medium text-gray-700">MSL</span>
          <span className="font-semibold text-blue-800">{data.msl?.compliant || 0} out of {data.msl?.total || 0} = {fmtPct(data.msl?.pct)}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
          <span className="font-medium text-gray-700">Extended Inventory</span>
          <span className="font-semibold text-indigo-800">{data.ext?.compliant || 0} out of {data.ext?.total || 0} = {fmtPct(data.ext?.pct)}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
          <span className="font-medium text-gray-700">MSL + E-INV</span>
          <span className="font-semibold text-emerald-800">{data.combined?.compliant || 0} out of {data.combined?.total || 0} = {fmtPct(data.combined?.pct)}</span>
        </div>
      </div>

      {!!locationRows.length && (
        <div className="mt-4 overflow-x-auto">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Location-Wise Count</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 px-2 font-semibold text-gray-500">Location</th>
                <th className="text-center py-2 px-2 font-semibold text-gray-500">Count</th>
              </tr>
            </thead>
            <tbody>
              {locationRows.map((r) => (
                <tr key={r.location} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-2 font-medium text-gray-700">{r.location}</td>
                  <td className="py-2 px-2 text-center font-semibold text-blue-700">{parseInt(r.count) || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExtEndpointComplianceCard({ data }) {
  if (!data) return null;
  return (
    <div className="card">
      <SectionHeader icon={Layers} title="Ext. Endpoint Compliance" subtitle="Password and agent compliance across extended inventory endpoints" />
      <div className="space-y-2 text-sm">
        <p className="text-gray-700 font-medium">Total {data.total_endpoints || 0} endpoints</p>
        <p className="text-gray-700">For <span className="font-semibold">{data.password_received || 0}</span> endpoints we received password info.</p>
        <p className="text-blue-800 font-semibold">Compliance: {data.password_received || 0} out of {data.total_endpoints || 0} = {fmtPct(data.compliance_pct)}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
          <div className="rounded-lg bg-teal-50 border border-teal-100 px-3 py-2 text-teal-800">ManageEngine Installed: <span className="font-semibold">{data.me_installed || 0}</span></div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-gray-700">ME Not Applicable: <span className="font-semibold">{data.me_not_applicable || 0}</span></div>
          <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-amber-800">Name Conflicts: <span className="font-semibold">{data.name_conflicts || 0}</span></div>
          <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-green-800">Auto Patching: <span className="font-semibold">{data.auto_patching || 0}</span></div>
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-blue-800 md:col-span-2">Manual Patching: <span className="font-semibold">{data.manual_patching || 0}</span></div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { configVersion } = useConfig();
  const [stats, setStats]           = useState(null);
  const [vmBreakdowns, setVmBreakdowns] = useState({ department: [], location: [] });
  const [vmBreakdownLoading, setVmBreakdownLoading] = useState({ department: true, location: true });
  const [vmBreakdownError, setVmBreakdownError] = useState({ department: '', location: '' });
  const [iconConfig, setIconConfig] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError]   = useState('');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [refreshEvery, setRefreshEvery] = useState(() => {
    const raw = Number(localStorage.getItem('dashboard_refresh_sec') || 60);
    return REFRESH_OPTIONS.includes(raw) ? raw : 60;
  });
  const [activeView, setActiveView] = useState('executive');
  const hasLoadedOnceRef = useRef(false);

  const fetchStats = useCallback(async ({ silent = false } = {}) => {
    const isInitialLoad = !hasLoadedOnceRef.current;
    if (isInitialLoad) {
      setLoading(true);
    } else if (silent) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const r = await dashboardAPI.getStats();
      setStats(r.data);
      hasLoadedOnceRef.current = true;
      setLastRefresh(new Date());
      setLoadError('');
    } catch (e) {
      setLoadError(e?.response?.data?.error || e?.message || 'Failed to load dashboard statistics');
      console.error(e);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const fetchVmBreakdowns = useCallback(async ({ silent = false } = {}) => {
    if (!silent || (!vmBreakdowns.department.length && !vmBreakdowns.location.length)) {
      setVmBreakdownLoading({ department: true, location: true });
    }

    const [departmentResult, locationResult] = await Promise.allSettled([
      dashboardAPI.getVmCountByDepartment(),
      dashboardAPI.getVmCountByLocation(),
    ]);

    if (departmentResult.status === 'fulfilled') {
      setVmBreakdowns((prev) => ({
        ...prev,
        department: Array.isArray(departmentResult.value?.data) ? departmentResult.value.data : [],
      }));
      setVmBreakdownError((prev) => ({ ...prev, department: '' }));
    } else {
      setVmBreakdowns((prev) => ({ ...prev, department: [] }));
      setVmBreakdownError((prev) => ({
        ...prev,
        department: departmentResult.reason?.response?.data?.error || departmentResult.reason?.message || 'Failed to load VM count by department',
      }));
    }

    if (locationResult.status === 'fulfilled') {
      setVmBreakdowns((prev) => ({
        ...prev,
        location: Array.isArray(locationResult.value?.data) ? locationResult.value.data : [],
      }));
      setVmBreakdownError((prev) => ({ ...prev, location: '' }));
    } else {
      setVmBreakdowns((prev) => ({ ...prev, location: [] }));
      setVmBreakdownError((prev) => ({
        ...prev,
        location: locationResult.reason?.response?.data?.error || locationResult.reason?.message || 'Failed to load VM count by location',
      }));
    }

    setVmBreakdownLoading({ department: false, location: false });
  }, [vmBreakdowns.department.length, vmBreakdowns.location.length]);

  useEffect(() => {
    settingsAPI.getDashboardIcons()
      .then((r) => setIconConfig(Array.isArray(r.data) ? r.data : []))
      .catch(() => setIconConfig([]));
  }, [configVersion]);

  useEffect(() => {
    fetchStats();
    fetchVmBreakdowns();
  }, [fetchStats, fetchVmBreakdowns, configVersion]);
  useEffect(() => {
    const t = setInterval(() => {
      fetchStats({ silent: true });
      fetchVmBreakdowns({ silent: true });
    }, refreshEvery * 1000);
    return () => clearInterval(t);
  }, [fetchStats, fetchVmBreakdowns, refreshEvery]);
  useEffect(() => {
    localStorage.setItem('dashboard_refresh_sec', String(refreshEvery));
  }, [refreshEvery]);

  const ic = iconConfig;
  const mainCards = stats ? [
    {key:'total_assets',            label:'Total Assets',        value:stats.total_assets},
    {key:'vm_count',                label:'Virtual Machines',    value:stats.vm_count},
    {key:'physical_server_count',   label:'Physical Servers',    value:stats.physical_server_count},
    {key:'me_installed_count',      label:'ManageEngine',        value:stats.me_installed_count},
    {key:'tenable_installed_count', label:'Tenable',             value:stats.tenable_installed_count},
    {key:'auto_patch_count',        label:'Auto Patching',       value:stats.auto_patch_count},
    {key:'manual_patch_count',      label:'Manual Patching',     value:stats.manual_patch_count},
    {key:'exception_count',         label:'Exception',           value:stats.exception_count},
    {key:'beijing_count',           label:'Beijing IT Team',     value:stats.beijing_count},
    {key:'eol_no_patch_count',      label:'EOL - No Patches',    value:stats.eol_no_patch_count},
    {key:'onboard_pending_count',   label:'Onboard Pending',     value:stats.onboard_pending_count},
    {key:'on_hold_count',           label:'On Hold',             value:stats.on_hold_count},
    {key:'alive_servers',           label:'Alive',               value:stats.alive_servers},
    {key:'powered_off_servers',     label:'Powered Off',         value:stats.powered_off_servers},
    {key:'not_alive_servers',       label:'Not Alive',           value:stats.not_alive_servers},
  ] : [];

  const extCards = stats?.ext_stats ? [
    {key:'ext_total',   label:'Ext. Total',       value:stats.ext_stats.total},
    {key:'ext_active',  label:'Ext. Active',      value:stats.ext_stats.active},
    {key:'ext_inactive',label:'Ext. Inactive',    value:stats.ext_stats.inactive},
    {key:'ext_me',      label:'Ext. ME Installed', value:stats.ext_stats.me_count},
    {key:'ext_tenable', label:'Ext. Tenable',     value:stats.ext_stats.tenable_count},
  ] : [];

  const vmPie     = stats ? { labels:['Virtual Machines','Physical Servers'], datasets:[{data:[stats.vm_count,stats.physical_server_count],backgroundColor:['#1d4ed8','#7c3aed'],borderWidth:0}] } : null;
  const statusBar = stats ? { labels:['Alive','Powered Off','Not Alive'], datasets:[{label:'Servers',data:[stats.alive_servers,stats.powered_off_servers,stats.not_alive_servers],backgroundColor:['#059669','#f97316','#dc2626'],borderRadius:6}] } : null;
  const patchBar  = stats ? { labels:['Auto','Manual','Exception','Beijing IT','EOL','Pending','On Hold'], datasets:[{label:'Count',data:[stats.auto_patch_count,stats.manual_patch_count,stats.exception_count,stats.beijing_count,stats.eol_no_patch_count,stats.onboard_pending_count,stats.on_hold_count],backgroundColor:['#16a34a','#2563eb','#d97706','#7c3aed','#dc2626','#0891b2','#9ca3af'],borderRadius:6}] } : null;
  const lastRefreshDate = lastRefresh.toLocaleDateString();
  const lastRefreshTime = lastRefresh.toLocaleTimeString();
  const stale = ((Date.now() - lastRefresh.getTime()) / 1000) > (refreshEvery * 2);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-blue-50 px-5 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Infrastructure inventory overview for enterprise operations</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
              Last sync: {lastRefreshDate} {lastRefreshTime}
            </span>
            <span className={`px-2 py-1 rounded-full font-medium ${stale ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {stale ? 'Data stale' : 'Live'}
            </span>
            {isRefreshing && (
              <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium animate-pulse">
                Syncing...
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium">Auto-refresh</label>
          <select
            className="input-field !w-auto !py-1.5 !px-2 !text-xs"
            value={refreshEvery}
            onChange={(e) => setRefreshEvery(Number(e.target.value))}
          >
            {REFRESH_OPTIONS.map((sec) => (
              <option key={sec} value={sec}>Every {sec}s</option>
            ))}
          </select>
          <button
            onClick={() => {
              fetchStats();
              fetchVmBreakdowns();
            }}
            disabled={loading || isRefreshing}
            className="btn-secondary"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>
      </div>

      <StatusBanner
        message={loadError}
        onRetry={() => {
          fetchStats();
          fetchVmBreakdowns();
        }}
      />

      <div className="flex flex-wrap gap-1 bg-slate-100 border border-slate-200 p-1 rounded-xl w-fit">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveView(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeView === tab.key ? 'bg-slate-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && !stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3 animate-pulse">
          {Array(20).fill(0).map((_,i)=><div key={i} className="card h-16 bg-gray-100" />)}
        </div>
      ) : (
        <>
          {activeView !== 'weekly' && <ExecutiveKpiStrip stats={stats} />}

          {activeView === 'executive' && (
            <>
              <div>
                <SectionHeader icon={Activity} title="Asset Inventory Summary" subtitle="Live counts across VM and Physical Server inventory" />
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                  {mainCards.map(c=><StatCard key={c.key} {...c} statKey={c.key} iconConfig={ic}/>)}
                </div>
              </div>

              {extCards.length > 0 && (
                <div>
                  <SectionHeader icon={Layers} title="Extended Inventory Summary" subtitle="Live counts from extended inventory" />
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                    {extCards.map(c=><StatCard key={c.key} {...c} statKey={c.key} iconConfig={ic}/>)}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {vmPie && <div className="card"><p className="text-sm font-semibold text-gray-700 mb-3">VM vs Physical</p><div className="h-44"><Pie data={vmPie} options={chartOpts}/></div></div>}
                {statusBar && <div className="card"><p className="text-sm font-semibold text-gray-700 mb-3">Server Status</p><div className="h-44"><Bar data={statusBar} options={barOpts}/></div></div>}
                {patchBar && <div className="card"><p className="text-sm font-semibold text-gray-700 mb-3">Patching Categories</p><div className="h-44"><Bar data={patchBar} options={barOpts}/></div></div>}
              </div>

              <InventoryComplianceCard data={stats?.inventory_compliance} locationRows={stats?.location_distribution || []}/>
              <ExtEndpointComplianceCard data={stats?.ext_endpoint_compliance}/>
            </>
          )}

          {activeView === 'operations' && (
            <div className="space-y-4">
              <DeptSection
                rows={stats?.dept_stats}
                iconConfig={ic}
                refreshedAt={lastRefresh}
              />
              <AssetInventoryActiveStatus stats={stats} />
              <AssetInventoryPatchingStatus stats={stats} />
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <VmCountBreakdownSection
                  title="VM Count by Location"
                  subtitle="Live VM inventory grouped by location"
                  rows={vmBreakdowns.location}
                  loading={vmBreakdownLoading.location}
                  error={vmBreakdownError.location}
                  icon={MapPin}
                  color="#0f766e"
                />
              </div>
            </div>
          )}

          {activeView === 'extended' && (
            <>
              {extCards.length > 0 && (
                <div>
                  <SectionHeader icon={Layers} title="Extended Inventory Summary" subtitle="Live counts from extended inventory" />
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                    {extCards.map(c=><StatCard key={c.key} {...c} statKey={c.key} iconConfig={ic}/>)}
                  </div>
                </div>
              )}
              <ExtEndpointComplianceCard data={stats?.ext_endpoint_compliance}/>
              {stats?.ext_dept_stats?.length > 0 && (
                <>
                  <div className="border-t border-indigo-100 pt-2">
                    <h2 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                      <Layers size={14}/> Extended Inventory Analytics
                    </h2>
                  </div>
                  <ExtDeptSection rows={stats?.ext_dept_stats} refreshedAt={lastRefresh}/>
                  <ExtComplianceSection extStats={stats?.ext_stats}/>
                  <ExtPatchingStatusSection rows={stats?.ext_dept_stats}/>
                  <ExtLocationSection rows={stats?.ext_location_stats}/>
                </>
              )}
            </>
          )}

          {activeView === 'weekly' && (
            <WeeklyReportPage embedded />
          )}

          {!stats && !loading && (
            <div className="card text-center">
              <AlertTriangle size={20} className="mx-auto text-amber-500" />
              <p className="text-sm font-semibold text-gray-700 mt-2">No dashboard data returned</p>
              <p className="text-xs text-gray-500 mt-1">Try refreshing to fetch the latest inventory state.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

