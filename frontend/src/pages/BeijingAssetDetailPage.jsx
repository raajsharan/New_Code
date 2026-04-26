import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { beijingAssetsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Edit2, Save, X, Server, Building2, Shield,
  RefreshCw, CheckCircle, Info, MapPin, History, Layers,
  HardDrive, Key, Zap, ExternalLink, Eye, EyeOff,
} from 'lucide-react';

const FIELDS = [
  { key: 'vm_name',            label: 'VM Name',            mono: true },
  { key: 'os_hostname',        label: 'OS Hostname',        mono: true },
  { key: 'ip_address',         label: 'IP Address',         mono: true },
  { key: 'asset_type',         label: 'Asset Type' },
  { key: 'os_type',            label: 'OS Type' },
  { key: 'os_version',         label: 'OS Version' },
  { key: 'assigned_user',      label: 'Assigned User' },
  { key: 'department',         label: 'Department' },
  { key: 'location',           label: 'Location' },
  { key: 'business_purpose',   label: 'Business Purpose' },
  { key: 'server_status',      label: 'Server Status' },
  { key: 'serial_number',      label: 'Serial Number',      mono: true },
  { key: 'eol_status',         label: 'EOL Status' },
  { key: 'asset_tag',          label: 'Asset Tag',          mono: true },
  { key: 'patching_type',      label: 'Patching Type' },
  { key: 'server_patch_type',  label: 'Server Patch Type' },
  { key: 'patching_schedule',  label: 'Patching Schedule' },
  { key: 'idrac_ip',           label: 'iDRAC IP',           mono: true },
  { key: 'oem_status',         label: 'OME Status' },
  { key: 'hosted_ip',          label: 'Hosted IP',          mono: true },
  { key: 'asset_username',     label: 'Asset Username',     mono: true },
  { key: 'additional_remarks', label: 'Additional Remarks', multiline: true },
];

const eolCls = (s) => ({ InSupport: 'bg-green-100 text-green-700', EOL: 'bg-orange-100 text-orange-700', Decom: 'bg-red-100 text-red-700' }[s] || 'bg-gray-100 text-gray-500');
const statusCls = (s) => ({ Alive: 'bg-green-100 text-green-700', 'Powered Off': 'bg-orange-100 text-orange-700', 'Not Alive': 'bg-red-100 text-red-700' }[s] || 'bg-gray-100 text-gray-500');

