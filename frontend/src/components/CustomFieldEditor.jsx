import React, { useState } from 'react';
import Toggle from './Toggle';
import toast from 'react-hot-toast';
import { Plus, Trash2, Edit2, Save, X, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';

export const FIELD_TYPES = [
  { value: 'textbox',  label: 'Text Box',       desc: 'Single line text input' },
  { value: 'dropdown', label: 'Dropdown',        desc: 'Select one from a list' },
  { value: 'toggle',   label: 'Toggle (Yes/No)', desc: 'Boolean on/off switch' },
  { value: 'radio',    label: 'Radio Buttons',   desc: 'Select one visible option' },
];

// Render a custom field value in a form context
export function RenderCustomField({ cf, value, onChange, disabled = false }) {
  let opts = [];
  try { opts = JSON.parse(cf.field_options || '[]'); } catch {}

  if (cf.field_type === 'textbox') {
    return (
      <input className="input-field" value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled} />
    );
  }
  if (cf.field_type === 'dropdown') {
    return (
      <select className="input-field" value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled}>
        <option value="">Select…</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (cf.field_type === 'toggle') {
    return (
      <div className="flex items-center gap-3 h-9">
        <Toggle checked={!!value} onChange={onChange} disabled={disabled} />
        <span className="text-sm text-gray-600">{value ? 'Yes' : 'No'}</span>
      </div>
    );
  }
  if (cf.field_type === 'radio') {
    return (
      <div className="flex flex-wrap gap-3 pt-1">
        {opts.map(o => (
          <label key={o} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-all
            ${value === o ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            <input type="radio" className="accent-blue-700" name={cf.field_key} value={o}
              checked={value === o} onChange={() => onChange(o)} disabled={disabled} />
            {o}
          </label>
        ))}
      </div>
    );
  }
  return null;
}

// Full custom field management table — used by all 3 custom field pages
export default function CustomFieldEditor({
  fields,
  onAdd,
  onUpdate,
  onDelete,
  canWrite,
  title = 'Custom Fields'
}) {
  const INIT = { field_label: '', field_key: '', field_type: 'textbox', field_options: '', field_group: 'General', is_active: true, sort_order: 0 };
  const [form, setForm]       = useState(INIT);
  const [editId, setEditId]   = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});

  const autoKey = (label) => label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_').replace(/^_|_$/, '');

  const handleLabelChange = (v) => setForm(p => ({ ...p, field_label: v, field_key: editId ? p.field_key : autoKey(v) }));

  const resetForm = () => { setForm(INIT); setEditId(null); setShowForm(false); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.field_label || !form.field_key || !form.field_type) { toast.error('Label, key and type required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        field_options: ['dropdown','radio'].includes(form.field_type) && form.field_options
          ? form.field_options.split('\n').map(s => s.trim()).filter(Boolean)
          : [],
        sort_order: parseInt(form.sort_order) || 0,
      };
      if (editId) { await onUpdate(editId, payload); toast.success('Field updated'); }
      else        { await onAdd(payload);             toast.success('Field created'); }
      resetForm();
    } catch (err) { toast.error(err?.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleEdit = (field) => {
    let opts = '';
    try { const parsed = JSON.parse(field.field_options || '[]'); opts = Array.isArray(parsed) ? parsed.join('\n') : ''; } catch {}
    setForm({ ...field, field_options: opts });
    setEditId(field.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (field) => {
    if (!confirm(`Delete field "${field.field_label}"?`)) return;
    try { await onDelete(field.id); toast.success('Deleted'); }
    catch (err) { toast.error(err?.response?.data?.error || 'Delete failed'); }
  };

  const toggleGroup = (g) => setExpandedGroups(p => ({ ...p, [g]: !p[g] }));

  // Group fields
  const grouped = (fields || []).reduce((acc, cf) => {
    const g = cf.field_group || 'General';
    if (!acc[g]) acc[g] = [];
    acc[g].push(cf);
    return acc;
  }, {});

  const typeBadge = (type) => ({
    textbox: 'bg-blue-50 text-blue-700', dropdown: 'bg-purple-50 text-purple-700',
    toggle: 'bg-green-50 text-green-700', radio: 'bg-orange-50 text-orange-700',
  })[type] || 'bg-gray-100 text-gray-600';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        {canWrite && !showForm && (
          <button onClick={() => setShowForm(true)} className="btn-primary text-xs">
            <Plus size={14} /> Add Field
          </button>
        )}
      </div>

      {/* Add / Edit Form */}
      {showForm && canWrite && (
        <div className="border-2 border-blue-200 rounded-xl p-5 bg-blue-50/30">
          <h3 className="font-semibold text-gray-700 mb-4">{editId ? 'Edit Field' : 'New Custom Field'}</h3>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Field Label <span className="text-red-500">*</span></label>
                <input className="input-field" placeholder="e.g. VLAN ID" value={form.field_label} onChange={e => handleLabelChange(e.target.value)} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Field Key <span className="text-red-500">*</span></label>
                <input className="input-field font-mono text-xs" placeholder="e.g. vlan_id" value={form.field_key}
                  onChange={e => setForm(p => ({ ...p, field_key: e.target.value }))} disabled={!!editId} required />
                {editId && <p className="text-xs text-gray-400 mt-0.5">Key cannot change after creation</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Field Type <span className="text-red-500">*</span></label>
                <select className="input-field" value={form.field_type} onChange={e => setForm(p => ({ ...p, field_type: e.target.value }))}>
                  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Group / Section</label>
                <input className="input-field" placeholder="e.g. Network Info" value={form.field_group}
                  onChange={e => setForm(p => ({ ...p, field_group: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
                <input type="number" className="input-field" min={0} value={form.sort_order}
                  onChange={e => setForm(p => ({ ...p, sort_order: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Visible in form</label>
                <div className="flex items-center gap-2 h-9">
                  <Toggle checked={form.is_active} onChange={v => setForm(p => ({ ...p, is_active: v }))} />
                  <span className="text-sm text-gray-600">{form.is_active ? 'Active' : 'Hidden'}</span>
                </div>
              </div>
            </div>

            {['dropdown','radio'].includes(form.field_type) && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Options (one per line)</label>
                <textarea className="input-field font-mono text-xs" rows={5} value={form.field_options}
                  onChange={e => setForm(p => ({ ...p, field_options: e.target.value }))}
                  placeholder={`Option A\nOption B\nOption C`} />
                <p className="text-xs text-gray-400 mt-1">Each line = one selectable option</p>
              </div>
            )}

            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary text-xs">
                <Save size={13} />{saving ? 'Saving…' : editId ? 'Update' : 'Create Field'}
              </button>
              <button type="button" onClick={resetForm} className="btn-secondary text-xs">
                <X size={13} /> Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Fields grouped display */}
      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="font-medium">No custom fields yet</p>
          <p className="text-xs mt-1">Click "Add Field" to create your first custom field</p>
        </div>
      ) : (
        Object.entries(grouped).map(([group, groupFields]) => {
          const isExpanded = expandedGroups[group] !== false; // default open
          return (
            <div key={group} className="border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => toggleGroup(group)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-2">
                  <GripVertical size={14} className="text-gray-400" />
                  <span className="font-semibold text-gray-700 text-sm">{group}</span>
                  <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{groupFields.length}</span>
                </div>
                {isExpanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
              </button>

              {isExpanded && (
                <table className="w-full text-sm">
                  <thead className="bg-white border-b border-gray-100">
                    <tr>
                      <th className="table-th">Label</th>
                      <th className="table-th">Key</th>
                      <th className="table-th">Type</th>
                      <th className="table-th">Options Preview</th>
                      <th className="table-th">Sort</th>
                      <th className="table-th">Status</th>
                      {canWrite && <th className="table-th">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {groupFields.map(field => (
                      <tr key={field.id} className="hover:bg-gray-50">
                        <td className="table-td font-medium">{field.field_label}</td>
                        <td className="table-td font-mono text-xs text-gray-500">{field.field_key}</td>
                        <td className="table-td">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${typeBadge(field.field_type)}`}>
                            {FIELD_TYPES.find(t => t.value === field.field_type)?.label || field.field_type}
                          </span>
                        </td>
                        <td className="table-td text-xs text-gray-500 max-w-[150px] truncate">
                          {['dropdown','radio'].includes(field.field_type) && field.field_options
                            ? (() => { try { const o = JSON.parse(field.field_options); return o.slice(0,3).join(', ') + (o.length>3?'…':''); } catch { return '—'; } })()
                            : '—'}
                        </td>
                        <td className="table-td text-xs">{field.sort_order}</td>
                        <td className="table-td">
                          <span className={`text-xs font-medium ${field.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                            {field.is_active ? '● Active' : '○ Hidden'}
                          </span>
                        </td>
                        {canWrite && (
                          <td className="table-td">
                            <div className="flex gap-1">
                              <button onClick={() => handleEdit(field)} className="p-1.5 text-blue-500 hover:bg-blue-100 rounded"><Edit2 size={12} /></button>
                              <button onClick={() => handleDelete(field)} className="p-1.5 text-red-500 hover:bg-red-100 rounded"><Trash2 size={12} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
