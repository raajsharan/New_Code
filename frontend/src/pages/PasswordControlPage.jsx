import React, { useState, useEffect, useCallback } from 'react';
import { usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Toggle from '../components/Toggle';
import toast from 'react-hot-toast';
import { Shield, Save, ChevronDown, ChevronRight } from 'lucide-react';

// All pages with labels and grouping
const PAGE_GROUPS = [
  {
    group: 'Main Navigation',
    pages: [
      { key: 'dashboard',              label: 'Dashboard' },
      { key: 'asset-list',             label: 'Asset List — Full Page' },
      { key: 'asset-list-add',         label: 'Asset List → Add New Asset tab' },
      { key: 'asset-list-inventory',   label: 'Asset List → Inventory List tab' },
      { key: 'ext-asset-list',         label: 'Ext. Asset List — Full Page' },
      { key: 'ext-asset-list-add',     label: 'Ext. Asset List → Add New tab' },
      { key: 'ext-asset-list-inventory', label: 'Ext. Asset List → Inventory tab' },
      { key: 'physical-assets',        label: 'Physical Server — Register / View' },
      { key: 'physical-server-list',   label: 'Physical Servers List' },
      { key: 'beijing-asset-list',     label: 'Beijing Asset List' },
      { key: 'beijing-asset-list-add', label: 'Beijing Asset List → Add Asset tab' },
      { key: 'tenable-report',         label: 'Tenable Report' },
      { key: 'configuration',          label: 'Inventory Configuration' },
      { key: 'report-builder',         label: 'Report Builder' },
    ],
  },
  {
    group: 'Asset Config (Admin)',
    pages: [
      { key: 'custom-fields',                 label: 'Asset Custom Fields' },
      { key: 'physical-asset-custom-fields',  label: 'Physical Asset Config' },
      { key: 'extended-custom-fields',        label: 'Extended Inventory Fields' },
      { key: 'beijing-asset-fields',          label: 'Beijing Asset Fields' },
      { key: 'column-config',                 label: 'Column Visibility Config' },
      { key: 'transfer-to-inventory',         label: 'Transfer to Inventory' },
      { key: 'dept-range-management',         label: 'Department Tag Ranges' },
    ],
  },
  {
    group: 'Administration (Admin)',
    pages: [
      { key: 'users',               label: 'User Management' },
      { key: 'password-control',    label: 'Password & Page Control' },
      { key: 'audit-explorer',      label: 'Audit Explorer' },
      { key: 'branding',            label: 'Branding' },
      { key: 'dashboard-icons',     label: 'Dashboard Icons' },
      { key: 'dashboard-compliance-config', label: 'Dashboard Compliance Config' },
      { key: 'backup',              label: 'Backup & Export' },
      { key: 'email-notifications', label: 'Email Notifications' },
      { key: 'new-asset-import',    label: 'New Asset Import' },
      { key: 'excel-smart-import', label: 'Excel Smart Import', children: [
        { key: 'excel-smart-import-asset',   label: 'Asset List' },
        { key: 'excel-smart-import-ext',     label: 'Ext. Asset List' },
        { key: 'excel-smart-import-beijing', label: 'Beijing Asset' },
      ]},
      { key: 'import-audit-report', label: 'Import Audit Report' },
    ],
  },
];

// Flat map for saving — includes sub-permission children
const ALL_PAGES = PAGE_GROUPS.flatMap(g =>
  g.pages.flatMap(p => p.children ? [p, ...p.children] : [p])
);

const roleBadge = (role) => ({
  admin:     'bg-red-100 text-red-700',
  readwrite: 'bg-blue-100 text-blue-700',
  readonly:  'bg-gray-100 text-gray-600',
}[role] || '');

export default function PasswordControlPage() {
  const { isSuperAdmin } = useAuth();
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState({});
  const [localPerms, setLocalPerms] = useState({});
  const [expanded, setExpanded]   = useState(new Set());

  const toggleExpand = (userId) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await usersAPI.getAllPermissions();
      setUsers(res.data);
      const initial = {};
      res.data.forEach(u => {
        const pages = {};
        u.page_permissions.forEach(p => { pages[p.page_key] = p.is_visible; });
        ALL_PAGES.forEach(p => { if (!(p.key in pages)) pages[p.key] = true; });
        initial[u.id] = { ...pages, can_view_passwords: u.can_view_passwords };
      });
      setLocalPerms(initial);
    } catch { toast.error('Failed to load permissions'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const setUserPerm = (userId, key, value) =>
    setLocalPerms(p => ({ ...p, [userId]: { ...p[userId], [key]: value } }));

  const saveUser = async (userId) => {
    setSaving(p => ({ ...p, [userId]: true }));
    try {
      const perms = localPerms[userId];
      const pagePerms = {};
      ALL_PAGES.forEach(p => { pagePerms[p.key] = perms[p.key] !== false; });
      await usersAPI.updatePagePerms(userId, { permissions: pagePerms });
      await usersAPI.updatePasswordVisibility(userId, { can_view_passwords: perms.can_view_passwords });
      toast.success('Permissions saved');
    } catch { toast.error('Save failed'); }
    finally { setSaving(p => ({ ...p, [userId]: false })); }
  };

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      {Array(3).fill(0).map((_, i) => <div key={i} className="card h-40 bg-gray-100" />)}
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Shield size={22} className="text-blue-700" /> Password &amp; Page Control
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Control password visibility and page access for each user</p>
      </div>

      <div className="space-y-5">
        {users.map(user => {
          const perms   = localPerms[user.id] || {};
          const isAdmin   = user.role === 'admin';
          const isLocked  = isAdmin && !isSuperAdmin;
          const initials  = (user.first_name?.[0] || user.username[0]).toUpperCase();
          const isOpen = expanded.has(user.id);
          return (
            <div key={user.id} className="card !p-0 overflow-hidden">
              {/* User header — always visible, click to expand */}
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer select-none hover:bg-gray-50/60 transition-colors"
                onClick={() => toggleExpand(user.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="text-gray-400">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                  {user.profile_pic
                    ? <img src={user.profile_pic} alt="avatar" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-9 h-9 bg-blue-800 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{initials}</div>}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-800">{user.full_name || user.username}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleBadge(user.role)}`}>{user.role}</span>
                    </div>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                  {!isLocked && isOpen && (
                    <button onClick={() => saveUser(user.id)} disabled={saving[user.id]} className="btn-primary text-xs py-1.5">
                      <Save size={13} /> {saving[user.id] ? 'Saving…' : 'Save'}
                    </button>
                  )}
                  {!isOpen && (
                    <span className="text-xs text-gray-400">{isLocked ? 'Full access' : `${ALL_PAGES.length} permissions`}</span>
                  )}
                </div>
              </div>

              {/* Collapsible body */}
              {isOpen && (
                <div className="px-5 pb-5 border-t border-gray-100">
                  {isLocked ? (
                    <div className="mt-4 p-3 bg-gray-50 rounded-xl text-sm text-gray-500 italic flex items-center gap-2">
                      <Shield size={14} className="text-gray-400" />
                      Admin users have full access to all pages and passwords. Their permissions are managed at the system level.
                    </div>
                  ) : (
                    <>
                      {/* Password visibility */}
                      <div className="flex items-center gap-3 mt-4 mb-5 p-3 bg-amber-50 rounded-xl border border-amber-100">
                        <Toggle checked={perms.can_view_passwords || false} onChange={v => setUserPerm(user.id, 'can_view_passwords', v)} />
                        <div>
                          <p className="text-sm font-medium text-gray-700">Can view asset passwords</p>
                          <p className="text-xs text-gray-500">Allow this user to reveal passwords in Asset Inventory &amp; Extended Inventory</p>
                        </div>
                      </div>

                      {/* Page visibility by group */}
                      {PAGE_GROUPS.map(({ group, pages }) => (
                        <div key={group} className="mb-4 last:mb-0">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{group}</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                            {pages.map(({ key, label, children }) => {
                              if (children) {
                                const parentOn = perms[key] !== false;
                                return (
                                  <div key={key} className="col-span-full flex flex-col gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                                    <div className="flex items-center gap-2.5">
                                      <Toggle size="sm" checked={parentOn} onChange={v => setUserPerm(user.id, key, v)} />
                                      <span className="text-xs font-medium text-gray-700 leading-tight">{label}</span>
                                    </div>
                                    <div className={`ml-6 flex flex-wrap gap-2 ${!parentOn ? 'opacity-40 pointer-events-none' : ''}`}>
                                      {children.map(({ key: ck, label: cl }) => (
                                        <div key={ck} className="flex items-center gap-2 px-2.5 py-1.5 bg-white rounded-md border border-gray-200">
                                          <Toggle size="sm" checked={perms[ck] !== false} onChange={v => setUserPerm(user.id, ck, v)} />
                                          <span className="text-xs text-gray-600">{cl}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }
                              return (
                                <div key={key} className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                                  <Toggle size="sm" checked={perms[key] !== false} onChange={v => setUserPerm(user.id, key, v)} />
                                  <span className="text-xs text-gray-700 leading-tight">{label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {users.length === 0 && (
        <div className="card text-center py-12 text-gray-400">No users found</div>
      )}
    </div>
  );
}

