import React, { useState, useEffect, useCallback } from 'react';
import { beijingAssetsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDeleteConfirm } from '../context/DeleteConfirmContext';
import Toggle from '../components/Toggle';
import toast from 'react-hot-toast';
import { Globe, Plus, Edit2, Trash2, Save, X, Info, Lock } from 'lucide-react';

// ── Standard Beijing Asset built-in fields (read-only reference) ──────────────
const STANDARD_GROUPS = [
  { group: 'Basic Information', fields: [
    { key: 'vm_name',       label: 'VM Name',     type: 'textbox', note: 'Required' },
    { key: 'ip_address',    label: 'IP Address',  type: 'textbox', note: 'Required, must be unique' },
    { key: 'os_hostname',   label: 'Hostname',    type: 'textbox' },
    { key: 'asset_type',    label: 'Asset Type',  type: 'textbox' },
    { key: 'os_type',       label: 'OS',          type: 'textbox' },
    { key: 'os_version',    label: 'OS Version',  type: 'textbox' },
  ]},
  { group: 'Ownership', fields: [
    { key: 'department',       label: 'Dept',             type: 'textbox' },
    { key: 'location',         label: 'Location',         type: 'textbox' },
    { key: 'assigned_user',    label: 'Assigned User',    type: 'textbox' },
    { key: 'asset_tag',        label: 'Asset Tag',        type: 'textbox' },
    { key: 'serial_number',    label: 'Serial',           type: 'textbox' },
    { key: 'business_purpose', label: 'Business Purpose', type: 'textbox' },
    { key: 'additional_remarks', label: 'Add. Remark',    type: 'textbox' },
  ]},
  { group: 'Status & EOL', fields: [
    { key: 'server_status', label: 'Status',  type: 'textbox' },
    { key: 'eol_status',    label: 'EOL',     type: 'textbox' },
  ]},
  { group: 'Agent Status', fields: [
    { key: 'me_installed_status',      label: 'ME',      type: 'toggle' },
    { key: 'tenable_installed_status', label: 'Tenable', type: 'toggle' },
  ]},
  { group: 'Patching', fields: [
    { key: 'patching_type',     label: 'Patch Type',      type: 'textbox' },
    { key: 'server_patch_type', label: 'Ser. Patch Type', type: 'textbox' },
    { key: 'patching_schedule', label: 'Schedule',        type: 'textbox' },
  ]},
  { group: 'Host Details', fields: [
    { key: 'idrac_enabled',  label: 'iDRAC',     type: 'toggle'  },
    { key: 'idrac_ip',       label: 'iDRAC IP',  type: 'textbox' },
    { key: 'oem_status',     label: 'OME',       type: 'textbox' },
    { key: 'hosted_ip',      label: 'Hosted IP', type: 'textbox' },
  ]},
  { group: 'Credentials', fields: [
    { key: 'asset_username', label: 'Username', type: 'textbox' },
    { key: 'asset_password', label: 'Password', type: 'textbox', note: 'Stored as-is; use with care' },
  ]},
];

const TYPE_BADGE = {
  textbox:  'bg-blue-50 text-blue-700',
  dropdown: 'bg-purple-50 text-purple-700',
  toggle:   'bg-green-50 text-green-700',
};
const TYPE_LABEL = { textbox: 'Text Box', dropdown: 'Dropdown', toggle: 'Toggle' };

