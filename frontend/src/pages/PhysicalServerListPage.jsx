import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { physicalAssetsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDeleteConfirm } from '../context/DeleteConfirmContext';
import toast from 'react-hot-toast';
import {
  Server, Download, Upload, RefreshCw, Search,
  Edit2, Trash2, Eye, Plus, CheckCircle, AlertTriangle,
  HardDrive, Cpu, Database, Save, X, ChevronDown, ChevronUp, Settings
} from 'lucide-react';

// OME badge
const OMEBadge = ({ active }) => active
  ? <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 font-medium">✓ Active</span>
  : <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-600 font-medium">✗ Expired</span>;

// ── Manage Models inline panel ─────────────────────────────────────────────────
function ManageModelsPanel({ canWrite }) {
  const [models, setModels]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [open, setOpen]           = useState(false);
  const [showAdd, setShowAdd]     = useState(false);
  const [addForm, setAddForm]     = useState({ name: '', manufacturer: '' });
  const [editId, setEditId]       = useState(null);
  const [editForm, setEditForm]   = useState({});
  const [saving, setSaving]       = useState(false);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try { const r = await physicalAssetsAPI.getModels(); setModels(r.data); }
    catch { toast.error('Failed to load models'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) fetchModels(); }, [open, fetchModels]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim()) { toast.error('Model name is required'); return; }
    setSaving(true);
    try {
      await physicalAssetsAPI.addModel(addForm);
      toast.success('Model added');
      setAddForm({ name: '', manufacturer: '' });
      setShowAdd(false);
      fetchModels();
    } catch (err) { toast.error(err.response?.data?.error || 'Add failed'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (id) => {
    if (!editForm.name?.trim()) { toast.error('Model name is required'); return; }
    setSaving(true);
    try {
      await physicalAssetsAPI.updateModel(id, editForm);
      toast.success('Model updated');
      setEditId(null);
      fetchModels();
    } catch (err) { toast.error(err.response?.data?.error || 'Update failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = (m) => {
    requestDelete(`model "${m.manufacturer ? m.manufacturer + ' ' : ''}${m.name}"`, async () => {
      try {
        await physicalAssetsAPI.deleteModel(m.id);
        toast.success('Model deleted');
        fetchModels();
      } catch (err) { toast.error(err.response?.data?.error || 'Delete failed'); }
    });
  };

  return (
    <div className="mb-5 border border-gray-200 rounded-xl overflow-hidden">
      {/* Panel header — click to toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Settings size={14} className="text-blue-700" />
          <span className="font-semibold text-sm text-gray-700">Manage Server Models</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{models.length} models</span>
          <Link
            to="/physical-server-models"
            onClick={e => e.stopPropagation()}
            className="text-xs text-blue-600 hover:underline ml-1"
          >
            Open full page →
          </Link>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {open && (
        <div className="p-4">
          {/* Add new model form */}
          {canWrite && (
            <div className="mb-4">
              {!showAdd ? (
                <button onClick={() => setShowAdd(true)} className="btn-primary text-xs">
                  <Plus size={13} /> Add Model
                </button>
              ) : (
                <form onSubmit={handleAdd} className="flex items-end gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl flex-wrap">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Manufacturer <span className="text-gray-400">(optional)</span></label>
                    <input
                      className="input-field text-xs py-1.5 w-36"
                      placeholder="Dell, HP, Lenovo…"
                      value={addForm.manufacturer}
                      onChange={e => setAddForm(p => ({ ...p, manufacturer: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Model Name <span className="text-red-500">*</span></label>
                    <input
                      className="input-field text-xs py-1.5 w-44"
                      placeholder="PowerEdge R750, DL380…"
                      value={addForm.name}
                      onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                      autoFocus
                    />
                  </div>
                  <button type="submit" disabled={saving} className="btn-primary text-xs py-1.5">
                    <Save size={12} /> {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" onClick={() => { setShowAdd(false); setAddForm({ name: '', manufacturer: '' }); }} className="btn-secondary text-xs py-1.5">
                    <X size={12} /> Cancel
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Models table */}
          {loading ? (
            <div className="space-y-2 animate-pulse">
              {Array(3).fill(0).map((_, i) => <div key={i} className="h-9 bg-gray-100 rounded-lg" />)}
            </div>
          ) : models.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No models yet. Add one above to start.</p>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-th">Manufacturer</th>
                    <th className="table-th">Model Name</th>
                    {canWrite && <th className="table-th w-24 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {models.map(m => editId === m.id ? (
                    <tr key={m.id} className="bg-blue-50/40">
                      <td className="table-td">
                        <input
                          className="input-field text-xs py-1 w-full"
                          value={editForm.manufacturer || ''}
                          onChange={e => setEditForm(p => ({ ...p, manufacturer: e.target.value }))}
                          placeholder="Manufacturer"
                        />
                      </td>
                      <td className="table-td">
                        <input
                          className="input-field text-xs py-1 w-full"
                          value={editForm.name || ''}
                          onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                          placeholder="Model name"
                          autoFocus
                        />
                      </td>
                      <td className="table-td">
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => handleUpdate(m.id)} disabled={saving} className="p-1.5 text-green-600 hover:bg-green-100 rounded" title="Save"><Save size={13}/></button>
                          <button onClick={() => setEditId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded" title="Cancel"><X size={13}/></button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="table-td text-xs text-gray-500">{m.manufacturer || <span className="text-gray-300">—</span>}</td>
                      <td className="table-td text-sm font-medium text-gray-800">{m.name}</td>
                      {canWrite && (
                        <td className="table-td">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => { setEditId(m.id); setEditForm({ name: m.name, manufacturer: m.manufacturer || '' }); }}
                              className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors" title="Edit"
                            ><Edit2 size={13}/></button>
                            <button onClick={() => handleDelete(m)} className="p-1.5 text-red-500 hover:bg-red-100 rounded transition-colors" title="Delete"><Trash2 size={13}/></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PhysicalServerListPage() {
  const { canWrite } = useAuth();
  const { requestDelete } = useDeleteConfirm();
  const navigate     = useNavigate();

  const [servers, setServers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [csvFile, setCsvFile]     = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [search, setSearch]       = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const r = await physicalAssetsAPI.getAll();
      setServers(r.data);
    } catch { toast.error('Failed to load physical servers'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDelete = (s) => {
    requestDelete(`physical server record for "${s.hosted_ip}"`, async () => {
      try { await physicalAssetsAPI.delete(s.id); toast.success('Deleted'); fetchAll(); }
      catch (err) { toast.error(err.response?.data?.error || 'Delete failed'); }
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const r = await physicalAssetsAPI.exportCSV();
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv' }));
      const a = document.createElement('a'); a.href = url;
      a.download = `physical-servers-${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url); toast.success('Exported');
    } catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  };

  const handleDownloadTemplate = async () => {
    try {
      const r = await physicalAssetsAPI.downloadTemplate();
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = 'physical_servers_template.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
  };

  const handleImport = async () => {
    if (!csvFile) { toast.error('Select a CSV file'); return; }
    setImporting(true);
    setImportResult(null);
    try {
      const r = await physicalAssetsAPI.importCSV(csvFile);
      setImportResult(r.data);
      toast.success(`Imported ${r.data.success} server${r.data.success !== 1 ? 's' : ''}${r.data.skipped > 0 ? `, ${r.data.skipped} skipped` : ''}${r.data.failed > 0 ? `, ${r.data.failed} failed` : ''}`);
      setCsvFile(null);
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Import failed'); }
    finally { setImporting(false); }
  };

  const filtered = servers.filter(s =>
    !search || [s.hosted_ip, s.serial_number, s.model_name, s.rack_number, s.vm_name, s.department]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-800 rounded-xl flex items-center justify-center">
            <Server size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Physical Servers</h1>
            <p className="text-sm text-gray-500 mt-0.5">{servers.length} registered · click a row to view full details</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Template */}
          <button onClick={handleDownloadTemplate} className="btn-secondary text-xs">
            <Download size={13} /> Template
          </button>
          {/* Import */}
          {canWrite && (
            <>
              <label className="btn-secondary text-xs cursor-pointer">
                <Upload size={13} />
                {csvFile ? csvFile.name.slice(0, 18) + '…' : 'Select CSV'}
                <input type="file" accept=".csv" className="hidden"
                  onChange={e => { setCsvFile(e.target.files[0]); setImportResult(null); }} />
              </label>
              {csvFile && (
                <button onClick={handleImport} disabled={importing}
                  className="btn-success text-xs">
                  {importing ? 'Importing…' : 'Import'}
                </button>
              )}
            </>
          )}
          {/* Export */}
          <button onClick={handleExport} disabled={exporting} className="btn-secondary text-xs">
            <Download size={13} /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button onClick={fetchAll} className="btn-secondary text-xs p-2"><RefreshCw size={14} /></button>
          {canWrite && (
            <button onClick={() => navigate('/physical-assets')} className="btn-primary text-xs">
              <Plus size={14} /> Register Server
            </button>
          )}
        </div>
      </div>

      {/* Import result */}
      {importResult && (
        <div className={`mb-4 p-4 rounded-xl border ${importResult.failed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            {importResult.failed > 0 ? <AlertTriangle size={15} className="text-amber-600" /> : <CheckCircle size={15} className="text-green-600" />}
            <p className="text-sm font-semibold">
              Import complete: {importResult.success} added/updated
              {importResult.skipped > 0 && `, ${importResult.skipped} skipped`}
              {importResult.failed > 0 && `, ${importResult.failed} failed`}
            </p>
          </div>
          {importResult.errors?.length > 0 && (
            <ul className="text-xs text-amber-700 space-y-0.5 ml-5">
              {importResult.errors.slice(0, 5).map((e, i) => <li key={i} className="list-disc">{e}</li>)}
              {importResult.errors.length > 5 && <li className="list-disc">{importResult.errors.length - 5} more errors…</li>}
            </ul>
          )}
        </div>
      )}

      {/* Manage Models panel */}
      <ManageModelsPanel canWrite={canWrite} />

      {/* CSV format info */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1">
        <p className="font-semibold">CSV Import / Export Format</p>
        <p>Required columns: <code className="bg-blue-100 px-1 rounded">hosted_ip</code></p>
        <p>Optional: <code className="bg-blue-100 px-1 rounded">model_name, serial_number, cores, ram_gb, total_disks, ome_support_status (Yes/No), rack_number, server_position, additional_notes</code></p>
        <p><strong>Upsert behavior:</strong> existing records with the same <code>hosted_ip</code> are updated; new IPs are inserted. Download the template for a ready-to-fill example.</p>
      </div>

      {/* Search */}
      <div className="card mb-4">
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input-field pl-8" placeholder="Search by IP, model, rack, serial…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Hosted IP','Model','Serial No.','CPU Cores','RAM (GB)','Disks','OME Support','Rack No.','Position','VM / Asset','Dept','Location','Actions']
                  .map(h => <th key={h} className="table-th">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? Array(4).fill(0).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array(13).fill(0).map((_, j) => <td key={j} className="table-td"><div className="h-4 bg-gray-100 rounded" /></td>)}
                </tr>
              )) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center py-16 text-gray-400">
                    <Server size={32} className="mx-auto mb-2 opacity-20" />
                    <p className="font-medium">{search ? 'No servers match your search' : 'No physical servers registered yet'}</p>
                    <p className="text-xs mt-1">{!search && 'Import a CSV or register servers individually via the Asset Inventory hosted IP link'}</p>
                  </td>
                </tr>
              ) : filtered.map(s => (
                <tr key={s.id} className="hover:bg-blue-50/20 cursor-pointer transition-colors"
                  onClick={() => navigate(`/physical-assets?ip=${encodeURIComponent(s.hosted_ip)}`)}>
                  <td className="table-td font-mono text-xs font-semibold text-blue-700">{s.hosted_ip}</td>
                  <td className="table-td text-xs">
                    {s.manufacturer ? `${s.manufacturer} ${s.model_name}` : s.model_name || '—'}
                  </td>
                  <td className="table-td font-mono text-xs">{s.serial_number || '—'}</td>
                  <td className="table-td">
                    {s.cores ? (
                      <span className="flex items-center gap-1 text-xs"><Cpu size={11} className="text-blue-500" />{s.cores}</span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="table-td">
                    {s.ram_gb ? (
                      <span className="flex items-center gap-1 text-xs"><Database size={11} className="text-violet-500" />{s.ram_gb} GB</span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="table-td">
                    {s.total_disks ? (
                      <span className="flex items-center gap-1 text-xs"><HardDrive size={11} className="text-teal-500" />{s.total_disks}</span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="table-td"><OMEBadge active={s.oem_support_status} /></td>
                  <td className="table-td font-mono text-xs">{s.rack_number || '—'}</td>
                  <td className="table-td font-mono text-xs">{s.server_position || '—'}</td>
                  <td className="table-td text-xs">{s.vm_name || '—'}</td>
                  <td className="table-td text-xs">{s.department || '—'}</td>
                  <td className="table-td text-xs">{s.location || '—'}</td>
                  <td className="table-td" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button onClick={() => navigate(`/physical-assets?ip=${encodeURIComponent(s.hosted_ip)}`)}
                        className="p-1.5 text-blue-600 hover:bg-blue-100 rounded" title="View/Edit">
                        <Eye size={12} />
                      </button>
                      {canWrite && (
                        <button onClick={() => handleDelete(s)}
                          className="p-1.5 text-red-500 hover:bg-red-100 rounded" title="Delete">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
