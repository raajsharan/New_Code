import React, { useState, useEffect, useCallback } from 'react';
import { extendedInventoryAPI, dropdownsAPI, transferAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  ArrowRight, CheckCircle, Clock, AlertCircle,
  Search, RefreshCw, ChevronDown, ChevronUp, Info,
} from 'lucide-react';

const StatusBadge = ({ s }) => {
  const cls = { Active:'bg-green-100 text-green-700', Inactive:'bg-gray-100 text-gray-500', Decommissioned:'bg-red-100 text-red-600', Maintenance:'bg-amber-100 text-amber-700' }[s] || 'bg-gray-100 text-gray-500';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{s||'—'}</span>;
};

// ── Transfer Modal (Extended Inventory) ───────────────────────────────────────
function TransferModal({ item, dropdowns, onTransfer, onClose }) {
  const [form, setForm] = useState({
    map_asset_type_id: '',
    map_os_type_id: '',
    map_os_version_id: '',
    map_server_status_id: '',
    map_patching_type_id: '',
    map_patching_schedule_id: '',
    map_server_patch_type_id: '',
    map_location_id: '',
    map_eol_status: 'InSupport',
    transfer_notes: '',
    additional_remarks: `Transferred from Extended Asset List on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
  });
  const [osVersions, setOsVersions] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (form.map_os_type_id) {
      const filtered = (dropdowns.os_versions || []).filter(v => v.os_type_id === parseInt(form.map_os_type_id));
      setOsVersions(filtered);
      setForm(p => ({ ...p, map_os_version_id: '' }));
    }
  }, [form.map_os_type_id, dropdowns.os_versions]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleTransfer = async () => {
    setSaving(true);
    try {
      await onTransfer(item.id, form);
      toast.success(`"${item.asset_name}" transferred to main inventory`);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Transfer failed');
    } finally { setSaving(false); }
  };

  const Field = ({ label, children, hint }) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Transfer to Main Inventory</h3>
            <p className="text-sm text-gray-500 mt-0.5">Map this item to asset fields before transferring</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
        </div>

        <div className="mx-6 mt-4 p-3 bg-blue-50 rounded-xl border border-blue-200">
          <p className="text-xs font-semibold text-blue-700 mb-1.5">Source: Extended Inventory</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-800">
            <span><strong>Name:</strong> {item.asset_name || '—'}</span>
            <span><strong>IP:</strong> {item.ip_address || '—'}</span>
            <span><strong>MAC:</strong> {item.mac_address || '—'}</span>
            <span><strong>Type:</strong> {item.asset_type || '—'}</span>
            <span><strong>User:</strong> {item.assigned_user || '—'}</span>
            <span><strong>Dept:</strong> {item.department || '—'}</span>
          </div>
        </div>

        <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider col-span-full">
            Map to Main Inventory Fields
          </p>

          <Field label="Asset Type">
            <select className="input-field" value={form.map_asset_type_id} onChange={e => set('map_asset_type_id', e.target.value)}>
              <option value="">Select…</option>
              {(dropdowns.asset_types||[]).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>

          <Field label="OS Type">
            <select className="input-field" value={form.map_os_type_id} onChange={e => set('map_os_type_id', e.target.value)}>
              <option value="">Select…</option>
              {(dropdowns.os_types||[]).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>

          <Field label="OS Version">
            <select className="input-field" value={form.map_os_version_id} onChange={e => set('map_os_version_id', e.target.value)} disabled={!form.map_os_type_id}>
              <option value="">{form.map_os_type_id ? 'Select version…' : 'Select OS Type first'}</option>
              {osVersions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>

          <Field label="Server Status">
            <select className="input-field" value={form.map_server_status_id} onChange={e => set('map_server_status_id', e.target.value)}>
              <option value="">Select…</option>
              {(dropdowns.server_status||[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>

          <Field label="Patching Type">
            <select className="input-field" value={form.map_patching_type_id} onChange={e => set('map_patching_type_id', e.target.value)}>
              <option value="">Select…</option>
              {(dropdowns.patching_types||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          <Field label="Patching Schedule">
            <select className="input-field" value={form.map_patching_schedule_id} onChange={e => set('map_patching_schedule_id', e.target.value)}>
              <option value="">Select…</option>
              {(dropdowns.patching_schedules||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          <Field label="Server Patch Type">
            <select className="input-field" value={form.map_server_patch_type_id} onChange={e => set('map_server_patch_type_id', e.target.value)}>
              <option value="">Select…</option>
              {(dropdowns.server_patch_types||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          <Field label="Location" hint="Leave blank to keep original location">
            <select className="input-field" value={form.map_location_id} onChange={e => set('map_location_id', e.target.value)}>
              <option value="">Keep original ({item.location || 'none'})</option>
              {(dropdowns.locations||[]).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>

          <Field label="EOL Status">
            <select className="input-field" value={form.map_eol_status} onChange={e => set('map_eol_status', e.target.value)}>
              <option value="InSupport">In Support</option>
              <option value="EOL">EOL</option>
              <option value="Decom">Decommissioned</option>
              <option value="Not Applicable">Not Applicable</option>
            </select>
          </Field>

          <div className="col-span-full">
            <Field label="Transfer Notes">
              <textarea className="input-field" rows={3} value={form.transfer_notes}
                onChange={e => set('transfer_notes', e.target.value)}
                placeholder="Reason for transfer, any notes…" />
            </Field>
          </div>

          <div className="col-span-full">
            <Field label="Additional Remarks (copied to new asset)" hint="Auto-stamped with transfer date — edit or append as needed">
              <textarea className="input-field" rows={3} value={form.additional_remarks}
                onChange={e => set('additional_remarks', e.target.value)}
                placeholder="Transferred from Extended Asset List on DD Mon YYYY" />
            </Field>
          </div>
        </div>

        <div className="mx-6 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-2">
          <AlertCircle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            This will create a new asset in the main inventory using the data above.
            The extended inventory record will be marked as <strong>Transferred</strong> and cannot be transferred again.
          </p>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={handleTransfer} disabled={saving} className="btn-primary flex-1 justify-center py-2.5">
            <ArrowRight size={16} />
            {saving ? 'Transferring…' : 'Confirm Transfer'}
          </button>
          <button onClick={onClose} className="btn-secondary px-6">Cancel</button>
        </div>
      </div>
    </div>
  );
}


// ── Main page ─────────────────────────────────────────────────────────────────
export default function TransferToInventoryPage() {
  const { isAdmin } = useAuth();
  const [items, setItems]           = useState([]);
  const [log, setLog]               = useState([]);
  const [dropdowns, setDropdowns]   = useState({});
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [showLog, setShowLog]       = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsR, ddR] = await Promise.all([
        transferAPI.getNotTransferred(),
        dropdownsAPI.getAll(),
      ]);
      setItems(itemsR.data);
      setDropdowns(ddR.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, []);

  const fetchLog = useCallback(async () => {
    try {
      const r = await transferAPI.getTransferLog();
      setLog(r.data);
    } catch {}
  }, []);

  useEffect(() => { fetchAll(); fetchLog(); }, [fetchAll, fetchLog]);

  const handleTransfer = async (id, form) => {
    await transferAPI.transfer(id, form);
    fetchAll();
    fetchLog();
  };

  const filtered = items.filter(i =>
    !search || [i.asset_name, i.ip_address, i.mac_address, i.asset_type, i.assigned_user]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="text-5xl">🔒</div>
        <p className="text-lg font-semibold text-gray-700">Admin Only</p>
        <p className="text-sm text-gray-500">Only administrators can transfer items between inventories.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ArrowRight size={22} className="text-blue-700" />
            Transfer to Asset Inventory
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Move approved items from Extended Inventory or Beijing Asset List into the main Asset Inventory
          </p>
        </div>
        <button onClick={() => { fetchAll(); fetchLog(); }} className="btn-secondary text-xs">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>


      {/* ── Extended Inventory ────────────────────────────────────────────── */}
      <>
        {/* Info banner */}
          <div className="card mb-5 border-blue-200 bg-blue-50 flex items-start gap-3">
            <Info size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">How it works</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-blue-700">
                <li>Select an Extended Inventory item and click <strong>Transfer</strong></li>
                <li>Map it to the correct asset fields (OS type, patching, status, etc.)</li>
                <li>On confirmation, a new record is created in the main Asset Inventory</li>
                <li>The source item is marked <strong>Transferred</strong> and locked from re-transfer</li>
                <li>A full audit log is kept below</li>
              </ul>
            </div>
          </div>

          {/* Search */}
          <div className="card mb-4">
            <div className="relative max-w-sm">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input-field pl-8" placeholder="Search by name, IP, type, user…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          {/* Items table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <p className="text-sm font-semibold text-gray-700">
                Pending Transfer
                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{filtered.length}</span>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Asset Name','IP Address','MAC','Type','Department','Assigned User','Location','Status','Description','Action'].map(h => (
                      <th key={h} className="table-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? Array(4).fill(0).map((_,i) => (
                    <tr key={i} className="animate-pulse">
                      {Array(10).fill(0).map((_,j) => <td key={j} className="table-td"><div className="h-4 bg-gray-100 rounded"/></td>)}
                    </tr>
                  )) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-16 text-gray-400">
                        <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
                        <p className="font-medium">{items.length === 0 ? 'No extended inventory items to transfer' : 'No items match your search'}</p>
                      </td>
                    </tr>
                  ) : filtered.map(item => (
                    <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="table-td font-medium text-blue-800">{item.asset_name || '—'}</td>
                      <td className="table-td font-mono text-xs">{item.ip_address || '—'}</td>
                      <td className="table-td font-mono text-xs">{item.mac_address || '—'}</td>
                      <td className="table-td text-xs">{item.asset_type || '—'}</td>
                      <td className="table-td text-xs">{item.department || '—'}</td>
                      <td className="table-td text-xs">{item.assigned_user || '—'}</td>
                      <td className="table-td text-xs">{item.location || '—'}</td>
                      <td className="table-td"><StatusBadge s={item.status} /></td>
                      <td className="table-td text-xs max-w-[160px] truncate" title={item.description}>{item.description || '—'}</td>
                      <td className="table-td">
                        <button
                          onClick={() => setSelectedItem(item)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 text-white rounded-lg text-xs font-medium hover:bg-blue-800 transition-colors"
                        >
                          <ArrowRight size={12} /> Transfer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Transfer log */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowLog(!showLog)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Clock size={15} className="text-gray-500" />
                <span className="text-sm font-semibold text-gray-700">Transfer Audit Log</span>
                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{log.length}</span>
              </div>
              {showLog ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
            </button>

            {showLog && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Asset Name','IP Address','Main Asset ID','Transferred By','Notes','Date'].map(h => (
                        <th key={h} className="table-th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {log.length === 0 ? (
                      <tr><td colSpan={6} className="table-td text-center text-gray-400 py-6">No transfers yet</td></tr>
                    ) : log.map(entry => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="table-td font-medium">{entry.ext_asset_name}</td>
                        <td className="table-td font-mono text-xs">{entry.ext_ip_address}</td>
                        <td className="table-td text-xs">
                          {entry.main_asset_id
                            ? <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">#{entry.main_asset_id}</span>
                            : '—'}
                        </td>
                        <td className="table-td text-xs">{entry.transferred_by}</td>
                        <td className="table-td text-xs max-w-[200px] truncate" title={entry.transfer_notes}>{entry.transfer_notes || '—'}</td>
                        <td className="table-td text-xs text-gray-400">
                          {new Date(entry.transferred_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
      </>

      {/* Transfer modal */}
      {selectedItem && (
        <TransferModal
          item={selectedItem}
          dropdowns={dropdowns}
          onTransfer={handleTransfer}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}
