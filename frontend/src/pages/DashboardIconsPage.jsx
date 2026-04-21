import React, { useState, useEffect, useCallback } from 'react';
import { settingsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import toast from 'react-hot-toast';
import {
  Server, Monitor, ShieldCheck, Zap, Hand, CheckCircle, Power,
  AlertCircle, Activity, Database, Layers, Globe, Cpu, HardDrive,
  Network, Shield, Lock, Cloud, Box, BarChart2, TrendingUp,
  Wifi, Radio, Smartphone, Laptop, Package, Wrench, Settings,
  Save, RotateCcw, Tag, MapPin, Building2, Users, Eye, Search,
  Star, Circle, Square, Triangle, Heart, Home, Key,
  Archive, Flag, Bell, Clock, Calendar, Filter, Hash, Upload, X
} from 'lucide-react';

// ── All available icons ──────────────────────────────────────────────────────
const ICON_MAP = {
  Server, Monitor, ShieldCheck, Zap, Hand, CheckCircle, Power, AlertCircle,
  Activity, Database, Layers, Globe, Cpu, HardDrive, Network, Shield, Lock,
  Cloud, Box, BarChart2, TrendingUp, Wifi, Radio, Smartphone, Laptop,
  Package, Wrench, Settings, Tag, MapPin, Building2, Users, Eye, Search,
  Star, Bolt: Zap, Circle, Square, Triangle, Heart, Home, Key, Archive, Flag,
  Bell, Clock, Calendar, Filter, Hash
};

const ICON_NAMES = Object.keys(ICON_MAP).sort();

// ── Available tailwind bg colors ─────────────────────────────────────────────
const COLORS = [
  { label: 'Blue 800',    value: 'bg-blue-800' },
  { label: 'Indigo',      value: 'bg-indigo-600' },
  { label: 'Violet',      value: 'bg-violet-600' },
  { label: 'Purple',      value: 'bg-purple-600' },
  { label: 'Teal',        value: 'bg-teal-600' },
  { label: 'Cyan',        value: 'bg-cyan-600' },
  { label: 'Green',       value: 'bg-green-600' },
  { label: 'Emerald',     value: 'bg-emerald-600' },
  { label: 'Blue 500',    value: 'bg-blue-500' },
  { label: 'Sky',         value: 'bg-sky-500' },
  { label: 'Amber',       value: 'bg-amber-500' },
  { label: 'Orange',      value: 'bg-orange-500' },
  { label: 'Red',         value: 'bg-red-600' },
  { label: 'Red Dark',    value: 'bg-red-700' },
  { label: 'Rose',        value: 'bg-rose-600' },
  { label: 'Gray',        value: 'bg-gray-500' },
  { label: 'Slate',       value: 'bg-slate-600' },
  { label: 'Pink',        value: 'bg-pink-500' },
  { label: 'Lime',        value: 'bg-lime-500' },
  { label: 'Yellow',      value: 'bg-yellow-500' },
];

// ── Default cards (mirrors DashboardPage statCards) ──────────────────────────
const DEFAULT_CARDS = [
  { key: 'total_assets',           label: 'Total Assets',        icon: 'Server',       color: 'bg-blue-800' },
  { key: 'vm_count',               label: 'Virtual Machines',    icon: 'Monitor',      color: 'bg-indigo-600' },
  { key: 'physical_server_count',  label: 'Physical Servers',    icon: 'Server',       color: 'bg-violet-600' },
  { key: 'me_installed_count',     label: 'ManageEngine',        icon: 'ShieldCheck',  color: 'bg-teal-600' },
  { key: 'tenable_installed_count',label: 'Tenable',             icon: 'ShieldCheck',  color: 'bg-cyan-600' },
  { key: 'auto_patch_count',       label: 'Auto Patching',       icon: 'Zap',          color: 'bg-green-600' },
  { key: 'manual_patch_count',     label: 'Manual Patching',     icon: 'Hand',         color: 'bg-blue-500' },
  { key: 'exception_count',        label: 'Exception',           icon: 'AlertCircle',  color: 'bg-amber-500' },
  { key: 'beijing_count',          label: 'Beijing IT Team',     icon: 'Server',       color: 'bg-purple-600' },
  { key: 'eol_no_patch_count',     label: 'EOL - No Patches',    icon: 'AlertCircle',  color: 'bg-red-600' },
  { key: 'onboard_pending_count',  label: 'Onboard Pending',     icon: 'Activity',     color: 'bg-sky-500' },
  { key: 'on_hold_count',          label: 'On Hold',             icon: 'Power',        color: 'bg-gray-500' },
  { key: 'alive_servers',          label: 'Alive',               icon: 'CheckCircle',  color: 'bg-emerald-600' },
  { key: 'powered_off_servers',    label: 'Powered Off',         icon: 'Power',        color: 'bg-orange-500' },
  { key: 'not_alive_servers',      label: 'Not Alive',           icon: 'AlertCircle',  color: 'bg-red-700' },
  // Extended inventory cards
  { key: 'ext_total',              label: 'Ext. Total',          icon: 'Layers',       color: 'bg-indigo-600' },
  { key: 'ext_active',             label: 'Ext. Active',         icon: 'CheckCircle',  color: 'bg-emerald-600' },
  { key: 'ext_inactive',           label: 'Ext. Inactive',       icon: 'Power',        color: 'bg-gray-500' },
  { key: 'ext_me',                 label: 'Ext. ME Installed',   icon: 'ShieldCheck',  color: 'bg-teal-600' },
  { key: 'ext_tenable',            label: 'Ext. Tenable',        icon: 'ShieldCheck',  color: 'bg-cyan-600' },
  // Dashboard section headers
  { key: 'section_dept_endpoint_distribution',          label: 'Department-wise Endpoint Distribution', icon: 'Building2',  color: 'bg-blue-800' },
  { key: 'section_patching_compliance',                 label: 'Patching Compliance',                    icon: 'TrendingUp', color: 'bg-blue-800' },
  { key: 'section_location_wise_patching_distribution', label: 'Location-wise Patching Distribution',    icon: 'MapPin',     color: 'bg-blue-800' },
];

// ── Default page / nav icons (mirrors Layout.jsx NAV + ADMIN_NAV) ──────────────
const DEFAULT_PAGE_ICONS = [
  // Main nav
  { key: 'dashboard',          label: 'Dashboard',               icon: 'LayoutDashboard', section: 'Main Navigation' },
  { key: 'asset-list',         label: 'Asset List',              icon: 'List',            section: 'Main Navigation' },
  { key: 'extended-inventory', label: 'Ext. Asset List',         icon: 'Table2',          section: 'Main Navigation' },
  { key: 'physical-assets',    label: 'Physical Servers',        icon: 'Server',          section: 'Main Navigation' },
  { key: 'configuration',      label: 'Inventory Config',        icon: 'Settings',        section: 'Main Navigation' },
  // Admin nav (keyed by route path)
  { key: '/users',                        label: 'User Management',        icon: 'Users',      section: 'Admin Navigation' },
  { key: '/password-control',             label: 'Password Control',       icon: 'Shield',     section: 'Admin Navigation' },
  { key: '/transfer-to-inventory',        label: 'Transfer to Inventory',  icon: 'ArrowRight', section: 'Admin Navigation' },
  { key: '/new-asset-import',             label: 'New Asset Import',       icon: 'DownloadCloud', section: 'Admin Navigation' },
  { key: '/excel-smart-import',           label: 'Excel Smart Import',     icon: 'DownloadCloud', section: 'Admin Navigation' },
  { key: '/import-audit-report',          label: 'Import Audit Report',    icon: 'Search',       section: 'Admin Navigation' },
  { key: '/dept-range-management',        label: 'Dept. Tag Ranges',       icon: 'Tag',        section: 'Admin Navigation' },
  { key: '/dashboard-icons',              label: 'Dashboard Icons',        icon: 'BarChart2',  section: 'Admin Navigation' },
  { key: '/backup',                       label: 'Backup & Export',        icon: 'Database',   section: 'Admin Navigation' },
  { key: '/email-notifications',          label: 'Email Notifications',    icon: 'Mail',       section: 'Admin Navigation' },
  { key: '/branding',                     label: 'Branding',               icon: 'Palette',    section: 'Admin Navigation' },
  { key: '/custom-fields',                label: 'Asset Custom Fields',    icon: 'Layers',     section: 'Admin Navigation' },
  { key: '/physical-asset-custom-fields', label: 'Physical Asset Config',  icon: 'HardDrive',  section: 'Admin Navigation' },
  { key: '/extended-custom-fields',       label: 'Extended Inv. Fields',   icon: 'Database',   section: 'Admin Navigation' },
];

// ── Icon picker ───────────────────────────────────────────────────────────────
function IconPicker({ value, onChange }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = ICON_NAMES.filter(n => !search || n.toLowerCase().includes(search.toLowerCase()));
  const SelIcon = ICON_MAP[value] || Server;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-white hover:border-blue-400 text-sm w-full">
        <SelIcon size={16} className="text-blue-700 flex-shrink-0" />
        <span className="flex-1 text-left text-gray-700">{value}</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg w-72 p-3">
          <div className="relative mb-2">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input-field pl-7 py-1.5 text-xs" placeholder="Search icons…"
              value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-6 gap-1 max-h-48 overflow-y-auto">
            {filtered.map(name => {
              const Ic = ICON_MAP[name];
              return (
                <button key={name} type="button" title={name}
                  onClick={() => { onChange(name); setOpen(false); setSearch(''); }}
                  className={`p-2 rounded-lg flex items-center justify-center transition-colors ${
                    value === name ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'
                  }`}>
                  <Ic size={16} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Color swatch ──────────────────────────────────────────────────────────────
function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLORS.map(c => (
        <button key={c.value} type="button" title={c.label} onClick={() => onChange(c.value)}
          className={`w-6 h-6 rounded-full ${c.value} transition-all ${
            value === c.value ? 'ring-2 ring-offset-1 ring-gray-500 scale-110' : 'opacity-80 hover:opacity-100'
          }`} />
      ))}
    </div>
  );
}

// ── Mini preview card — supports custom image URLs ───────────────────────────
function PreviewCard({ label, icon: iconName, color, customIconUrl }) {
  const Icon = ICON_MAP[iconName] || Server;
  return (
    <div className="card flex items-center gap-3 p-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${customIconUrl ? '' : color} overflow-hidden`}
        style={customIconUrl ? { background: 'transparent' } : {}}>
        {customIconUrl
          ? <img src={customIconUrl} alt={label} className="w-full h-full object-contain rounded-xl" />
          : <Icon size={16} className="text-white" />}
      </div>
      <div>
        <p className="text-base font-bold text-gray-800 leading-none">0</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</p>
      </div>
    </div>
  );
}

// ── Local image uploader — converts file to base64 data URL ──────────────────
function ImageUploader({ value, onChange }) {
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 512 * 1024) { toast.error('Image must be under 512 KB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target.result);
    reader.readAsDataURL(file);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs text-gray-700 font-medium cursor-pointer transition-colors">
          <Upload size={12} /> Upload image
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
        {value && (
          <button type="button" onClick={() => onChange('')}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg">
            <X size={11}/> Remove
          </button>
        )}
      </div>
      {value && (
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
          <img src={value} alt="preview" className="w-8 h-8 object-contain rounded" />
          <span className="text-xs text-gray-500 truncate flex-1">Custom image loaded</span>
        </div>
      )}
      <p className="text-xs text-gray-400">PNG/SVG/JPG · max 512 KB · replaces the Lucide icon</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DashboardIconsPage() {
  const { isAdmin } = useAuth();
  const { bumpConfig } = useConfig();
  const [cards, setCards]           = useState(DEFAULT_CARDS);
  const [pageIcons, setPageIcons]   = useState(DEFAULT_PAGE_ICONS);
  const [saving, setSaving]         = useState(false);
  const [pageIconsSaving, setPageIconsSaving] = useState(false);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState('dashboard');

  useEffect(() => {
    Promise.all([
      settingsAPI.getDashboardIcons().then(r => r.data).catch(() => null),
      settingsAPI.getPageIcons().then(r => r.data).catch(() => null),
    ]).then(([dashData, pageData]) => {
      if (dashData && Array.isArray(dashData) && dashData.length) setCards(dashData);
      if (pageData && Array.isArray(pageData) && pageData.length) {
        // Merge saved data over defaults so new entries are always present
        const merged = DEFAULT_PAGE_ICONS.map(def => {
          const saved = pageData.find(p => p.key === def.key);
          return saved ? { ...def, ...saved } : def;
        });
        setPageIcons(merged);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const updateCard = (key, field, val) =>
    setCards(p => p.map(c => c.key === key ? { ...c, [field]: val } : c));

  const updatePageIcon = (key, field, val) =>
    setPageIcons(p => p.map(pi => pi.key === key ? { ...pi, [field]: val } : pi));

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsAPI.saveDashboardIcons(cards);
      bumpConfig();
      toast.success('Dashboard icons saved — changes apply immediately');
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const handleSavePageIcons = async () => {
    setPageIconsSaving(true);
    try {
      await settingsAPI.savePageIcons(pageIcons);
      bumpConfig();
      toast.success('Page icons saved — sidebar will update on next navigation');
    } catch { toast.error('Save failed'); }
    finally { setPageIconsSaving(false); }
  };

  const handleReset = () => {
    if (confirm('Reset all dashboard icons to defaults?')) setCards(DEFAULT_CARDS);
  };

  const handleResetPageIcons = () => {
    if (confirm('Reset all page icons to defaults?')) setPageIcons(DEFAULT_PAGE_ICONS);
  };

  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <Shield size={40} className="text-gray-300 mb-3" />
      <p className="text-gray-500">Admin access required</p>
    </div>
  );

  // Group cards by section
  const sectionKeys = new Set([
    'section_dept_endpoint_distribution',
    'section_patching_compliance',
    'section_location_wise_patching_distribution',
  ]);
  const mainCards = cards.filter(c => !c.key.startsWith('ext_') && !sectionKeys.has(c.key));
  const extCards  = cards.filter(c => c.key.startsWith('ext_'));
  const dashboardSectionCards = cards.filter(c => sectionKeys.has(c.key));

  // Group page icons by section
  const pageIconSections = [...new Set(DEFAULT_PAGE_ICONS.map(p => p.section))];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-800 rounded-xl flex items-center justify-center">
            <BarChart2 size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Dashboard &amp; Page Icons</h1>
            <p className="text-sm text-gray-500 mt-0.5">Customise icons and colours for dashboard stat cards and sidebar navigation</p>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {[['dashboard', 'Dashboard Card Icons'], ['pages', 'Page / Nav Icons']].map(([key, lbl]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key ? 'bg-white text-blue-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {key === 'dashboard' ? <BarChart2 size={14}/> : <Settings size={14}/>}
            {lbl}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-pulse">
          {Array(6).fill(0).map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* ── Dashboard Card Icons tab ── */}
          {activeTab === 'dashboard' && (
            <>
              <div className="flex justify-end gap-2 mb-4">
                <button onClick={handleReset} className="btn-secondary text-xs"><RotateCcw size={13} /> Reset Defaults</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary">
                  <Save size={14} /> {saving ? 'Saving…' : 'Save Dashboard Icons'}
                </button>
              </div>
              {[['Main Inventory', mainCards], ['Extended Inventory', extCards], ['Dashboard Sections', dashboardSectionCards]].map(([section, list]) => (
                <div key={section} className="mb-8">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">{section}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {list.map(card => (
                      <div key={card.key} className="card space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs font-semibold text-gray-600 flex-1">{card.label}</p>
                          <PreviewCard label={card.label} icon={card.icon} color={card.color} customIconUrl={card.customIconUrl} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block font-medium">Custom Image (optional)</label>
                          <ImageUploader value={card.customIconUrl || ''} onChange={v => updateCard(card.key, 'customIconUrl', v)} />
                        </div>
                        {!card.customIconUrl && (
                          <>
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">Icon</label>
                              <IconPicker value={card.icon} onChange={v => updateCard(card.key, 'icon', v)} />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 mb-1.5 block">Color</label>
                              <ColorPicker value={card.color} onChange={v => updateCard(card.key, 'color', v)} />
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── Page / Nav Icons tab ── */}
          {activeTab === 'pages' && (
            <>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800 mb-5">
                <p className="font-semibold mb-1">Sidebar Navigation Icons</p>
                <p className="text-xs">Change the icon and label shown in the sidebar for each page. Changes take effect immediately after saving — no page refresh needed for other users.</p>
              </div>
              <div className="flex justify-end gap-2 mb-4">
                <button onClick={handleResetPageIcons} className="btn-secondary text-xs"><RotateCcw size={13} /> Reset Defaults</button>
                <button onClick={handleSavePageIcons} disabled={pageIconsSaving} className="btn-primary">
                  <Save size={14} /> {pageIconsSaving ? 'Saving…' : 'Save Page Icons'}
                </button>
              </div>
              {pageIconSections.map(section => (
                <div key={section} className="mb-8">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">{section}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {pageIcons.filter(pi => pi.section === section).map(pi => {
                      const Icon = ICON_MAP[pi.icon] || Server;
                      return (
                        <div key={pi.key} className="card space-y-3">
                          {/* Preview + label */}
                          <div className="flex items-center gap-3 pb-2 border-b border-gray-100">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden ${pi.customIconUrl ? '' : 'bg-gray-900'}`}>
                              {pi.customIconUrl
                                ? <img src={pi.customIconUrl} alt={pi.label} className="w-full h-full object-contain rounded-xl" />
                                : <Icon size={17} className="text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{pi.label}</p>
                              <p className="text-xs text-gray-400 font-mono truncate">{pi.key}</p>
                            </div>
                          </div>
                          {/* Label override */}
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Sidebar Label</label>
                            <input
                              className="input-field text-sm"
                              value={pi.label}
                              onChange={e => updatePageIcon(pi.key, 'label', e.target.value)}
                              placeholder="Enter label…"
                            />
                          </div>
                          {/* Custom image upload */}
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block font-medium">Custom Image (optional)</label>
                            <ImageUploader
                              value={pi.customIconUrl || ''}
                              onChange={v => updatePageIcon(pi.key, 'customIconUrl', v)}
                            />
                          </div>
                          {/* Icon picker — only show when no custom image */}
                          {!pi.customIconUrl && (
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">Icon</label>
                              <IconPicker value={pi.icon} onChange={v => updatePageIcon(pi.key, 'icon', v)} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

