import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { extendedInventoryAPI, dropdownsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { MEIcon, TenableIcon } from '../components/AgentIcon';
import toast from 'react-hot-toast';
import {
  Search, Edit2, Trash2, ChevronLeft, ChevronRight,
  Eye, EyeOff, RefreshCw, Download, ExternalLink, Server, Layers
} from 'lucide-react';

const StatusBadge = ({ s }) => {
  const cls = {
    'Alive':'bg-green-100 text-green-700', 'Powered Off':'bg-orange-100 text-orange-700',
    'Not Alive':'bg-red-100 text-red-700', 'Active':'bg-green-100 text-green-700',
    'Inactive':'bg-gray-100 text-gray-500', 'Decommissioned':'bg-red-100 text-red-600',
    'Maintenance':'bg-amber-100 text-amber-700'
  }[s] || 'bg-gray-100 text-gray-500';
  return s ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{s}</span> : <span className="text-gray-300 text-xs">—</span>;
};

const PatchBadge = ({ s }) => {
  const cls = {
    'Auto':'bg-green-100 text-green-700', 'Manual':'bg-blue-100 text-blue-700',
    'Exception':'bg-amber-100 text-amber-700', 'EOL - No Patches':'bg-red-100 text-red-700',
    'On Hold':'bg-gray-100 text-gray-600',
  }[s] || 'bg-gray-100 text-gray-500';
  return s ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{s}</span> : <span className="text-gray-300 text-xs">—</span>;
};

function PasswordCell({ password }) {
  const [show, setShow] = useState(false);
  if (!password) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-xs text-gray-700">{show ? password : '••••••••'}</span>
      <button type="button" onClick={() => setShow(!show)} className="p-0.5 text-gray-400 hover:text-gray-600">
        {show ? <EyeOff size={11} /> : <Eye size={11} />}
      </button>
    </div>
  );
}

const COL_NAME = 160;
const COL_IP   = 120;

