import React, { useState, useEffect, useRef } from 'react';
import { FileSpreadsheet, CheckCircle, Trash2, DownloadCloud } from 'lucide-react';
import toast from 'react-hot-toast';
import { tenableAPI } from '../services/api';
import { useDeleteConfirm } from '../context/DeleteConfirmContext';

export default function TenableImportPage() {
  const [imports, setImports]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [dragging, setDragging]   = useState(false);
  const fileRef = useRef(null);
  const { requestDelete } = useDeleteConfirm();

  useEffect(() => { fetchImports(); }, []);

  const fetchImports = async () => {
    setLoading(true);
    try { const r = await tenableAPI.getImports(); setImports(r.data); }
    catch { toast.error('Failed to load import history'); }
    finally { setLoading(false); }
  };

  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) { toast.error('Please upload an Excel file (.xlsx or .xls)'); return; }
    setUploading(true);
    setLastResult(null);
    try {
      const r = await tenableAPI.import(file);
      setLastResult(r.data);
      toast.success(`Import complete — ${r.data.new_ips} new IPs, ${r.data.updated_ips} updated`);
      fetchImports();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Import failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleDelete = (imp) => {
    requestDelete(`import record from ${new Date(imp.imported_at).toLocaleDateString()} (${imp.filename})`, async () => {
      try { await tenableAPI.deleteImport(imp.id); toast.success('Import record deleted'); fetchImports(); }
      catch { toast.error('Delete failed'); }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Tenable Import</h1>
        <p className="text-sm text-gray-500 mt-1">Upload the weekly Tenable asset export to update the IP comparison list. New IPs are added; existing IPs are updated.</p>
      </div>

      {/* Expected columns */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-blue-800 mb-2">Expected Excel Columns</p>
        <div className="flex flex-wrap gap-2">
          {[
            'host_name / DNS Name',
            'name',
            'display_mac_address / MAC Address',
            'ipv4_addresses / IP Addresses',
            'last_observed / Last Observed',
            'operating_systems / Operating System',
          ].map(c => (
            <span key={c} className="text-xs bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded font-mono">{c}</span>
          ))}
        </div>
        <p className="text-xs text-blue-600 mt-2">Only IPs in the <strong>192.168.x.x</strong> or <strong>10.x.x.x</strong> range will be stored and compared.</p>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer
          ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-sm font-medium text-blue-600">Processing Excel file…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <FileSpreadsheet size={44} className="text-gray-400" />
            <div>
              <p className="font-semibold text-gray-700">Drop Tenable Excel here, or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">Supports .xlsx, .xls · Max 50 MB</p>
            </div>
            <button type="button" className="btn-primary text-xs mt-1 pointer-events-none">
              <DownloadCloud size={13} /> Choose File
            </button>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={e => handleFile(e.target.files[0])} />
      </div>

      {/* Result banner */}
      {lastResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-green-800">Import Successful</p>
            <p className="text-green-700 mt-0.5">
              Total IPs stored: <strong>{lastResult.total_ips.toLocaleString()}</strong>
              &nbsp;·&nbsp;New: <strong className="text-green-700">+{lastResult.new_ips}</strong>
              &nbsp;·&nbsp;Updated: <strong className="text-blue-700">~{lastResult.updated_ips}</strong>
            </p>
          </div>
        </div>
      )}

      {/* Import history */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Import History</h2>
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
        ) : imports.length === 0 ? (
          <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
            <p className="font-medium">No imports yet</p>
            <p className="text-xs mt-1">Upload a Tenable Excel file above to get started</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-th">Filename</th>
                  <th className="table-th">Imported By</th>
                  <th className="table-th">Date &amp; Time</th>
                  <th className="table-th">Total IPs</th>
                  <th className="table-th">New</th>
                  <th className="table-th">Updated</th>
                  <th className="table-th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {imports.map(imp => (
                  <tr key={imp.id} className="hover:bg-gray-50">
                    <td className="table-td font-medium text-gray-800 max-w-[200px] truncate" title={imp.filename}>{imp.filename}</td>
                    <td className="table-td text-gray-600">{imp.imported_by_name || '—'}</td>
                    <td className="table-td text-xs text-gray-500">{new Date(imp.imported_at).toLocaleString()}</td>
                    <td className="table-td"><span className="font-semibold text-gray-800">{(imp.total_ips || 0).toLocaleString()}</span></td>
                    <td className="table-td"><span className="text-green-600 font-medium">+{imp.new_ips || 0}</span></td>
                    <td className="table-td"><span className="text-blue-600 font-medium">~{imp.updated_ips || 0}</span></td>
                    <td className="table-td">
                      <button onClick={() => handleDelete(imp)} className="p-1.5 text-red-500 hover:bg-red-100 rounded transition-colors" title="Delete record">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
