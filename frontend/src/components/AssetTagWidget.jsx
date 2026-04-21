/**
 * AssetTagWidget.jsx
 * ──────────────────
 * Rich Asset Tag assignment UI for Add Asset page.
 *
 * Props:
 *   departmentId  – currently selected dept id
 *   departments   – array of { id, name } from dropdowns
 *   value         – current asset_tag value
 *   onChange      – (tag: string) => void
 *   onValidation  – (error: string|null) => void  — null=valid, string=error message
 *   excludeAssetId– optional asset id to exclude from duplicate check (for edits)
 *   disabled      – bool
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { assetTagsAPI } from '../services/api';
import {
  Tag, CheckCircle, AlertTriangle, RefreshCw,
  Hash, List, Pencil, ChevronDown, Zap
} from 'lucide-react';

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div className={`rounded-xl px-4 py-3 border ${color}`}>
      <p className="text-xs text-current opacity-70 mb-0.5">{label}</p>
      <p className="text-2xl font-bold leading-none">{value}</p>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────
export default function AssetTagWidget({
  departmentId,
  departments = [],
  value = '',
  onChange,
  onValidation,
  excludeAssetId,
  disabled = false,
}) {
  const [stats, setStats]         = useState(null);          // department stats
  const [loading, setLoading]     = useState(false);
  const [mode, setMode]           = useState('pick');         // 'pick' | 'manual'
  const [validation, setValidation] = useState(null);        // null=unknown, false=ok, str=err
  const [validating, setValidating] = useState(false);
  const validateTimer = useRef(null);

  // Derive dept name from id
  const deptName = departments.find(d => String(d.id) === String(departmentId))?.name || '';

  // Fetch stats whenever department changes
  const fetchStats = useCallback(async () => {
    if (!deptName) { setStats(null); setValidation(null); onValidation?.(null); return; }
    setLoading(true);
    try {
      const r = await assetTagsAPI.getDepartmentStats({
        dept: deptName,
        exclude_asset_id: excludeAssetId || undefined,
      });
      if (r.data.found) {
        setStats(r.data);
      } else {
        setStats({ found: false });
      }
    } catch { setStats(null); }
    finally { setLoading(false); }
  }, [deptName, excludeAssetId]);

  useEffect(() => {
    fetchStats();
    // Reset tag when department changes
    if (value) { onChange?.(''); setValidation(null); onValidation?.(null); }
  }, [deptName]); // eslint-disable-line

  // Validate the current value
  const runValidation = useCallback(async (tag) => {
    if (!tag?.trim()) { setValidation(null); onValidation?.(null); return; }
    setValidating(true);
    try {
      const r = await assetTagsAPI.validate({
        tag: tag.trim(),
        dept: deptName || undefined,
        exclude_asset_id: excludeAssetId || undefined,
      });
      const err = r.data.valid ? null : r.data.error;
      setValidation(err ? err : false); // false = valid
      onValidation?.(err);
    } catch { setValidation(null); onValidation?.(null); }
    finally { setValidating(false); }
  }, [deptName, excludeAssetId, onValidation]);

  const handleTagChange = (tag) => {
    onChange?.(tag);
    setValidation(null);
    clearTimeout(validateTimer.current);
    if (tag) {
      validateTimer.current = setTimeout(() => runValidation(tag), 600);
    } else {
      onValidation?.(null);
    }
  };

  const handleUseTag = (tag) => {
    handleTagChange(tag);
  };

  const handleAutoAssign = () => {
    if (stats?.next_available) handleTagChange(stats.next_available);
  };

  // ── No department selected ────────────────────────────────────────────────
  if (!departmentId) {
    return (
      <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-4 flex items-center gap-3 text-gray-400">
        <Tag size={18} className="opacity-50" />
        <p className="text-sm">Select a department above to see available Asset Tags for that team.</p>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center gap-2 text-gray-400 text-sm animate-pulse">
          <RefreshCw size={15} className="animate-spin" />
          Loading tag availability for <strong className="text-gray-600">{deptName}</strong>…
        </div>
      </div>
    );
  }

  // ── Dept not in range table ────────────────────────────────────────────────
  if (stats && !stats.found) {
    return (
      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center gap-2 text-amber-700 text-sm">
          <AlertTriangle size={15} />
          <p>No Asset Tag range configured for <strong>{deptName}</strong>. Enter a tag manually.</p>
        </div>
        <input
          className={`input-field mt-3 font-mono ${validation ? 'border-red-400' : validation === false ? 'border-green-400' : ''}`}
          placeholder="Enter tag number"
          value={value}
          onChange={e => handleTagChange(e.target.value)}
          disabled={disabled}
        />
        <ValidationStatus validation={validation} validating={validating} />
      </div>
    );
  }

  // ── Full widget ────────────────────────────────────────────────────────────
  return (
    <div className="mt-2 rounded-xl border border-blue-200 bg-gradient-to-b from-blue-950/5 to-transparent overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <Tag size={16} className="text-blue-600" />
        <span className="font-semibold text-blue-700 text-sm">Asset Tag</span>
        <button onClick={fetchStats} disabled={loading}
          className="ml-auto p-1 text-gray-400 hover:text-blue-600 rounded transition-colors" title="Refresh">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-4 gap-2 px-4 pb-3">
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center">
            <p className="text-xs text-gray-500 mb-0.5">Range</p>
            <p className="text-sm font-bold text-gray-800 font-mono">{stats.range?.label}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center">
            <p className="text-xs text-gray-500 mb-0.5">Total Slots</p>
            <p className="text-lg font-bold text-gray-800">{stats.total_slots?.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-center">
            <p className="text-xs text-red-500 mb-0.5">Used</p>
            <p className="text-lg font-bold text-red-600">{stats.used_count ?? 0}</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-center">
            <p className="text-xs text-green-600 mb-0.5">Available</p>
            <p className="text-lg font-bold text-green-600">{stats.available_count ?? 0}</p>
          </div>
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex gap-2 px-4 pb-3">
        <button
          type="button"
          onClick={() => setMode('pick')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            mode === 'pick'
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
          }`}>
          <List size={12} /> Pick from list
        </button>
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            mode === 'manual'
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
          }`}>
          <Pencil size={12} /> Enter manually
        </button>
      </div>

      <div className="px-4 pb-4 space-y-4">
        {/* Pick mode */}
        {mode === 'pick' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Dropdown select */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Asset Tag</label>
              <div className="relative">
                <select
                  className={`input-field font-mono pr-8 ${
                    validation    ? 'border-red-400 bg-red-50'
                    : validation === false ? 'border-green-400 bg-green-50'
                    : 'border-gray-300'
                  }`}
                  value={value}
                  onChange={e => handleTagChange(e.target.value)}
                  disabled={disabled || !stats?.available?.length}>
                  <option value="">Select available tag…</option>
                  {value && !(stats?.available || []).includes(value) && (
                    <option value={value}>{value} (current)</option>
                  )}
                  {(stats?.available || []).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <ValidationStatus validation={validation} validating={validating} />
            </div>

            {/* Auto-assign */}
            {stats?.next_available && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  <Zap size={11} className="inline mr-1 text-blue-500" />
                  Auto-assign next available
                </label>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xl font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                    {stats.next_available}
                  </span>
                  <button
                    type="button"
                    onClick={handleAutoAssign}
                    disabled={disabled}
                    className="px-4 py-2 bg-gray-800 text-white rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors whitespace-nowrap disabled:opacity-50">
                    Use this tag
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Next available tag in <span className="font-medium">{deptName}</span>'s range
                </p>
              </div>
            )}
          </div>
        )}

        {/* Manual mode */}
        {mode === 'manual' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Enter Asset Tag {stats?.range && <span className="text-gray-400">(range: {stats.range.label})</span>}
            </label>
            <input
              type="text"
              className={`input-field font-mono text-base ${
                validation    ? 'border-red-400 bg-red-50'
                : validation === false ? 'border-green-400 bg-green-50'
                : 'border-gray-300'
              }`}
              placeholder={stats?.range ? `${String(stats.range.start).padStart(4,'0')}–${String(stats.range.end - 1).padStart(4,'0')}` : 'Enter tag number'}
              value={value}
              onChange={e => handleTagChange(e.target.value)}
              disabled={disabled}
              maxLength={8}
            />
            <ValidationStatus validation={validation} validating={validating} />
          </div>
        )}

        {/* Next 20 available chips */}
        {stats?.next_20?.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">
              Next {stats.next_20.length} available tags
            </p>
            <div className="flex flex-wrap gap-1.5">
              {stats.next_20.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => !disabled && handleTagChange(tag)}
                  disabled={disabled}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-medium transition-all ${
                    value === tag
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No tags available */}
        {stats?.available_count === 0 && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertTriangle size={15} />
            <p>All tags in <strong>{deptName}</strong>'s range ({stats.range?.label}) are used. Contact admin.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Validation status indicator ───────────────────────────────────────────────
function ValidationStatus({ validation, validating }) {
  if (validating) {
    return (
      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
        <span className="inline-block w-3 h-3 border border-t-transparent rounded-full animate-spin border-gray-400" />
        Checking availability…
      </p>
    );
  }
  if (validation === false) {
    return (
      <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
        <CheckCircle size={11} /> Tag is available
      </p>
    );
  }
  if (validation) {
    return (
      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
        <AlertTriangle size={11} /> {validation}
      </p>
    );
  }
  return null;
}
