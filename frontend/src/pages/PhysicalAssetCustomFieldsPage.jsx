import React, { useState, useEffect, useCallback } from 'react';
import { physicalAssetsAPI, settingsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Toggle from '../components/Toggle';
import toast from 'react-hot-toast';
import {
  HardDrive, X, Type, ListFilter, GripVertical, ChevronDown, ChevronUp,
  Info, Lock, Plus, Edit2, Trash2, ArrowRight, Save, MoveRight
} from 'lucide-react';

// ── Standard Physical Asset built-in fields ───────────────────────────────────
const STANDARD_GROUPS = [
  {
    group: 'Hardware Information',
    fields: [
      { key: 'hosted_ip',          label: 'Hosted IP',          type: 'textbox',  note: 'IP of this physical server' },
      { key: 'model_id',           label: 'Server Model',       type: 'dropdown', note: 'Linked to Models list' },
      { key: 'serial_number',      label: 'Serial Number',      type: 'textbox'  },
      { key: 'cores',              label: 'CPU Cores',          type: 'textbox',  note: 'Numeric' },
      { key: 'ram_gb',             label: 'RAM (GB)',           type: 'textbox',  note: 'Numeric' },
      { key: 'total_disks',        label: 'Total Disks',        type: 'textbox',  note: 'Numeric' },
      { key: 'oem_support_status', label: 'OME Support Status', type: 'toggle',   note: 'Active / Expired' },
    ],
  },
  {
    group: 'Rack Information',
    fields: [
      { key: 'rack_number',     label: 'Rack Number',      type: 'textbox', note: 'e.g. RACK-A1' },
      { key: 'server_position', label: 'Server Position',  type: 'textbox', note: 'e.g. U12' },
    ],
  },
  {
    group: 'General',
    fields: [
      { key: 'vm_name',          label: 'Device Name',      type: 'textbox' },
      { key: 'department_id',    label: 'Department',       type: 'dropdown' },
      { key: 'location_id',      label: 'Location',         type: 'dropdown' },
      { key: 'additional_notes', label: 'Additional Notes', type: 'textbox', note: 'Multi-line' },
    ],
  },
];

const TYPE_BADGE = {
  textbox:  'bg-blue-50 text-blue-700',
  dropdown: 'bg-purple-50 text-purple-700',
  toggle:   'bg-green-50 text-green-700',
  radio:    'bg-orange-50 text-orange-700',
};
const TYPE_LABEL = { textbox: 'Text Box', dropdown: 'Dropdown', toggle: 'Toggle', radio: 'Radio' };

function TypeBadge({ type }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${TYPE_BADGE[type] || 'bg-gray-100 text-gray-500'}`}>
      {TYPE_LABEL[type] || type}
    </span>
  );
}


// ── Built-in field type editor ────────────────────────────────────────────────
const TYPE_CHANGEABLE_FIELDS_DEF = [
  { key:'hosted_ip',          label:'Hosted IP',           defaultType:'textbox', group:'Hardware Information' },
  { key:'serial_number',      label:'Serial Number',       defaultType:'textbox', group:'Hardware Information' },
  { key:'cores',              label:'CPU Cores',           defaultType:'textbox', group:'Hardware Information' },
  { key:'ram_gb',             label:'RAM (GB)',             defaultType:'textbox', group:'Hardware Information' },
  { key:'total_disks',        label:'Total Disks',         defaultType:'textbox', group:'Hardware Information' },
  { key:'oem_support_status', label:'OME Support Status',  defaultType:'toggle',  group:'Hardware Information' },
  { key:'rack_number',        label:'Rack Number',         defaultType:'textbox', group:'Rack Information' },
  { key:'server_position',    label:'Server Position (U)', defaultType:'textbox', group:'Rack Information' },
  { key:'additional_notes',   label:'Additional Notes',    defaultType:'textbox', group:'General' },
  { key:'vm_name',            label:'Device Name',         defaultType:'textbox', group:'General' },
  { key:'department_id',      label:'Department',          defaultType:'dropdown',group:'General' },
  { key:'location_id',        label:'Location',            defaultType:'dropdown',group:'General' },
];
const TYPE_LABELS_MAP = { textbox:'Text Box', dropdown:'Dropdown', radio:'Radio Buttons', toggle:'Toggle (Yes/No)' };
const TYPE_TRANSITIONS = { textbox:['textbox','dropdown','radio'], dropdown:['dropdown','textbox','radio'], toggle:['toggle','dropdown','radio'] };

function BuiltInFieldTypeEditor({ scope, fieldTypeOverrides, onSave, saving }) {
  const [local, setLocal] = useState({});
  useEffect(() => { if (fieldTypeOverrides) setLocal(fieldTypeOverrides); }, [fieldTypeOverrides]);
  const getEff = (f) => ({ type:local[f.key]?.type||f.defaultType, options:local[f.key]?.options||f.defaultOptions||[], label:local[f.key]?.label||f.label });
  const setType = (key,type) => setLocal(p=>({...p,[key]:{...p[key],type,options:p[key]?.options||[]}}));
  const setOptions = (key,opts) => setLocal(p=>({...p,[key]:{...p[key],options:opts}}));
  const setLbl = (key,lbl) => setLocal(p=>({...p,[key]:{...p[key],label:lbl}}));
  const resetField = (key) => setLocal(p=>{const n={...p};delete n[key];return n;});
  const grouped = {};
  TYPE_CHANGEABLE_FIELDS_DEF.forEach(f=>{if(!grouped[f.group])grouped[f.group]=[];grouped[f.group].push(f);});
  return (
    <div className="space-y-5">
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
        <p className="font-semibold flex items-center gap-2"><MoveRight size={13}/> Change Built-in Field Types</p>
        <p>Override the input type for built-in fields. For example change <strong>Assigned User</strong> from a text box to a dropdown, or <strong>Additional Remarks</strong> to radio buttons.</p>
        <p className="text-amber-600">⚠ Fields linked to database tables (Asset Type, OS Type, Department etc.) are always dropdowns and are not listed here.</p>
      </div>
      {Object.entries(grouped).map(([grp,fields])=>(
        <div key={grp}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{grp}</p>
          <div className="space-y-3">
            {fields.map(f=>{
              const eff=getEff(f); const mod=!!local[f.key];
              const allowed=TYPE_TRANSITIONS[f.defaultType]||['textbox','dropdown','radio'];
              return (
                <div key={f.key} className={`border rounded-xl p-4 ${mod?'border-blue-300 bg-blue-50/30':'border-gray-200 bg-white'}`}>
                  <div className="flex items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-[180px]"><div className="flex items-center gap-2 mb-0.5"><span className="text-sm font-semibold text-gray-800">{f.label}</span>{mod&&<span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Modified</span>}</div><span className="text-xs font-mono text-gray-400">{f.key}</span></div>
                    <div className="flex-1 min-w-[150px]"><label className="block text-xs font-medium text-gray-500 mb-1">Field Label</label><input className="input-field py-1.5 text-xs" value={eff.label} onChange={e=>setLbl(f.key,e.target.value)} placeholder={f.label}/></div>
                    <div className="min-w-[160px]"><label className="block text-xs font-medium text-gray-500 mb-1">Input Type</label><div className="flex items-center gap-2"><span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded font-mono">{TYPE_LABELS_MAP[f.defaultType]}</span><ArrowRight size={12} className="text-gray-300 flex-shrink-0"/><select className="input-field py-1.5 text-xs flex-1" value={eff.type} onChange={e=>setType(f.key,e.target.value)}>{allowed.map(t=><option key={t} value={t}>{TYPE_LABELS_MAP[t]}</option>)}</select></div></div>
                    {mod&&<div className="flex items-end pb-0.5"><button onClick={()=>resetField(f.key)} title="Reset" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><X size={14}/></button></div>}
                  </div>
                  {['dropdown','radio'].includes(eff.type)&&(
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <label className="block text-xs font-medium text-gray-600 mb-2">Options <span className="text-gray-400 font-normal">(one per line)</span></label>
                      <textarea className="input-field text-xs font-mono py-2" rows={Math.max(3,(eff.options||[]).length+1)} value={(eff.options||[]).join("\n")} onChange={e=>setOptions(f.key,e.target.value.split("\n").map(s=>s.trimEnd()).filter((s,i,a)=>s||i===a.length-1))} placeholder={"Option A\nOption B\nOption C"}/>
                      <p className="text-xs text-gray-400 mt-1">{(eff.options||[]).filter(Boolean).length} options{f.defaultOptions?.length?` · Default: ${f.defaultOptions.join(', ')}`:''}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <button onClick={()=>onSave(local)} disabled={saving} className="btn-primary"><Save size={14}/> {saving?'Saving…':'Save Field Types'}</button>
        <button onClick={()=>setLocal({})} className="btn-secondary text-xs">Reset All to Default</button>
        <p className="text-xs text-gray-400">{Object.keys(local).length} field{Object.keys(local).length!==1?'s':''} modified</p>
      </div>
    </div>
  );
}

// Inline-editable custom field row
function CustomFieldRow({ field, canWrite, onRefresh, allGroupNames }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({});
  const [saving, setSaving]   = useState(false);

  const startEdit = () => {
    let opts = '';
    try { const p = JSON.parse(field.field_options || '[]'); opts = Array.isArray(p) ? p.join('\n') : ''; } catch {}
    setForm({
      field_label:   field.field_label,
      field_type:    field.field_type,
      field_group:   field.field_group || 'General',
      field_options: opts,
      is_active:     field.is_active,
      sort_order:    field.sort_order,
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        field_options: ['dropdown', 'radio'].includes(form.field_type)
          ? form.field_options.split('\n').map(s => s.trim()).filter(Boolean)
          : [],
        sort_order: parseInt(form.sort_order) || 0,
      };
      await physicalAssetsAPI.updateCustomField(field.id, payload);
      toast.success('Field updated');
      setEditing(false);
      onRefresh();
    } catch (e) { toast.error(e?.response?.data?.error || 'Update failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete field "${field.field_label}"?`)) return;
    try { await physicalAssetsAPI.deleteCustomField(field.id); toast.success('Deleted'); onRefresh(); }
    catch { toast.error('Delete failed'); }
  };

  if (editing) {
    return (
      <tr className="bg-blue-50/40 border-l-4 border-blue-400">
        <td colSpan={6} className="table-td">
          <div className="py-2 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Label</label>
              <input className="input-field py-1.5 text-xs" value={form.field_label}
                onChange={e => setForm(p => ({ ...p, field_label: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <select className="input-field py-1.5 text-xs" value={form.field_type}
                onChange={e => setForm(p => ({ ...p, field_type: e.target.value }))}>
                <option value="textbox">Text Box</option>
                <option value="dropdown">Dropdown</option>
                <option value="toggle">Toggle</option>
                <option value="radio">Radio</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Move to Group</label>
              <select className="input-field py-1.5 text-xs" value={form.field_group}
                onChange={e => setForm(p => ({ ...p, field_group: e.target.value }))}>
                {allGroupNames.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Sort Order</label>
              <input type="number" min={0} className="input-field py-1.5 text-xs" value={form.sort_order}
                onChange={e => setForm(p => ({ ...p, sort_order: e.target.value }))} />
            </div>
            {['dropdown', 'radio'].includes(form.field_type) && (
              <div className="col-span-full">
                <label className="block text-xs font-medium text-gray-500 mb-1">Options (one per line)</label>
                <textarea className="input-field text-xs font-mono py-1.5" rows={3}
                  value={form.field_options}
                  onChange={e => setForm(p => ({ ...p, field_options: e.target.value }))}
                  placeholder="Option A&#10;Option B&#10;Option C" />
              </div>
            )}
            <div className="col-span-full flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Toggle size="sm" checked={form.is_active} onChange={v => setForm(p => ({ ...p, is_active: v }))} />
                <span className="text-xs text-gray-600">{form.is_active ? 'Active' : 'Hidden'}</span>
              </div>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-xs py-1.5">
                <Save size={12} />{saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} className="btn-secondary text-xs py-1.5">
                <X size={12} /> Cancel
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-purple-50/20">
      <td className="table-td w-6"><GripVertical size={13} className="text-gray-300 mx-auto" /></td>
      <td className="table-td font-medium text-purple-800">
        {field.field_label}
        {!field.is_active && <span className="ml-2 text-xs text-gray-400">(hidden)</span>}
      </td>
      <td className="table-td font-mono text-xs text-gray-400">{field.field_key}</td>
      <td className="table-td"><TypeBadge type={field.field_type} /></td>
      <td className="table-td text-xs text-gray-500">
        {['dropdown', 'radio'].includes(field.field_type) && field.field_options
          ? (() => { try { const o = JSON.parse(field.field_options); return o.slice(0, 3).join(', ') + (o.length > 3 ? '…' : ''); } catch { return '—'; } })()
          : '—'}
      </td>
      <td className="table-td">
        <div className="flex items-center gap-1">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${field.is_active ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'}`}>
            {field.is_active ? 'Custom' : 'Hidden'}
          </span>
          {canWrite && (
            <div className="flex items-center gap-1 ml-1">
              <button onClick={startEdit} title="Edit field"
                className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg font-medium transition-colors">
                <Edit2 size={11}/> Edit
              </button>
              <button onClick={startEdit} title="Move to another group"
                className="flex items-center gap-1 px-2 py-1 text-xs text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg font-medium transition-colors">
                <ArrowRight size={11}/> Move
              </button>
              <button onClick={handleDelete} title="Delete field"
                className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 bg-red-50 hover:bg-red-100 rounded-lg font-medium transition-colors">
                <Trash2 size={11}/> Delete
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// Collapsible group
function GroupSection({ group, standardFields, customFields, canWrite, onRefresh, allGroupNames }) {
  const [open, setOpen] = useState(true);
  const total = standardFields.length + customFields.length;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
        <div className="flex items-center gap-2">
          <GripVertical size={14} className="text-gray-300" />
          <span className="font-semibold text-gray-700 text-sm">{group}</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{total}</span>
          {standardFields.length > 0 && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{standardFields.length} built-in</span>}
          {customFields.length > 0 && <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">{customFields.length} custom</span>}
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {open && (
        <table className="w-full text-sm">
          <thead className="bg-white border-b border-gray-100">
            <tr>
              <th className="table-th w-6"></th>
              <th className="table-th">Field Label</th>
              <th className="table-th">Key</th>
              <th className="table-th">Type</th>
              <th className="table-th">Options / Notes</th>
              <th className="table-th">Kind</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {standardFields.map(f => (
              <tr key={f.key} className="hover:bg-gray-50/50">
                <td className="table-td w-6"><Lock size={11} className="text-gray-300 mx-auto" /></td>
                <td className="table-td font-medium text-gray-700">{f.label}</td>
                <td className="table-td font-mono text-xs text-gray-400">{f.key}</td>
                <td className="table-td"><TypeBadge type={f.type} /></td>
                <td className="table-td text-xs text-gray-400 italic">{f.note || '—'}</td>
                <td className="table-td"><span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Built-in</span></td>
              </tr>
            ))}
            {customFields.map(cf => (
              <CustomFieldRow key={cf.id} field={cf} canWrite={canWrite} onRefresh={onRefresh} allGroupNames={allGroupNames} />
            ))}
            {total === 0 && (
              <tr><td colSpan={6} className="table-td text-center py-4 text-xs text-gray-400 italic">No fields in this group</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Built-in Physical Asset field layout editor ────────────────────────────
const PHYSICAL_BUILT_IN_FIELDS = [
  { key:'hosted_ip',          label:'Hosted IP',          defaultGroup:'Hardware Information' },
  { key:'model_id',           label:'Server Model',       defaultGroup:'Hardware Information' },
  { key:'serial_number',      label:'Serial Number',      defaultGroup:'Hardware Information' },
  { key:'cores',              label:'CPU Cores',          defaultGroup:'Hardware Information' },
  { key:'ram_gb',             label:'RAM (GB)',           defaultGroup:'Hardware Information' },
  { key:'total_disks',        label:'Total Disks',        defaultGroup:'Hardware Information' },
  { key:'oem_support_status', label:'OME Support Status', defaultGroup:'Hardware Information' },
  { key:'rack_number',        label:'Rack Number',        defaultGroup:'Rack Information' },
  { key:'server_position',    label:'Server Position',    defaultGroup:'Rack Information' },
  { key:'vm_name',            label:'VM / Asset Name',    defaultGroup:'General' },
  { key:'department_id',      label:'Department',         defaultGroup:'General' },
  { key:'location_id',        label:'Location',           defaultGroup:'General' },
  { key:'additional_notes',   label:'Additional Notes',   defaultGroup:'General' },
];
const PHYSICAL_GROUPS = ['Hardware Information','Rack Information','General'];

function BuiltInPhysicalFieldLayoutEditor({ fieldLayout, onSave, saving }) {
  const [local, setLocal] = useState({});

  useEffect(() => {
    if (fieldLayout && Object.keys(fieldLayout).length > 0) {
      setLocal(fieldLayout);
    } else {
      const def = {};
      PHYSICAL_BUILT_IN_FIELDS.forEach((f, i) => { def[f.key] = { group: f.defaultGroup, sort: i + 1 }; });
      setLocal(def);
    }
  }, [fieldLayout]);

  const setGroup = (key, group) => setLocal(p => ({ ...p, [key]: { ...p[key], group } }));

  const grouped = PHYSICAL_GROUPS.reduce((acc, g) => { acc[g] = []; return acc; }, {});
  PHYSICAL_BUILT_IN_FIELDS.forEach(f => {
    const g = local[f.key]?.group || f.defaultGroup;
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(f);
  });

  return (
    <div className="space-y-5">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1">
        <p className="font-semibold flex items-center gap-2"><MoveRight size={13}/> Move Built-in Fields Between Groups</p>
        <p>Reassign any built-in Physical Server field to a different group using the dropdown. Changes apply immediately on the Register Server form after saving.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PHYSICAL_GROUPS.map(grp => (
          <div key={grp} className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-200">
              <span className="font-semibold text-sm text-gray-700">{grp}</span>
              <span className="ml-2 text-xs text-gray-400">({grouped[grp]?.length || 0} fields)</span>
            </div>
            <div className="p-2 space-y-1.5 min-h-[60px]">
              {(grouped[grp] || []).map(f => (
                <div key={f.key} className="flex items-center gap-2 p-2 bg-white border border-gray-100 rounded-lg">
                  <GripVertical size={12} className="text-gray-300 flex-shrink-0"/>
                  <span className="text-xs text-gray-700 flex-1 font-medium">{f.label}</span>
                  <select
                    className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-600 max-w-[150px]"
                    value={local[f.key]?.group || f.defaultGroup}
                    onChange={e => setGroup(f.key, e.target.value)}>
                    {PHYSICAL_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              ))}
              {(!grouped[grp] || grouped[grp].length === 0) && (
                <p className="text-xs text-gray-400 italic px-2 py-1">No fields in this group</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => onSave(local)} disabled={saving} className="btn-primary">
          <Save size={14}/> {saving ? 'Saving…' : 'Save Layout'}
        </button>
        <button onClick={() => {
          const def = {};
          PHYSICAL_BUILT_IN_FIELDS.forEach((f, i) => { def[f.key] = { group: f.defaultGroup, sort: i + 1 }; });
          setLocal(def);
        }} className="btn-secondary text-xs">
          Reset to Default
        </button>
        <p className="text-xs text-gray-400">Changes apply on the Physical Server registration form after saving</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PhysicalAssetCustomFieldsPage() {
  const { isAdmin } = useAuth();
  const [customFields, setCustomFields] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showAdd, setShowAdd]           = useState(false);
  const [activeTab, setActiveTab]       = useState('fields');
  const [fieldLayout, setFieldLayout]   = useState(null);
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [fieldTypeOverrides, setFieldTypeOverrides] = useState(null);
  const [typesSaving, setTypesSaving]   = useState(false);
  const INIT = { field_label: '', field_key: '', field_type: 'textbox', field_options: '', field_group: 'Hardware Information', is_active: true, sort_order: 0 };
  const [addForm, setAddForm] = useState(INIT);
  const [saving, setSaving]   = useState(false);

  const fetchFields = useCallback(async () => {
    setLoading(true);
    try { const r = await physicalAssetsAPI.getCustomFields(); setCustomFields(r.data); }
    catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchFields();
    settingsAPI.getPhysicalFieldLayout().then(r => {
      setFieldLayout(r.data && Object.keys(r.data).length > 0 ? r.data : null);
    }).catch(() => {});
    settingsAPI.getBuiltinFieldTypes('physical').then(r => {
      setFieldTypeOverrides(r.data || {});
    }).catch(()=>setFieldTypeOverrides({}));
  }, [fetchFields]);

  const autoKey = l => l.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_').replace(/^_|_$/g, '');

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.field_label || !addForm.field_key) { toast.error('Label and key required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...addForm,
        field_options: ['dropdown', 'radio'].includes(addForm.field_type)
          ? addForm.field_options.split('\n').map(s => s.trim()).filter(Boolean)
          : [],
        sort_order: parseInt(addForm.sort_order) || 0,
      };
      await physicalAssetsAPI.createCustomField(payload);
      toast.success('Custom field created');
      setAddForm(INIT);
      setShowAdd(false);
      fetchFields();
    } catch (e) { toast.error(e?.response?.data?.error || 'Create failed'); }
    finally { setSaving(false); }
  };

  const standardGroupNames = STANDARD_GROUPS.map(g => g.group);
  const customGroupNames   = [...new Set(customFields.map(f => f.field_group || 'General'))];
  const allGroupNames      = [...new Set([...standardGroupNames, ...customGroupNames, 'General'])];

  const mergedGroups = allGroupNames
    .map(group => ({
      group,
      standardFields: STANDARD_GROUPS.find(g => g.group === group)?.fields || [],
      customFields:   customFields.filter(f => (f.field_group || 'General') === group),
    }))
    .filter(g => g.standardFields.length > 0 || g.customFields.length > 0);

  const totalBuiltIn = STANDARD_GROUPS.reduce((a, g) => a + g.fields.length, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-800 rounded-xl flex items-center justify-center">
            <HardDrive size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Physical Asset Fields</h1>
            <p className="text-sm text-gray-500">All Physical Server fields grouped by section · Edit custom fields inline</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab toggle */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[['fields','Fields & Groups'],['layout','Move Built-in Fields'],['types','Change Field Types']].map(([k,l])=>(
              <button key={k} onClick={()=>setActiveTab(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab===k?'bg-white text-blue-800 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
                {l}
              </button>
            ))}
          </div>
          {isAdmin && activeTab==='fields' && (
            <button onClick={() => setShowAdd(!showAdd)} className="btn-primary">
              <Plus size={15} />{showAdd ? 'Cancel' : 'Add Custom Field'}
            </button>
          )}
        </div>
      </div>

      {/* ── Layout editor tab ── */}
      {activeTab==='layout' && isAdmin && (
        <BuiltInPhysicalFieldLayoutEditor
          fieldLayout={fieldLayout}
          onSave={async (newLayout) => {
            setLayoutSaving(true);
            try {
              await settingsAPI.updatePhysicalFieldLayout(newLayout);
              setFieldLayout(newLayout);
              toast.success('Physical field layout saved');
            } catch { toast.error('Save failed'); }
            finally { setLayoutSaving(false); }
          }}
          saving={layoutSaving}
        />
      )}

      {activeTab==='types' && isAdmin && (
        <BuiltInFieldTypeEditor
          scope="physical"
          fieldTypeOverrides={fieldTypeOverrides}
          onSave={async (overrides) => {
            setTypesSaving(true);
            try {
              await settingsAPI.saveBuiltinFieldTypes('physical', overrides);
              setFieldTypeOverrides(overrides);
              toast.success('Field types saved — changes apply on Physical Server form immediately');
            } catch { toast.error('Save failed'); }
            finally { setTypesSaving(false); }
          }}
          saving={typesSaving}
        />
      )}

      {activeTab==='fields' && <>
      {/* Info bar */}
      <div className="card mb-5 flex flex-wrap gap-4 py-3 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><Lock size={11} className="text-gray-400" /> Built-in = standard Physical Asset form fields (read-only)</span>
        <span className="flex items-center gap-1.5"><GripVertical size={11} className="text-purple-400" /> <span className="text-purple-700 font-medium">Custom</span> = your added fields (click Edit to change group)</span>
        <span className="flex items-center gap-1.5"><Info size={11} className="text-blue-500" /> Move a custom field to another group by editing it and changing the "Move to Group" dropdown</span>
      </div>

      {/* Add form */}
      {showAdd && isAdmin && (
        <div className="card mb-6 border-2 border-blue-200 bg-blue-50/30">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><Plus size={15} /> New Custom Field</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Field Label <span className="text-red-500">*</span></label>
              <input className="input-field" placeholder="e.g. Power Supply" value={addForm.field_label} required
                onChange={e => setAddForm(p => ({ ...p, field_label: e.target.value, field_key: autoKey(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Field Key <span className="text-red-500">*</span></label>
              <input className="input-field font-mono text-xs" placeholder="e.g. power_supply" value={addForm.field_key} required
                onChange={e => setAddForm(p => ({ ...p, field_key: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Field Type</label>
              <select className="input-field" value={addForm.field_type}
                onChange={e => setAddForm(p => ({ ...p, field_type: e.target.value }))}>
                <option value="textbox">Text Box</option>
                <option value="dropdown">Dropdown</option>
                <option value="toggle">Toggle (Yes/No)</option>
                <option value="radio">Radio Buttons</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Assign to Group</label>
              <select className="input-field" value={addForm.field_group}
                onChange={e => setAddForm(p => ({ ...p, field_group: e.target.value }))}>
                {allGroupNames.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
              <input type="number" min={0} className="input-field" value={addForm.sort_order}
                onChange={e => setAddForm(p => ({ ...p, sort_order: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Visible in Form</label>
              <div className="flex items-center gap-2 h-9">
                <Toggle checked={addForm.is_active} onChange={v => setAddForm(p => ({ ...p, is_active: v }))} />
                <span className="text-sm text-gray-600">{addForm.is_active ? 'Active' : 'Hidden'}</span>
              </div>
            </div>
            {['dropdown', 'radio'].includes(addForm.field_type) && (
              <div className="col-span-full">
                <label className="block text-xs font-medium text-gray-600 mb-1">Options (one per line)</label>
                <textarea className="input-field font-mono text-xs" rows={4}
                  value={addForm.field_options}
                  onChange={e => setAddForm(p => ({ ...p, field_options: e.target.value }))}
                  placeholder={"Option A\nOption B\nOption C"} />
              </div>
            )}
            <div className="col-span-full flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating…' : 'Create Field'}</button>
              <button type="button" onClick={() => { setAddForm(INIT); setShowAdd(false); }} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="space-y-3 animate-pulse">{Array(3).fill(0).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl" />)}</div>
      ) : (
        <div className="space-y-4">
          {mergedGroups.map(({ group, standardFields, customFields: cfs }) => (
            <GroupSection key={group} group={group}
              standardFields={standardFields} customFields={cfs}
              canWrite={isAdmin} onRefresh={fetchFields} allGroupNames={allGroupNames} />
          ))}
        </div>
      )}

      {!loading && (
        <p className="mt-4 text-xs text-gray-400">
          {totalBuiltIn} built-in · {customFields.length} custom · {mergedGroups.length} groups
        </p>
      )}
      </> }
    </div>
  );
}
