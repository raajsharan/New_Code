import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { assetsAPI, extendedInventoryAPI, beijingAssetsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Download, FileSpreadsheet, Upload, CheckCircle2, AlertCircle } from 'lucide-react';

const TARGETS = {
  assets: {
    label: 'Asset List',
    permKey: 'excel-smart-import-asset',
    templateName: 'asset_import_template.csv',
    downloadTemplate: () => assetsAPI.downloadTemplate(),
    importFile: (file) => assetsAPI.importCSV(file, { import_source: 'excel-smart-import' }),
    previewFile: (file, meta = {}) => assetsAPI.previewImportCSV(file, meta),
    importSelectedRows: (rows, options = {}) => assetsAPI.importSelectedCSVRows(rows, { only_verified: true, import_source: 'excel-smart-import', ...options }),
  },
  ext: {
    label: 'Ext. Asset List',
    permKey: 'excel-smart-import-ext',
    templateName: 'extended_inventory_template.csv',
    downloadTemplate: () => extendedInventoryAPI.downloadTemplate(),
    importFile: (file) => extendedInventoryAPI.importCSV(file, { import_source: 'excel-smart-import' }),
    previewFile: (file, meta = {}) => extendedInventoryAPI.previewImportCSV(file, meta),
    importSelectedRows: (rows, options = {}) => extendedInventoryAPI.importSelectedCSVRows(rows, { only_verified: true, import_source: 'excel-smart-import', ...options }),
  },
  beijing: {
    label: 'Beijing Asset List',
    permKey: 'excel-smart-import-beijing',
    templateName: 'beijing_assets_template.csv',
    downloadTemplate: () => beijingAssetsAPI.downloadTemplate(),
    importFile: (file) => beijingAssetsAPI.importFile(file),
    previewFile: (file) => beijingAssetsAPI.previewFile(file),
    importSelectedRows: (rows) => beijingAssetsAPI.importSelected(rows),
  },
};

