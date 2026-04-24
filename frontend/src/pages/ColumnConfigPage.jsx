import React, { useState, useEffect, useCallback } from 'react';
import { settingsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import toast from 'react-hot-toast';
import {
  Save, RotateCcw, Eye, EyeOff, GripVertical,
  List, Layers, ChevronUp, ChevronDown, Server, Globe
} from 'lucide-react';

// ── All columns for Asset Inventory List ──────────────────────────────────────
const ASSET_COLUMNS = [
  { key: 'vm_name',          label: 'VM Name',            locked: true,  defaultVisible: true },
  { key: 'ip_address',       label: 'IP Address',         locked: true,  defaultVisible: true },
  { key: 'os_hostname',      label: 'Hostname',           locked: false, defaultVisible: true },
  { key: 'asset_type',       label: 'Asset Type',         locked: false, defaultVisible: true },
  { key: 'os_type',          label: 'OS',                 locked: false, defaultVisible: true },
  { key: 'os_version',       label: 'OS Version',         locked: false, defaultVisible: true },
  { key: 'assigned_user',    label: 'Assigned User',      locked: false, defaultVisible: true },
  { key: 'department',       label: 'Department',         locked: false, defaultVisible: true },
  { key: 'server_status',    label: 'Status',             locked: false, defaultVisible: true },
  { key: 'patching_type',    label: 'Patch Type',         locked: false, defaultVisible: true },
  { key: 'server_patch_type',label: 'Ser. Patch Type',    locked: false, defaultVisible: true },
  { key: 'patching_schedule',label: 'Schedule',           locked: false, defaultVisible: true },
  { key: 'location',         label: 'Location',           locked: false, defaultVisible: true },
  { key: 'serial_number',    label: 'Serial Number',      locked: false, defaultVisible: true },
  { key: 'idrac',            label: 'iDRAC',              locked: false, defaultVisible: true },
  { key: 'oem_status',       label: 'OME Status',         locked: false, defaultVisible: true },
  { key: 'eol_status',       label: 'EOL Status',         locked: false, defaultVisible: true },
  { key: 'me_installed',     label: 'ManageEngine',        locked: false, defaultVisible: true },
  { key: 'tenable_installed',label: 'Tenable',            locked: false, defaultVisible: true },
  { key: 'hosted_ip',        label: 'Hosted IP',          locked: false, defaultVisible: true },
  { key: 'asset_tag',        label: 'Asset Tag',          locked: false, defaultVisible: true },
  { key: 'business_purpose', label: 'Business Purpose',   locked: false, defaultVisible: false },
  { key: 'additional_remarks',label: 'Add. Remark',       locked: false, defaultVisible: false },
  { key: 'asset_username',   label: 'Username',           locked: false, defaultVisible: false },
  { key: 'asset_password',   label: 'Password',           locked: false, defaultVisible: true },
  { key: 'submitted_by',     label: 'Submitted By',       locked: false, defaultVisible: false },
  { key: 'updated_at',       label: 'Last Modified',      locked: false, defaultVisible: true },
  { key: 'actions',          label: 'Actions',            locked: true,  defaultVisible: true },
];

// ── All columns for Ext. Asset Inventory List ─────────────────────────────────
const EXT_COLUMNS = [
  { key: 'vm_name',          label: 'VM Name',            locked: true,  defaultVisible: true },
  { key: 'ip_address',       label: 'IP Address',         locked: true,  defaultVisible: true },
  { key: 'os_hostname',      label: 'Hostname',           locked: false, defaultVisible: true },
  { key: 'asset_type',       label: 'Asset Type',         locked: false, defaultVisible: true },
  { key: 'os_type',          label: 'OS',                 locked: false, defaultVisible: true },
  { key: 'os_version',       label: 'OS Version',         locked: false, defaultVisible: true },
  { key: 'assigned_user',    label: 'Assigned User',      locked: false, defaultVisible: true },
  { key: 'department',       label: 'Department',         locked: false, defaultVisible: true },
  { key: 'server_status',    label: 'Srv Status',         locked: false, defaultVisible: true },
  { key: 'status',           label: 'Record Status',      locked: false, defaultVisible: true },
  { key: 'patching_type',    label: 'Patch Type',         locked: false, defaultVisible: true },
  { key: 'server_patch_type',label: 'Ser. Patch Type',    locked: false, defaultVisible: true },
  { key: 'patching_schedule',label: 'Schedule',           locked: false, defaultVisible: true },
  { key: 'location',         label: 'Location',           locked: false, defaultVisible: true },
  { key: 'serial_number',    label: 'Serial Number',      locked: false, defaultVisible: true },
  { key: 'idrac',            label: 'iDRAC',              locked: false, defaultVisible: true },
  { key: 'oem_status',       label: 'OME Status',         locked: false, defaultVisible: true },
  { key: 'eol_status',       label: 'EOL Status',         locked: false, defaultVisible: true },
  { key: 'me_installed',     label: 'ManageEngine',       locked: false, defaultVisible: true },
  { key: 'tenable_installed',label: 'Tenable',            locked: false, defaultVisible: true },
  { key: 'hosted_ip',        label: 'Hosted IP',          locked: false, defaultVisible: true },
  { key: 'asset_tag',        label: 'Asset Tag',          locked: false, defaultVisible: true },
  { key: 'business_purpose', label: 'Business Purpose',   locked: false, defaultVisible: false },
  { key: 'additional_remarks',label: 'Add. Remark',       locked: false, defaultVisible: false },
  { key: 'asset_username',   label: 'Username',           locked: false, defaultVisible: false },
  { key: 'asset_password',   label: 'Password',           locked: false, defaultVisible: false },
  { key: 'submitted_by',     label: 'Submitted By',       locked: false, defaultVisible: false },
  { key: 'updated_at',       label: 'Last Modified',      locked: false, defaultVisible: true },
  { key: 'actions',          label: 'Actions',            locked: true,  defaultVisible: true },
];

const VMWARE_COLUMNS = [
  { key: 'source_name',      label: 'Source',             locked: false, defaultVisible: true },
  { key: 'source_host',      label: 'Host',               locked: false, defaultVisible: true },
  { key: 'source_type',      label: 'Type',               locked: false, defaultVisible: false },
  { key: 'vm_name',          label: 'VM Name',            locked: false, defaultVisible: true },
  { key: 'os_hostname',      label: 'Hostname',           locked: false, defaultVisible: true },
  { key: 'ip_address',       label: 'IP Address',         locked: false, defaultVisible: true },
  { key: 'mac_address',      label: 'MAC Address',        locked: false, defaultVisible: true },
  { key: 'power_state',      label: 'Power State',        locked: false, defaultVisible: true },
  { key: 'guest_os',         label: 'Guest OS',           locked: false, defaultVisible: true },
  { key: 'cpu_count',        label: 'vCPU',               locked: false, defaultVisible: false },
  { key: 'memory_size_mb',   label: 'Memory (MB)',        locked: false, defaultVisible: false },
  { key: 'vm_id',            label: 'VM ID',              locked: false, defaultVisible: false },
  { key: 'reason',           label: 'Reason',             locked: false, defaultVisible: true },
];

// ── All columns for Beijing Asset List ────────────────────────────────────────
const BEIJING_COLUMNS = [
  { key: 'vm_name',           label: 'VM Name',           locked: true,  defaultVisible: true },
  { key: 'ip_address',        label: 'IP Address',        locked: true,  defaultVisible: true },
  { key: 'os_hostname',       label: 'Hostname',          locked: false, defaultVisible: true },
  { key: 'asset_type',        label: 'Asset Type',        locked: false, defaultVisible: true },
  { key: 'os_type',           label: 'OS',                locked: false, defaultVisible: true },
  { key: 'os_version',        label: 'OS Version',        locked: false, defaultVisible: false },
  { key: 'assigned_user',     label: 'Assigned User',     locked: false, defaultVisible: true },
  { key: 'department',        label: 'Department',        locked: false, defaultVisible: true },
  { key: 'location',          label: 'Location',          locked: false, defaultVisible: true },
  { key: 'server_status',     label: 'Server Status',     locked: false, defaultVisible: true },
  { key: 'serial_number',     label: 'Serial No.',        locked: false, defaultVisible: true },
  { key: 'eol_status',        label: 'EOL Status',        locked: false, defaultVisible: true },
  { key: 'asset_tag',         label: 'Asset Tag',         locked: false, defaultVisible: false },
  { key: 'business_purpose',  label: 'Business Purpose',  locked: false, defaultVisible: false },
  { key: 'additional_remarks',label: 'Remarks',           locked: false, defaultVisible: false },
  { key: 'is_migrated',       label: 'Migration Status',  locked: false, defaultVisible: true },
  { key: 'migrated_by',       label: 'Migrated By',       locked: false, defaultVisible: false },
  { key: 'actions',           label: 'Actions',           locked: true,  defaultVisible: true },
];

const DEFAULT_CONFIGS = { asset: ASSET_COLUMNS, ext: EXT_COLUMNS, vmware: VMWARE_COLUMNS, beijing: BEIJING_COLUMNS };

// ── Merge saved config over defaults (handles new columns added later) ────────
function mergeConfig(defaults, saved) {
  if (!saved || !saved.length) return defaults.map(d => ({ ...d, visible: d.defaultVisible, order: d.order ?? 0 }));
  const savedMap = Object.fromEntries(saved.map((s, i) => [s.key, { ...s, order: i }]));
  const merged = defaults.map((d, i) => ({
    ...d,
    visible: savedMap[d.key] !== undefined ? savedMap[d.key].visible : d.defaultVisible,
    order: savedMap[d.key] !== undefined ? savedMap[d.key].order : 999 + i,
  }));
  return merged.sort((a, b) => a.order - b.order);
}

// ── Column row ────────────────────────────────────────────────────────────────
function ColumnRow({ col, index, total, onToggle, onMove }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
      col.visible ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'
    } ${col.locked ? 'cursor-not-allowed' : 'cursor-default'}`}>
      {/* Drag handle placeholder (visual only) */}
      <GripVertical size={14} className="text-gray-300 flex-shrink-0" />

      {/* Reorder buttons */}
      <div className="flex flex-col gap-0.5 flex-shrink-0">
        <button
          onClick={() => onMove(index, -1)}
          disabled={index === 0 || col.locked}
          className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
          title="Move up"
        >
          <ChevronUp size={11} />
        </button>
        <button
          onClick={() => onMove(index, 1)}
          disabled={index === total - 1 || col.locked}
          className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
          title="Move down"
        >
          <ChevronDown size={11} />
        </button>
      </div>

      {/* Order number */}
      <span className="text-xs text-gray-300 w-5 text-center flex-shrink-0">{index + 1}</span>

      {/* Column label */}
      <span className={`flex-1 text-sm font-medium ${col.visible ? 'text-gray-800' : 'text-gray-400'}`}>
        {col.label}
        {col.locked && <span className="ml-1.5 text-[10px] text-gray-400 font-normal">(always visible)</span>}
        {col.isCustom && <span className="ml-1.5 text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-medium">custom</span>}
      </span>

      {/* Toggle */}
      <button
        onClick={() => !col.locked && onToggle(col.key)}
        disabled={col.locked}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
          col.locked
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : col.visible
              ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
        }`}
        title={col.locked ? 'This column is always visible' : col.visible ? 'Click to hide' : 'Click to show'}
      >
        {col.visible ? <Eye size={12} /> : <EyeOff size={12} />}
        {col.visible ? 'Visible' : 'Hidden'}
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ColumnConfigPage() {
  const { isAdmin } = useAuth();
  const { configVersion } = useConfig();
  const [activeTab, setActiveTab] = useState('asset');
  const [configs, setConfigs] = useState({ asset: null, ext: null, vmware: null, beijing: null });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const [assetR, extR, vmwareR, beijingR, cfAssetR, cfExtR] = await Promise.all([
        settingsAPI.getColumnConfig('asset').catch(() => ({ data: [] })),
        settingsAPI.getColumnConfig('ext').catch(() => ({ data: [] })),
        settingsAPI.getColumnConfig('vmware').catch(() => ({ data: [] })),
        settingsAPI.getColumnConfig('beijing').catch(() => ({ data: [] })),
        settingsAPI.getCustomFields().catch(() => ({ data: [] })),
        settingsAPI.getCustomFields().catch(() => ({ data: [] })),
      ]);

      // Build dynamic custom field columns for asset list
      const cfAssetCols = (cfAssetR.data || [])
        .filter(f => f.is_active)
        .map(f => ({
          key: `cf_${f.field_key}`,
          label: f.field_label,
          locked: false,
          defaultVisible: true,
          isCustom: true,
        }));

      // Extended inventory also shares asset custom fields (same custom_fields table)
      const cfExtCols = (cfExtR.data || [])
        .filter(f => f.is_active)
        .map(f => ({
          key: `cf_${f.field_key}`,
          label: f.field_label,
          locked: false,
          defaultVisible: true,
          isCustom: true,
        }));

      const assetBase = [...ASSET_COLUMNS, ...cfAssetCols];
      const extBase   = [...EXT_COLUMNS,   ...cfExtCols];

      setConfigs({
        asset:   mergeConfig(assetBase,       assetR.data),
        ext:     mergeConfig(extBase,          extR.data),
        vmware:  mergeConfig(VMWARE_COLUMNS,   vmwareR.data),
        beijing: mergeConfig(BEIJING_COLUMNS,  beijingR.data),
      });
    } catch { toast.error('Failed to load column config'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadConfigs(); }, [loadConfigs, configVersion]);

  const toggleColumn = (scope, key) => {
    setConfigs(prev => ({
      ...prev,
      [scope]: prev[scope].map(c => c.key === key ? { ...c, visible: !c.visible } : c),
    }));
  };

  const moveColumn = (scope, index, dir) => {
    setConfigs(prev => {
      const cols = [...prev[scope]];
      const newIdx = index + dir;
      if (newIdx < 0 || newIdx >= cols.length) return prev;
      // Don't move locked columns
      if (cols[index].locked || cols[newIdx].locked) return prev;
      [cols[index], cols[newIdx]] = [cols[newIdx], cols[index]];
      return { ...prev, [scope]: cols };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const toSave = (configs[activeTab] || []).map((c, i) => ({
        key: c.key, visible: c.visible, order: i,
      }));
      await settingsAPI.saveColumnConfig(activeTab, toSave);
      const tabName = { asset: 'Asset', ext: 'Ext. Asset', vmware: 'VMware Candidates', beijing: 'Beijing Asset' }[activeTab] || activeTab;
      toast.success(`${tabName} column config saved — changes apply immediately`);
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const handleReset = () => {
    if (!confirm(`Reset ${activeTab === 'asset' ? 'Asset' : activeTab === 'ext' ? 'Ext. Asset' : 'VMware Candidates'} columns to defaults?`)) return;
    setConfigs(prev => ({
      ...prev,
      [activeTab]: DEFAULT_CONFIGS[activeTab].map((d, i) => ({
        ...d, visible: d.defaultVisible, order: i,
      })),
    }));
  };

  const showAllInTab = () =>
    setConfigs(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(c => ({ ...c, visible: true })),
    }));

  const hideOptionalInTab = () =>
    setConfigs(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(c => ({ ...c, visible: c.locked ? true : c.defaultVisible })),
    }));

  const currentCols = configs[activeTab] || [];
  const visibleCount = currentCols.filter(c => c.visible).length;

  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <div className="text-5xl">🔒</div>
      <p className="text-lg font-semibold text-gray-700">Admin access required</p>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-800 rounded-xl flex items-center justify-center">
            <List size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Column Visibility Config</h1>
            <p className="text-sm text-gray-500 mt-0.5">Show, hide, and reorder columns in the Inventory List tables</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset} className="btn-secondary text-xs">
            <RotateCcw size={13} /> Reset Defaults
          </button>
          <button onClick={handleSave} disabled={saving || loading} className="btn-primary">
            <Save size={14} /> {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 w-fit">
        {[['asset', 'Asset Inventory List', List], ['ext', 'Ext. Asset Inventory List', Layers], ['vmware', 'New VM Candidates', Server], ['beijing', 'Beijing Asset List', Globe]].map(([key, lbl, Icon]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key ? 'bg-white text-blue-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={14} /> {lbl}
          </button>
        ))}
      </div>

      {/* Info bar */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-700">{visibleCount}</span> of{' '}
          <span className="font-semibold text-gray-700">{currentCols.length}</span> columns visible
        </p>
        <div className="flex gap-2">
          <button onClick={showAllInTab} className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">
            <Eye size={11} className="inline mr-1" />Show All
          </button>
          <button onClick={hideOptionalInTab} className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium">
            <EyeOff size={11} className="inline mr-1" />Reset Visibility
          </button>
        </div>
        <p className="text-xs text-gray-400 ml-auto">Use ↑↓ arrows to reorder. Locked columns are always shown and cannot be moved.</p>
      </div>

      {/* Info box */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 mb-5">
        <strong>Note:</strong> Changes apply immediately for all users as soon as you save. Custom fields (added via Asset Custom Fields or Extended Inventory Fields) are always shown after built-in columns and cannot be reordered here.
      </div>

      {/* Column list */}
      {loading ? (
        <div className="space-y-2 animate-pulse">
          {Array(10).fill(0).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-lg" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {currentCols.map((col, index) => (
            <ColumnRow
              key={col.key}
              col={col}
              index={index}
              total={currentCols.length}
              onToggle={(key) => toggleColumn(activeTab, key)}
              onMove={(idx, dir) => moveColumn(activeTab, idx, dir)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