function TypeBadge({ type }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${TYPE_BADGE[type] || 'bg-gray-100 text-gray-500'}`}>
      {TYPE_LABEL[type] || type}
    </span>
  );
}

// ── Custom field row ──────────────────────────────────────────────────────────
function CustomFieldRow({ field, onEdit, onDelete, onToggleActive }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
      field.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-800 text-sm">{field.field_label}</span>
          <TypeBadge type={field.field_type} />
          <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            {field.field_key}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            field.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'
          }`}>
            {field.is_active ? 'Active' : 'Hidden'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Toggle size="sm" checked={field.is_active} onChange={v => onToggleActive(field.id, v)} />
        <button onClick={() => onEdit(field)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50" title="Edit">
          <Edit2 size={13} />
        </button>
        <button onClick={() => onDelete(field)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50" title="Delete">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────
function FieldModal({ field, onSave, onClose }) {
  const [form, setForm] = useState({
    field_label:   field?.field_label   || '',
    field_type:    field?.field_type    || 'textbox',
    display_order: field?.display_order ?? 0,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.field_label.trim()) return toast.error('Label is required');
    setSaving(true);
    try {
      await onSave(form);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">{field ? 'Edit Custom Field' : 'Add Custom Field'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Field Label <span className="text-red-500">*</span></label>
            <input className="input-field" value={form.field_label} onChange={e => setForm(f => ({ ...f, field_label: e.target.value }))}
              placeholder="e.g. Application Owner" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Field Type</label>
            <select className="input-field" value={form.field_type} onChange={e => setForm(f => ({ ...f, field_type: e.target.value }))}>
              <option value="textbox">Text Box</option>
              <option value="dropdown">Dropdown</option>
              <option value="toggle">Toggle (Yes/No)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Display Order</label>
            <input type="number" className="input-field" value={form.display_order}
              onChange={e => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} />
          </div>
          {!field && (
            <p className="text-xs text-gray-400">
              The field key is auto-generated from the label. Values are stored in each Beijing asset record.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-secondary text-xs" disabled={saving}>Cancel</button>
          <button onClick={handleSave} className="btn-primary text-xs" disabled={saving}>
            <Save size={13} /> {saving ? 'Saving…' : (field ? 'Update Field' : 'Add Field')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BeijingAssetFieldsPage() {
  const { isAdmin } = useAuth();
  const { requestDelete } = useDeleteConfirm();
  const [customFields, setCustomFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | field object
  const [dbReady, setDbReady] = useState(true);

  const fetchFields = useCallback(async () => {
    setLoading(true);
    try {
      const r = await beijingAssetsAPI.getCustomFields();
      if (Array.isArray(r.data)) {
        setCustomFields(r.data);
        setDbReady(true);
      } else {
        setDbReady(false);
      }
    } catch (e) {
      const msg = e?.response?.data?.error || '';
      // Only show "DB not ready" when the table genuinely doesn't exist
      if (e?.response?.status === 500 && (msg.includes('does not exist') || msg.includes('42P01'))) {
        setDbReady(false);
      } else if (e?.response?.status === 500) {
        // Other 500 (e.g. route mismatch before restart) — don't show misleading banner
        setCustomFields([]);
        setDbReady(true);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFields(); }, [fetchFields]);

  const handleAdd = async (form) => {
    try {
      await beijingAssetsAPI.addCustomField(form);
      toast.success('Custom field added');
      setModal(null);
      fetchFields();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to add field');
    }
  };

  const handleUpdate = async (id, form) => {
    try {
      await beijingAssetsAPI.updateCustomField(id, form);
      toast.success('Field updated');
      setModal(null);
      fetchFields();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to update field');
    }
  };

  const handleToggleActive = async (id, is_active) => {
    try {
      await beijingAssetsAPI.updateCustomField(id, { is_active });
      setCustomFields(prev => prev.map(f => f.id === id ? { ...f, is_active } : f));
    } catch { toast.error('Failed to update field'); }
  };

  const handleDelete = (field) => {
    requestDelete(field.field_label, async () => {
      try {
        await beijingAssetsAPI.deleteCustomField(field.id);
        toast.success('Field deleted');
        fetchFields();
      } catch { toast.error('Failed to delete field'); }
    });
  };

  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <Lock size={36} className="text-gray-300" />
      <p className="text-lg font-semibold text-gray-700">Admin access required</p>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-800 rounded-xl flex items-center justify-center">
            <Globe size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Beijing Asset Fields</h1>
            <p className="text-sm text-gray-500 mt-0.5">View built-in fields and manage custom fields for Beijing Asset List</p>
          </div>
        </div>
        <button onClick={() => setModal('add')} className="btn-primary text-sm">
          <Plus size={14} /> Add Custom Field
        </button>
      </div>

      {!dbReady && (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-2">
          <p className="font-semibold flex items-center gap-2"><Info size={13} /> Database tables not yet created</p>
          <p>Run the following SQL on your database to enable custom fields for Beijing Asset List:</p>
          <pre className="bg-amber-100 rounded p-2 text-[11px] overflow-x-auto">{`CREATE TABLE IF NOT EXISTS beijing_custom_fields (
  id SERIAL PRIMARY KEY,
  field_key VARCHAR(100) NOT NULL UNIQUE,
  field_label VARCHAR(200) NOT NULL,
  field_type VARCHAR(50) NOT NULL DEFAULT 'text',
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE beijing_assets
  ADD COLUMN IF NOT EXISTS custom_field_values JSONB DEFAULT '{}';`}</pre>
        </div>
      )}

      {/* Standard fields (read-only) */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Lock size={14} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Standard Fields (Built-in)</h2>
        </div>
        <div className="space-y-4">
          {STANDARD_GROUPS.map(({ group, fields }) => (
            <div key={group} className="card !p-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{group}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {fields.map(f => (
                  <div key={f.key} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700">{f.label}</p>
                      {f.note && <p className="text-[10px] text-gray-400 mt-0.5">{f.note}</p>}
                    </div>
                    <TypeBadge type={f.type} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom fields */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Plus size={14} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">
              Custom Fields ({customFields.length})
            </h2>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            {Array(3).fill(0).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl" />)}
          </div>
        ) : customFields.length === 0 ? (
          <div className="card text-center py-10 text-gray-400">
            <Globe size={30} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No custom fields yet.</p>
            <p className="text-xs mt-1">Click <strong>Add Custom Field</strong> to extend the Beijing Asset form.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {customFields.map(f => (
              <CustomFieldRow
                key={f.id}
                field={f}
                onEdit={setModal}
                onDelete={handleDelete}
                onToggleActive={handleToggleActive}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <FieldModal
          field={modal === 'add' ? null : modal}
          onSave={modal === 'add'
            ? handleAdd
            : (form) => handleUpdate(modal.id, form)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
