import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { dropdownsAPI, settingsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useDeleteConfirm } from '../context/DeleteConfirmContext';
import Toggle from '../components/Toggle';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Save, X, ChevronDown, ChevronUp,
  Settings, Server, Layers, HardDrive, ExternalLink, ArrowRight } from 'lucide-react';

const TABLE_CONFIG = [
  { key: 'asset_types', label: 'Asset Types', examples: ['VM', 'Physical Server'] },
  { key: 'os_types', label: 'OS Types', examples: ['Linux', 'Windows', 'ESXi'] },
  { key: 'departments', label: 'Departments', examples: ['IT', 'DevOps', 'Security'] },
  { key: 'server_status', label: 'Server Status', examples: ['Alive', 'Powered Off', 'Not Alive'] },
  { key: 'patching_schedules', label: 'Patching Schedules', examples: ['Weekly', 'Monthly'] },
  { key: 'patching_types', label: 'Patching Types', examples: ['Auto', 'Manual'] },
  { key: 'server_patch_types', label: 'Server Patch Types', examples: ['Critical', 'Non-Critical', 'Test'] },
  { key: 'locations', label: 'Locations', examples: ['DC1', 'DC2', 'Azure', 'AWS'] },
];

function DropdownSection({ tableKey, label, items, canWrite, onRefresh }) {
  const { requestDelete } = useDeleteConfirm();
  const [expanded, setExpanded] = useState(true);
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await dropdownsAPI.addItem(tableKey, { name: newName.trim() });
      toast.success('Added');
      setNewName('');
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add');
    } finally { setAdding(false); }
  };

  const handleUpdate = async (id) => {
    if (!editName.trim()) return;
    try {
      await dropdownsAPI.updateItem(tableKey, id, { name: editName.trim() });
      toast.success('Updated');
      setEditId(null);
      onRefresh();
    } catch (err) { toast.error('Update failed'); }
  };

  const handleDelete = (id, name) => {
    requestDelete(name, async () => {
      try {
        await dropdownsAPI.deleteItem(tableKey, id);
        toast.success('Deleted');
        onRefresh();
      } catch (err) {
        toast.error(err.response?.data?.error || 'Cannot delete (in use)');
      }
    });
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-700 text-sm">{label}</h3>
          <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">{items.length}</span>
        </div>
        {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {expanded && (
        <div className="p-4">
          <div className="space-y-2 mb-3">
            {items.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-2">No items yet</p>
            ) : items.map(item => (
              <div key={item.id} className="flex items-center gap-2">
                {editId === item.id ? (
                  <>
                    <input
                      className="input-field flex-1 text-sm py-1.5"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleUpdate(item.id); if (e.key === 'Escape') setEditId(null); }}
                      autoFocus
                    />
                    <button onClick={() => handleUpdate(item.id)} className="p-1.5 text-green-600 hover:bg-green-100 rounded"><Save size={14} /></button>
                    <button onClick={() => setEditId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"><X size={14} /></button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-700 px-3 py-1.5 bg-gray-50 rounded-lg">{item.name}</span>
                    {canWrite && (
                      <>
                        <button onClick={() => { setEditId(item.id); setEditName(item.name); }}
                          className="p-1.5 text-blue-500 hover:bg-blue-100 rounded"><Edit2 size={13} /></button>
                        <button onClick={() => handleDelete(item.id, item.name)}
                          className="p-1.5 text-red-500 hover:bg-red-100 rounded"><Trash2 size={13} /></button>
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {canWrite && (
            <form onSubmit={handleAdd} className="flex gap-2">
              <input
                className="input-field flex-1 text-sm py-1.5"
                placeholder={`Add new ${label.toLowerCase()} value…`}
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
              <button type="submit" disabled={adding || !newName.trim()} className="btn-primary py-1.5 text-xs">
                <Plus size={14} /> Add
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function OsVersionsSection({ dropdowns, canWrite, onRefresh }) {
  const { requestDelete } = useDeleteConfirm();
  const [expanded, setExpanded] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');

  const osTypes = dropdowns.os_types || [];
  const allVersions = dropdowns.os_versions || [];
  const filtered = selectedType ? allVersions.filter(v => v.os_type_id === parseInt(selectedType)) : allVersions;

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!selectedType || !newVersion.trim()) { toast.error('Select OS type and enter version name'); return; }
    try {
      await dropdownsAPI.addOsVersion({ os_type_id: parseInt(selectedType), name: newVersion.trim() });
      toast.success('Version added');
      setNewVersion('');
      onRefresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to add'); }
  };

  const handleUpdate = async (id) => {
    try {
      const ver = allVersions.find(v => v.id === id);
      await dropdownsAPI.updateOsVersion(id, { name: editName, os_type_id: ver.os_type_id });
      toast.success('Updated'); setEditId(null); onRefresh();
    } catch { toast.error('Update failed'); }
  };

  const handleDelete = (id, name) => {
    requestDelete(name, async () => {
      try {
        await dropdownsAPI.deleteOsVersion(id);
        toast.success('Deleted'); onRefresh();
      } catch { toast.error('Delete failed'); }
    });
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-700 text-sm">OS Versions (linked to OS Types)</h3>
          <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">{allVersions.length}</span>
        </div>
        {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {expanded && (
        <div className="p-4">
          <div className="flex gap-2 mb-4">
            <select className="input-field text-sm" value={selectedType} onChange={e => setSelectedType(e.target.value)}>
              <option value="">All OS Types</option>
              {osTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <span className="text-xs text-gray-400 self-center whitespace-nowrap">{filtered.length} versions</span>
          </div>

          <div className="space-y-1.5 mb-4 max-h-60 overflow-y-auto">
            {filtered.map(v => {
              const typeName = osTypes.find(t => t.id === v.os_type_id)?.name;
              return (
                <div key={v.id} className="flex items-center gap-2">
                  {editId === v.id ? (
                    <>
                      <input className="input-field flex-1 text-sm py-1" value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleUpdate(v.id); if (e.key === 'Escape') setEditId(null); }}
                        autoFocus />
                      <button onClick={() => handleUpdate(v.id)} className="p-1.5 text-green-600 hover:bg-green-100 rounded"><Save size={13} /></button>
                      <button onClick={() => setEditId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"><X size={13} /></button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-gray-400 w-16 flex-shrink-0">[{typeName}]</span>
                      <span className="flex-1 text-sm text-gray-700 px-2 py-1 bg-gray-50 rounded">{v.name}</span>
                      {canWrite && (
                        <>
                          <button onClick={() => { setEditId(v.id); setEditName(v.name); }} className="p-1 text-blue-500 hover:bg-blue-100 rounded"><Edit2 size={12} /></button>
                          <button onClick={() => handleDelete(v.id, v.name)} className="p-1 text-red-500 hover:bg-red-100 rounded"><Trash2 size={12} /></button>
                        </>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {canWrite && (
            <form onSubmit={handleAdd} className="flex gap-2">
              <select className="input-field w-40 text-sm py-1.5 flex-shrink-0" value={selectedType} onChange={e => setSelectedType(e.target.value)}>
                <option value="">OS Type…</option>
                {osTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input className="input-field flex-1 text-sm py-1.5" placeholder="New OS version name…"
                value={newVersion} onChange={e => setNewVersion(e.target.value)} />
              <button type="submit" disabled={!selectedType || !newVersion.trim()} className="btn-primary py-1.5 text-xs">
                <Plus size={14} /> Add
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// ── OME Status options manager ──────────────────────────────────────────────
function OmeStatusSection({ canWrite, onRefresh }) {
  const { requestDelete } = useDeleteConfirm();
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving]   = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState({ value:'', label:'' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await settingsAPI.getOmeOptions(); setOptions(r.data); }
    catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (updated) => {
    setSaving(true);
    try { await settingsAPI.saveOmeOptions(updated); setOptions(updated); onRefresh && onRefresh(); toast.success('OME Status options saved'); }
    catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newValue.trim() || !newLabel.trim()) { toast.error('Value and label are required'); return; }
    if (options.find(o => o.value.toUpperCase() === newValue.trim().toUpperCase())) { toast.error('Value already exists'); return; }
    save([...options, { value: newValue.trim().toUpperCase(), label: newLabel.trim() }]);
    setNewValue(''); setNewLabel('');
  };

  const handleDelete = (idx) => {
    requestDelete(options[idx].label, () => save(options.filter((_,i) => i !== idx)));
  };

  const handleEditSave = (idx) => {
    if (!editVal.value.trim() || !editVal.label.trim()) { toast.error('Value and label required'); return; }
    const updated = options.map((o,i) => i===idx ? { value: editVal.value.trim().toUpperCase(), label: editVal.label.trim() } : o);
    save(updated);
    setEditIdx(null);
  };

  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={()=>setExpanded(e=>!e)}
        className="flex items-center justify-between w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left">
        <span className="font-medium text-sm text-gray-800 flex items-center gap-2">
          OME Status Options
          <span className="text-xs font-normal text-gray-400">({options.length} options)</span>
        </span>
        {expanded ? <ChevronUp size={15} className="text-gray-400"/> : <ChevronDown size={15} className="text-gray-400"/>}
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="animate-pulse space-y-2">{Array(3).fill(0).map((_,i)=><div key={i} className="h-8 bg-gray-100 rounded"/>)}</div>
          ) : (
            <>
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  {editIdx === idx ? (
                    <>
                      <input className="input-field py-1.5 text-xs w-20 font-mono uppercase"
                        value={editVal.value} onChange={e=>setEditVal(p=>({...p,value:e.target.value}))}
                        placeholder="YES" />
                      <input className="input-field py-1.5 text-xs flex-1"
                        value={editVal.label} onChange={e=>setEditVal(p=>({...p,label:e.target.value}))}
                        placeholder="YES — OME Support Active" />
                      <button onClick={()=>handleEditSave(idx)} disabled={saving} className="btn-primary text-xs py-1.5 px-3">
                        <Save size={12}/> {saving?'…':'Save'}
                      </button>
                      <button onClick={()=>setEditIdx(null)} className="btn-secondary text-xs py-1.5 px-2"><X size={12}/></button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded w-14 text-center">{opt.value}</span>
                      <span className="text-sm text-gray-700 flex-1">{opt.label}</span>
                      {canWrite && (
                        <>
                          <button onClick={()=>{setEditIdx(idx);setEditVal({value:opt.value,label:opt.label});}} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={13}/></button>
                          <button onClick={()=>handleDelete(idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={13}/></button>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}

              {canWrite && editIdx === null && (
                <form onSubmit={handleAdd} className="flex gap-2 pt-2 border-t border-gray-100">
                  <input className="input-field py-1.5 text-xs w-20 font-mono uppercase"
                    value={newValue} onChange={e=>setNewValue(e.target.value.toUpperCase())}
                    placeholder="VAL" maxLength={20} />
                  <input className="input-field py-1.5 text-xs flex-1"
                    value={newLabel} onChange={e=>setNewLabel(e.target.value)}
                    placeholder="VAL — Description shown in dropdown" />
                  <button type="submit" disabled={saving} className="btn-primary text-xs py-1.5 px-3">
                    <Plus size={12}/> Add
                  </button>
                </form>
              )}
              <p className="text-xs text-gray-400 mt-1">These options appear in the OME Status dropdown on Add Asset and Add Ext. Asset forms.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

//---------- EOL Status options manager --------------------------------------------
function EolStatusSection({ canWrite, onRefresh }) {
  const { requestDelete } = useDeleteConfirm();
  const DEFAULT_OPTIONS = ['InSupport', 'EOL', 'Decom', 'Not Applicable'];
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newOption, setNewOption] = useState('');
  const [editIdx, setEditIdx] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await settingsAPI.getBuiltinFieldTypes('asset');
      const ov = r.data || {};
      const eolOpts = Array.isArray(ov?.eol_status?.options) && ov.eol_status.options.length
        ? ov.eol_status.options
        : DEFAULT_OPTIONS;
      setOverrides(ov);
      setOptions(eolOpts);
    } catch {
      setOverrides({});
      setOptions(DEFAULT_OPTIONS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (nextOptions) => {
    const cleaned = nextOptions.map(s => String(s || '').trim()).filter(Boolean);
    if (!cleaned.length) { toast.error('At least one EOL status option is required'); return; }
    setSaving(true);
    try {
      const next = {
        ...overrides,
        eol_status: {
          ...(overrides.eol_status || {}),
          type: 'dropdown',
          label: overrides?.eol_status?.label || 'EOL Status',
          options: cleaned,
        },
      };
      await settingsAPI.saveBuiltinFieldTypes('asset', next);
      setOverrides(next);
      setOptions(cleaned);
      onRefresh && onRefresh();
      toast.success('EOL Status options saved');
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = (e) => {
    e.preventDefault();
    const val = newOption.trim();
    if (!val) { toast.error('Enter an option value'); return; }
    if (options.some(o => o.toLowerCase() === val.toLowerCase())) { toast.error('Option already exists'); return; }
    save([...options, val]);
    setNewOption('');
  };

  const handleDelete = (idx) => {
    requestDelete(options[idx], () => save(options.filter((_, i) => i !== idx)));
  };

  const handleEditSave = (idx) => {
    const val = editValue.trim();
    if (!val) { toast.error('Value is required'); return; }
    if (options.some((o, i) => i !== idx && o.toLowerCase() === val.toLowerCase())) { toast.error('Option already exists'); return; }
    const updated = options.map((o, i) => i === idx ? val : o);
    save(updated);
    setEditIdx(null);
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(e => !e)}
        className="flex items-center justify-between w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left">
        <span className="font-medium text-sm text-gray-800 flex items-center gap-2">
          EOL Status Options
          <span className="text-xs font-normal text-gray-400">({options.length} options)</span>
        </span>
        {expanded ? <ChevronUp size={15} className="text-gray-400"/> : <ChevronDown size={15} className="text-gray-400"/>}
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="animate-pulse space-y-2">{Array(3).fill(0).map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded"/>)}</div>
          ) : (
            <>
              {options.map((opt, idx) => (
                <div key={`${opt}-${idx}`} className="flex items-center gap-2">
                  {editIdx === idx ? (
                    <>
                      <input className="input-field py-1.5 text-xs flex-1"
                        value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="InSupport" />
                      <button onClick={() => handleEditSave(idx)} disabled={saving} className="btn-primary text-xs py-1.5 px-3">
                        <Save size={12}/> {saving ? 'â€¦' : 'Save'}
                      </button>
                      <button onClick={() => setEditIdx(null)} className="btn-secondary text-xs py-1.5 px-2"><X size={12}/></button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-gray-700 flex-1">{opt}</span>
                      {canWrite && (
                        <>
                          <button onClick={() => { setEditIdx(idx); setEditValue(opt); }} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={13}/></button>
                          <button onClick={() => handleDelete(idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={13}/></button>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}

              {canWrite && editIdx === null && (
                <form onSubmit={handleAdd} className="flex gap-2 pt-2 border-t border-gray-100">
                  <input className="input-field py-1.5 text-xs flex-1"
                    value={newOption} onChange={e => setNewOption(e.target.value)}
                    placeholder="Add EOL option (e.g. EndOfLife)" />
                  <button type="submit" disabled={saving} className="btn-primary text-xs py-1.5 px-3">
                    <Plus size={12}/> Add
                  </button>
                </form>
              )}
              <p className="text-xs text-gray-400 mt-1">These options appear in the EOL Status dropdown on Add Asset and Add Ext. Asset forms.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Quick-link card to a related settings page ─────────────────────────────
function QuickLink({ to, icon: Icon, label, desc }) {
  return (
    <Link to={to}
      className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-sm transition-all group">
      <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100">
        <Icon size={16} className="text-blue-700" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="text-xs text-gray-500 truncate">{desc}</p>
      </div>
      <ArrowRight size={14} className="text-gray-400 group-hover:text-blue-600 flex-shrink-0" />
    </Link>
  );
}

// ── Per-page overview cards ────────────────────────────────────────────────
const PAGE_CONFIG = {
  'add-asset': {
    icon: Server,
    title: 'Add New Asset',
    description: 'Manages what fields and values appear when registering a new server or VM.',
    dropdownGroups: [
      { label: 'Basic Information', keys: ['asset_types', 'os_types'] },
      { label: 'Ownership',         keys: ['departments'] },
      { label: 'Status & Patching', keys: ['server_status', 'patching_schedules', 'patching_types', 'server_patch_types', 'locations'] },
    ],
    links: [
      { to: '/custom-fields',         icon: Layers,    label: 'Asset Custom Fields',  desc: 'Add/move/delete custom fields on the Add Asset form' },
      { to: '/dept-range-management', icon: Server,    label: 'Department Tag Ranges', desc: 'Configure Asset Tag number ranges per department' },
      { to: '/new-asset-import',     icon: ExternalLink, label: 'New Asset Import', desc: 'Scan vCenter/ESXi and list only non-inventory VMs for transfer' },
      { to: '/excel-smart-import',    icon: ExternalLink, label: 'Excel Smart Import', desc: 'Import Excel/CSV with random columns using smart template matching' },
    ],
    oem: true,
    eol: true,
  },
  'add-ext-asset': {
    icon: Layers,
    title: 'Add New Ext. Asset',
    description: 'Extended inventory form — shares all dropdown values and custom fields with Add New Asset.',
    dropdownGroups: [
      { label: 'Basic Information', keys: ['asset_types', 'os_types'] },
      { label: 'Ownership',         keys: ['departments'] },
      { label: 'Status & Patching', keys: ['server_status', 'patching_schedules', 'patching_types', 'server_patch_types', 'locations'] },
    ],
    links: [
      { to: '/extended-custom-fields', icon: Layers,    label: 'Extended Custom Fields', desc: 'Add/move/delete custom fields on the Ext. Asset form' },
      { to: '/dept-range-management',  icon: Server,    label: 'Department Tag Ranges',  desc: 'Configure Asset Tag number ranges per department' },
      { to: '/new-asset-import',      icon: ExternalLink, label: 'New Asset Import', desc: 'Scan vCenter/ESXi and list only non-inventory VMs for transfer' },
      { to: '/excel-smart-import',     icon: ExternalLink, label: 'Excel Smart Import', desc: 'Import Excel/CSV with random columns using smart template matching' },
    ],
    note: 'Ext. Asset uses the same dropdown lists as Add Asset. Changes made here reflect on both forms.',
    oem: true,
    eol: true,
  },
  'physical-server': {
    icon: HardDrive,
    title: 'Physical Server',
    description: 'Controls the fields and options for the Register Physical Server form. Fields include Hosted IP, VM/Asset Name, Department, Location, Server Model, Serial Number, CPU Cores, RAM, Total Disks, OME Support Status, Rack Number, Server Position, and Additional Notes.',
    dropdownGroups: [
      { label: 'Ownership', keys: ['departments'] },
      { label: 'Location',  keys: ['locations'] },
    ],
    links: [
      { to: '/physical-assets',              icon: HardDrive, label: 'Register Physical Server', desc: 'Register a new physical server with Hosted IP, Model, Serial Number, Rack Info and OME Status' },
      { to: '/physical-asset-custom-fields', icon: HardDrive, label: 'Physical Asset Config',    desc: 'Add/edit standard and custom fields on Physical Server registration (including OME Status)' },
      { to: '/physical-server-list',         icon: Server,    label: 'Physical Servers List',    desc: 'View, import, and export all physical server records' },
    ],
    note: 'OME Support Status (Active/Expired toggle) is a built-in field on the Register Physical Server form. Use Physical Asset Config to add custom fields or change field types.',
  },
};

// ── Tab content: shows dropdowns for the selected page ────────────────────
function PageConfigTab({ pageKey, dropdowns, canWrite, onRefresh }) {
  const cfg = PAGE_CONFIG[pageKey];
  if (!cfg) return null;
  const allKeys = cfg.dropdownGroups.flatMap(g => g.keys);
  return (
    <div className="space-y-5">
      {/* Page description */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
        <p className="font-semibold flex items-center gap-2 mb-1">
          <cfg.icon size={14} /> {cfg.title}
        </p>
        <p className="text-xs">{cfg.description}</p>
        {cfg.note && <p className="text-xs mt-1 text-blue-600 italic">{cfg.note}</p>}
      </div>

      {/* Quick links */}
      {cfg.links.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Settings Pages</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {cfg.links.map(l => <QuickLink key={l.to} {...l} />)}
          </div>
        </div>
      )}

      {/* OME Status options */}
      {cfg.oem && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">OME Status Options</p>
          <OmeStatusSection canWrite={canWrite} onRefresh={onRefresh} />
        </div>
      )}

      {cfg.eol && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">EOL Status Options</p>
          <EolStatusSection canWrite={canWrite} onRefresh={onRefresh} />
        </div>
      )}

      {/* Dropdown management */}
      {allKeys.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Dropdown Values</p>
          <div className="space-y-4">
            {cfg.dropdownGroups.map(group => (
              <div key={group.label}>
                <p className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1">
                  <span className="w-4 h-px bg-gray-300 inline-block"/> {group.label}
                </p>
                {group.keys.map(k => (
                  <DropdownSection
                    key={k}
                    tableKey={k}
                    label={TABLE_CONFIG.find(t => t.key === k)?.label || k}
                    items={dropdowns[k] || []}
                    canWrite={canWrite}
                    onRefresh={onRefresh}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConfigurationPage() {
  const { canWrite } = useAuth();
  const { bumpConfig } = useConfig();
  const [dropdowns, setDropdowns] = useState({});
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState('add-asset');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dropdownsAPI.getAll();
      setDropdowns(res.data);
    } catch { toast.error('Failed to load configuration'); }
    finally { setLoading(false); }
  }, []);

  const handleRefresh = useCallback(async () => {
    await fetchAll();
    bumpConfig();
  }, [fetchAll, bumpConfig]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) return (
    <div className="animate-pulse space-y-4">
      {Array(4).fill(0).map((_, i) => <div key={i} className="card h-16 bg-gray-100" />)}
    </div>
  );

  const TABS = [
    { key: 'add-asset',       label: 'Add New Asset',        icon: Server },
    { key: 'add-ext-asset',   label: 'Add New Ext. Asset',   icon: Layers },
    { key: 'physical-server', label: 'Physical Server',      icon: HardDrive },
    { key: 'all-dropdowns',   label: 'All Dropdown Values',  icon: Settings },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Inventory Configuration</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage dropdown values, custom fields and settings for each inventory page</p>
      </div>

      {!canWrite && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          Read-only access. Contact an admin to modify configuration values.
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key ? 'bg-white text-blue-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab !== 'all-dropdowns' ? (
        <PageConfigTab
          pageKey={activeTab}
          dropdowns={dropdowns}
          canWrite={canWrite}
          onRefresh={handleRefresh}
        />
      ) : (
        /* All Dropdowns tab — original full list */
        <div className="space-y-4">
          {TABLE_CONFIG.map(({ key, label }) => (
            <DropdownSection
              key={key}
              tableKey={key}
              label={label}
              items={dropdowns[key] || []}
              canWrite={canWrite}
              onRefresh={handleRefresh}
            />
          ))}
          <OsVersionsSection dropdowns={dropdowns} canWrite={canWrite} onRefresh={handleRefresh} />
        </div>
      )}
    </div>
  );
}

