import React, { useState, useRef } from 'react';
import { beijingAssetsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Upload, FileUp, RefreshCw, AlertTriangle, XCircle } from 'lucide-react';

function ImportResult({ result, onClose }) {
  if (!result) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-gray-800">Import Complete</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XCircle size={16} /></button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{result.added}</p>
          <p className="text-xs text-green-600 mt-0.5">Added</p>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{result.skipped}</p>
          <p className="text-xs text-amber-600 mt-0.5">Skipped (exist in Asset/Ext. List)</p>
        </div>
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{result.already_in_beijing}</p>
          <p className="text-xs text-blue-600 mt-0.5">Already in Beijing List</p>
        </div>
      </div>
      {result.skipped_details?.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-amber-600 font-medium">
            {result.skipped_details.length} skipped IP{result.skipped_details.length !== 1 ? 's' : ''} (click to expand)
          </summary>
          <div className="mt-2 max-h-40 overflow-y-auto space-y-1 pl-2">
            {result.skipped_details.map((s, i) => (
              <p key={i} className="text-gray-500">
                <span className="font-mono text-gray-700">{s.ip}</span> — {s.reason}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default function BeijingImportPage() {
  const { isAdmin } = useAuth();
  const fileRef = useRef();

  const [importFile,   setImportFile]   = useState(null);
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState(null);

  async function handleImport() {
    if (!importFile) return toast.error('Please select a file');
    setImporting(true);
    try {
      const res = await beijingAssetsAPI.importFile(importFile);
      setImportResult(res.data);
      toast.success(`Import done — ${res.data.added} asset(s) added`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
      setImportFile(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass-panel px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Beijing Asset Import</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload an Excel or CSV file to add assets to the Beijing Asset List
        </p>
      </div>

      <div className="max-w-xl space-y-4">
        <div className="glass-panel p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-800">Import from Excel / CSV</h2>
            <p className="text-sm text-gray-500 mt-1">
              Upload an Excel (.xlsx) or CSV file. Only IPs <strong>not found</strong> in the
              Asset List or Ext. Asset List will be added to the Beijing Asset List.
            </p>
          </div>

          <div
            className="rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors p-6 text-center cursor-pointer"
            onClick={() => fileRef.current?.click()}
          >
            <FileUp size={28} className="mx-auto text-gray-400 mb-2" />
            {importFile
              ? <p className="text-sm font-medium text-blue-600">{importFile.name}</p>
              : <>
                  <p className="text-sm text-gray-600">Click to select a file</p>
                  <p className="text-xs text-gray-400 mt-1">Supports .xlsx, .xls, .csv (max 10 MB)</p>
                </>}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => { setImportFile(e.target.files[0] || null); setImportResult(null); }}
            />
          </div>

          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 space-y-1">
            <p className="font-semibold">Expected columns (flexible naming):</p>
            <p>IP Address · VM Name · Hostname · Asset Type · OS Type · OS Version</p>
            <p>Assigned User · Department · Location · Server Status · Serial Number</p>
            <p>EOL Status · Asset Tag · Business Purpose · Additional Remarks</p>
          </div>

          <div className="flex gap-3">
            {importFile && (
              <button
                onClick={() => { setImportFile(null); setImportResult(null); if (fileRef.current) fileRef.current.value = ''; }}
                className="px-4 py-2 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
              >
                Clear
              </button>
            )}
            <button
              onClick={handleImport}
              disabled={!importFile || importing || !isAdmin}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {importing ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
              {importing ? 'Importing…' : 'Import File'}
            </button>
          </div>

          {!isAdmin && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle size={12} /> Admin access required to import
            </p>
          )}
        </div>

        <ImportResult result={importResult} onClose={() => setImportResult(null)} />
      </div>
    </div>
  );
}
