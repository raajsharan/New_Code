import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { assetsAPI, dropdownsAPI, settingsAPI, assetTagsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { RenderCustomField } from '../components/CustomFieldEditor';
import Toggle from '../components/Toggle';
import toast from 'react-hot-toast';
import {
  PlusCircle, RotateCcw, Upload, Download,
  Eye, EyeOff, AlertTriangle, CheckCircle
} from 'lucide-react';

const INIT = {
  vm_name:'', os_hostname:'', ip_address:'', asset_type_id:'', os_type_id:'', os_version_id:'',
  assigned_user:'', department_id:'', business_purpose:'', server_status_id:'',
  me_installed_status:false, tenable_installed_status:false,
  patching_schedule_id:'', patching_type_id:'', server_patch_type_id:'', location_id:'',
  additional_remarks:'', serial_number:'', idrac_enabled:false, idrac_ip:'',
  eol_status:'InSupport', asset_username:'', asset_password:'', custom_field_values:{},
  hosted_ip:'', asset_tag:'',
};

// â”€â”€ Field wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

// â”€â”€ Section title inside grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SectionTitle = ({ title }) => (
  <div className="col-span-full pt-2 pb-1 border-b border-gray-100">
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
  </div>
);

// â”€â”€ Duplicate indicator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DupIndicator = ({ state, checking }) => {
  if (checking) return (
    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
      <span className="inline-block w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" /> Checking...
    </p>
  );
  if (state === false) return <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle size={11} /> Available</p>;
  if (state) return <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertTriangle size={11} /> {state}</p>;
  return null;
};

