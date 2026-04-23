import React, { useState, useRef } from 'react';
import { beijingAssetsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  Upload, FileUp, RefreshCw, AlertTriangle, XCircle,
  Download, CheckCircle2, AlertCircle, FileSpreadsheet,
} from 'lucide-react';

function StatTile({ label, value, cls }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <p className="text-xs opacity-75">{label}</p>
      <p className="text-lg font-semibold">{value ?? 0}</p>
    </div>
  );
}

export default function BeijingImportPage() {
  const { isAdmin } = useAuth();
  const fileRef = useRef();

  const [file,          setFile]          = useState(null);
  const [previewing,    setPreviewing]    = useState(false);
  const [importing,     setImporting]     = useState(false);
  const [preview,       setPreview]       = useState(null);
  const [selectedRows,  setSelectedRows]  = useState({});
  const [result,        setResult]        = useState(null);

  function resetAll() {
    setFile(null);
    setPreview(null);
    setSelectedRows({});
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  // ── Download template ────────────────────────────────────────────────────────
  async function downloadTemplate() {
    try {
      const r = await beijingAssetsAPI.downloadTemplate();
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'beijing_assets_template.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Template download failed');
    }
  }

  // ── Verify / Preview ─────────────────────────────────────────────────────────
  async function runPreview() {
    if (!file) { toast.error('Select a file first'); return; }
    setPreviewing(true);
    setResult(null);
    try {
      const r = await beijingAssetsAPI.previewFile(file);
      const d = r.data || {};
      setPreview(d);
      const defaults = {};
      (d.rows || []).forEach(row => { if (row.verified) defaults[row.row_number] = true; });
      setSelectedRows(defaults);
      toast.success(`Verified: ${d.verified_count || 0} OK, ${d.unverified_count || 0} needs review`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Verification failed');
    } finally {
      setPreviewing(false);
    }
  }

  // ── Row selection helpers ─────────────────────────────────────────────────────
  const toggleRow = (row) => {
    if (!row?.verified) return;
    setSelectedRows(prev => ({ ...prev, [row.row_number]: !prev[row.row_number] }));
  };
  const selectAllVerified = () => {
    const next = {};
    (preview?.rows || []).forEach(row => { if (row.verified) next[row.row_number] = true; });
    setSelectedRows(next);
  };
  const clearSelected = () => setSelectedRows({});

  const selectedCount = (preview?.rows || []).filter(r => !!selectedRows[r.row_number] && r.verified).length;

  // ── Import selected ───────────────────────────────────────────────────────────
  async function importSelected() {
    if (!preview?.rows?.length) { toast.error('Verify file first'); return; }
    const picked = preview.rows.filter(r => !!selectedRows[r.row_number] && r.verified);
    if (!picked.length) { toast.error('Select at least one verified row'); return; }
    setImporting(true);
    setResult(null);
    try {
      const r = await beijingAssetsAPI.importSelected(picked);
      const d = r.data || {};
      setResult({ ...d, mapped_fields: preview.mapped_fields, unmapped_columns: preview.unmapped_columns });
      toast.success(`Import done — ${d.added} asset(s) added`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  // ── Direct import (no preview) ────────────────────────────────────────────────
  async function handleDirectImport() {
    if (!file) { toast.error('Select a file first'); return; }
    setImporting(true);
    setResult(null);
    try {
      const r = await beijingAssetsAPI.importFile(file);
      const d = r.data || {};
      setResult({
        added: d.added,
        skipped: d.skipped,
        skipped_details: d.skipped_details,
        already_in_beijing: d.already_in_beijing,
      });
      toast.success(`Import done — ${d.added} asset(s) added`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
      resetAll();
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center">
          <FileSpreadsheet size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Beijing Asset Import</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Upload Excel / CSV, verify rows, then import to Beijing Asset List.
          </p>
        </div>
      </div>

      {/* Upload + Actions */}
      <div className="card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">Import File</label>
            <label className="input-field flex items-center justify-between cursor-pointer">
              <span className="text-sm text-gray-700 dark:text-slate-300 truncate">
                {file ? file.name : 'Select .xlsx / .xls / .csv'}
              </span>
              <Upload size={14} className="text-gray-500 dark:text-slate-400 shrink-0" />
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => {
                  setFile(e.target.files?.[0] || null);
                  setPreview(null);
                  setSelectedRows({});
                  setResult(null);
                }}
              />
            </label>
          </div>
        </div>

        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-800 dark:text-blue-300">
          Flexible column matching — headers are matched by name, spacing, and common aliases. IPs already in Asset List or Ext. Asset List are skipped automatically.
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary text-sm" onClick={downloadTemplate}>
            <Download size={13} /> Download Template
          </button>
          <button className="btn-secondary text-sm" onClick={runPreview} disabled={previewing || !file}>
            {previewing ? <><RefreshCw size={13} className="animate-spin" /> Verifying…</> : 'Verify Data'}
          </button>
          <button
            className="btn-primary text-sm"
            onClick={importSelected}
            disabled={importing || !preview || selectedCount === 0}
          >
            {importing ? <><RefreshCw size={13} className="animate-spin" /> Importing…</> : `Import Selected (${selectedCount})`}
          </button>
          <button
            className="btn-primary text-sm"
            onClick={handleDirectImport}
            disabled={importing || !file}
          >
            {importing ? <><RefreshCw size={13} className="animate-spin" /> Importing…</> : 'Import All'}
          </button>
        </div>

        {!isAdmin && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle size={12} /> Admin access required to import
          </p>
        )}
      </div>

      {/* Preview Table */}
      {preview && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200">Verification Preview</h2>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={selectAllVerified}>
                Select All Verified
              </button>
              <button type="button" className="btn-secondary text-xs" onClick={clearSelected}>
                Clear Selection
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Verified"         value={preview.verified_count}   cls="border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 text-green-800 dark:text-green-300" />
            <StatTile label="Needs Fix"        value={preview.unverified_count} cls="border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 text-amber-800 dark:text-amber-300" />
            <StatTile label="Selected to Import" value={selectedCount}          cls="border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 text-blue-800 dark:text-blue-300" />
          </div>

          {(preview.mapped_fields || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-gray-500 dark:text-slate-400 self-center">Mapped:</span>
              {preview.mapped_fields.map(f => (
                <span key={f} className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">{f}</span>
              ))}
              {(preview.unmapped_columns || []).map(f => (
                <span key={f} className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400">{f}</span>
              ))}
            </div>
          )}

          <div className="overflow-x-auto border border-gray-200 dark:border-slate-700 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-slate-300">Row</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-slate-300">VM Name</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-slate-300">Hostname</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-slate-300">IP Address</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-slate-300">Department</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-slate-300">Status / Errors</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-slate-300">Select</th>
                </tr>
              </thead>
              <tbody>
                {(preview.rows || []).slice(0, 300).map(row => (
                  <tr key={row.row_number} className="border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-800/40">
                    <td className="px-3 py-2 text-gray-500 dark:text-slate-400">{row.row_number}</td>
                    <td className="px-3 py-2 dark:text-slate-300">{row.data?.vm_name || '—'}</td>
                    <td className="px-3 py-2 dark:text-slate-300">{row.data?.os_hostname || '—'}</td>
                    <td className="px-3 py-2 font-mono dark:text-slate-300">{row.data?.ip_address || '—'}</td>
                    <td className="px-3 py-2 dark:text-slate-400">{row.data?.department || '—'}</td>
                    <td className="px-3 py-2">
                      {row.errors?.length
                        ? <span className="text-red-600 dark:text-red-400">{row.errors.join('; ')}</span>
                        : <span className="text-green-700 dark:text-green-400">No issues</span>}
                    </td>
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!selectedRows[row.row_number]}
                          disabled={!row.verified}
                          onChange={() => toggleRow(row)}
                        />
                        <span className={`px-2 py-0.5 rounded text-[11px] ${
                          row.verified
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}>
                          {row.verified ? 'Verified' : 'Skipped'}
                        </span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(preview.rows || []).length > 300 && (
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Showing first 300 rows. All rows are still counted for import selection.
            </p>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200">Import Result</h2>
            <button onClick={() => setResult(null)} className="text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300">
              <XCircle size={15} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Added"   value={result.added}   cls="border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 text-green-800 dark:text-green-300" />
            <StatTile label="Skipped" value={result.skipped} cls="border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 text-amber-800 dark:text-amber-300" />
            <StatTile label="Already in Beijing" value={result.already_in_beijing ?? 0} cls="border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 text-blue-800 dark:text-blue-300" />
          </div>

          {((result.mapped_fields || []).length > 0 || (result.unmapped_columns || []).length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase mb-2">Mapped Fields</p>
                {(result.mapped_fields || []).length
                  ? <div className="flex flex-wrap gap-1.5">
                      {result.mapped_fields.map(f => (
                        <span key={f} className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">{f}</span>
                      ))}
                    </div>
                  : <p className="text-xs text-gray-400 dark:text-slate-500">None</p>}
              </div>
              <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase mb-2">Unmapped Columns</p>
                {(result.unmapped_columns || []).length
                  ? <div className="flex flex-wrap gap-1.5">
                      {result.unmapped_columns.map(f => (
                        <span key={f} className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300">{f}</span>
                      ))}
                    </div>
                  : <p className="text-xs text-gray-400 dark:text-slate-500">None</p>}
              </div>
            </div>
          )}

          {(result.skipped_details || []).length > 0 && (
            <div className="border border-amber-200 dark:border-amber-800 rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase mb-2 flex items-center gap-1">
                <AlertCircle size={12} /> Skipped Details
              </p>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {result.skipped_details.slice(0, 30).map((s, i) => (
                  <li key={i} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                    <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-amber-500" />
                    <span><span className="font-mono">{s.ip || `Row ${s.row}`}</span> — {s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
