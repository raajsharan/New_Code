import React, { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { settingsAPI } from '../services/api';
import { useBranding } from '../context/BrandingContext';
import {
  LayoutDashboard, List, Settings, Table2, Tag, BarChart2, Mail,
  Users, Shield, Palette, Layers, Database,
  LogOut, ChevronDown, Server, Menu, X,
  UserCircle, HardDrive, ArrowRight,
  DownloadCloud,
  Monitor, ShieldCheck, Zap, Hand, CheckCircle, Power, AlertCircle,
  Activity, Globe, Cpu, Network, Lock, Cloud, Box, TrendingUp,
  Wifi, Radio, Smartphone, Laptop, Package, Wrench, MapPin,
  Building2, Eye, Search, Star, Circle, Square, Triangle, Heart,
  Home, Key, Archive, Flag, Bell, Clock, Calendar, Filter, Hash
} from 'lucide-react';

// Icon map for dynamic overrides
const NAV_ICON_MAP = {
  LayoutDashboard, List, Settings, Table2, Tag, BarChart2, Mail,
  Users, Shield, Palette, Layers, Database, Server, HardDrive, ArrowRight, DownloadCloud,
  Monitor, ShieldCheck, Zap, Hand, CheckCircle, Power, AlertCircle,
  Activity, Globe, Cpu, Network, Lock, Cloud, Box, TrendingUp,
  Wifi, Radio, Smartphone, Laptop, Package, Wrench, MapPin,
  Building2, Eye, Search, Star, Circle, Square, Triangle, Heart,
  Home, Key, Archive, Flag, Bell, Clock, Calendar, Filter, Hash
};

const NAV = [
  { to: '/dashboard',          icon: LayoutDashboard, label: 'Dashboard',          key: 'dashboard' },
  { to: '/asset-list',         icon: List,            label: 'Asset List',          key: 'asset-list' },
  { to: '/ext-asset-list',     icon: Table2,          label: 'Ext. Asset List',     key: 'extended-inventory' },
  { to: '/physical-server-list',icon: Server,         label: 'Physical Servers',    key: 'physical-assets' },
  { to: '/configuration',      icon: Settings,        label: 'Inventory Config',    key: 'configuration' },
  { to: '/report-builder',     icon: BarChart2,       label: 'Report Builder',      key: 'report-builder' },
  { to: '/tenable-report',     icon: ShieldCheck,     label: 'Tenable Report',      key: 'tenable-report' },
];

const ADMIN_NAV = [
  { to: '/users',                        icon: Users,      label: 'User Management',          key: 'users' },
  { to: '/password-control',             icon: Shield,     label: 'Password Control',         key: 'password-control' },
  { to: '/transfer-to-inventory',        icon: ArrowRight, label: 'Transfer to Inventory',    key: 'transfer-to-inventory' },
  { to: '/new-asset-import',             icon: DownloadCloud, label: 'New Asset Import',       key: 'new-asset-import' },
  { to: '/excel-smart-import',           icon: DownloadCloud, label: 'Excel Smart Import',     key: 'excel-smart-import' },
  { to: '/import-audit-report',          icon: Search,     label: 'Import Audit Report',       key: 'import-audit-report' },
  { to: '/dept-range-management',        icon: Tag,        label: 'Dept. Tag Ranges',         key: 'dept-range-management' },
  { to: '/dashboard-icons',             icon: BarChart2,  label: 'Dashboard Icons',           key: 'dashboard-icons' },
  { to: '/dashboard-compliance-config', icon: Settings,   label: 'Dashboard Compliance',      key: 'dashboard-compliance-config' },
  { to: '/software-deployment',         icon: Package,    label: 'Software Deployment',        key: 'software-deployment' },
  { to: '/backup',                      icon: Database,   label: 'Backup & Export',           key: 'backup' },
  { to: '/email-notifications',         icon: Mail,       label: 'Email Notifications',       key: 'email-notifications' },
  { to: '/audit-explorer',              icon: Search,     label: 'Audit Explorer',            key: 'audit-explorer' },
  { to: '/branding',                     icon: Palette,    label: 'Branding',                 key: 'branding' },
  { to: '/custom-fields',                icon: Layers,     label: 'Asset Custom Fields',      key: 'custom-fields' },
  { to: '/physical-asset-custom-fields', icon: HardDrive,  label: 'Physical Asset Config',    key: 'physical-asset-custom-fields' },
  { to: '/physical-server-models',       icon: HardDrive,  label: 'Server Models',            key: 'physical-assets' },
  { to: '/extended-custom-fields',       icon: Database,   label: 'Extended Inv. Fields',     key: 'extended-custom-fields' },
  { to: '/column-config',                  icon: List,       label: 'Column Config',          key: 'column-config' },
  { to: '/tenable-import',                 icon: DownloadCloud, label: 'Tenable Import',        key: 'tenable-import' },
];

const roleBadgeCls = {
  admin:     'bg-red-100 text-red-700',
  readwrite: 'bg-blue-100 text-blue-700',
  readonly:  'bg-gray-100 text-gray-600',
};

function UserAvatar({ user, size = 'md' }) {
  const initials = [user?.first_name, user?.last_name]
    .filter(Boolean).map(s => s[0].toUpperCase()).join('') ||
    user?.username?.[0]?.toUpperCase() || '?';
  const dim = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-sm';
  if (user?.profile_pic) {
    return <img src={user.profile_pic} alt="avatar"
      className={`${dim} rounded-full object-cover flex-shrink-0 ring-2 ring-white`} />;
  }
  return (
    <div className={`${dim} bg-blue-800 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {initials}
    </div>
  );
}

export default function Layout() {
  const { user, logout, isAdmin, canViewPage } = useAuth();
  const { branding } = useBranding();       // single source of truth
  const navigate    = useNavigate();
  const [dropOpen, setDropOpen]   = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pageIconOverrides, setPageIconOverrides] = useState({});
  const dropRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    settingsAPI.getPageIcons().then(r => {
      if (Array.isArray(r.data) && r.data.length) {
        const map = {};
        r.data.forEach(pi => { map[pi.key] = pi; });
        setPageIconOverrides(map);
      }
    }).catch(() => {});
  }, []);

  // Resolve icon component for a nav item, respecting overrides
  const resolveIcon = (key, defaultIcon) => {
    const ov = pageIconOverrides[key];
    if (ov?.icon && NAV_ICON_MAP[ov.icon]) return NAV_ICON_MAP[ov.icon];
    return defaultIcon;
  };

  const toolName    = branding.app_name    || 'InfraInventory';
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || '';
  const year        = new Date().getFullYear();

  return (
    <div className="h-full w-full overflow-hidden bg-transparent p-3">
      <div className="workspace-shell flex h-full w-full overflow-visible">

      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-64'} flex-shrink-0 bg-gray-900 flex flex-col transition-all duration-200 overflow-hidden rounded-l-[22px]`}>

        {/* Logo row */}
        <div className={`flex items-center py-4 border-b border-gray-700/70 min-h-[68px] ${collapsed ? 'px-2 gap-2 justify-between' : 'px-4 gap-3'}`}>
          {branding.logo_data
            ? <img src={branding.logo_data} alt="logo" className="w-8 h-8 object-contain rounded flex-shrink-0" />
            : <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center flex-shrink-0">
                <Server size={16} className="text-white" />
              </div>}
          {!collapsed && (
            <span className="font-semibold text-sm text-white truncate flex-1">{toolName}</span>
          )}
          <button onClick={() => setCollapsed(!collapsed)}
            className="text-gray-400 hover:text-white flex-shrink-0 rounded-md p-1 hover:bg-white/10">
            <X size={15} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          {NAV.filter(n => canViewPage(n.key)).map(({ to, icon: DefaultIcon, label, key }) => {
            const Icon = resolveIcon(key || to, DefaultIcon);
            const ovLabel = pageIconOverrides[key || to]?.label || label;
            return (
              <NavLink key={to} to={to} title={collapsed ? ovLabel : ''}
                className={({ isActive }) =>
                  `flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-xl text-sm font-medium transition-all border
                   ${isActive ? 'bg-blue-700 text-white border-blue-500/60 shadow-sm' : 'text-gray-300 border-transparent hover:bg-gray-800/80 hover:text-white hover:border-gray-700'}`}>
                <Icon size={18} className="flex-shrink-0" />
                {!collapsed && <span className="truncate">{ovLabel}</span>}
              </NavLink>
            );
          })}

          {isAdmin && (
            <>
              {!collapsed
                ? <p className="pt-4 pb-1 px-3 text-[10px] font-semibold text-gray-500 uppercase tracking-[0.2em]">Admin</p>
                : <div className="my-2 border-t border-gray-700" />}
              {ADMIN_NAV.filter(n => !n.key || canViewPage(n.key)).map(({ to, icon: DefaultIcon, label, key }) => {
                const Icon = resolveIcon(key || to, DefaultIcon);
                const ovLabel = pageIconOverrides[key || to]?.label || label;
                return (
                  <NavLink key={to} to={to} title={collapsed ? ovLabel : ''}
                    className={({ isActive }) =>
                      `flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-xl text-sm font-medium transition-all border
                       ${isActive ? 'bg-blue-700 text-white border-blue-500/60 shadow-sm' : 'text-gray-300 border-transparent hover:bg-gray-800/80 hover:text-white hover:border-gray-700'}`}>
                    <Icon size={18} className="flex-shrink-0" />
                    {!collapsed && <span className="truncate">{ovLabel}</span>}
                  </NavLink>
                );
              })}
            </>
          )}
        </nav>

        {/* Sidebar user strip */}
        {!collapsed && (
          <div className="border-t border-gray-700/70 px-3 py-3">
            <button onClick={() => navigate('/profile')}
              className="flex items-center gap-2 w-full hover:bg-gray-800 rounded-lg px-2 py-1.5 transition-colors">
              <UserAvatar user={user} size="sm" />
              <div className="overflow-hidden flex-1 text-left">
                <p className="text-white text-xs font-medium truncate">{displayName}</p>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${roleBadgeCls[user?.role]}`}>
                  {user?.role}
                </span>
              </div>
            </button>
          </div>
        )}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-visible rounded-r-[22px] bg-white/35">

        {/* Top bar */}
        <header className="glass-panel m-3 mb-2 h-[72px] flex items-center justify-between px-6 flex-shrink-0 relative z-30">
          <p className="text-sm text-gray-500 font-medium">{toolName}</p>

          {/* User dropdown */}
          <div className="relative" ref={dropRef}>
            <button onClick={() => setDropOpen(!dropOpen)}
              className="flex items-center gap-2.5 text-sm text-gray-700 hover:text-gray-900">
              <UserAvatar user={user} size="md" />
              <div className="hidden sm:block text-left">
                <p className="text-sm font-medium text-gray-800 leading-tight">{displayName}</p>
                {user?.job_role && <p className="text-xs text-gray-400 leading-tight">{user.job_role}</p>}
              </div>
              <span className={`hidden sm:block text-xs px-2 py-0.5 rounded-full font-medium ${roleBadgeCls[user?.role]}`}>
                {user?.role}
              </span>
              <ChevronDown size={14} className="text-gray-400" />
            </button>

            {dropOpen && (
              <div className="absolute right-0 top-12 w-56 bg-white/95 border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden backdrop-blur-sm">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <UserAvatar user={user} size="lg" />
                  <div className="overflow-hidden">
                    <p className="text-sm font-semibold text-gray-800 truncate">{displayName}</p>
                    <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    {user?.job_role && <p className="text-xs text-gray-400 truncate">{user.job_role}</p>}
                  </div>
                </div>
                <div className="py-1">
                  <button onClick={() => { setDropOpen(false); navigate('/profile'); }}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700">
                    <UserCircle size={14} /> My Profile
                  </button>
                </div>
                <div className="border-t border-gray-100 py-1">
                  <button onClick={() => { logout(); navigate('/login'); }}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto flex flex-col min-h-0 px-3 pb-3 relative z-10">
          <div className="flex-1 px-1 py-2">
            <Outlet />
          </div>

          {/* Footer */}
          <footer className="flex-shrink-0 glass-panel px-6 py-2.5 text-center">
            <p className="text-xs text-gray-400">
              (c) {year}{' '}
              <Link
                to="/copyright"
                className="font-medium text-gray-500 hover:text-blue-700 hover:underline transition-colors"
                title="View Copyright Notice"
              >
                {toolName}
              </Link>
              . All rights reserved.{' '}|{' '}
              Developed by{' '}
              <span className="font-medium text-gray-500">Sharansakthi</span>
              {' - '}
              <span className="text-gray-400">Senior System Engineer</span>
            </p>
          </footer>
        </main>
      </div>
      </div>
    </div>
  );
}


