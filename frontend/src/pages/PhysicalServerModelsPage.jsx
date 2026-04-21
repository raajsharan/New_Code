import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { physicalAssetsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  HardDrive, Plus, Edit2, Trash2, Save, X,
  Search, RefreshCw, ArrowLeft, Server, Check
} from 'lucide-react';

// ── Small field wrapper ───────────────────────────────────────────────────────
const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

// ── Add / Edit form (shared) ──────────────────────────────────────────────────
function ModelForm({ initial = {}, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name:         initial.name         || '',
    manufacturer: initial.manufacturer || '',
    description:  initial.description  || '',
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Model name is required'); return; }
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Field label="Manufacturer" >
        <input
          className="input-field"
          placeholder="Dell, HP, Lenovo, Supermicro…"
          value={form.manufacturer}
          onChange={e => set('manufacturer', e.target.value)}
        />
      </Field>
      <Field label="Model Name" required>
        <input
          className="input-field"
          placeholder="PowerEdge R750, ProLiant DL380…"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Description / Notes">
        <input
          className="input-field"
          placeholder="Optional notes about this model"
          value={form.description}
          onChange={e => set('description', e.target.value)}
        />
      </Field>
      <div className="sm:col-span-3 flex gap-3 pt-1">
        <button type="submit" disabled={saving} className="btn-primary">
          <Save size={14} /> {saving ? 'Saving…' : initial.id ? 'Update Model' : 'Add Model'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          <X size={14} /> Cancel
        </button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PhysicalServerModelsPage() {
  const { canWrite, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [models,  setModels]  = useState([]);
  const [servers, setServers] = useState([]);   // used to compute usage counts
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [search,  setSearch]  = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editId,  setEditId]  = useState(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [mR, sR] = await Promise.all([
        physicalAssetsAPI.getModels(),
        physicalAssetsAPI.getAll(),
      ]);
      setModels(mR.data);
      setServers(sR.data);
    } catch { toast.error('Failed to load models'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Usage count per model ─────────────────────────────────────────────────
  const usageMap = servers.reduce((acc, s) => {
    if (s.model_id) acc[s.model_id] = (acc[s.model_id] || 0) + 1;
    return acc;
  }, {});

  // ── Filter ───────────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const filtered = models.filter(m =>
    !q ||
    m.name.toLowerCase().includes(q) ||
    (m.manufacturer || '').toLowerCase().includes(q) ||
    (m.description  || '').toLowerCase().includes(q)
  );

  // ── Add ───────────────────────────────────────────────────────────────────
  const handleAdd = async (form) => {
    setSaving(true);
    try {
      await physicalAssetsAPI.addModel(form);
      toast.success('Model added');
      setShowAdd(false);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Add failed');
    } finally { setSaving(false); }
  };

  // ── Update ────────────────────────────────────────────────────────────────
  const handleUpdate = async (id, form) => {
    setSaving(true);
    try {
      await physicalAssetsAPI.updateModel(id, form);
      toast.success('Model updated');
      setEditId(null);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    } finally { setSaving(false); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (m) => {
    const count = usageMap[m.id] || 0;
    const warning = count > 0
      ? `\n\n⚠️ This model is currently assigned to ${count} server${count > 1 ? 's' : ''}. Those servers will have their model cleared.`
      : '';
    if (!confirm(`Delete model "${m.manufacturer ? m.manufacturer + ' ' : ''}${m.name}"?${warning}`)) return;
    try {
      await physicalAssetsAPI.deleteModel(m.id);
      toast.success('Model deleted');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/physical-server-list')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Back to Physical Servers"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="w-10 h-10 bg-blue-800 rounded-xl flex items-center justify-center">
            <HardDrive size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Server Models</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage the list of physical server models used in registration
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={fetchAll} className="btn-secondary text-xs p-2" title="Refresh">
            <RefreshCw size={14} />
          </button>
          {canWrite && !showAdd && (
            <button onClick={() => { setShowAdd(true); setEditId(null); }} className="btn-primary text-xs">
              <Plus size={14} /> Add Model
            </button>
          )}
        </div>
      </div>

      {/* Add form */}
      {showAdd && canWrite && (
        <div className="card mb-6 border-2 border-blue-200 bg-blue-50/30">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2 text-sm">
            <Plus size={15} className="text-blue-700" /> New Server Model
          </h3>
          <ModelForm
            onSave={handleAdd}
            onCancel={() => setShowAdd(false)}
            saving={saving}
          />
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
        <div className="card py-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
            <HardDrive size={16} className="text-blue-700" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-800">{models.length}</p>
            <p className="text-xs text-gray-500">Total Models</p>
          </div>
        </div>
        <div className="card py-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
            <Server size={16} className="text-green-700" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-800">
              {models.filter(m => usageMap[m.id]).length}
            </p>
            <p className="text-xs text-gray-500">Models In Use</p>
          </div>
        </div>
        <div className="card py-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center">
            <HardDrive size={16} className="text-gray-400" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-800">
              {models.filter(m => !usageMap[m.id]).length}
            </p>
            <p className="text-xs text-gray-500">Unused Models</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="card mb-4 py-3">
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input-field pl-8"
            placeholder="Search by manufacturer or model name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-th">Manufacturer</th>
              <th className="table-th">Model Name</th>
              <th className="table-th">Description / Notes</th>
              <th className="table-th text-center">Servers Using</th>
              {canWrite && <th className="table-th text-center w-28">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">

            {/* Skeleton */}
            {loading && Array(4).fill(0).map((_, i) => (
              <tr key={i} className="animate-pulse">
                {Array(canWrite ? 5 : 4).fill(0).map((_, j) => (
                  <td key={j} className="table-td">
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                  </td>
                ))}
              </tr>
            ))}

            {/* Empty state */}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={canWrite ? 5 : 4} className="text-center py-16 text-gray-400">
                  <HardDrive size={32} className="mx-auto mb-2 opacity-20" />
                  <p className="font-medium text-gray-500">
                    {search ? 'No models match your search' : 'No server models yet'}
                  </p>
                  {!search && canWrite && (
                    <p className="text-xs mt-1">
                      Click <strong>Add Model</strong> above to create the first one.
                    </p>
                  )}
                </td>
              </tr>
            )}

            {/* Rows */}
            {!loading && filtered.map(m => {
              const useCount = usageMap[m.id] || 0;
              const isEditing = editId === m.id;

              if (isEditing) {
                return (
                  <tr key={m.id} className="bg-blue-50/40 border-l-4 border-blue-400">
                    <td colSpan={canWrite ? 5 : 4} className="table-td">
                      <div className="py-2">
                        <p className="text-xs font-semibold text-blue-700 mb-3 flex items-center gap-1.5">
                          <Edit2 size={12} /> Editing model #{m.id}
                        </p>
                        <ModelForm
                          initial={m}
                          onSave={(form) => handleUpdate(m.id, form)}
                          onCancel={() => setEditId(null)}
                          saving={saving}
                        />
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="table-td text-sm text-gray-500 font-medium">
                    {m.manufacturer || <span className="text-gray-300 text-xs italic">—</span>}
                  </td>
                  <td className="table-td">
                    <span className="font-semibold text-gray-800">{m.name}</span>
                  </td>
                  <td className="table-td text-xs text-gray-500 max-w-[220px] truncate" title={m.description || ''}>
                    {m.description || <span className="text-gray-300 italic">—</span>}
                  </td>
                  <td className="table-td text-center">
                    {useCount > 0 ? (
                      <button
                        onClick={() => navigate(`/physical-server-list`)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium hover:bg-green-200 transition-colors"
                        title="View servers using this model"
                      >
                        <Server size={11} />
                        {useCount} server{useCount > 1 ? 's' : ''}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 italic">unused</span>
                    )}
                  </td>
                  {canWrite && (
                    <td className="table-td">
                      <div className="flex gap-1.5 justify-center">
                        <button
                          onClick={() => { setEditId(m.id); setShowAdd(false); }}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg font-medium transition-colors"
                          title="Edit model"
                        >
                          <Edit2 size={11} /> Edit
                        </button>
                        <button
                          onClick={() => handleDelete(m)}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 bg-red-50 hover:bg-red-100 rounded-lg font-medium transition-colors"
                          title={useCount > 0 ? `Used by ${useCount} server(s) — will clear their model on delete` : 'Delete model'}
                        >
                          <Trash2 size={11} /> Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer count */}
      {!loading && (
        <p className="text-xs text-gray-400 mt-3 text-right">
          {filtered.length} of {models.length} model{models.length !== 1 ? 's' : ''}
          {search && ` matching "${search}"`}
        </p>
      )}

      {/* Link back */}
      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500 flex items-center gap-2">
        <Server size={14} className="text-blue-600 flex-shrink-0" />
        Models added here appear in the <strong>Server Model</strong> dropdown on the
        <button
          onClick={() => navigate('/physical-assets')}
          className="text-blue-700 font-medium hover:underline mx-1"
        >
          Physical Server registration form
        </button>
        and the{' '}
        <button
          onClick={() => navigate('/physical-server-list')}
          className="text-blue-700 font-medium hover:underline mx-1"
        >
          Physical Servers list
        </button>.
      </div>

    </div>
  );
}
