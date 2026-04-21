import React, { useState, useEffect, useCallback, useRef } from 'react';
import { deptRangesAPI, dropdownsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDeleteConfirm } from '../context/DeleteConfirmContext';
import toast from 'react-hot-toast';
import {
  Tag, Plus, Edit2, Trash2, Save, X, RefreshCw,
  AlertTriangle, CheckCircle, Info, ChevronDown, ChevronUp,
  Eye, Search, Layers, Shield
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Tag grid component — show all tags colored by status
// ─────────────────────────────────────────────────────────────
function TagGrid({ usageData, loading }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'used' | 'available'
  const [search, setSearch] = useState('');
  const PAGE = 200;
  const [page, setPage] = useState(1);

  if (!usageData) return null;

  const { tags, range, department_name, used_count, available_count, total } = usageData;
  const filtered = tags.filter(t => {
    if (filter === 'used' && t.status !== 'used') return false;
    if (filter === 'available' && t.status !== 'available') return false;
    if (search && !t.tag.includes(search) && !t.vm_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const paginated = filtered.slice(0, page * PAGE);
  const hasMore   = paginated.length < filtered.length;

  return (
    <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm text-gray-700">{department_name} — Tag Usage</span>
          <span className="text-xs text-gray-400">Range: {String(range.start).padStart(4,'0')}–{String(range.end-1).padStart(4,'0')} · {total} total</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{available_count} available</span>
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{used_count} used</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-100">
        <div className="flex gap-1">
          {[['all','All'],['available','Available'],['used','Used']].map(([v,l])=>(
            <button key={v} onClick={()=>{setFilter(v);setPage(1);}}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${filter===v?'bg-blue-600 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{l}</button>
          ))}
        </div>
        <div className="relative flex-1 max-w-[200px]">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input className="input-field pl-6 py-1 text-xs" placeholder="Search tag or asset…"
            value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-center text-gray-400 text-sm animate-pulse">Loading tags…</div>
      ) : (
        <div className="p-4 max-h-[360px] overflow-y-auto">
          <div className="flex flex-wrap gap-1.5">
            {paginated.map(t => (
              <div key={t.tag}
                title={t.status==='used'?`Used by: ${t.vm_name||t.os_hostname||'Asset #'+t.asset_id}`:'Available'}
                className={`px-2 py-1 rounded text-xs font-mono font-medium cursor-default transition-colors ${
                  t.status==='used'
                    ? 'bg-red-100 text-red-700 border border-red-200'
                    : 'bg-green-50 text-green-700 border border-green-200'
                }`}>
                {t.tag}
                {t.status==='used'&&<span className="ml-1 opacity-60 text-[9px]">✓</span>}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-gray-400 italic">No tags match filter</p>
            )}
          </div>
          {hasMore && (
            <button onClick={()=>setPage(p=>p+1)}
              className="mt-3 text-xs text-blue-600 hover:underline">
              Show more ({filtered.length - paginated.length} remaining)
            </button>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 border border-green-200 inline-block"/>Available</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-200 inline-block"/>Used (hover for asset name)</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Range form — create or edit
// ─────────────────────────────────────────────────────────────
function RangeForm({ editData, allDepts, onSaved, onCancel }) {
  const [form, setForm] = useState({
    department_name: editData?.department_name || '',
    range_start:     editData?.range_start     || '',
    range_end:       editData?.range_end       || '',
  });
  const [validation, setValidation] = useState(null); // { valid, errors, warnings }
  const [saving, setSaving]         = useState(false);
  const [forceMode, setForceMode]   = useState(false);
  const [conflicts, setConflicts]   = useState([]);
  const validateTimer = useRef(null);

  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const runValidation = useCallback(async (f) => {
    if (!f.range_start || !f.range_end) { setValidation(null); return; }
    try {
      const r = await deptRangesAPI.validate({
        department_name: f.department_name,
        range_start: parseInt(f.range_start),
        range_end:   parseInt(f.range_end),
        exclude_id:  editData?.id,
      });
      setValidation(r.data);
    } catch { setValidation(null); }
  }, [editData?.id]);

  useEffect(() => {
    clearTimeout(validateTimer.current);
    validateTimer.current = setTimeout(() => runValidation(form), 700);
  }, [form.department_name, form.range_start, form.range_end, runValidation]);

  const handleSave = async () => {
    if (!form.department_name || !form.range_start || !form.range_end) {
      toast.error('All fields required'); return;
    }
    setSaving(true);
    setConflicts([]);
    try {
      const payload = {
        department_name: form.department_name,
        range_start:     parseInt(form.range_start),
        range_end:       parseInt(form.range_end),
        force:           forceMode,
      };
      if (editData?.id) {
        await deptRangesAPI.update(editData.id, payload);
        toast.success('Range updated');
      } else {
        await deptRangesAPI.save(payload);
        toast.success('Range saved');
      }
      onSaved();
    } catch (err) {
      const d = err.response?.data;
      if (d?.conflict_count) {
        setConflicts(d.conflicts || []);
        toast.error(d.error, { duration: 6000 });
      } else {
        toast.error(d?.error || 'Save failed');
      }
    } finally { setSaving(false); }
  };

  const startNum  = parseInt(form.range_start);
  const endNum    = parseInt(form.range_end);
  const slotCount = (!isNaN(startNum) && !isNaN(endNum) && endNum > startNum) ? endNum - startNum : null;

  return (
    <div className="border-2 border-blue-200 rounded-xl p-5 bg-blue-50/30">
      <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <Tag size={15} className="text-blue-700"/>
        {editData ? `Edit Range — ${editData.department_name}` : 'Add New Department Range'}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {/* Department selector */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Department <span className="text-red-500">*</span></label>
          {editData ? (
            <input className="input-field bg-gray-50" value={form.department_name} disabled/>
          ) : (
            <select className="input-field" value={form.department_name} onChange={e=>set('department_name',e.target.value)}>
              <option value="">Select or type department…</option>
              {allDepts.filter(d=>!d.range).map(d=>(
                <option key={d.id} value={d.name}>{d.name} {d.asset_count>0?`(${d.asset_count} assets)`:''}</option>
              ))}
              {allDepts.filter(d=>d.range).length > 0 && (
                <optgroup label="Has existing range (will update)">
                  {allDepts.filter(d=>d.range).map(d=>(
                    <option key={d.id} value={d.name}>{d.name} ({d.range.range_start}–{d.range.range_end-1})</option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Range Start <span className="text-red-500">*</span></label>
          <input type="number" min={0} className="input-field font-mono" placeholder="e.g. 1000"
            value={form.range_start} onChange={e=>set('range_start',e.target.value)}/>
          <p className="text-xs text-gray-400 mt-1">Tag: {form.range_start ? String(parseInt(form.range_start)).padStart(4,'0') : '—'}</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Range End <span className="text-red-500">*</span> <span className="text-gray-400 font-normal">(exclusive)</span></label>
          <input type="number" min={0} className="input-field font-mono" placeholder="e.g. 2000"
            value={form.range_end} onChange={e=>set('range_end',e.target.value)}/>
          <p className="text-xs text-gray-400 mt-1">Last tag: {(form.range_end && !isNaN(parseInt(form.range_end))) ? String(parseInt(form.range_end)-1).padStart(4,'0') : '—'}</p>
        </div>
      </div>

      {/* Slot count preview */}
      {slotCount !== null && (
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-200 text-xs">
            <span className="text-gray-500">Slots:</span>
            <span className="font-bold text-gray-800">{slotCount.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-200 text-xs">
            <span className="text-gray-500">Tags:</span>
            <span className="font-mono font-bold text-blue-700">
              {String(startNum).padStart(4,'0')} → {String(endNum-1).padStart(4,'0')}
            </span>
          </div>
        </div>
      )}

      {/* Live validation */}
      {validation && (
        <div className="mb-4 space-y-2">
          {validation.errors.map((e,i)=>(
            <div key={i} className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertTriangle size={13} className="flex-shrink-0"/>{e}
            </div>
          ))}
          {validation.warnings.map((w,i)=>(
            <div key={i} className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <AlertTriangle size={13} className="flex-shrink-0"/><strong>Overlap warning:</strong> {w}
            </div>
          ))}
          {validation.valid && validation.warnings.length===0 && (
            <div className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
              <CheckCircle size={13}/> Range is valid with no conflicts
            </div>
          )}
        </div>
      )}

      {/* Asset conflicts requiring force */}
      {conflicts.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-xs font-semibold text-red-700 mb-2">Assets outside new range:</p>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {conflicts.map((c,i)=>(
              <div key={i} className="flex items-center gap-2 text-xs text-red-600">
                <span className="font-mono bg-red-100 px-1.5 py-0.5 rounded">{c.asset_tag}</span>
                <span>{c.vm_name||'—'}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input type="checkbox" id="force_override" checked={forceMode} onChange={e=>setForceMode(e.target.checked)} className="accent-red-600"/>
            <label htmlFor="force_override" className="text-xs text-red-700 font-medium cursor-pointer">
              Force save anyway (those assets will have out-of-range tags)
            </label>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving || (validation && !validation.valid && !forceMode)}
          className="btn-primary">
          <Save size={14}/> {saving ? 'Saving…' : editData ? 'Update Range' : 'Save Range'}
        </button>
        <button onClick={onCancel} className="btn-secondary"><X size={14}/> Cancel</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Range card — one per department
// ─────────────────────────────────────────────────────────────
function RangeCard({ range, onEdit, onDelete, onViewTags, isViewing, tagUsage, tagLoading }) {
  const usedPct = range.total_slots > 0 ? Math.round((range.used_count / range.total_slots) * 100) : 0;

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${range.has_overlap ? 'border-amber-300' : 'border-gray-200'}`}>
      {/* Overlap banner */}
      {range.has_overlap && (
        <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
          <AlertTriangle size={12} className="text-amber-600"/>
          <p className="text-xs text-amber-700 font-medium">Range overlaps with another department</p>
        </div>
      )}

      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-800">{range.department_name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {range.asset_count} asset{range.asset_count!==1?'s':''} in this department
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={()=>onViewTags(range.department_name)} title="View all tags"
              className={`p-1.5 rounded-lg transition-colors ${isViewing?'bg-blue-600 text-white':'text-blue-600 hover:bg-blue-50'}`}>
              <Eye size={13}/>
            </button>
            <button onClick={()=>onEdit(range)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"><Edit2 size={13}/></button>
            <button onClick={()=>onDelete(range)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={13}/></button>
          </div>
        </div>

        {/* Range display */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="text-center p-2 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-400 mb-0.5">Range</p>
            <p className="text-xs font-mono font-bold text-gray-700">
              {String(range.range_start).padStart(4,'0')}–{String(range.range_end-1).padStart(4,'0')}
            </p>
          </div>
          <div className="text-center p-2 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-400 mb-0.5">Slots</p>
            <p className="text-sm font-bold text-gray-800">{range.total_slots.toLocaleString()}</p>
          </div>
          <div className="text-center p-2 bg-red-50 rounded-lg">
            <p className="text-xs text-red-400 mb-0.5">Used</p>
            <p className="text-sm font-bold text-red-600">{range.used_count}</p>
          </div>
          <div className="text-center p-2 bg-green-50 rounded-lg">
            <p className="text-xs text-green-500 mb-0.5">Available</p>
            <p className="text-sm font-bold text-green-600">{range.available_count}</p>
          </div>
        </div>

        {/* Usage bar */}
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Usage</span>
            <span>{usedPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${usedPct>80?'bg-red-400':usedPct>50?'bg-amber-400':'bg-green-400'}`}
              style={{width:`${usedPct}%`}}/>
          </div>
        </div>
      </div>

      {/* Tag grid when expanded */}
      {isViewing && (
        <div className="border-t border-gray-200 px-4 pb-4">
          <TagGrid usageData={tagUsage} loading={tagLoading}/>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function DeptRangeManagementPage() {
  const { isAdmin } = useAuth();
  const { requestDelete } = useDeleteConfirm();
  const [ranges, setRanges]       = useState([]);
  const [allDepts, setAllDepts]   = useState([]);
  const [overlaps, setOverlaps]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editData, setEditData]   = useState(null);
  const [viewingDept, setViewingDept] = useState(null);
  const [tagUsage, setTagUsage]   = useState(null);
  const [tagLoading, setTagLoading] = useState(false);
  const [sortBy, setSortBy]       = useState('name'); // 'name' | 'start' | 'used'
  const [filterText, setFilterText] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [rangesR, deptsR] = await Promise.all([
        deptRangesAPI.getAll(),
        deptRangesAPI.getDepartments(),
      ]);
      setRanges(rangesR.data.ranges);
      setOverlaps(rangesR.data.overlaps);
      setAllDepts(deptsR.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleViewTags = useCallback(async (deptName) => {
    if (viewingDept === deptName) { setViewingDept(null); setTagUsage(null); return; }
    setViewingDept(deptName);
    setTagUsage(null);
    setTagLoading(true);
    try {
      const r = await deptRangesAPI.getTagUsage(deptName);
      setTagUsage(r.data);
    } catch { toast.error('Failed to load tag usage'); }
    finally { setTagLoading(false); }
  }, [viewingDept]);

  const handleEdit = (range) => {
    setEditData(range);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (range) => {
    const label = range.used_count > 0
      ? `range for "${range.department_name}" (${range.used_count} asset(s) assigned — their tags won't be validated after deletion)`
      : `range for "${range.department_name}"`;
    requestDelete(label, async () => {
      try {
        await deptRangesAPI.delete(range.id, range.used_count > 0);
        toast.success(`Range for "${range.department_name}" deleted`);
        fetchAll();
      } catch (err) { toast.error(err.response?.data?.error || 'Delete failed'); }
    });
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditData(null);
    fetchAll();
  };

  // Sort + filter
  const displayed = ranges
    .filter(r => !filterText || r.department_name.toLowerCase().includes(filterText.toLowerCase()))
    .sort((a,b) => {
      if (sortBy === 'start') return a.range_start - b.range_start;
      if (sortBy === 'used')  return b.used_count - a.used_count;
      return a.department_name.localeCompare(b.department_name);
    });

  // Summary stats
  const totalSlots     = ranges.reduce((s,r)=>s+r.total_slots, 0);
  const totalUsed      = ranges.reduce((s,r)=>s+r.used_count, 0);
  const totalAvailable = ranges.reduce((s,r)=>s+r.available_count, 0);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Shield size={40} className="text-gray-300"/>
        <p className="text-lg font-semibold text-gray-700">Admin Only</p>
        <p className="text-sm text-gray-500">Only administrators can manage department tag ranges.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-800 rounded-xl flex items-center justify-center">
            <Tag size={18} className="text-white"/>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Department Tag Ranges</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage Asset-Tag number ranges per department · Changes apply immediately to asset creation</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} className="btn-secondary text-xs p-2" title="Refresh"><RefreshCw size={14}/></button>
          {!showForm && (
            <button onClick={()=>{setShowForm(true);setEditData(null);}} className="btn-primary">
              <Plus size={15}/> Add Range
            </button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      {!loading && ranges.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label:'Departments',   value:ranges.length,             color:'bg-blue-50 text-blue-700 border-blue-200' },
            { label:'Total Slots',   value:totalSlots.toLocaleString(),color:'bg-gray-50 text-gray-700 border-gray-200' },
            { label:'Tags Used',     value:totalUsed,                 color:'bg-red-50 text-red-700 border-red-200' },
            { label:'Tags Available',value:totalAvailable.toLocaleString(),color:'bg-green-50 text-green-700 border-green-200' },
          ].map(s=>(
            <div key={s.label} className={`rounded-xl border p-4 ${s.color}`}>
              <p className="text-xs opacity-70 mb-0.5">{s.label}</p>
              <p className="text-2xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Overlaps warning banner */}
      {overlaps.length > 0 && (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-600"/>
            <p className="text-sm font-semibold text-amber-800">{overlaps.length} Range Overlap{overlaps.length>1?'s':''} Detected</p>
          </div>
          <div className="space-y-1">
            {overlaps.map((o,i)=>(
              <p key={i} className="text-xs text-amber-700">
                <strong>{o.a}</strong> and <strong>{o.b}</strong> share tags in range <span className="font-mono">{o.range}</span>
              </p>
            ))}
          </div>
          <p className="text-xs text-amber-600 mt-2">Overlapping ranges are allowed but may cause conflicts when assigning tags. Consider adjusting ranges to avoid overlap.</p>
        </div>
      )}

      {/* Info card */}
      <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-xl flex gap-3">
        <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5"/>
        <div className="text-xs text-blue-800 space-y-1">
          <p><strong>How ranges work:</strong> Each department has a start–end number range for Asset Tags. The <em>end</em> value is exclusive (e.g. 1000–2000 means tags 1000 to 1999).</p>
          <p><strong>Tag display:</strong> Click the <Eye size={10} className="inline"/> eye icon on any department to see every tag in its range colored green (available) or red (used).</p>
          <p><strong>Live updates:</strong> Any range you save here is immediately used in the Add Asset form dropdown and tag validation.</p>
        </div>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="mb-6">
          <RangeForm
            editData={editData}
            allDepts={allDepts}
            onSaved={handleSaved}
            onCancel={()=>{setShowForm(false);setEditData(null);}}
          />
        </div>
      )}

      {/* Filter + sort bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input className="input-field pl-8" placeholder="Filter by department…"
            value={filterText} onChange={e=>setFilterText(e.target.value)}/>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span>Sort:</span>
          {[['name','Name'],['start','Range'],['used','Usage']].map(([v,l])=>(
            <button key={v} onClick={()=>setSortBy(v)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${sortBy===v?'bg-blue-600 text-white':'bg-gray-100 hover:bg-gray-200'}`}>{l}</button>
          ))}
        </div>
        {filterText && <button onClick={()=>setFilterText('')} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>}
      </div>

      {/* Range cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-pulse">
          {Array(6).fill(0).map((_,i)=><div key={i} className="h-44 bg-gray-100 rounded-xl"/>)}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-20 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          <Tag size={36} className="mx-auto mb-3 opacity-20"/>
          <p className="font-medium text-gray-500">{filterText ? 'No departments match your filter' : 'No department ranges configured yet'}</p>
          <p className="text-sm mt-1">{!filterText && 'Click "Add Range" to define the first department tag range'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayed.map(range=>(
            <RangeCard
              key={range.id}
              range={range}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onViewTags={handleViewTags}
              isViewing={viewingDept===range.department_name}
              tagUsage={viewingDept===range.department_name ? tagUsage : null}
              tagLoading={viewingDept===range.department_name ? tagLoading : false}
            />
          ))}
        </div>
      )}

      {/* Departments with no range */}
      {(() => {
        const rangedNames = new Set(ranges.map(r=>r.department_name.toLowerCase()));
        const unranged    = allDepts.filter(d=>!rangedNames.has(d.name.toLowerCase()));
        if (!unranged.length) return null;
        return (
          <div className="mt-8 border border-dashed border-gray-300 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Layers size={12}/> Departments Without Tag Ranges ({unranged.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {unranged.map(d=>(
                <button key={d.id} onClick={()=>{setEditData({department_name:d.name});setShowForm(true);window.scrollTo({top:0,behavior:'smooth'});}}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:border-blue-400 hover:text-blue-700 transition-colors">
                  <Plus size={11}/>{d.name}
                  {d.asset_count>0&&<span className="text-amber-500">({d.asset_count})</span>}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">Click a department to assign a tag range</p>
          </div>
        );
      })()}
    </div>
  );
}
