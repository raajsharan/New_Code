import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { physicalAssetsAPI, dropdownsAPI, settingsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { RenderCustomField } from '../components/CustomFieldEditor';
import Toggle from '../components/Toggle';
import toast from 'react-hot-toast';
import {
  Server, Save, ArrowLeft, Edit2, Plus,
  HardDrive, Cpu, Database, Layers,
  CheckCircle, XCircle, ExternalLink, RefreshCw
} from 'lucide-react';

// ── Field wrapper ─────────────────────────────────────────────────────────────
const Field = ({ label, required, children, hint }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);

const SectionTitle = ({ title }) => (
  <div className="col-span-full pt-2 pb-1 border-b border-gray-100">
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
  </div>
);

// ── Info card for view mode ───────────────────────────────────────────────────
const InfoRow = ({ label, value, mono, badge, bClass }) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
    <span className="text-sm text-gray-500 flex-shrink-0 min-w-[140px]">{label}</span>
    {badge
      ? <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${bClass}`}>{value}</span>
      : <span className={`text-sm font-medium text-gray-800 text-right ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>}
  </div>
);

const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
      <Icon size={20} className="text-white" />
    </div>
    <div>
      <p className="text-xl font-bold text-gray-800">{value || '—'}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  </div>
);

export default function PhysicalAssetPage() {
  const { canWrite } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hostedIP = searchParams.get('ip');

  const [server, setServer]         = useState(null);
  const [models, setModels]         = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [dropdowns, setDropdowns]   = useState({ departments: [], locations: [] });
  const [form, setForm]             = useState(null);
  const [editing, setEditing]       = useState(false);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [isNew, setIsNew]           = useState(false);
  const [fieldTypeOverrides, setFieldTypeOverrides] = useState({});

  const buildEmptyForm = useCallback(() => ({
    hosted_ip:          hostedIP || '',
    asset_id:           null,
    vm_name:            '',
    department_id:      '',
    location_id:        '',
    model_id:           '',
    serial_number:      '',
    cores:              '',
    ram_gb:             '',
    total_disks:        '',
    oem_support_status: true,
    rack_number:        '',
    server_position:    '',
    additional_notes:   '',
    custom_field_values:{},
  }), [hostedIP]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mR, cfR, ddR, ftR] = await Promise.all([
        physicalAssetsAPI.getModels(),
        physicalAssetsAPI.getCustomFields(),
        dropdownsAPI.getAll(),
        settingsAPI.getBuiltinFieldTypes('physical').catch(() => ({ data: {} })),
      ]);
      setModels(mR.data);
      setCustomFields(cfR.data.filter(f => f.is_active));
      setDropdowns({ departments: ddR.data.departments || [], locations: ddR.data.locations || [] });
      setFieldTypeOverrides(ftR.data || {});

      if (hostedIP) {
        try {
          const r = await physicalAssetsAPI.getByIP(hostedIP);
          setServer(r.data);
          setForm({
            ...buildEmptyForm(),
            ...r.data,
            model_id:      r.data.model_id      || '',
            department_id: r.data.department_id || '',
            location_id:   r.data.location_id   || '',
            vm_name:       r.data.vm_name        || '',
          });
          setIsNew(false);
        } catch {
          // IP provided but no record exists — show registration form
          setIsNew(true);
          setEditing(true);
          setForm(buildEmptyForm());
        }
      } else {
        // No IP provided — navigated here to register a new server from scratch
        setIsNew(true);
        setEditing(true);
        setForm(buildEmptyForm());
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [hostedIP, buildEmptyForm]);

  useEffect(() => { loadData(); }, [loadData]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setCustom = (k, v) => setForm(p => ({ ...p, custom_field_values: { ...p.custom_field_values, [k]: v } }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        cores:         parseInt(form.cores) || 0,
        ram_gb:        parseInt(form.ram_gb) || 0,
        total_disks:   parseInt(form.total_disks) || 0,
        model_id:      form.model_id      || null,
        department_id: form.department_id || null,
        location_id:   form.location_id   || null,
        vm_name:       form.vm_name       || '',
      };
      let saved;
      if (isNew || !server) {
        saved = await physicalAssetsAPI.create(payload);
        setIsNew(false);
        toast.success('Physical server registered successfully');
      } else {
        saved = await physicalAssetsAPI.update(server.id, payload);
        toast.success('Physical server updated');
      }
      setServer(saved.data);
      setForm({ ...payload, ...saved.data, model_id: saved.data.model_id || '' });
      setEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  };

  // Renders a built-in field, respecting any label/type overrides stored in fieldTypeOverrides.
  // Currently returns the provided JSX as-is (future: could hide/replace based on overrides).
  const renderBuiltinField = (_key, _defaultLabel, fieldJsx) => fieldJsx;

  // Group custom fields
  const cfGrouped = customFields.reduce((acc, cf) => {
    const g = cf.field_group || 'General';
    if (!acc[g]) acc[g] = [];
    acc[g].push(cf);
    return acc;
  }, {});

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px] text-gray-400 text-sm animate-pulse">
      Loading physical server details…
    </div>
  );

  const modelDisplay = server
    ? `${server.manufacturer ? server.manufacturer + ' ' : ''}${server.model_name || ''}`.trim() || '—'
    : '—';

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="w-10 h-10 bg-blue-800 rounded-xl flex items-center justify-center">
            <Server size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              {isNew && !hostedIP ? 'Register Physical Server' : 'Physical Server Details'}
            </h1>
            {hostedIP ? (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm text-gray-500">Hosted IP:</span>
                <code className="text-sm font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{hostedIP}</code>
                <a href={`https://${hostedIP}/ui/#/login`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors" title="Open ESXi UI">
                  <ExternalLink size={12} /> ESXi UI
                </a>
              </div>
            ) : (
              <p className="text-xs text-gray-500 mt-0.5">Fill in the server details and assign a Hosted IP to register it</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={loadData} className="btn-secondary text-xs p-2" title="Refresh">
            <RefreshCw size={14} />
          </button>
          {canWrite && !editing && (
            <button onClick={() => setEditing(true)} className="btn-primary text-xs">
              <Edit2 size={13} /> {isNew ? 'Register Server' : 'Edit Details'}
            </button>
          )}
        </div>
      </div>

      {/* Not found notice */}
      {isNew && !editing && (
        <div className="card mb-5 border border-blue-200 bg-blue-50">
          <p className="text-sm font-semibold text-blue-800 mb-1">No record found for this IP</p>
          <p className="text-xs text-blue-600 mb-3">Register this physical server to track its hardware details.</p>
          <button onClick={() => setEditing(true)} className="btn-primary text-xs">
            <Plus size={13} /> Register Physical Server
          </button>
        </div>
      )}

      {/* ── VIEW MODE ─────────────────────────────────────────────────────────── */}
      {!editing && server && (
        <>
          {/* Quick stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard icon={Cpu}      label="CPU Cores"    value={server.cores}       color="bg-blue-700" />
            <StatCard icon={Database} label="RAM (GB)"     value={server.ram_gb}      color="bg-violet-600" />
            <StatCard icon={HardDrive}label="Total Disks"  value={server.total_disks} color="bg-teal-600" />
            <StatCard icon={Layers}   label="Rack Position"value={server.server_position || server.rack_number || '—'} color="bg-amber-600" />
          </div>

          {/* Detail cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            {/* Hardware */}
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <HardDrive size={15} className="text-blue-700" /> Hardware
              </h3>
              <InfoRow label="Model"         value={modelDisplay} />
              <InfoRow label="Serial Number" value={server.serial_number} mono />
              <InfoRow label="CPU Cores"     value={server.cores} />
              <InfoRow label="RAM (GB)"      value={server.ram_gb} />
              <InfoRow label="Total Disks"   value={server.total_disks} />
              <InfoRow label="OME Support"
                badge bClass={server.oem_support_status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}
                value={server.oem_support_status ? '✓ Active' : '✗ Expired'} />
            </div>

            {/* Rack info */}
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Server size={15} className="text-blue-700" /> Rack &amp; Location
              </h3>
              <InfoRow label="Rack Number"     value={server.rack_number} mono />
              <InfoRow label="Server Position" value={server.server_position} mono />
              <InfoRow label="Hosted IP"       value={server.hosted_ip || hostedIP} mono />
              {server.vm_name && <InfoRow label="VM / Asset Name" value={server.vm_name} />}
              {server.department && <InfoRow label="Department" value={server.department} />}
              {server.location && <InfoRow label="Location" value={server.location} />}
            </div>
          </div>

          {/* Notes */}
          {server.additional_notes && (
            <div className="card mb-5">
              <h3 className="font-semibold text-gray-700 mb-2 text-sm">Additional Notes</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{server.additional_notes}</p>
            </div>
          )}

          {/* Custom field groups */}
          {Object.entries(cfGrouped).map(([group, fields]) => {
            const hasValues = fields.some(cf => {
              const v = server.custom_field_values?.[cf.field_key];
              return v !== undefined && v !== null && v !== '';
            });
            if (!hasValues) return null;
            return (
              <div key={group} className="card mb-4">
                <h3 className="font-semibold text-gray-700 mb-3 text-sm border-b border-gray-100 pb-2">{group}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {fields.map(cf => {
                    const val = server.custom_field_values?.[cf.field_key];
                    if (val === undefined || val === null || val === '') return null;
                    return (
                      <div key={cf.id}>
                        <p className="text-xs text-gray-500 mb-0.5">{cf.field_label}</p>
                        <p className="text-sm font-medium text-gray-800">
                          {cf.field_type === 'toggle' ? (val ? '✓ Yes' : 'No') : String(val)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Meta info */}
          <p className="text-xs text-gray-400 text-right mt-2">
            Registered: {server.created_at ? new Date(server.created_at).toLocaleString() : '—'}
            {server.updated_at && server.updated_at !== server.created_at &&
              ` · Updated: ${new Date(server.updated_at).toLocaleString()}`}
          </p>
        </>
      )}

      {/* ── EDIT / REGISTER MODE ─────────────────────────────────────────────── */}
      {editing && form && (
        <form onSubmit={handleSave}>
          <div className="card mb-5">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <SectionTitle title="Hardware Information" />

              {renderBuiltinField('hosted_ip', 'Hosted IP',
                <Field label={fieldTypeOverrides?.hosted_ip?.label || 'Hosted IP'} hint="IP address of this physical server">
                  <input className="input-field font-mono" value={form.hosted_ip}
                    onChange={e => set('hosted_ip', e.target.value)} placeholder="10.0.0.1" />
                </Field>
              )}

              {renderBuiltinField('vm_name', 'VM / Asset Name',
                <Field label={fieldTypeOverrides?.vm_name?.label || 'VM / Asset Name'} hint="Linked VM or primary asset on this host">
                  <input className="input-field" value={form.vm_name}
                    onChange={e => set('vm_name', e.target.value)} placeholder="e.g. ESX-HOST-01" />
                </Field>
              )}

              <Field label="Department">
                <select className="input-field" value={form.department_id} onChange={e => set('department_id', e.target.value)}>
                  <option value="">Select department…</option>
                  {dropdowns.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>

              <Field label="Location">
                <select className="input-field" value={form.location_id} onChange={e => set('location_id', e.target.value)}>
                  <option value="">Select location…</option>
                  {dropdowns.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>

              <Field label="Server Model">
                <select className="input-field" value={form.model_id} onChange={e => set('model_id', e.target.value)}>
                  <option value="">Select model…</option>
                  {models.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.manufacturer ? `${m.manufacturer} — ${m.name}` : m.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  <Link to="/physical-server-models" className="text-blue-600 hover:underline">
                    Manage models →
                  </Link>
                </p>
              </Field>

              {renderBuiltinField('serial_number', 'Serial Number',
                <Field label={fieldTypeOverrides?.serial_number?.label || 'Serial Number'}>
                  <input className="input-field" value={form.serial_number}
                    onChange={e => set('serial_number', e.target.value)} placeholder="SRV-001-2024" />
                </Field>
              )}

              {renderBuiltinField('cores', 'CPU Cores',
                <Field label={fieldTypeOverrides?.cores?.label || 'CPU Cores'}>
                  <input type="number" min={0} className="input-field" value={form.cores}
                    onChange={e => set('cores', e.target.value)} placeholder="0" />
                </Field>
              )}

              {renderBuiltinField('ram_gb', 'RAM (GB)',
                <Field label={fieldTypeOverrides?.ram_gb?.label || 'RAM (GB)'}>
                  <input type="number" min={0} className="input-field" value={form.ram_gb}
                    onChange={e => set('ram_gb', e.target.value)} placeholder="0" />
                </Field>
              )}

              {renderBuiltinField('total_disks', 'Total Disks',
                <Field label={fieldTypeOverrides?.total_disks?.label || 'Total Disks'}>
                  <input type="number" min={0} className="input-field" value={form.total_disks}
                    onChange={e => set('total_disks', e.target.value)} placeholder="0" />
                </Field>
              )}

              <Field label="OME Support Status">
                <div className="flex items-center gap-3 h-9">
                  <Toggle checked={form.oem_support_status}
                    onChange={v => set('oem_support_status', v)} disabled={!canWrite} />
                  <span className={`text-sm font-medium ${form.oem_support_status ? 'text-green-700' : 'text-red-600'}`}>
                    {form.oem_support_status ? '✓ Active Support' : '✗ Support Expired'}
                  </span>
                </div>
              </Field>

              <SectionTitle title="Rack Information" />

              {renderBuiltinField('rack_number', 'Rack Number',
                <Field label={fieldTypeOverrides?.rack_number?.label || 'Rack Number'} hint="e.g. RACK-A1, RACK-B3">
                  <input className="input-field" value={form.rack_number}
                    onChange={e => set('rack_number', e.target.value)} placeholder="RACK-A1" />
                </Field>
              )}

              {renderBuiltinField('server_position', 'Server Position (U)',
                <Field label={fieldTypeOverrides?.server_position?.label || 'Server Position (U)'} hint="e.g. U12, U13-U14">
                  <input className="input-field" value={form.server_position}
                    onChange={e => set('server_position', e.target.value)} placeholder="U12" />
                </Field>
              )}

              <div className="col-span-full">
                {renderBuiltinField('additional_notes', 'Additional Notes',
                  <Field label={fieldTypeOverrides?.additional_notes?.label || 'Additional Notes'}>
                    <textarea className="input-field" rows={3} value={form.additional_notes}
                      onChange={e => set('additional_notes', e.target.value)}
                      placeholder="Any additional notes about this physical server…" />
                  </Field>
                )}
              </div>

              {/* Custom field groups */}
              {Object.entries(cfGrouped).map(([group, fields]) => (
                <React.Fragment key={group}>
                  <SectionTitle title={group} />
                  {fields.map(cf => (
                    <Field key={cf.id} label={cf.field_label}>
                      <RenderCustomField
                        cf={cf}
                        value={form.custom_field_values[cf.field_key]}
                        onChange={v => setCustom(cf.field_key, v)}
                        disabled={!canWrite}
                      />
                    </Field>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={saving || !canWrite} className="btn-primary">
              <Save size={15} /> {saving ? 'Saving…' : isNew ? 'Register Server' : 'Save Changes'}
            </button>
            {!isNew && (
              <button type="button" onClick={() => { setEditing(false); setForm({ ...buildEmptyForm(), ...server, model_id: server.model_id||'', department_id: server.department_id||'', location_id: server.location_id||'', vm_name: server.vm_name||'' }); }}
                className="btn-secondary">
                Cancel
              </button>
            )}
            {isNew && (
              <button type="button" onClick={() => navigate(-1)} className="btn-secondary">
                Go Back
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