export default function ExcelSmartImportPage() {
  const { canViewPage, isAdmin } = useAuth();
  const [target, setTarget] = useState('assets');

  const allowedTargets = Object.entries(TARGETS).filter(
    ([, t]) => isAdmin || canViewPage(t.permKey)
  );

  useEffect(() => {
    if (!allowedTargets.find(([k]) => k === target)) {
      setTarget(allowedTargets[0]?.[0] || 'assets');
    }
  }, [allowedTargets, target]);
  const [file, setFile] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [selectedRows, setSelectedRows] = useState({});
  const [selectedUpdates, setSelectedUpdates] = useState({});
  const [result, setResult] = useState(null);
  const [compareExisting, setCompareExisting] = useState(false);

  const current = TARGETS[target];

  const downloadTemplate = async () => {
    try {
      const r = await current.downloadTemplate();
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = current.templateName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Template download failed');
    }
  };

  const runImport = async () => {
    if (!file) { toast.error('Select an Excel/CSV file'); return; }
    setImporting(true);
    setResult(null);
    try {
      const r = await current.importFile(file);
      const d = r.data || {};
      setResult(d);
      toast.success(`Imported ${d.success || 0}${d.skipped ? `, ${d.skipped} skipped` : ''}${d.failed ? `, ${d.failed} failed` : ''}`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const runPreview = async () => {
    if (!file) { toast.error('Select an Excel/CSV file'); return; }
    setPreviewing(true);
    setResult(null);
    try {
      const previewMeta = compareExisting ? { compare_existing: 1 } : {};
      const r = await current.previewFile(file, previewMeta);
      const d = r.data || {};
      setPreview(d);
      const defaults = {};
      const updateDefaults = {};
      (d.rows || []).forEach((row) => {
        if (row.verified) defaults[row.row_number] = true;
        if (row.update_check?.update_required) updateDefaults[row.row_number] = false;
      });
      setSelectedRows(defaults);
      setSelectedUpdates(updateDefaults);
      toast.success(
        `Verification complete: ${d.verified_count || 0} verified, ${d.unverified_count || 0} needs review` +
        (compareExisting ? `, ${d.update_required_count || 0} update-needed` : '')
      );
    } catch (e) {
      toast.error(e.response?.data?.error || 'Verification failed');
    } finally {
      setPreviewing(false);
    }
  };

  const toggleRow = (row) => {
    if (!row?.verified) return;
    setSelectedRows((prev) => ({ ...prev, [row.row_number]: !prev[row.row_number] }));
  };

  const selectAllVerified = () => {
    if (!preview?.rows?.length) return;
    const next = {};
    preview.rows.forEach((row) => {
      if (row.verified) next[row.row_number] = true;
    });
    setSelectedRows(next);
  };

  const clearSelected = () => setSelectedRows({});
  const clearSelectedUpdates = () => setSelectedUpdates({});

  const toggleUpdateRow = (row) => {
    if (!row?.update_check?.update_required) return;
    setSelectedUpdates((prev) => {
      const nextVal = !prev[row.row_number];
      if (nextVal) {
        setSelectedRows((old) => ({ ...old, [row.row_number]: true }));
      }
      return { ...prev, [row.row_number]: nextVal };
    });
  };

  const selectAllUpdateNeeded = () => {
    if (!preview?.rows?.length) return;
    const next = {};
    const importNext = { ...selectedRows };
    preview.rows.forEach((row) => {
      if (row.update_check?.update_required) {
        next[row.row_number] = true;
        importNext[row.row_number] = true;
      }
    });
    setSelectedUpdates(next);
    setSelectedRows(importNext);
  };

  const importSelected = async () => {
    if (!preview?.rows?.length) { toast.error('Verify file first'); return; }
    const picked = preview.rows.filter((row) => {
      const selectedVerifiedImport = !!selectedRows[row.row_number] && row.verified;
      const selectedUpdate = compareExisting && !!selectedUpdates[row.row_number] && !!row.update_check?.update_required;
      return selectedVerifiedImport || selectedUpdate;
    });
    if (!picked.length) { toast.error('Select at least one verified row or update-needed row'); return; }
    const payloadRows = picked.map((row) => {
      const applyUpdate = !!selectedUpdates[row.row_number];
      return {
        ...row,
        update_fields: applyUpdate ? (row.update_check?.changed_fields || []) : [],
      };
    });
    const hasUnverifiedSelected = picked.some((row) => !row.verified);

    setImporting(true);
    setResult(null);
    try {
      const r = await current.importSelectedRows(payloadRows, { allow_updates: true, only_verified: !hasUnverifiedSelected, import_source: 'excel-smart-import' });
      const d = r.data || {};
      setResult(d);
      toast.success(`Imported ${d.success || 0}${d.skipped ? `, ${d.skipped} skipped` : ''}${d.failed ? `, ${d.failed} failed` : ''}`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Import selected failed');
    } finally {
      setImporting(false);
    }
  };

  const selectedCount = preview?.rows?.filter((row) => !!selectedRows[row.row_number] && row.verified).length || 0;
  const selectedUpdateCount = preview?.rows?.filter((row) => !!selectedUpdates[row.row_number]).length || 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <FileSpreadsheet size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Excel Smart Import</h1>
          <p className="text-sm text-gray-500">
            Upload Excel/CSV with random columns, auto-map against template fields, and import into Asset List, Ext. Asset List, or Beijing Asset List.
          </p>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Target List</label>
            <select className="input-field" value={target} onChange={(e) => setTarget(e.target.value)}>
              {allowedTargets.map(([key, t]) => (
                <option key={key} value={key}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Import File</label>
            <label className="input-field flex items-center justify-between cursor-pointer">
              <span className="text-sm text-gray-700 truncate">{file ? file.name : 'Select .xlsx / .xls / .csv'}</span>
              <Upload size={14} className="text-gray-500" />
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setPreview(null);
                  setSelectedRows({});
                  setSelectedUpdates({});
                  setResult(null);
                }}
              />
            </label>
          </div>
        </div>

        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
          Import compares incoming headers with template fields using flexible matching (spacing, casing, and common aliases). EOL Status also accepts
          `InSupport`, `EOL`, `Decom`, and `Not Applicable` (including `NA`/`N/A` variants).
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={compareExisting}
            onChange={(e) => setCompareExisting(e.target.checked)}
          />
          Verify if mapped fields differ from existing data (by IP)
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary text-sm" onClick={downloadTemplate}>
            <Download size={13} /> Download Template
          </button>
          <button className="btn-secondary text-sm" onClick={runPreview} disabled={previewing}>
            {previewing ? 'Verifying...' : 'Verify Data'}
          </button>
          <button className="btn-primary text-sm" onClick={importSelected} disabled={importing || !preview}>
            {importing ? 'Importing...' : `Import Selected (${selectedCount})`}
          </button>
          <button className="btn-primary text-sm" onClick={runImport} disabled={importing}>
            {importing ? 'Importing...' : `Import to ${current.label}`}
          </button>
        </div>
      </div>

      {preview && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-700">Verification Preview</h2>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={selectAllVerified}>Select All Verified</button>
              <button type="button" className="btn-secondary text-xs" onClick={clearSelected}>Clear Selection</button>
              {compareExisting && (
                <>
                  <button type="button" className="btn-secondary text-xs" onClick={selectAllUpdateNeeded}>Select All Update Needed</button>
                  <button type="button" className="btn-secondary text-xs" onClick={clearSelectedUpdates}>Clear Updates</button>
                </>
              )}
            </div>
          </div>

          <div className={`${compareExisting ? 'grid grid-cols-4' : 'grid grid-cols-3'} gap-2`}>
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <p className="text-xs text-green-700">Verified</p>
              <p className="text-lg font-semibold text-green-800">{preview.verified_count || 0}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs text-amber-700">Needs Fix</p>
              <p className="text-lg font-semibold text-amber-800">{preview.unverified_count || 0}</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
              <p className="text-xs text-blue-700">Selected to Import</p>
              <p className="text-lg font-semibold text-blue-800">{selectedCount}</p>
            </div>
            {compareExisting && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                <p className="text-xs text-indigo-700">Selected to Update</p>
                <p className="text-lg font-semibold text-indigo-800">{selectedUpdateCount}</p>
              </div>
            )}
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Row</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">VM Name</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Hostname</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">IP Address</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Errors</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Update Check</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Verified</th>
                </tr>
              </thead>
              <tbody>
                {(preview.rows || []).slice(0, 300).map((row) => (
                  <tr key={row.row_number} className="border-b border-gray-100">
                    <td className="px-3 py-2 text-gray-600">{row.row_number}</td>
                    <td className="px-3 py-2">{row.data?.vm_name || '-'}</td>
                    <td className="px-3 py-2">{row.data?.os_hostname || '-'}</td>
                    <td className="px-3 py-2 font-mono">{row.data?.ip_address || '-'}</td>
                    <td className="px-3 py-2">
                      {(row.errors || []).length
                        ? <span className="text-red-600">{row.errors.join('; ')}</span>
                        : <span className="text-green-700">No issues</span>}
                    </td>
                    <td className="px-3 py-2">
                      {compareExisting ? (
                        row.update_check?.exists ? (
                          row.update_check?.update_required ? (
                            <div className="space-y-1">
                              <span className="text-amber-700" title={(row.update_check?.changed_fields || []).join(', ')}>
                                Update needed ({(row.update_check?.changed_fields || []).length})
                              </span>
                              <label className="inline-flex items-center gap-1.5 text-[11px] text-indigo-700">
                                <input
                                  type="checkbox"
                                  checked={!!selectedUpdates[row.row_number]}
                                  onChange={() => toggleUpdateRow(row)}
                                />
                                Apply changed fields
                              </label>
                              {(row.update_check?.changed_fields || []).length > 0 && (
                                <p className="text-[11px] text-gray-500 break-words">
                                  {(row.update_check?.changed_fields || []).join(', ')}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-green-700">No update needed</span>
                          )
                        ) : (
                          <span className="text-gray-500">New record</span>
                        )
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!selectedRows[row.row_number]}
                          disabled={!row.verified}
                          onChange={() => toggleRow(row)}
                        />
                        <span className={`px-2 py-0.5 rounded text-[11px] ${row.verified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {row.verified ? 'Verified' : 'Not Verified'}
                        </span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(preview.rows || []).length > 300 && (
            <p className="text-xs text-gray-500">Showing first 300 rows in preview table. All rows are still considered for import selection and execution.</p>
          )}
        </div>
      )}

      {result && (
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Import Result</h2>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <p className="text-xs text-green-700">Success</p>
              <p className="text-lg font-semibold text-green-800">{result.success || 0}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs text-amber-700">Skipped</p>
              <p className="text-lg font-semibold text-amber-800">{result.skipped || 0}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs text-red-700">Failed</p>
              <p className="text-lg font-semibold text-red-800">{result.failed || 0}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Mapped Fields</p>
              {(result.mapped_fields || []).length ? (
                <div className="flex flex-wrap gap-1.5">
                  {result.mapped_fields.map((f) => (
                    <span key={f} className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">{f}</span>
                  ))}
                </div>
              ) : <p className="text-xs text-gray-400">None</p>}
            </div>
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Unmapped Source Columns</p>
              {(result.unmapped_columns || []).length ? (
                <div className="flex flex-wrap gap-1.5">
                  {result.unmapped_columns.map((f) => (
                    <span key={f} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{f}</span>
                  ))}
                </div>
              ) : <p className="text-xs text-gray-400">None</p>}
            </div>
          </div>

          {(result.errors || []).length > 0 && (
            <div className="border border-red-200 rounded-lg p-3 bg-red-50">
              <p className="text-xs font-semibold text-red-700 uppercase mb-2 flex items-center gap-1">
                <AlertCircle size={12} /> Row Errors
              </p>
              <ul className="space-y-1">
                {result.errors.slice(0, 25).map((err, idx) => (
                  <li key={idx} className="text-xs text-red-700 flex items-start gap-1.5">
                    <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-red-500" />
                    <span>{err}</span>
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

