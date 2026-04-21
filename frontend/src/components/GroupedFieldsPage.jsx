import React, { useState } from 'react';
import Toggle from './Toggle';
import { useDeleteConfirm } from '../context/DeleteConfirmContext';
import toast from 'react-hot-toast';
import { GripVertical, ChevronDown, ChevronUp, Lock, Plus, Info } from 'lucide-react';

export const TYPE_BADGE = {
  textbox:  'bg-blue-50 text-blue-700',
  dropdown: 'bg-purple-50 text-purple-700',
  toggle:   'bg-green-50 text-green-700',
  radio:    'bg-orange-50 text-orange-700',
};
export const TYPE_LABEL = { textbox:'Text Box', dropdown:'Dropdown', toggle:'Toggle', radio:'Radio' };

export function TypeBadge({ type }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${TYPE_BADGE[type]||'bg-gray-100 text-gray-500'}`}>
      {TYPE_LABEL[type]||type}
    </span>
  );
}

// ── Inline edit row for a custom field ───────────────────────────────────────
function CustomRow({ field, canWrite, onUpdate, onDelete, allGroupNames }) {
  const { requestDelete } = useDeleteConfirm();
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({});
  const [saving, setSaving]   = useState(false);

  const startEdit = () => {
    let opts = '';
    try { const p = JSON.parse(field.field_options||'[]'); opts = Array.isArray(p)?p.join('\n'):''; } catch {}
    setForm({
      field_label:  field.field_label,
      field_type:   field.field_type,
      field_group:  field.field_group || 'General',
      field_options:opts,
      is_active:    field.is_active,
      sort_order:   field.sort_order,
    });
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        field_options: ['dropdown','radio'].includes(form.field_type)
          ? form.field_options.split('\n').map(s=>s.trim()).filter(Boolean)
          : [],
        sort_order: parseInt(form.sort_order)||0,
      };
      await onUpdate(field.id, payload);
      toast.success('Field updated');
      setEditing(false);
    } catch(e) { toast.error(e?.response?.data?.error||'Update failed'); }
    finally { setSaving(false); }
  };

  const del = () => {
    requestDelete(field.field_label, async () => {
      try { await onDelete(field.id); toast.success('Deleted'); }
      catch { toast.error('Delete failed'); }
    });
  };

  if (editing) {
    return (
      <tr className="bg-blue-50/40 border-l-4 border-blue-400">
        <td colSpan={6} className="px-4 py-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Label</label>
              <input className="input-field py-1.5 text-xs" value={form.field_label}
                onChange={e=>setForm(p=>({...p,field_label:e.target.value}))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <select className="input-field py-1.5 text-xs" value={form.field_type}
                onChange={e=>setForm(p=>({...p,field_type:e.target.value}))}>
                <option value="textbox">Text Box</option>
                <option value="dropdown">Dropdown</option>
                <option value="toggle">Toggle</option>
                <option value="radio">Radio Buttons</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Move to Group</label>
              <select className="input-field py-1.5 text-xs" value={form.field_group}
                onChange={e=>setForm(p=>({...p,field_group:e.target.value}))}>
                {allGroupNames.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Sort Order</label>
              <input type="number" min={0} className="input-field py-1.5 text-xs" value={form.sort_order}
                onChange={e=>setForm(p=>({...p,sort_order:e.target.value}))} />
            </div>
            {['dropdown','radio'].includes(form.field_type) && (
              <div className="col-span-full">
                <label className="block text-xs font-medium text-gray-500 mb-1">Options (one per line)</label>
                <textarea className="input-field text-xs font-mono py-1.5" rows={3}
                  value={form.field_options}
                  onChange={e=>setForm(p=>({...p,field_options:e.target.value}))}
                  placeholder="Option A&#10;Option B&#10;Option C" />
              </div>
            )}
            <div className="col-span-full flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Toggle size="sm" checked={form.is_active} onChange={v=>setForm(p=>({...p,is_active:v}))} />
                <span className="text-xs text-gray-600">{form.is_active?'Active':'Hidden'}</span>
              </div>
              <button onClick={save} disabled={saving} className="btn-primary text-xs py-1.5">
                {saving?'Saving…':'Save Changes'}
              </button>
              <button onClick={()=>setEditing(false)} className="btn-secondary text-xs py-1.5">Cancel</button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-purple-50/20">
      <td className="table-td w-6"><GripVertical size={13} className="text-gray-300 mx-auto"/></td>
      <td className="table-td font-medium text-purple-800">
        {field.field_label}
        {!field.is_active && <span className="ml-2 text-xs text-gray-400 font-normal">(hidden)</span>}
      </td>
      <td className="table-td font-mono text-xs text-gray-400">{field.field_key}</td>
      <td className="table-td"><TypeBadge type={field.field_type}/></td>
      <td className="table-td text-xs text-gray-500">
        {['dropdown','radio'].includes(field.field_type)&&field.field_options
          ?(()=>{try{const o=JSON.parse(field.field_options);return o.slice(0,3).join(', ')+(o.length>3?'…':'');}catch{return'—';}})():'—'}
      </td>
      <td className="table-td">
        <div className="flex items-center gap-1">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${field.is_active?'bg-purple-100 text-purple-700':'bg-gray-100 text-gray-400'}`}>
            {field.is_active?'Custom':'Hidden'}
          </span>
          {canWrite && (
            <>
              <button onClick={startEdit} className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-0.5 rounded ml-1 transition-colors">Edit</button>
              <button onClick={del} className="text-xs text-red-500 hover:bg-red-50 px-2 py-0.5 rounded transition-colors">Delete</button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Group section ─────────────────────────────────────────────────────────────
function GroupSection({ group, standardFields, customFields, canWrite, onUpdate, onDelete, allGroupNames }) {
  const [open, setOpen] = useState(true);
  const total = standardFields.length + customFields.length;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={()=>setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
        <div className="flex items-center gap-2">
          <GripVertical size={14} className="text-gray-300"/>
          <span className="font-semibold text-gray-700 text-sm">{group}</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{total}</span>
          {standardFields.length>0 && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{standardFields.length} built-in</span>}
          {customFields.length>0  && <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">{customFields.length} custom</span>}
        </div>
        {open?<ChevronUp size={14} className="text-gray-400"/>:<ChevronDown size={14} className="text-gray-400"/>}
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
            {/* Built-in rows */}
            {standardFields.map(f => (
              <tr key={f.key} className="hover:bg-gray-50/50">
                <td className="table-td w-6"><Lock size={11} className="text-gray-300 mx-auto"/></td>
                <td className="table-td font-medium text-gray-700">{f.label}</td>
                <td className="table-td font-mono text-xs text-gray-400">{f.key}</td>
                <td className="table-td"><TypeBadge type={f.type}/></td>
                <td className="table-td text-xs text-gray-400 italic">{f.note||'—'}</td>
                <td className="table-td"><span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Built-in</span></td>
              </tr>
            ))}
            {/* Custom rows */}
            {customFields.map(cf => (
              <CustomRow key={cf.id} field={cf} canWrite={canWrite}
                onUpdate={onUpdate} onDelete={onDelete} allGroupNames={allGroupNames}/>
            ))}
            {total===0 && (
              <tr><td colSpan={6} className="table-td text-center py-4 text-xs text-gray-400 italic">No fields</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main exported component ───────────────────────────────────────────────────
export default function GroupedFieldsPage({
  title,
  subtitle,
  icon: Icon,
  standardGroups,        // [{group, fields:[{key,label,type,note}]}]
  customFields,          // from API
  canWrite,
  onAdd,
  onUpdate,
  onDelete,
  extraContent,          // optional JSX appended at top (e.g. Models tab)
}) {
  const [showAdd, setShowAdd]   = useState(false);
  const INIT = { field_label:'', field_key:'', field_type:'textbox', field_options:'', field_group:'General', is_active:true, sort_order:0 };
  const [addForm, setAddForm]   = useState(INIT);
  const [saving, setSaving]     = useState(false);

  const autoKey = l => l.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/__+/g,'_').replace(/^_|_$/g,'');

  const standardGroupNames = standardGroups.map(g=>g.group);
  const customGroupNames   = [...new Set(customFields.map(f=>f.field_group||'General'))];
  const allGroupNames      = [...new Set([...standardGroupNames,...customGroupNames,'General'])];

  const mergedGroups = allGroupNames
    .map(group => ({
      group,
      standardFields: standardGroups.find(g=>g.group===group)?.fields||[],
      customFields:   customFields.filter(f=>(f.field_group||'General')===group),
    }))
    .filter(g => g.standardFields.length>0 || g.customFields.length>0);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.field_label||!addForm.field_key) { toast.error('Label and key are required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...addForm,
        field_options: ['dropdown','radio'].includes(addForm.field_type)
          ? addForm.field_options.split('\n').map(s=>s.trim()).filter(Boolean)
          : [],
        sort_order: parseInt(addForm.sort_order)||0,
      };
      await onAdd(payload);
      toast.success('Custom field created');
      setAddForm(INIT);
      setShowAdd(false);
    } catch(e) { toast.error(e?.response?.data?.error||'Create failed'); }
    finally { setSaving(false); }
  };

  const totalBuiltIn = standardGroups.reduce((a,g)=>a+g.fields.length,0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-800 rounded-xl flex items-center justify-center">
            {Icon && <Icon size={18} className="text-white"/>}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
            <p className="text-sm text-gray-500">{subtitle}</p>
          </div>
        </div>
        {canWrite && (
          <button onClick={()=>setShowAdd(!showAdd)} className="btn-primary">
            <Plus size={15}/>{showAdd?'Cancel':'Add Custom Field'}
          </button>
        )}
      </div>

      {/* Extra content (e.g. models management) */}
      {extraContent}

      {/* Info bar */}
      <div className="card mb-5 flex flex-wrap gap-4 py-3 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><Lock size={11} className="text-gray-400"/> Built-in = standard form fields (read-only)</span>
        <span className="flex items-center gap-1.5"><GripVertical size={11} className="text-purple-400"/> <span className="text-purple-700 font-medium">Custom</span> = your added fields · click Edit to change group, type or options</span>
        <span className="flex items-center gap-1.5"><Info size={11} className="text-blue-500"/> To move a field to another group, click Edit → change "Move to Group"</span>
      </div>

      {/* Add form */}
      {showAdd && canWrite && (
        <div className="card mb-6 border-2 border-blue-200 bg-blue-50/30">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><Plus size={15}/> New Custom Field</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Field Label <span className="text-red-500">*</span></label>
              <input className="input-field" placeholder="e.g. VLAN ID" value={addForm.field_label} required
                onChange={e=>setAddForm(p=>({...p,field_label:e.target.value,field_key:autoKey(e.target.value)}))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Field Key <span className="text-red-500">*</span></label>
              <input className="input-field font-mono text-xs" placeholder="e.g. vlan_id" value={addForm.field_key} required
                onChange={e=>setAddForm(p=>({...p,field_key:e.target.value}))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Field Type</label>
              <select className="input-field" value={addForm.field_type} onChange={e=>setAddForm(p=>({...p,field_type:e.target.value}))}>
                <option value="textbox">Text Box</option>
                <option value="dropdown">Dropdown</option>
                <option value="toggle">Toggle (Yes/No)</option>
                <option value="radio">Radio Buttons</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Assign to Group</label>
              <select className="input-field" value={addForm.field_group} onChange={e=>setAddForm(p=>({...p,field_group:e.target.value}))}>
                {allGroupNames.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
              <input type="number" min={0} className="input-field" value={addForm.sort_order}
                onChange={e=>setAddForm(p=>({...p,sort_order:e.target.value}))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Active</label>
              <div className="flex items-center gap-2 h-9">
                <Toggle checked={addForm.is_active} onChange={v=>setAddForm(p=>({...p,is_active:v}))} />
                <span className="text-sm text-gray-600">{addForm.is_active?'Visible':'Hidden'}</span>
              </div>
            </div>
            {['dropdown','radio'].includes(addForm.field_type) && (
              <div className="col-span-full">
                <label className="block text-xs font-medium text-gray-600 mb-1">Options (one per line)</label>
                <textarea className="input-field font-mono text-xs" rows={4} value={addForm.field_options}
                  onChange={e=>setAddForm(p=>({...p,field_options:e.target.value}))}
                  placeholder="Option A&#10;Option B&#10;Option C" />
              </div>
            )}
            <div className="col-span-full flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">{saving?'Creating…':'Create Field'}</button>
              <button type="button" onClick={()=>{setAddForm(INIT);setShowAdd(false);}} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Groups */}
      <div className="space-y-4">
        {mergedGroups.map(({group, standardFields, customFields:cfs}) => (
          <GroupSection key={group} group={group}
            standardFields={standardFields} customFields={cfs}
            canWrite={canWrite} onUpdate={onUpdate} onDelete={onDelete}
            allGroupNames={allGroupNames}/>
        ))}
      </div>

      {/* Stats */}
      <p className="mt-4 text-xs text-gray-400">
        {totalBuiltIn} built-in · {customFields.length} custom · {mergedGroups.length} groups
      </p>
    </div>
  );
}