export default function AddAssetPage() {
  const { canWrite } = useAuth();
  const { configVersion } = useConfig();
  const navigate = useNavigate();
  const routeState = useLocation().state;
  const editAsset = routeState?.asset;

  const [form, setForm]             = useState(INIT);
  const [dropdowns, setDropdowns]   = useState({});
  const [osVersions, setOsVersions] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [showPw, setShowPw]         = useState(false);
  const [csvFile, setCsvFile]       = useState(null);
  const [importing, setImporting]   = useState(false);
  const [dupState, setDupState]     = useState({ ip: null });
  const [checking, setChecking]     = useState({ ip: false });
  const [availableTags, setAvailableTags] = useState([]);
  const [tagValidation, setTagValidation] = useState(null); // null | false | string(error)
  const ipTimer = useRef(null);
  const hostnameTimer = useRef(null);

  // Re-fetch dropdowns when inventory config changes
  const fetchMeta = useCallback(async () => {
    try {
      const [dd, cf] = await Promise.all([
        dropdownsAPI.getAll(),
        settingsAPI.getCustomFields(),
      ]);
      setDropdowns(dd.data);
      setCustomFields(cf.data.filter(f => f.is_active));
    } catch {}
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta, configVersion]);

  useEffect(() => {
    if (editAsset) setForm({ ...INIT, ...editAsset, custom_field_values: editAsset.custom_field_values || {} });
  }, [editAsset]);

  // Filter OS versions by selected OS type
  useEffect(() => {
    const versions = form.os_type_id
      ? (dropdowns.os_versions || []).filter(v => v.os_type_id === parseInt(form.os_type_id))
      : [];
    setOsVersions(versions);
    if (!editAsset || String(editAsset.os_type_id) !== String(form.os_type_id)) {
      setForm(p => ({ ...p, os_version_id: '' }));
    }
  }, [form.os_type_id, dropdowns.os_versions]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setCustom = (k, v) => setForm(p => ({ ...p, custom_field_values: { ...p.custom_field_values, [k]: v } }));

  // IP-only duplicate check
  const checkDup = useCallback(async (field, value) => {
    if (field !== 'ip') return;
    if (!value?.trim()) { setDupState({ ip: null }); return; }
    setChecking(p => ({ ...p, ip: true }));
    try {
      const r = await assetsAPI.checkDuplicate({ ip_address: value.trim(), exclude_id: editAsset?.id });
      setDupState({ ip: r.data.duplicate ? r.data.errors[0] : false });
    } catch { setDupState({ ip: null }); }
    finally { setChecking(p => ({ ...p, ip: false })); }
  }, [editAsset?.id]);

  const handleIPChange = (v) => {
    set('ip_address', v);
    clearTimeout(ipTimer.current);
    ipTimer.current = setTimeout(() => checkDup('ip', v), 700);
  };

  const handleHostnameChange = (v) => {
    set('os_hostname', v);
    // no duplicate check for hostname
  };

  // Load available asset tags when department changes
  const loadAvailableTags = useCallback(async (deptId) => {
    if (!deptId) { setAvailableTags([]); return; }
    try {
      const dept = dropdowns.departments?.find(d => String(d.id) === String(deptId));
      if (!dept) return;
      const r = await assetTagsAPI.getAvailable(dept.name);
      setAvailableTags(r.data.available || []);
    } catch { setAvailableTags([]); }
  }, [dropdowns.departments]);

  useEffect(() => { loadAvailableTags(form.department_id); }, [form.department_id, loadAvailableTags]);

  const validateTag = async (tag) => {
    if (!tag?.trim()) { setTagValidation(null); return; }
    try {
      const dept = dropdowns.departments?.find(d => String(d.id) === String(form.department_id));
      const r = await assetTagsAPI.validate({ tag: tag.trim(), dept: dept?.name, exclude_asset_id: editAsset?.id });
      setTagValidation(r.data.valid ? false : r.data.error);
    } catch { setTagValidation(null); }
  };

  const hasDupError = !!(dupState.ip);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canWrite) { toast.error('Read-only access'); return; }
    if (hasDupError) { toast.error('Fix duplicate IP before saving'); return; }
    if (tagValidation) { toast.error('Fix asset tag issue before saving'); return; }
    setLoading(true);
    try {
      const payload = {
        ...form,
        asset_type_id: form.asset_type_id || null, os_type_id: form.os_type_id || null,
        os_version_id: form.os_version_id || null, department_id: form.department_id || null,
        server_status_id: form.server_status_id || null, patching_schedule_id: form.patching_schedule_id || null,
        patching_type_id: form.patching_type_id || null, server_patch_type_id: form.server_patch_type_id || null,
        location_id: form.location_id || null,
      };
      if (editAsset) { await assetsAPI.update(editAsset.id, payload); toast.success('Asset updated'); }
      else { await assetsAPI.create(payload); toast.success('Asset added'); }
      navigate('/asset-list');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to save';
      if (err.response?.data?.duplicate) toast.error('Duplicate: ' + msg, { duration: 6000 });
      else toast.error(msg);
    } finally { setLoading(false); }
  };

  const handleCSVDownload = async () => {
    try {
      const r = await assetsAPI.downloadTemplate();
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a'); a.href = url; a.download = 'asset_import_template.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
  };

  const handleCSVImport = async () => {
    if (!csvFile) { toast.error('Select an Excel/CSV file'); return; }
    setImporting(true);
    try {
      const r = await assetsAPI.importCSV(csvFile);
      const { success, failed, skipped } = r.data;
      toast.success(`Imported ${success}${skipped > 0 ? `, ${skipped} skipped (dup)` : ''}${failed > 0 ? `, ${failed} failed` : ''}`);
      if (r.data.errors?.length) r.data.errors.slice(0, 2).forEach(e => toast.error(e, { duration: 5000 }));
      setCsvFile(null);
    } catch (err) { toast.error(err.response?.data?.error || 'Import failed'); }
    finally { setImporting(false); }
  };

  // â”€â”€ Group custom fields by field_group â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const groupedCustomFields = customFields.reduce((acc, cf) => {
    const g = cf.field_group || 'General';
    if (!acc[g]) acc[g] = [];
    acc[g].push(cf);
    return acc;
  }, {});

  const renderCustomField = (cf) => {
    const val = form.custom_field_values[cf.field_key];
    if (cf.field_type === 'textbox') {
      return (
        <input className="input-field" value={val || ''}
          onChange={e => setCustom(cf.field_key, e.target.value)} />
      );
    }
    if (cf.field_type === 'dropdown') {
      let opts = [];
      try { opts = JSON.parse(cf.field_options || '[]'); } catch {}
      return (
        <select className="input-field" value={val || ''} onChange={e => setCustom(cf.field_key, e.target.value)}>
          <option value="">Select...</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (cf.field_type === 'toggle') {
      return (
        <div className="flex items-center gap-3 h-9">
          <Toggle checked={!!val} onChange={v => setCustom(cf.field_key, v)} disabled={!canWrite} />
          <span className="text-sm text-gray-600">{val ? 'Yes' : 'No'}</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{editAsset ? 'Edit Asset' : 'Add New Asset'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{editAsset ? 'Update asset information' : 'Register a new server or VM'}</p>
        </div>
        {!editAsset && canWrite && (
          <div className="flex items-center gap-2">
            <button onClick={handleCSVDownload} className="btn-secondary text-xs"><Download size={13} /> Template</button>
            <label className="btn-secondary text-xs cursor-pointer">
              <Upload size={13} />{csvFile ? csvFile.name.slice(0, 16) + 'â€¦' : 'Select File'}
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => setCsvFile(e.target.files[0])} />
            </label>
            {csvFile && <button onClick={handleCSVImport} disabled={importing} className="btn-success text-xs">{importing ? 'Importing...' : 'Import'}</button>}
          </div>
        )}
      </div>

      {!canWrite && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          Read-only access â€” contact an admin to add or edit assets.
        </div>
      )}
      {hasDupError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={16} /> Duplicate detected â€” resolve before saving.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

            <SectionTitle title="Basic Information" />
            <Field label="VM Name">
              <input className="input-field" value={form.vm_name}
                onChange={e => set('vm_name', e.target.value)} placeholder="PROD-WEB-01" />
            </Field>
            <Field label="OS Hostname">
              <input className="input-field"
                value={form.os_hostname} onChange={e => handleHostnameChange(e.target.value)}
                placeholder="prod-web-01.local" />
            </Field>
            <Field label="IP Address">
              <input className={`input-field ${dupState.ip ? 'border-red-400 focus:ring-red-400' : ''}`}
                value={form.ip_address} onChange={e => handleIPChange(e.target.value)}
                placeholder="192.168.1.10" />
              <DupIndicator state={dupState.ip} checking={checking.ip} />
            </Field>
            <Field label="Asset Type">
              <select className="input-field" value={form.asset_type_id} onChange={e => set('asset_type_id', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.asset_types||[]).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="OS Type">
              <select className="input-field" value={form.os_type_id} onChange={e => set('os_type_id', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.os_types||[]).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="OS Version">
              <select className="input-field" value={form.os_version_id}
                onChange={e => set('os_version_id', e.target.value)} disabled={!form.os_type_id}>
                <option value="">{form.os_type_id ? 'Select version...' : 'Select OS Type first'}</option>
                {osVersions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>

            <SectionTitle title="Ownership" />
            <Field label="Assigned User">
              <input className="input-field" value={form.assigned_user}
                onChange={e => set('assigned_user', e.target.value)} placeholder="john.doe" />
            </Field>
            <Field label="Department">
              <select className="input-field" value={form.department_id} onChange={e => set('department_id', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.departments||[]).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Business Purpose">
              <input className="input-field" value={form.business_purpose}
                onChange={e => set('business_purpose', e.target.value)} placeholder="Production web server" />
            </Field>

            <SectionTitle title="Status & Patching" />
            <Field label="Server Status">
              <select className="input-field" value={form.server_status_id} onChange={e => set('server_status_id', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.server_status||[]).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Server Patch Type">
              <select className="input-field" value={form.server_patch_type_id} onChange={e => set('server_patch_type_id', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.server_patch_types||[]).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Patching Schedule">
              <select className="input-field" value={form.patching_schedule_id} onChange={e => set('patching_schedule_id', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.patching_schedules||[]).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Patching Type">
              <select className="input-field" value={form.patching_type_id} onChange={e => set('patching_type_id', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.patching_types||[]).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Location">
              <select className="input-field" value={form.location_id} onChange={e => set('location_id', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.locations||[]).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="EOL Status">
              <select className="input-field" value={form.eol_status} onChange={e => set('eol_status', e.target.value)}>
                <option value="InSupport">In Support</option>
                <option value="EOL">EOL</option>
                <option value="Decom">Decommissioned</option>
                <option value="Not Applicable">Not Applicable</option>
              </select>
            </Field>

            <SectionTitle title="Agent Status" />
            <Field label="ManageEngine Installed">
              <div className="flex items-center gap-3 h-9">
                <Toggle checked={form.me_installed_status} onChange={v => set('me_installed_status', v)} disabled={!canWrite} />
                <span className="text-sm text-gray-600">{form.me_installed_status ? 'Installed' : 'Not Installed'}</span>
              </div>
            </Field>
            <Field label="Tenable Installed">
              <div className="flex items-center gap-3 h-9">
                <Toggle checked={form.tenable_installed_status} onChange={v => set('tenable_installed_status', v)} disabled={!canWrite} />
                <span className="text-sm text-gray-600">{form.tenable_installed_status ? 'Installed' : 'Not Installed'}</span>
              </div>
            </Field>

            <SectionTitle title="Host Details" />
            <Field label="Serial Number">
              <input className="input-field" value={form.serial_number||''}
                onChange={e => set('serial_number', e.target.value)} placeholder="SRV-001-2024" />
            </Field>
            <Field label="iDRAC">
              <div className="flex items-center gap-3 h-9">
                <Toggle checked={form.idrac_enabled} onChange={v => set('idrac_enabled', v)} disabled={!canWrite} />
                <span className="text-sm text-gray-600">{form.idrac_enabled ? 'Yes' : 'No'}</span>
              </div>
            </Field>
            {form.idrac_enabled && (
              <Field label="iDRAC IP Address">
                <input className="input-field" value={form.idrac_ip||''}
                  onChange={e => set('idrac_ip', e.target.value)} placeholder="10.0.0.100" />
              </Field>
            )}

            <SectionTitle title="Credentials" />
            <Field label="Asset Username">
              <input className="input-field" value={form.asset_username||''}
                onChange={e => set('asset_username', e.target.value)} placeholder="admin" />
            </Field>
            <Field label="Asset Password">
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} className="input-field pr-10"
                  value={form.asset_password||''} onChange={e => set('asset_password', e.target.value)}
                  placeholder="********" />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>

            <div className="col-span-full">
              <Field label="Additional Remarks">
                <textarea className="input-field" rows={3} value={form.additional_remarks||''}
                  onChange={e => set('additional_remarks', e.target.value)} placeholder="Any notes..." />
              </Field>
            </div>

            {/* Hosted IP and Asset Tag section */}
            <div className="col-span-full pt-2 pb-1 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Extended Info</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <Field label="Hosted IP (Physical Host)">
                <input className="input-field font-mono" value={form.hosted_ip||''}
                  onChange={e => set('hosted_ip', e.target.value)} placeholder="10.0.0.1" />
                <p className="text-xs text-gray-400 mt-1">Physical server IP hosting this VM. Enables ESXi UI link in inventory.</p>
              </Field>

              <Field label="Asset Tag">
                <div className="space-y-1.5">
                  {availableTags.length > 0 ? (
                    <select className={`input-field ${tagValidation ? 'border-red-400' : tagValidation === false ? 'border-green-400' : ''}`}
                      value={form.asset_tag||''}
                      onChange={e => { set('asset_tag', e.target.value); validateTag(e.target.value); }}>
                      <option value="">Select available tag...</option>
                      {form.asset_tag && !availableTags.includes(form.asset_tag) && (
                        <option value={form.asset_tag}>{form.asset_tag} (current)</option>
                      )}
                      {availableTags.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  ) : (
                    <input className={`input-field font-mono ${tagValidation ? 'border-red-400' : tagValidation === false ? 'border-green-400' : ''}`}
                      value={form.asset_tag||''}
                      onChange={e => { set('asset_tag', e.target.value); validateTag(e.target.value); }}
                      placeholder={form.department_id ? 'Enter tag number' : 'Select dept first'} />
                  )}
                  {tagValidation && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={10}/> {tagValidation}</p>}
                  {tagValidation === false && <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle size={10}/> Tag available</p>}
                  {!form.department_id && <p className="text-xs text-gray-400">Select a department to see available tags for that team</p>}
                </div>
              </Field>
            </div>

            {/* â”€â”€ Grouped custom fields â”€â”€ */}
            {Object.entries(groupedCustomFields).map(([group, fields]) => (
              <React.Fragment key={group}>
                <SectionTitle title={group} />
                {fields.map(cf => (
                  <Field key={cf.id} label={cf.field_label}>
                    <RenderCustomField cf={cf} value={form.custom_field_values[cf.field_key]}
                      onChange={v => setCustom(cf.field_key, v)} disabled={!canWrite} />
                  </Field>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={loading || !canWrite || hasDupError || !!tagValidation} className="btn-primary">
            <PlusCircle size={16} />{loading ? 'Saving...' : editAsset ? 'Update Asset' : 'Add Asset'}
          </button>
          <button type="button" onClick={() => { setForm(INIT); setDupState({ ip: null }); setTagValidation(null); navigate('/add-asset'); }}
            className="btn-secondary">
            <RotateCcw size={16} /> Clear
          </button>
          <button type="button" onClick={() => navigate('/asset-list')} className="btn-secondary">
            View Inventory
          </button>
        </div>
      </form>
    </div>
  );
}