export default function ExtendedInventoryPage() {
  const { canWrite } = useAuth();
  const { configVersion } = useConfig();
  const navigate = useNavigate();

  const [items, setItems]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const limit                      = 15;
  const [loading, setLoading]     = useState(true);
  const [exporting, setExporting] = useState(false);
  const [dropdowns, setDropdowns] = useState({});
  const [customFields, setCustomFields] = useState([]);
  const [filters, setFilters]     = useState({ search:'', location:'', department:'', server_status:'', asset_type:'' });

  const fetchMeta = useCallback(async () => {
    try {
      const [dd, cf] = await Promise.all([dropdownsAPI.getAll(), extendedInventoryAPI.getCustomFields()]);
      setDropdowns(dd.data);
      setCustomFields(cf.data.filter(f => f.is_active));
    } catch {}
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit, ...filters };
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
      const r = await extendedInventoryAPI.getAll(params);
      setItems(r.data.items);
      setTotal(r.data.total);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [page, limit, filters]);

  useEffect(() => { fetchMeta(); }, [fetchMeta, configVersion]);
  useEffect(() => { fetchItems(); }, [fetchItems, configVersion]);

  const setFilter = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1); };

  const handleDelete = async (item) => {
    if (!confirm(`Delete "${item.vm_name || item.asset_name || item.ip_address}"?`)) return;
    try { await extendedInventoryAPI.delete(item.id); toast.success('Deleted'); fetchItems(); }
    catch (err) { toast.error(err.response?.data?.error || 'Delete failed'); }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = { ...filters };
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
      const r = await extendedInventoryAPI.exportCSV(params);
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv' }));
      const a = document.createElement('a'); a.href = url;
      a.download = `extended-inventory-${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Exported');
    } catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  };

  const renderCustomValue = (item, cf) => {
    const raw = item.custom_field_values?.[cf.field_key];
    if (raw === undefined || raw === null || raw === '') return <span className="text-gray-300 text-xs">—</span>;
    if (cf.field_type === 'toggle') return raw ? <span className="text-green-600 text-xs font-medium">✓ Yes</span> : <span className="text-gray-400 text-xs">No</span>;
    return <span className="text-xs text-gray-700">{String(raw)}</span>;
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-800 rounded-xl flex items-center justify-center">
            <Layers size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Extended Inventory</h1>
            <p className="text-sm text-gray-500 mt-0.5">{total} records</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={handleExport} disabled={exporting} className="btn-secondary text-xs">
            <Download size={13} />{exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button onClick={fetchItems} className="btn-secondary text-xs"><RefreshCw size={13} /> Refresh</button>
          {canWrite && <button onClick={() => navigate('/add-extended-inventory')} className="btn-primary text-xs">+ Add Record</button>}
        </div>
      </div>

      {/* Filters — same as Asset Inventory */}
      <div className="card mb-4">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="relative xl:col-span-2">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input-field pl-8" placeholder="VM name, hostname, IP, user…"
              value={filters.search} onChange={e => setFilter('search', e.target.value)} />
          </div>
          <select className="input-field" value={filters.location} onChange={e => setFilter('location', e.target.value)}>
            <option value="">All Locations</option>
            {(dropdowns.locations || []).map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
          </select>
          <select className="input-field" value={filters.department} onChange={e => setFilter('department', e.target.value)}>
            <option value="">All Departments</option>
            {(dropdowns.departments || []).map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          <select className="input-field" value={filters.server_status} onChange={e => setFilter('server_status', e.target.value)}>
            <option value="">All Statuses</option>
            {(dropdowns.server_status || []).map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
          <select className="input-field" value={filters.asset_type} onChange={e => setFilter('asset_type', e.target.value)}>
            <option value="">All Types</option>
            {(dropdowns.asset_types || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {/* Table — mirrors Asset Inventory columns */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse:'separate', borderSpacing:0 }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-th bg-gray-50 z-20 border-r border-gray-200" style={{ position:'sticky', left:0, minWidth:COL_NAME }}>VM Name</th>
                <th className="table-th bg-gray-50 z-20 border-r border-gray-200" style={{ position:'sticky', left:COL_NAME, minWidth:COL_IP }}>IP Address</th>
                {['Hostname','Type','OS','Version','User','Dept','Status','Record Status',
                  'Patch Type','Schedule','Location','Serial','iDRAC','EOL','ME','Tenable',
                  'Hosted IP','Asset Tag','Business Purpose',
                  ...customFields.map(cf => cf.field_label),
                  'Username','Password','Submitted By','Last Modified','Actions'
                ].map(h => <th key={h} className="table-th">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? Array(5).fill(0).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="table-td bg-white" style={{ position:'sticky', left:0 }}><div className="h-4 bg-gray-100 rounded" /></td>
                  <td className="table-td bg-white" style={{ position:'sticky', left:COL_NAME }}><div className="h-4 bg-gray-100 rounded" /></td>
                  {Array(22 + customFields.length).fill(0).map((_, j) => <td key={j} className="table-td"><div className="h-4 bg-gray-100 rounded" /></td>)}
                </tr>
              )) : items.length === 0 ? (
                <tr><td colSpan={25 + customFields.length} className="text-center py-16 text-gray-400">
                  <Layers size={32} className="mx-auto mb-2 opacity-20" />
                  <p className="font-medium">No extended inventory records</p>
                </td></tr>
              ) : items.map(item => (
                <tr key={item.id} className="hover:bg-blue-50/20 transition-colors">
                  <td className="table-td font-mono text-xs font-semibold text-blue-800 bg-white border-r border-gray-100"
                    style={{ position:'sticky', left:0, minWidth:COL_NAME }}>
                    {item.vm_name || item.asset_name || '—'}
                  </td>
                  <td className="table-td font-mono text-xs bg-white border-r border-gray-100"
                    style={{ position:'sticky', left:COL_NAME, minWidth:COL_IP }}>
                    {item.ip_address || '—'}
                  </td>
                  <td className="table-td font-mono text-xs">{item.os_hostname || '—'}</td>
                  <td className="table-td text-xs">{item.asset_type || '—'}</td>
                  <td className="table-td text-xs">{item.os_type || '—'}</td>
                  <td className="table-td text-xs max-w-[130px] truncate">{item.os_version || '—'}</td>
                  <td className="table-td text-xs">{item.assigned_user || '—'}</td>
                  <td className="table-td text-xs">{item.department || '—'}</td>
                  <td className="table-td"><StatusBadge s={item.server_status || item.status} /></td>
                  <td className="table-td"><StatusBadge s={item.status} /></td>
                  <td className="table-td"><PatchBadge s={item.patching_type} /></td>
                  <td className="table-td text-xs">{item.patching_schedule || '—'}</td>
                  <td className="table-td text-xs">{item.location || '—'}</td>
                  <td className="table-td font-mono text-xs">{item.serial_number || '—'}</td>
                  <td className="table-td text-xs">
                    {item.idrac_enabled ? <span className="text-green-700 text-xs font-medium">Yes{item.idrac_ip ? ` (${item.idrac_ip})` : ''}</span> : <span className="text-gray-400 text-xs">No</span>}
                  </td>
                  <td className="table-td text-xs">
                    <span className={item.eol_status === 'InSupport' ? 'text-green-700' : item.eol_status === 'EOL' ? 'text-orange-600' : 'text-red-600'}>
                      {item.eol_status || '—'}
                    </span>
                  </td>
                  <td className="table-td"><MEIcon installed={item.me_installed_status} size={18} /></td>
                  <td className="table-td"><TenableIcon installed={item.tenable_installed_status} size={18} /></td>
                  <td className="table-td">
                    {item.hosted_ip ? (
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs text-blue-700">{item.hosted_ip}</span>
                        <a href={`https://${item.hosted_ip}/ui/#/login`} target="_blank" rel="noopener noreferrer"
                          className="p-0.5 text-gray-400 hover:text-blue-600" title="Open ESXi UI">
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="table-td font-mono text-xs font-medium text-purple-700">{item.asset_tag || '—'}</td>
                  <td className="table-td text-xs text-gray-500 max-w-[160px] truncate">{item.business_purpose || item.description || '—'}</td>
                  {customFields.map(cf => <td key={cf.field_key} className="table-td">{renderCustomValue(item, cf)}</td>)}
                  <td className="table-td font-mono text-xs">{item.asset_username || '—'}</td>
                  <td className="table-td"><PasswordCell password={item.asset_password} /></td>
                  <td className="table-td text-xs text-gray-500">{item.submitted_by || '—'}</td>
                  <td className="table-td text-xs text-gray-400 whitespace-nowrap">
                    {item.updated_at ? new Date(item.updated_at).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}
                  </td>
                  <td className="table-td">
                    <div className="flex gap-1">
                      {canWrite && <>
                        <button onClick={() => navigate('/add-extended-inventory', { state: { item } })}
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded"><Edit2 size={12} /></button>
                        <button onClick={() => handleDelete(item)}
                          className="p-1.5 text-red-500 hover:bg-red-100 rounded"><Trash2 size={12} /></button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between bg-gray-50">
            <p className="text-xs text-gray-500">Showing {(page-1)*limit+1}–{Math.min(page*limit, total)} of {total}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
                className="p-1.5 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100"><ChevronLeft size={13}/></button>
              {Array.from({length:Math.min(7,totalPages)},(_,i)=>{
                const pg=page<=4?i+1:page-3+i; if(pg<1||pg>totalPages) return null;
                return <button key={pg} onClick={()=>setPage(pg)} className={`px-3 py-1 text-xs rounded border ${pg===page?'bg-blue-800 text-white border-blue-800':'border-gray-300 hover:bg-gray-100'}`}>{pg}</button>;
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages}
                className="p-1.5 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100"><ChevronRight size={13}/></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