function InfoRow({ label, value, mono, badge, badgeCls }) {
  return (
    <div className="flex items-start py-2 border-b border-gray-50 dark:border-slate-700/50 last:border-0">
      <span className="text-xs font-medium text-gray-500 dark:text-slate-400 w-40 flex-shrink-0">{label}</span>
      {badge
        ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeCls || 'bg-gray-100 text-gray-600'}`}>{value || '—'}</span>
        : <span className={`text-sm text-gray-800 dark:text-slate-200 flex-1 ${mono ? 'font-mono' : ''} ${!value ? 'text-gray-400 dark:text-slate-500 italic' : ''}`}>{value || '—'}</span>}
    </div>
  );
}

function EditRow({ field, value, onChange }) {
  if (field.multiline) {
    return (
      <div className="py-2 border-b border-gray-50 dark:border-slate-700/50 last:border-0">
        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">{field.label}</label>
        <textarea
          className="input-field w-full text-sm resize-none"
          rows={3}
          value={value ?? ''}
          onChange={e => onChange(field.key, e.target.value)}
        />
      </div>
    );
  }
  return (
    <div className="flex items-center py-2 border-b border-gray-50 dark:border-slate-700/50 last:border-0 gap-3">
      <span className="text-xs font-medium text-gray-500 dark:text-slate-400 w-40 flex-shrink-0">{field.label}</span>
      <input
        className={`input-field flex-1 text-sm ${field.mono ? 'font-mono' : ''}`}
        value={value ?? ''}
        onChange={e => onChange(field.key, e.target.value)}
      />
    </div>
  );
}

function Section({ icon: Icon, title, color = 'text-blue-700', children }) {
  return (
    <div className="card">
      <h3 className="font-semibold text-gray-800 dark:text-slate-100 mb-3 flex items-center gap-2">
        <Icon size={15} className={color} /> {title}
      </h3>
      <div>{children}</div>
    </div>
  );
}

export default function BeijingAssetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [asset,        setAsset]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [editing,      setEditing]      = useState(false);
  const [form,         setForm]         = useState({});
  const [saving,       setSaving]       = useState(false);
  const [customFields, setCustomFields] = useState([]);
  const [customValues, setCustomValues] = useState({});
  const [showPw,       setShowPw]       = useState(false);

  const fetchAsset = useCallback(async () => {
    setLoading(true);
    try {
      const [r, cfR] = await Promise.all([
        beijingAssetsAPI.getById(id),
        beijingAssetsAPI.getCustomFields().catch(() => ({ data: [] })),
      ]);
      setAsset(r.data);
      setCustomFields(cfR.data || []);
    } catch {
      toast.error('Asset not found');
      navigate('/beijing-asset-list');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { fetchAsset(); }, [fetchAsset]);

  function startEdit() {
    const base = FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: asset[f.key] ?? '' }), {});
    base.idrac_enabled            = asset.idrac_enabled            ?? false;
    base.me_installed_status      = asset.me_installed_status      ?? false;
    base.tenable_installed_status = asset.tenable_installed_status ?? false;
    setForm(base);
    setCustomValues(asset.custom_field_values || {});
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setForm({});
    setCustomValues({});
  }

  function setField(key, val) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const r = await beijingAssetsAPI.update(id, { ...form, custom_field_values: customValues });
      setAsset(r.data);
      setEditing(false);
      setForm({});
      setCustomValues({});
      toast.success('Asset updated');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto animate-pulse space-y-4">
        {Array(3).fill(0).map((_, i) => <div key={i} className="card h-32 bg-gray-100 dark:bg-slate-800" />)}
      </div>
    );
  }
  if (!asset) return null;

  const title = asset.vm_name || asset.os_hostname || `Asset #${asset.id}`;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="w-10 h-10 bg-blue-800 rounded-xl flex items-center justify-center">
            <Server size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-slate-100">{title}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <code className="text-sm font-mono text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                {asset.ip_address}
              </code>
              {asset.is_migrated
                ? <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                    <CheckCircle size={10} /> Migrated
                  </span>
                : <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                    <Info size={10} /> Pending
                  </span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={fetchAsset} className="btn-secondary text-xs p-2" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => navigate(`/audit-explorer?q=${encodeURIComponent(asset.ip_address || '')}&entity_type=beijing_asset`)}
            className="btn-secondary text-xs flex items-center gap-1"
            title="View audit trail"
          >
            <History size={13} /> Audit Trail
          </button>
          {isAdmin && !asset.is_migrated && !editing && (
            <button onClick={startEdit} className="btn-primary text-xs">
              <Edit2 size={13} /> Edit Asset
            </button>
          )}
          {editing && (
            <>
              <button onClick={cancelEdit} className="btn-secondary text-xs">
                <X size={13} /> Cancel
              </button>
              <button onClick={saveEdit} disabled={saving} className="btn-primary text-xs">
                {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Asset Type', value: asset.asset_type,  cls: 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300' },
          { label: 'OS',         value: [asset.os_type, asset.os_version].filter(Boolean).join(' · ') || '—', cls: 'bg-violet-50 dark:bg-violet-900/20 text-violet-800 dark:text-violet-300' },
          { label: 'Department', value: asset.department,  cls: 'bg-teal-50 dark:bg-teal-900/20 text-teal-800 dark:text-teal-300' },
          { label: 'Location',   value: asset.location,    cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-3 ${s.cls}`}>
            <p className="text-xs opacity-70 mb-0.5">{s.label}</p>
            <p className="text-sm font-bold leading-tight">{s.value || '—'}</p>
          </div>
        ))}
      </div>

      {/* Detail cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Basic Information */}
        <Section icon={Server} title="Basic Information">
          {editing ? (
            ['vm_name', 'os_hostname', 'ip_address', 'asset_type', 'os_type', 'os_version'].map(k => (
              <EditRow key={k} field={FIELDS.find(f => f.key === k)} value={form[k]} onChange={setField} />
            ))
          ) : (
            <>
              <InfoRow label="VM Name"     value={asset.vm_name}     mono />
              <InfoRow label="OS Hostname" value={asset.os_hostname} mono />
              <InfoRow label="IP Address"  value={asset.ip_address}  mono />
              <InfoRow label="Asset Type"  value={asset.asset_type} />
              <InfoRow label="OS Type"     value={asset.os_type} />
              <InfoRow label="OS Version"  value={asset.os_version} />
            </>
          )}
        </Section>

        {/* Ownership */}
        <Section icon={Building2} title="Ownership" color="text-teal-700">
          {editing ? (
            ['assigned_user', 'department', 'location', 'business_purpose', 'asset_tag', 'serial_number'].map(k => (
              <EditRow key={k} field={FIELDS.find(f => f.key === k)} value={form[k]} onChange={setField} />
            ))
          ) : (
            <>
              <InfoRow label="Assigned User"    value={asset.assigned_user} />
              <InfoRow label="Department"       value={asset.department} />
              <InfoRow label="Location"         value={asset.location} />
              <InfoRow label="Business Purpose" value={asset.business_purpose} />
              <InfoRow label="Asset Tag"        value={asset.asset_tag}    mono />
              <InfoRow label="Serial Number"    value={asset.serial_number} mono />
            </>
          )}
        </Section>

        {/* Status & Patching */}
        <Section icon={Shield} title="Status & Patching" color="text-green-700">
          {editing ? (
            <>
              {['server_status', 'eol_status', 'patching_type', 'server_patch_type', 'patching_schedule'].map(k => (
                <EditRow key={k} field={FIELDS.find(f => f.key === k)} value={form[k]} onChange={setField} />
              ))}
            </>
          ) : (
            <>
              <InfoRow label="Server Status"    value={asset.server_status}    badge badgeCls={statusCls(asset.server_status)} />
              <InfoRow label="EOL Status"       value={asset.eol_status}       badge badgeCls={eolCls(asset.eol_status)} />
              <InfoRow label="Patching Type"    value={asset.patching_type} />
              <InfoRow label="Server Patch Type" value={asset.server_patch_type} />
              <InfoRow label="Patching Schedule" value={asset.patching_schedule} />
            </>
          )}
        </Section>

        {/* Agent Status */}
        <Section icon={Zap} title="Agent Status" color="text-amber-600">
          {editing ? (
            <div className="space-y-2">
              <div className="flex items-center py-2 border-b border-gray-50 dark:border-slate-700/50 gap-3">
                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 w-40 flex-shrink-0">ManageEngine</span>
                <button type="button" onClick={() => setField('me_installed_status', !form.me_installed_status)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${form.me_installed_status ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${form.me_installed_status ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm text-gray-600 dark:text-slate-400">{form.me_installed_status ? 'Installed' : 'Not Installed'}</span>
              </div>
              <div className="flex items-center py-2 gap-3">
                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 w-40 flex-shrink-0">Tenable</span>
                <button type="button" onClick={() => setField('tenable_installed_status', !form.tenable_installed_status)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${form.tenable_installed_status ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${form.tenable_installed_status ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm text-gray-600 dark:text-slate-400">{form.tenable_installed_status ? 'Installed' : 'Not Installed'}</span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center py-2 border-b border-gray-50 dark:border-slate-700/50">
                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 w-40 flex-shrink-0">ManageEngine</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${asset.me_installed_status ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {asset.me_installed_status ? 'Installed' : 'Not Installed'}
                </span>
              </div>
              <div className="flex items-center py-2">
                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 w-40 flex-shrink-0">Tenable</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${asset.tenable_installed_status ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {asset.tenable_installed_status ? 'Installed' : 'Not Installed'}
                </span>
              </div>
            </>
          )}
        </Section>

        {/* Host Details */}
        <Section icon={HardDrive} title="Host Details" color="text-violet-700">
          {editing ? (
            <div className="space-y-1">
              <div className="flex items-center py-2 border-b border-gray-50 dark:border-slate-700/50 gap-3">
                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 w-40 flex-shrink-0">iDRAC</span>
                <button type="button" onClick={() => setField('idrac_enabled', !form.idrac_enabled)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${form.idrac_enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${form.idrac_enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm text-gray-600 dark:text-slate-400">{form.idrac_enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              {form.idrac_enabled && <EditRow field={FIELDS.find(f => f.key === 'idrac_ip')}   value={form.idrac_ip}   onChange={setField} />}
              {form.idrac_enabled && <EditRow field={FIELDS.find(f => f.key === 'oem_status')} value={form.oem_status} onChange={setField} />}
              <EditRow field={FIELDS.find(f => f.key === 'hosted_ip')} value={form.hosted_ip} onChange={setField} />
            </div>
          ) : (
            <>
              <InfoRow label="iDRAC" value={asset.idrac_enabled ? `Enabled${asset.idrac_ip ? ' (' + asset.idrac_ip + ')' : ''}` : 'Disabled'} />
              <InfoRow label="OME Status" value={asset.oem_status} />
              <div className="flex items-start py-2 border-b border-gray-50 dark:border-slate-700/50">
                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 w-40 flex-shrink-0">Hosted IP</span>
                {asset.hosted_ip
                  ? <div className="flex items-center gap-2">
                      <button onClick={() => navigate(`/physical-assets?ip=${encodeURIComponent(asset.hosted_ip)}`)}
                        className="text-sm font-mono text-blue-700 hover:underline flex items-center gap-1">
                        <Server size={12} />{asset.hosted_ip}
                      </button>
                      <a href={`https://${asset.hosted_ip}/ui/#/login`} target="_blank" rel="noopener noreferrer"
                        className="p-0.5 text-gray-400 hover:text-blue-600"><ExternalLink size={12} /></a>
                    </div>
                  : <span className="text-sm text-gray-400 dark:text-slate-500 italic">—</span>}
              </div>
            </>
          )}
        </Section>

        {/* Credentials */}
        <Section icon={Key} title="Credentials" color="text-rose-700">
          {editing ? (
            <>
              <EditRow field={FIELDS.find(f => f.key === 'asset_username')} value={form.asset_username} onChange={setField} />
              <div className="flex items-center py-2 border-b border-gray-50 dark:border-slate-700/50 gap-3">
                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 w-40 flex-shrink-0">Asset Password</span>
                <div className="relative flex-1">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="input-field pr-10 w-full text-sm font-mono"
                    value={form.asset_password ?? ''}
                    onChange={e => setField('asset_password', e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <InfoRow label="Username" value={asset.asset_username} mono />
              <div className="flex items-center py-2">
                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 w-40 flex-shrink-0">Password</span>
                <span className="text-sm font-mono text-gray-400 dark:text-slate-500 tracking-widest">••••••••</span>
                <span className="ml-2 text-xs text-gray-400">(view in list)</span>
              </div>
            </>
          )}
        </Section>

        {/* Import Info */}
        <Section icon={MapPin} title="Import Info" color="text-indigo-700">
          <InfoRow label="Import Source" value={asset.import_source} />
          <InfoRow label="Import Batch"  value={asset.import_batch_id} mono />
          <InfoRow label="Submitted By"  value={asset.submitted_by} />
          <InfoRow label="Created"       value={asset.created_at ? new Date(asset.created_at).toLocaleString() : null} />
          {asset.is_migrated && (
            <>
              <InfoRow label="Migrated By"      value={asset.migrated_by} />
              <InfoRow label="Migrated At"      value={asset.migrated_at ? new Date(asset.migrated_at).toLocaleString() : null} />
              <InfoRow label="Migration Note"   value={asset.migration_comment} />
            </>
          )}
        </Section>

        {/* Additional Remarks — full width */}
        {(editing || asset.additional_remarks) && (
          <div className="card md:col-span-2">
            <h3 className="font-semibold text-gray-800 dark:text-slate-100 mb-3 text-sm">Additional Remarks</h3>
            {editing
              ? <textarea
                  className="input-field w-full text-sm resize-none"
                  rows={4}
                  value={form['additional_remarks'] ?? ''}
                  onChange={e => setField('additional_remarks', e.target.value)}
                />
              : <p className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{asset.additional_remarks}</p>}
          </div>
        )}

        {/* Custom Fields — full width */}
        {customFields.length > 0 && (
          <div className="card md:col-span-2">
            <h3 className="font-semibold text-gray-800 dark:text-slate-100 mb-3 flex items-center gap-2 text-sm">
              <Layers size={14} className="text-purple-600" /> Custom Fields
            </h3>
            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {customFields.map(cf => (
                  <div key={cf.id}>
                    <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">{cf.field_label}</label>
                    {cf.field_type === 'dropdown' ? (
                      <select
                        className="input-field text-sm w-full"
                        value={customValues[cf.field_key] ?? ''}
                        onChange={e => setCustomValues(prev => ({ ...prev, [cf.field_key]: e.target.value }))}
                      >
                        <option value="">Select…</option>
                        {(cf.field_options || []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        className="input-field text-sm w-full"
                        value={customValues[cf.field_key] ?? ''}
                        onChange={e => setCustomValues(prev => ({ ...prev, [cf.field_key]: e.target.value }))}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {customFields.map(cf => {
                  const val = asset.custom_field_values?.[cf.field_key];
                  return (
                    <InfoRow
                      key={cf.id}
                      label={cf.field_label}
                      value={val || '—'}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
