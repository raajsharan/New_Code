import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { extendedInventoryAPI, dropdownsAPI, settingsAPI } from '../services/api';
import { displayText, isBlankLike } from '../services/displayText';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useDeleteConfirm } from '../context/DeleteConfirmContext';
import { RenderCustomField } from '../components/CustomFieldEditor';
import { MEIcon, TenableIcon } from '../components/AgentIcon';
import AssetTagWidget from '../components/AssetTagWidget';
import Toggle from '../components/Toggle';
import toast from 'react-hot-toast';
import {
  PlusCircle, RotateCcw, Upload, Download, List, Plus,
  Search, Edit2, Trash2, ChevronLeft, ChevronRight,
  Eye, EyeOff, RefreshCw, ExternalLink, Server, Layers,
  AlertTriangle, CheckCircle
} from 'lucide-react';

// 
// Field layout (mirrors AssetListCombinedPage exactly)
// 
const DEFAULT_FIELD_LAYOUT = {
  vm_name:{group:'Basic Information',sort:1}, os_hostname:{group:'Basic Information',sort:2},
  ip_address:{group:'Basic Information',sort:3}, asset_type_id:{group:'Basic Information',sort:4},
  os_type_id:{group:'Basic Information',sort:5}, os_version_id:{group:'Basic Information',sort:6},
  assigned_user:{group:'Ownership',sort:1}, department_id:{group:'Ownership',sort:2},
  business_purpose:{group:'Ownership',sort:3}, asset_tag:{group:'Ownership',sort:4},
  server_status_id:{group:'Status & Patching',sort:1}, server_patch_type_id:{group:'Status & Patching',sort:2},
  patching_schedule_id:{group:'Status & Patching',sort:3}, patching_type_id:{group:'Status & Patching',sort:4},
  location_id:{group:'Status & Patching',sort:5}, eol_status:{group:'Status & Patching',sort:6},
  status:{group:'Status & Patching',sort:7},
  me_installed_status:{group:'Agent Status',sort:1}, tenable_installed_status:{group:'Agent Status',sort:2},
  serial_number:{group:'Host Details',sort:1}, idrac_enabled:{group:'Host Details',sort:2},
  idrac_ip:{group:'Host Details',sort:3}, oem_status:{group:'Host Details',sort:4},
  asset_username:{group:'Credentials',sort:1}, asset_password:{group:'Credentials',sort:2},
  hosted_ip:{group:'Host Details',sort:5}, description:{group:'Extended Info',sort:2}, additional_remarks:{group:'Extended Info',sort:3},
};
const GROUP_ORDER = ['Basic Information','Ownership','Status & Patching','Agent Status','Host Details','Credentials','Extended Info'];

// 
// Shared sub-components (mirrors AssetListCombined)
// 
const EXT_INIT = {
  vm_name:'', os_hostname:'', ip_address:'',
  asset_type_id:'', os_type_id:'', os_version_id:'',
  assigned_user:'', department_id:'', business_purpose:'',
  server_status_id:'', me_installed_status:false, tenable_installed_status:false,
  patching_schedule_id:'', patching_type_id:'', server_patch_type_id:'',
  location_id:'', eol_status:'',
  serial_number:'', idrac_enabled:false, idrac_ip:'', oem_status:'',
  asset_username:'', asset_password:'',
  hosted_ip:'', asset_tag:'', status:'Active',
  description:'', additional_remarks:'',
  custom_field_values:{},
};

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

const StatusBadge = ({ s }) => {
  const safe = displayText(s, '');
  if (!safe) return <span className="text-gray-400 text-xs">-</span>;
  const cls = {'Alive':'bg-green-100 text-green-700','Powered Off':'bg-orange-100 text-orange-700','Not Alive':'bg-red-100 text-red-700','Active':'bg-green-100 text-green-700','Inactive':'bg-gray-100 text-gray-500','Decommissioned':'bg-red-100 text-red-600','Maintenance':'bg-amber-100 text-amber-700'}[safe]||'bg-gray-100 text-gray-500';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{safe}</span>;
};

const PatchBadge = ({ s }) => {
  const safe = displayText(s, '');
  if (!safe) return <span className="text-gray-400 text-xs">-</span>;
  const cls = {'Auto':'bg-green-100 text-green-700','Manual':'bg-blue-100 text-blue-700','Exception':'bg-amber-100 text-amber-700','Beijing IT Team':'bg-purple-100 text-purple-700','EOL - No Patches':'bg-red-100 text-red-700','Onboard Pending':'bg-cyan-100 text-cyan-700','On Hold':'bg-gray-100 text-gray-600'}[safe]||'bg-gray-100 text-gray-500';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{safe}</span>;
};

function PasswordCell({ password, canView }) {
  const [show, setShow] = useState(false);
  if (isBlankLike(password)) return <span className="text-gray-400 text-xs">-</span>;
  if (!canView) return <span className="text-gray-300 text-xs font-mono">********</span>;
  const safePassword = displayText(password, '');
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-xs text-gray-700">{show?safePassword:'********'}</span>
      <button type="button" onClick={()=>setShow(!show)} className="p-0.5 text-gray-400 hover:text-gray-600">{show?<EyeOff size={11}/>:<Eye size={11}/>}</button>
    </div>
  );
}

// 
// NameConversionModal  Popup for name conversion guide
// 
function NameConversionModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">Name Conversion Guide</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">X</button>
        </div>
        <div className="space-y-3 text-sm text-gray-700">
          <div>
            <p className="font-semibold text-gray-900 mb-1">Site:</p>
            <p className="text-gray-600">BUR, TOR, HYD, LHR, BJS, MUC, AWSE1, AZWE2, GCPUSC1</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900 mb-1">OS:</p>
            <p className="text-gray-600">L (Linux), W (Windows), E (ESXi), M (Mac OS)</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900 mb-1">Team:</p>
            <p className="text-gray-600">DEV, QAT, LAB, TO, QAT, DVO, SNP, PLT, SEC, PSE, NEA</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900 mb-1">Tier:</p>
            <p className="text-gray-600">P (Prod), D (Dev), S (Stage), T (Test), C (Customer), G (General)</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900 mb-1">ID:</p>
            <p className="text-gray-600">4-digit number</p>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 bg-blue-50 p-3 rounded">
            <p className="font-semibold text-gray-900 mb-2">Example:</p>
            <p className="font-mono text-sm">HYD + L + DEV + P + 0001 <span className="text-gray-400">-&gt;</span> <span className="font-bold text-blue-700">HYDLDEVP0001</span></p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="mt-6 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Close</button>
      </div>
    </div>
  );
}

// 
// renderExtFormGroups  mirrors AssetListCombinedPage renderFormGroups
// 
function renderExtFormGroups({ layout, form, set, dropdowns, osVersions, canWrite, showPw, setShowPw, dupState, checking, tagValidation, setTagValidation, editItem, handleIPChange, oemOptions, fieldTypeOverrides, customFields = [], setCustom = () => {}, setShowNameConversion }) {
  const getOverride = (key) => { const o = fieldTypeOverrides?.[key]; if (!o || !o.type) return null; return o; };
  const renderOverridableText = (key, label, inputJsx) => {
    const o = getOverride(key);
    if (!o) return inputJsx;
    const opts = (o.options || []).filter(Boolean);
    if (o.type === 'dropdown') return <Field key={key} label={o.label||label}><select className="input-field" value={form[key]} onChange={e=>set(key,e.target.value)}><option value="">Select...</option>{opts.map(opt=><option key={opt} value={opt}>{opt}</option>)}</select></Field>;
    if (o.type === 'radio') return <Field key={key} label={o.label||label}><div className="flex flex-wrap gap-3 pt-1">{opts.map(opt=><label key={opt} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700"><input type="radio" name={key} value={opt} checked={form[key]===opt} onChange={()=>set(key,opt)} className="accent-blue-600 w-4 h-4"/>{opt}</label>)}</div></Field>;
    return inputJsx;
  };

  const groupMap = {};
  for (const [key, cfg] of Object.entries(layout)) {
    const g = cfg.group || 'General';
    if (!groupMap[g]) groupMap[g] = [];
    groupMap[g].push({ key, sort: cfg.sort || 99 });
  }
  for (const g of Object.keys(groupMap)) groupMap[g].sort((a,b)=>a.sort-b.sort);
  const cfGroupMap = {};
  (customFields || []).forEach(cf => {
    const g = cf.field_group || 'General';
    if (!cfGroupMap[g]) cfGroupMap[g] = [];
    cfGroupMap[g].push(cf);
  });

  const allGroups = [...new Set([...GROUP_ORDER, ...Object.keys(groupMap), ...Object.keys(cfGroupMap)])];

  const renderField = (key) => {
    switch (key) {
      case 'vm_name':       return renderOverridableText('vm_name','VM / Asset Name',<Field key={key} label={getOverride('vm_name')?.label||'VM / Asset Name'}><input className="input-field" value={form.vm_name} onChange={e=>set('vm_name',e.target.value)} placeholder="SWITCH-CORE-01"/></Field>);
      case 'os_hostname':   return (
        <Field key={key} label="OS Hostname">
          <input className="input-field" value={form.os_hostname} onChange={e=>set('os_hostname',e.target.value)} placeholder="switch-core-01.local"/>
          <p className="text-xs text-gray-500 mt-2">
            <button type="button" onClick={()=>setShowNameConversion(true)} className="text-blue-600 hover:text-blue-700 font-semibold underline inline-flex items-center gap-1">
              <ExternalLink size={11}/> Name Conversion
            </button>
          </p>
        </Field>
      );
      case 'ip_address':    return (
        <Field key={key} label="IP Address">
          <input className={`input-field ${dupState?'border-red-400':dupState===false?'border-green-400':''}`} value={form.ip_address} onChange={e=>handleIPChange(e.target.value)} placeholder="10.0.0.1"/>
          {checking&&<p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><span className="inline-block w-3 h-3 border border-t-transparent rounded-full animate-spin border-gray-400"/>Checking...</p>}
          {dupState===false&&<p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle size={11}/> Available</p>}
        </Field>
      );
      case 'asset_type_id': return <Field key={key} label="Asset Type"><select className="input-field" value={form.asset_type_id} onChange={e=>set('asset_type_id',e.target.value)}><option value="">Select...</option>{(dropdowns.asset_types||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>;
      case 'os_type_id':    return <Field key={key} label="OS Type"><select className="input-field" value={form.os_type_id} onChange={e=>set('os_type_id',e.target.value)}><option value="">Select...</option>{(dropdowns.os_types||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>;
      case 'os_version_id': return <Field key={key} label="OS Version"><select className="input-field" value={form.os_version_id} onChange={e=>set('os_version_id',e.target.value)} disabled={!form.os_type_id}><option value="">{form.os_type_id?'Select version...':'Select OS Type first'}</option>{osVersions.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>;
      case 'assigned_user': return renderOverridableText('assigned_user','Assigned User',<Field key={key} label={getOverride('assigned_user')?.label||'Assigned User'}><input className="input-field" value={form.assigned_user} onChange={e=>set('assigned_user',e.target.value)} placeholder="john.doe"/></Field>);
      case 'department_id': return <Field key={key} label="Department"><select className="input-field" value={form.department_id} onChange={e=>set('department_id',e.target.value)}><option value="">Select...</option>{(dropdowns.departments||[]).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>;
      case 'business_purpose': return renderOverridableText('business_purpose','Business Purpose',<Field key={key} label={getOverride('business_purpose')?.label||'Business Purpose'}><input className="input-field" value={form.business_purpose} onChange={e=>set('business_purpose',e.target.value)} placeholder="Core switch"/></Field>);
      case 'asset_tag':     return (
        <div key={key} className="col-span-full">
          <label className="block text-sm font-medium text-gray-700 mb-0.5">Asset Tag</label>
          <AssetTagWidget departmentId={form.department_id} departments={dropdowns.departments||[]} value={form.asset_tag} onChange={tag=>set('asset_tag',tag)} onValidation={err=>setTagValidation(err)} excludeAssetId={editItem?.id} disabled={!canWrite}/>
        </div>
      );
      case 'server_status_id':      return <Field key={key} label="Server Status"><select className="input-field" value={form.server_status_id} onChange={e=>set('server_status_id',e.target.value)}><option value="">Select...</option>{(dropdowns.server_status||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>;
      case 'server_patch_type_id':  return <Field key={key} label="Server Patch Type"><select className="input-field" value={form.server_patch_type_id} onChange={e=>set('server_patch_type_id',e.target.value)}><option value="">Select...</option>{(dropdowns.server_patch_types||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>;
      case 'patching_schedule_id':  return <Field key={key} label="Patching Schedule"><select className="input-field" value={form.patching_schedule_id} onChange={e=>set('patching_schedule_id',e.target.value)}><option value="">Select...</option>{(dropdowns.patching_schedules||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>;
      case 'patching_type_id':      return <Field key={key} label="Patching Type"><select className="input-field" value={form.patching_type_id} onChange={e=>set('patching_type_id',e.target.value)}><option value="">Select...</option>{(dropdowns.patching_types||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>;
      case 'location_id':           return <Field key={key} label="Location"><select className="input-field" value={form.location_id} onChange={e=>set('location_id',e.target.value)}><option value="">Select...</option>{(dropdowns.locations||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>;
      case 'eol_status': {
        const eolOverride = getOverride('eol_status');
        const eolOptions = (eolOverride?.options || ['InSupport', 'EOL', 'Decom', 'Not Applicable']).filter(Boolean);
        return (
          <Field key={key} label={eolOverride?.label || 'EOL Status'}>
            <select className="input-field" value={form.eol_status} onChange={e=>set('eol_status',e.target.value)}>
              <option value="">Select...</option>
              {eolOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </Field>
        );
      }
      case 'status':                return <Field key={key} label="Record Status"><select className="input-field" value={form.status} onChange={e=>set('status',e.target.value)}>{['Active','Inactive','Decommissioned','Maintenance'].map(s=><option key={s} value={s}>{s}</option>)}</select></Field>;
      case 'me_installed_status':   return <Field key={key} label="ManageEngine Installed"><div className="flex items-center gap-3 h-9"><Toggle checked={form.me_installed_status} onChange={v=>set('me_installed_status',v)} disabled={!canWrite}/><span className="text-sm text-gray-600">{form.me_installed_status?'Installed':'Not Installed'}</span></div></Field>;
      case 'tenable_installed_status': return <Field key={key} label="Tenable Installed"><div className="flex items-center gap-3 h-9"><Toggle checked={form.tenable_installed_status} onChange={v=>set('tenable_installed_status',v)} disabled={!canWrite}/><span className="text-sm text-gray-600">{form.tenable_installed_status?'Installed':'Not Installed'}</span></div></Field>;
      case 'serial_number':         return <Field key={key} label="Serial Number"><input className="input-field" value={form.serial_number} onChange={e=>set('serial_number',e.target.value)} placeholder="SRV-001"/></Field>;
      case 'idrac_enabled':         return (
        <Field key={key} label="iDRAC">
          <div className="flex items-center gap-3 h-9">
            <Toggle checked={form.idrac_enabled} onChange={v=>set('idrac_enabled',v)} disabled={!canWrite}/>
            <span className="text-sm text-gray-600">{form.idrac_enabled?'Yes':'No'}</span>
          </div>
        </Field>
      );
      case 'idrac_ip':    return form.idrac_enabled ? <Field key={key} label="iDRAC IP Address"><input className="input-field font-mono" value={form.idrac_ip} onChange={e=>set('idrac_ip',e.target.value)} placeholder="10.0.0.100"/></Field> : null;
      case 'oem_status':  return form.idrac_enabled ? (
        <Field key={key} label="OME Status">
          <select className="input-field" value={form.oem_status} onChange={e=>set('oem_status',e.target.value)}>
            <option value="">Select...</option>
            {(oemOptions||[]).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      ) : null;
      case 'asset_username': return <Field key={key} label="Asset Username"><input className="input-field" value={form.asset_username} onChange={e=>set('asset_username',e.target.value)} placeholder="admin"/></Field>;
      case 'asset_password': return (
        <Field key={key} label="Asset Password">
          <div className="relative">
            <input type={showPw?'text':'password'} className="input-field pr-10" value={form.asset_password} onChange={e=>set('asset_password',e.target.value)} placeholder="********"/>
            <button type="button" onClick={()=>setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{showPw?<EyeOff size={15}/>:<Eye size={15}/>}</button>
          </div>
        </Field>
      );
      case 'hosted_ip':          return <Field key={key} label="Hosted IP (Physical Host)" hint="Physical/ESXi server IP"><input className="input-field font-mono" value={form.hosted_ip} onChange={e=>set('hosted_ip',e.target.value)} placeholder="10.0.0.1"/></Field>;
      case 'description':        return renderOverridableText('description','Description',<div key={key} className="col-span-full"><Field label={getOverride('description')?.label||'Description'}><textarea className="input-field" rows={2} value={form.description} onChange={e=>set('description',e.target.value)} placeholder="Short record description..."/></Field></div>);
      case 'additional_remarks': return renderOverridableText('additional_remarks','Additional Remarks',<div key={key} className="col-span-full"><Field label={getOverride('additional_remarks')?.label||'Additional Remarks'}><textarea className="input-field" rows={3} value={form.additional_remarks} onChange={e=>set('additional_remarks',e.target.value)} placeholder="Any notes..."/></Field></div>);
      default: return null;
    }
  };

  return allGroups.flatMap(group => {
    const fields = groupMap[group];
    const cfFields = cfGroupMap[group] || [];
    const hasBuiltIn = fields?.length > 0;
    const hasCustom = cfFields.length > 0;
    if (!hasBuiltIn && !hasCustom) return [];
    const builtInItems = hasBuiltIn ? fields.map(f => renderField(f.key)).filter(Boolean) : [];
    const customItems = cfFields.map(cf => (
      <Field key={cf.id} label={cf.field_label}>
        <RenderCustomField cf={cf} value={form.custom_field_values[cf.field_key]} onChange={v => setCustom(cf.field_key, v)} disabled={!canWrite}/>
      </Field>
    ));
    const allItems = [...builtInItems, ...customItems];
    if (!allItems.length) return [];
    return [
      <SectionTitle key={`st-${group}`} title={group}/>,
      ...allItems,
    ];
  });
}

// 
// ADD EXTENDED ASSET tab  layout-driven, mirrors Add Asset exactly
// 
function AddExtTab({ onSaved, editItem, onClearEdit }) {
  const { canWrite } = useAuth();
  const { configVersion } = useConfig();
  const [form, setForm]             = useState(EXT_INIT);
  const [dropdowns, setDropdowns]   = useState({});
  const [osVersions, setOsVersions] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [fieldLayout, setFieldLayout]   = useState(null);
  const [oemOptions, setOemOptions]     = useState([
    { value:'YES', label:'YES  OME Support Active' },
    { value:'NO',  label:'NO  OME Support Expired' },
    { value:'NA',  label:'NA  Not Applicable' },
  ]);
  const [fieldTypeOverrides, setFieldTypeOverrides] = useState({});
  const [loading, setLoading]       = useState(false);
  const [showPw, setShowPw]         = useState(false);
  const [dupState, setDupState]     = useState(null);
  const [checking, setChecking]     = useState(false);
  const [tagValidation, setTagValidation] = useState(null);
  const [csvFile, setCsvFile]       = useState(null);
  const [importing, setImporting]   = useState(false);
  const [showNameConversion, setShowNameConversion] = useState(false);
  const ipTimer = useRef(null);

  const fetchMeta = useCallback(async () => {
    try {
      const [dd, cf, layout, oem] = await Promise.all([
        dropdownsAPI.getAll(),
        extendedInventoryAPI.getCustomFields(),
        settingsAPI.getFieldLayout(),
        settingsAPI.getOmeOptions(),
      ]);
      setDropdowns(dd.data);
      setCustomFields(cf.data.filter(f => f.is_active));
      setFieldLayout(layout.data && Object.keys(layout.data).length > 0 ? { ...DEFAULT_FIELD_LAYOUT, ...layout.data } : DEFAULT_FIELD_LAYOUT);
      if (oem.data?.length) setOemOptions(oem.data);
      const ft = await settingsAPI.getBuiltinFieldTypes('asset').catch(()=>({data:{}}));
      setFieldTypeOverrides(ft.data || {});
    } catch { setFieldLayout(DEFAULT_FIELD_LAYOUT); }
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta, configVersion]);
  useEffect(() => {
    if (editItem) setForm({ ...EXT_INIT, ...editItem, custom_field_values: editItem.custom_field_values||{} });
    else setForm(EXT_INIT);
  }, [editItem]);

  useEffect(() => {
    const v = form.os_type_id ? (dropdowns.os_versions||[]).filter(v=>v.os_type_id===parseInt(form.os_type_id)) : [];
    setOsVersions(v);
  }, [form.os_type_id, dropdowns.os_versions]);

  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const setCustom = (k,v) => setForm(p=>({...p,custom_field_values:{...p.custom_field_values,[k]:v}}));

  const checkDup = async (ip) => {
    if (!ip?.trim()) { setDupState(null); return; }
    setChecking(true);
    try {
      const r = await extendedInventoryAPI.checkDuplicate({ip_address:ip.trim(),exclude_id:editItem?.id});
      setDupState(r.data.duplicate ? r.data.errors[0] : false);
    } catch { setDupState(null); } finally { setChecking(false); }
  };
  const handleIPChange = (v) => { set('ip_address',v); clearTimeout(ipTimer.current); ipTimer.current=setTimeout(()=>checkDup(v),700); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canWrite||dupState||tagValidation) { toast.error(dupState?'Fix duplicate IP':tagValidation||'Fix errors'); return; }
    setLoading(true);
    try {
      const payload = {
        ...form,
        asset_name: form.vm_name||form.os_hostname,
        asset_type: dropdowns.asset_types?.find(t=>String(t.id)===String(form.asset_type_id))?.name||'',
        department_id:form.department_id||null, location_id:form.location_id||null,
        asset_type_id:form.asset_type_id||null, os_type_id:form.os_type_id||null,
        os_version_id:form.os_version_id||null, server_status_id:form.server_status_id||null,
        patching_schedule_id:form.patching_schedule_id||null, patching_type_id:form.patching_type_id||null,
        server_patch_type_id:form.server_patch_type_id||null,
      };
      if (editItem) { await extendedInventoryAPI.update(editItem.id,payload); toast.success('Record updated'); }
      else          { await extendedInventoryAPI.create(payload);             toast.success('Record added'); }
      setForm(EXT_INIT); setDupState(null); setTagValidation(null); onSaved();
    } catch(err) {
      const msg = err.response?.data?.error||'Failed';
      if (err.response?.data?.duplicate) toast.error('Duplicate IP: '+msg,{duration:6000});
      else toast.error(msg);
    } finally { setLoading(false); }
  };

  const handleImport = async () => {
    if (!csvFile) { toast.error('Select an Excel/CSV file'); return; }
    setImporting(true);
    try {
      const r=await extendedInventoryAPI.importCSV(csvFile);
      toast.success(`Imported ${r.data.success}${r.data.skipped>0?`, ${r.data.skipped} skipped`:''}`);
      setCsvFile(null); onSaved();
    } catch(err) { toast.error(err.response?.data?.error||'Import failed'); } finally { setImporting(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{editItem?`Editing: ${editItem.vm_name||editItem.asset_name||'Record #'+editItem.id}`:'Fill in the details to add a new extended inventory record'}</p>
        <div className="flex items-center gap-2">
          {!editItem && (
            <>
              <button onClick={async()=>{try{const r=await extendedInventoryAPI.downloadTemplate();const url=URL.createObjectURL(new Blob([r.data]));const a=document.createElement('a');a.href=url;a.download='extended_inventory_template.csv';a.click();URL.revokeObjectURL(url);}catch{toast.error('Download failed');}}} className="btn-secondary text-xs"><Download size={13}/> Template</button>
              <label className="btn-secondary text-xs cursor-pointer"><Upload size={13}/>{csvFile?csvFile.name.slice(0,14)+'':'Select File'}<input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e=>setCsvFile(e.target.files[0])}/></label>
              {csvFile&&<button onClick={handleImport} disabled={importing} className="btn-success text-xs">{importing?'Importing...':'Import'}</button>}
            </>
          )}
          {editItem&&<button onClick={()=>{setForm(EXT_INIT);onClearEdit();}} className="btn-secondary text-xs"><RotateCcw size={13}/> Cancel Edit</button>}
        </div>
      </div>

      <NameConversionModal isOpen={showNameConversion} onClose={()=>setShowNameConversion(false)}/>

      {!canWrite&&<div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">Read-only access.</div>}
      {dupState&&<div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2"><AlertTriangle size={16}/> {dupState}</div>}

      <form onSubmit={handleSubmit}>
        <div className="card mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {renderExtFormGroups({
              layout: fieldLayout || DEFAULT_FIELD_LAYOUT,
              form, set, dropdowns, osVersions,
              canWrite, showPw, setShowPw,
              dupState, checking,
              tagValidation, setTagValidation,
              editItem,
              handleIPChange,
              oemOptions,
              fieldTypeOverrides,
              customFields,
              setCustom,
              setShowNameConversion,
            })}
          </div>
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={loading||!canWrite||!!dupState||!!tagValidation} className="btn-primary">
            <PlusCircle size={16}/>{loading?'Saving...':editItem?'Update Record':'Add Record'}
          </button>
          <button type="button" onClick={()=>{setForm(EXT_INIT);setDupState(null);setTagValidation(null);if(editItem)onClearEdit();}} className="btn-secondary"><RotateCcw size={16}/> Clear</button>
        </div>
      </form>
    </div>
  );
}

// 
//  Default column order + visibility for Ext Asset List 
const EXT_COL_DEFAULTS = [
  {key:'os_hostname',visible:true},{key:'asset_type',visible:true},{key:'os_type',visible:true},
  {key:'os_version',visible:true},{key:'assigned_user',visible:true},{key:'department',visible:true},
  {key:'server_status',visible:true},{key:'status',visible:true},{key:'patching_type',visible:true},
  {key:'server_patch_type',visible:true},{key:'patching_schedule',visible:true},{key:'location',visible:true},
  {key:'serial_number',visible:true},{key:'idrac',visible:true},{key:'oem_status',visible:true},{key:'eol_status',visible:true},
  {key:'me_installed',visible:true},{key:'tenable_installed',visible:true},{key:'hosted_ip',visible:true},
  {key:'asset_tag',visible:true},{key:'business_purpose',visible:false},{key:'additional_remarks',visible:false},
  {key:'asset_username',visible:false},{key:'asset_password',visible:false},{key:'submitted_by',visible:false},
  {key:'updated_at',visible:true},
];

function mergeExtColConfig(saved){
  if(!saved||!saved.length) return EXT_COL_DEFAULTS;
  const savedMap=Object.fromEntries(saved.map((s,i)=>[s.key,{...s,order:i}]));
  const merged=EXT_COL_DEFAULTS.map((d,i)=>({...d,visible:savedMap[d.key]!==undefined?savedMap[d.key].visible:d.visible,order:savedMap[d.key]!==undefined?savedMap[d.key].order:999+i}));
  return merged.sort((a,b)=>a.order-b.order);
}

// EXTENDED LIST tab  same columns as Asset Inventory
// 
function ExtListTab({ onEdit, refreshKey }) {
  const { canWrite, user, canViewPage } = useAuth();
  const ROW_LIMIT_OPTIONS = [50, 80, 100, 150, 200];
  const canViewPw = user?.can_view_passwords || user?.role === 'admin' || user?.role === 'superadmin';
  const { configVersion } = useConfig();
  const navigate = useNavigate();
  const [items, setItems]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [limit, setLimit]         = useState(50);
  const [loading, setLoading]     = useState(true);
  const [exporting, setExporting] = useState(false);
  const [dropdowns, setDropdowns] = useState({});
  const [customFields, setCustomFields] = useState([]);
  const [colConfig, setColConfig]  = useState(EXT_COL_DEFAULTS);
  const [filters, setFilters]     = useState({search:'',location:'',department:'',server_status:'',asset_type:''});
  const { requestDelete } = useDeleteConfirm();
  const [showBulkModal,  setShowBulkModal]  = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkDryRunning, setBulkDryRunning] = useState(false);
  const [bulkPatch, setBulkPatch] = useState({
    assigned_user:'', department_id:'', server_status_id:'', patching_type_id:'',
    patching_schedule_id:'', location_id:'', eol_status:'', status:'',
  });
  const [bulkJob, setBulkJob] = useState(null);

  const fetchMeta = useCallback(async () => {
    try {
      const [dd,cf,colR]=await Promise.all([
        dropdownsAPI.getAll(),
        extendedInventoryAPI.getCustomFields(),
        settingsAPI.getColumnConfig('ext').catch(()=>({data:[]})),
      ]);
      setDropdowns(dd.data);
      setCustomFields(cf.data.filter(f=>f.is_active));
      setColConfig(mergeExtColConfig(colR.data));
    } catch {}
  },[]);
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params={page,limit,...filters};
      Object.keys(params).forEach(k=>{if(!params[k])delete params[k];});
      const r=await extendedInventoryAPI.getAll(params);
      setItems(r.data.items); setTotal(r.data.total);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  },[page,limit,filters]);

  useEffect(()=>{fetchMeta();},[fetchMeta,configVersion]);
  useEffect(()=>{fetchItems();},[fetchItems,configVersion,refreshKey]);

  const setFilter=(k,v)=>{setFilters(p=>({...p,[k]:v}));setPage(1);};
  const handleDelete=(item)=>{requestDelete(item.vm_name||item.asset_name||item.ip_address||'this item',async()=>{try{await extendedInventoryAPI.delete(item.id);toast.success('Deleted');fetchItems();}catch(err){toast.error(err.response?.data?.error||'Failed');}});};

  const handleExport=async()=>{setExporting(true);try{const r=await extendedInventoryAPI.exportCSV({...filters});const url=URL.createObjectURL(new Blob([r.data],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=`extended-inventory-${new Date().toISOString().split('T')[0]}.csv`;a.click();URL.revokeObjectURL(url);toast.success('Exported');}catch{toast.error('Export failed');}finally{setExporting(false);}};

  const canBulkUpdate = canWrite && canViewPage('ext-asset-bulk-update');
  const setBulkField = (k, v) => setBulkPatch(prev => ({ ...prev, [k]: v }));
  const resetBulkPatch = () => setBulkPatch({ assigned_user:'', department_id:'', server_status_id:'', patching_type_id:'', patching_schedule_id:'', location_id:'', eol_status:'', status:'' });

  const pollBulkJob = async (jobId) => {
    for (let i = 0; i < 20; i++) {
      const jr = await extendedInventoryAPI.getBulkJob(jobId);
      const j = jr.data?.job;
      if (!j) break;
      setBulkJob(j);
      if (j.status !== 'pending' && j.status !== 'running') return j;
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    return null;
  };

  const handleBulkUpdate = async (dryRun = false) => {
    const patch = {};
    Object.entries(bulkPatch).forEach(([k, v]) => {
      if (k === 'assigned_user') { if (String(v || '').trim()) patch[k] = String(v).trim(); return; }
      if (v !== '' && v !== null && v !== undefined) patch[k] = v;
    });
    if (!Object.keys(patch).length) return toast.error('Select at least one field to update');
    if (!dryRun && !confirm('Apply this bulk update to all records matching current filters?')) return;

    const activeFilters = { ...filters };
    Object.keys(activeFilters).forEach(k => { if (!activeFilters[k]) delete activeFilters[k]; });

    if (dryRun) setBulkDryRunning(true); else setBulkSubmitting(true);
    try {
      const r = await extendedInventoryAPI.bulkUpdate({ filters: activeFilters, patch, dry_run: dryRun });
      const initial = r.data || {};
      if (initial.job_id) setBulkJob({ id:initial.job_id, status:initial.status, total_count:initial.matched_count, success_count:initial.success_count||0, failed_count:initial.failed_count||0 });

      if (dryRun) {
        toast.success(`Dry run complete: ${Number(initial.matched_count||0)} records would be targeted`);
      } else {
        const finalJob = initial.job_id ? await pollBulkJob(initial.job_id) : null;
        const effective = finalJob || initial;
        toast.success(`Bulk update finished: ${Number(effective.success_count||0)} updated${Number(effective.failed_count||0)?`, ${Number(effective.failed_count)} failed`:''}`);
        setShowBulkModal(false);
        resetBulkPatch();
        fetchItems();
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || (dryRun ? 'Dry run failed' : 'Bulk update failed'));
    } finally {
      if (dryRun) setBulkDryRunning(false); else setBulkSubmitting(false);
    }
  };

  const totalPages=Math.ceil(total/limit);
  const COL_VM=160,COL_IP=120;
  const renderCustomVal=(item,cf)=>{const raw=item.custom_field_values?.[cf.field_key];if(isBlankLike(raw))return<span className="text-gray-400 text-xs">-</span>;if(cf.field_type==='toggle')return raw?<span className="text-green-600 text-xs">Yes</span>:<span className="text-gray-400 text-xs">No</span>;return<span className="text-xs text-gray-700">{displayText(raw)}</span>;};

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">{total} records</p>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Rows</label>
            <select
              className="input-field py-1 text-xs min-w-[88px]"
              value={limit}
              onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}>
              {ROW_LIMIT_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          {canBulkUpdate && <button onClick={()=>setShowBulkModal(true)} className="btn-secondary text-xs"><PlusCircle size={13}/> Bulk Update</button>}
          <button onClick={handleExport} disabled={exporting} className="btn-secondary text-xs"><Download size={13}/>{exporting?'Exporting...':'Export CSV'}</button>
          <button onClick={fetchItems} className="btn-secondary text-xs"><RefreshCw size={13}/> Refresh</button>
        </div>
      </div>
      {bulkJob && (
        <div className="mb-3 text-xs rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800">
          Bulk job #{bulkJob.id}: <span className="font-semibold">{bulkJob.status}</span>
          {bulkJob.total_count !== undefined && ` - total ${bulkJob.total_count}`}
          {bulkJob.success_count !== undefined && ` - updated ${bulkJob.success_count}`}
          {bulkJob.failed_count !== undefined && ` - failed ${bulkJob.failed_count}`}
        </div>
      )}
      <div className="card mb-4">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="relative xl:col-span-2"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input className="input-field pl-8" placeholder="VM name, hostname, IP, user" value={filters.search} onChange={e=>setFilter('search',e.target.value)}/></div>
          <select className="input-field" value={filters.location} onChange={e=>setFilter('location',e.target.value)}><option value="">All Locations</option>{(dropdowns.locations||[]).map(l=><option key={l.id} value={l.name}>{l.name}</option>)}</select>
          <select className="input-field" value={filters.department} onChange={e=>setFilter('department',e.target.value)}><option value="">All Departments</option>{(dropdowns.departments||[]).map(d=><option key={d.id} value={d.name}>{d.name}</option>)}</select>
          <select className="input-field" value={filters.server_status} onChange={e=>setFilter('server_status',e.target.value)}><option value="">All Statuses</option>{(dropdowns.server_status||[]).map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</select>
          <select className="input-field" value={filters.asset_type} onChange={e=>setFilter('asset_type',e.target.value)}><option value="">All Types</option>{(dropdowns.asset_types||[]).map(t=><option key={t.id} value={t.name}>{t.name}</option>)}</select>
        </div>
      </div>
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={()=>!bulkSubmitting&&setShowBulkModal(false)}>
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-2xl p-5" onClick={e=>e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Bulk Update Ext. Assets</h3>
                <p className="text-xs text-gray-500 mt-1">Applies to records matching current filters.</p>
              </div>
              <button type="button" className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={()=>!bulkSubmitting&&setShowBulkModal(false)}>x</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Assigned User</label><input className="input-field" value={bulkPatch.assigned_user} onChange={e=>setBulkField('assigned_user',e.target.value)} placeholder="ops.team"/></div>
              <div><label className="block text-xs text-gray-500 mb-1">Department</label><select className="input-field" value={bulkPatch.department_id} onChange={e=>setBulkField('department_id',e.target.value)}><option value="">No change</option>{(dropdowns.departments||[]).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-1">Server Status</label><select className="input-field" value={bulkPatch.server_status_id} onChange={e=>setBulkField('server_status_id',e.target.value)}><option value="">No change</option>{(dropdowns.server_status||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-1">Patching Type</label><select className="input-field" value={bulkPatch.patching_type_id} onChange={e=>setBulkField('patching_type_id',e.target.value)}><option value="">No change</option>{(dropdowns.patching_types||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-1">Patching Schedule</label><select className="input-field" value={bulkPatch.patching_schedule_id} onChange={e=>setBulkField('patching_schedule_id',e.target.value)}><option value="">No change</option>{(dropdowns.patching_schedules||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-1">Location</label><select className="input-field" value={bulkPatch.location_id} onChange={e=>setBulkField('location_id',e.target.value)}><option value="">No change</option>{(dropdowns.locations||[]).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-1">EOL Status</label><select className="input-field" value={bulkPatch.eol_status} onChange={e=>setBulkField('eol_status',e.target.value)}><option value="">No change</option><option value="InSupport">In Support</option><option value="EOL">EOL</option><option value="Decom">Decommissioned</option><option value="Not Applicable">Not Applicable</option></select></div>
              <div><label className="block text-xs text-gray-500 mb-1">Record Status</label><select className="input-field" value={bulkPatch.status} onChange={e=>setBulkField('status',e.target.value)}><option value="">No change</option><option value="Active">Active</option><option value="Inactive">Inactive</option><option value="Decommissioned">Decommissioned</option><option value="Maintenance">Maintenance</option></select></div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn-secondary text-xs" onClick={()=>{resetBulkPatch();setShowBulkModal(false);}} disabled={bulkSubmitting||bulkDryRunning}>Cancel</button>
              <button type="button" className="btn-secondary text-xs" onClick={()=>handleBulkUpdate(true)} disabled={bulkSubmitting||bulkDryRunning}>{bulkDryRunning?'Running Dry Run...':'Dry Run'}</button>
              <button type="button" className="btn-primary text-xs" onClick={()=>handleBulkUpdate(false)} disabled={bulkSubmitting||bulkDryRunning}>{bulkSubmitting?'Applying...':'Apply Bulk Update'}</button>
            </div>
          </div>
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[62vh]">
          <table className="w-full text-sm" style={{borderCollapse:'separate',borderSpacing:0}}>
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-30">
              <tr>
                <th className="table-th bg-gray-50 z-40 border-r border-gray-200" style={{position:'sticky',left:0,minWidth:COL_VM}}>VM Name</th>
                <th className="table-th bg-gray-50 z-40 border-r border-gray-200" style={{position:'sticky',left:COL_VM,minWidth:COL_IP}}>IP Address</th>
                {colConfig.filter(c=>c.visible&&c.key!=='actions').map(c=>{
                  const labels={os_hostname:'Hostname',asset_type:'Asset Type',os_type:'OS',os_version:'OS Version',assigned_user:'Assigned User',department:'Dept',server_status:'Srv Status',status:'Rec Status',patching_type:'Patch Type',server_patch_type:'Ser. Patch Type',patching_schedule:'Schedule',location:'Location',serial_number:'Serial',idrac:'iDRAC',oem_status:'OME',eol_status:'EOL',me_installed:'ME',tenable_installed:'Tenable',hosted_ip:'Hosted IP',asset_tag:'Asset Tag',business_purpose:'Business Purpose',additional_remarks:'Add. Remark',asset_username:'Username',asset_password:'Password',submitted_by:'Submitted By',updated_at:'Last Modified'};
                  return <th key={c.key} className="table-th bg-gray-50 z-30">{labels[c.key]||c.key}</th>;
                })}
                {customFields.map(cf=><th key={cf.field_key} className="table-th bg-gray-50 z-30">{cf.field_label}</th>)}
                <th className="table-th bg-gray-50 z-30 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading?Array(5).fill(0).map((_,i)=><tr key={i} className="animate-pulse"><td className="table-td bg-white" style={{position:'sticky',left:0}}><div className="h-4 bg-gray-100 rounded"/></td><td className="table-td bg-white" style={{position:'sticky',left:COL_VM}}><div className="h-4 bg-gray-100 rounded"/></td>{colConfig.filter(c=>c.visible&&c.key!=='actions').map((_,j)=><td key={j} className="table-td"><div className="h-4 bg-gray-100 rounded"/></td>)}{customFields.map(cf=><td key={cf.field_key} className="table-td"><div className="h-4 bg-gray-100 rounded"/></td>)}<td className="table-td"><div className="h-4 bg-gray-100 rounded"/></td></tr>)
              :items.length===0?<tr><td colSpan={2+colConfig.filter(c=>c.visible&&c.key!=='actions').length+customFields.length+1} className="text-center py-16 text-gray-400"><Layers size={32} className="mx-auto mb-2 opacity-20"/><p className="font-medium">No extended inventory records</p></td></tr>
              :items.map(item=>(
                <tr key={item.id} className="hover:bg-blue-50/20">
                  <td className="table-td font-mono text-xs font-semibold text-blue-800 bg-white border-r border-gray-100" style={{position:'sticky',left:0,minWidth:COL_VM}}>
                    {!isBlankLike(item.vm_name||item.asset_name)?<button onClick={()=>navigate(`/ext-assets/${item.id}`)} className="hover:underline text-indigo-700 text-left w-full">{displayText(item.vm_name||item.asset_name)}</button>:<span className="text-gray-400">-</span>}
                  </td>
                  <td className="table-td font-mono text-xs bg-white border-r border-gray-100" style={{position:'sticky',left:COL_VM,minWidth:COL_IP}}>
                    {!isBlankLike(item.ip_address)?<button onClick={()=>navigate(`/ext-assets/${item.id}`)} className="hover:underline text-indigo-700 font-medium">{displayText(item.ip_address)}</button>:<span className="text-gray-400">-</span>}
                  </td>
                  {colConfig.filter(c=>c.visible&&c.key!=='actions').map(c=>{
                    switch(c.key){
                      case 'os_hostname':    return <td key={c.key} className="table-td font-mono text-xs">{displayText(item.os_hostname)}</td>;
                      case 'asset_type':     return <td key={c.key} className="table-td text-xs">{displayText(item.asset_type)}</td>;
                      case 'os_type':        return <td key={c.key} className="table-td text-xs">{displayText(item.os_type)}</td>;
                      case 'os_version':     return <td key={c.key} className="table-td text-xs max-w-[130px] truncate">{displayText(item.os_version)}</td>;
                      case 'assigned_user':  return <td key={c.key} className="table-td text-xs">{displayText(item.assigned_user)}</td>;
                      case 'department':     return <td key={c.key} className="table-td text-xs">{displayText(item.department)}</td>;
                      case 'server_status':  return <td key={c.key} className="table-td"><StatusBadge s={item.server_status}/></td>;
                      case 'status':         return <td key={c.key} className="table-td"><StatusBadge s={item.status}/></td>;
                      case 'patching_type':  return <td key={c.key} className="table-td"><PatchBadge s={item.patching_type}/></td>;
                      case 'server_patch_type': return <td key={c.key} className="table-td text-xs">{displayText(item.server_patch_type)}</td>;
                      case 'patching_schedule': return <td key={c.key} className="table-td text-xs">{displayText(item.patching_schedule)}</td>;
                      case 'location':       return <td key={c.key} className="table-td text-xs">{displayText(item.location)}</td>;
                      case 'serial_number':  return <td key={c.key} className="table-td font-mono text-xs">{displayText(item.serial_number)}</td>;
                      case 'idrac':          return <td key={c.key} className="table-td text-xs">{item.idrac_enabled?<span className="text-green-700 text-xs font-medium" title={item.idrac_ip||''}>Yes{item.idrac_ip?` (${item.idrac_ip})`:''}</span>:<span className="text-gray-400 text-xs">No</span>}</td>;
                      case 'oem_status':     return <td key={c.key} className="table-td">{item.oem_status?<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.oem_status==='YES'?'bg-green-100 text-green-700':item.oem_status==='NO'?'bg-red-100 text-red-600':'bg-gray-100 text-gray-500'}`}>{item.oem_status}</span>:<span className="text-gray-400 text-xs">-</span>}</td>;
                      case 'eol_status':     return <td key={c.key} className="table-td text-xs"><span className={item.eol_status==='InSupport'?'text-green-700':item.eol_status==='EOL'?'text-orange-600':'text-red-600'}>{displayText(item.eol_status)}</span></td>;
                      case 'me_installed':   return <td key={c.key} className="table-td"><MEIcon installed={item.me_installed_status} size={18}/></td>;
                      case 'tenable_installed': return <td key={c.key} className="table-td"><TenableIcon installed={item.tenable_installed_status} size={18}/></td>;
                      case 'hosted_ip':      return <td key={c.key} className="table-td">{!isBlankLike(item.hosted_ip)?<div className="flex items-center gap-1"><button onClick={()=>navigate(`/physical-assets?ip=${encodeURIComponent(displayText(item.hosted_ip,''))}`)} className="text-xs font-mono text-blue-700 hover:underline flex items-center gap-1"><Server size={11}/>{displayText(item.hosted_ip)}</button><a href={`https://${displayText(item.hosted_ip,'')}/ui/#/login`} target="_blank" rel="noopener noreferrer" className="p-0.5 text-gray-400 hover:text-blue-600"><ExternalLink size={11}/></a></div>:<span className="text-gray-400 text-xs">-</span>}</td>;
                      case 'asset_tag':      return <td key={c.key} className="table-td font-mono text-xs font-medium text-purple-700">{displayText(item.asset_tag)}</td>;
                      case 'business_purpose': return <td key={c.key} className="table-td text-xs text-gray-500 max-w-[140px] truncate">{displayText(item.business_purpose||item.description)}</td>;
                      case 'additional_remarks': return <td key={c.key} className="table-td text-xs text-gray-600 max-w-[160px] truncate" title={displayText(item.additional_remarks, '')}>{displayText(item.additional_remarks)}</td>;
                      case 'asset_username': return <td key={c.key} className="table-td font-mono text-xs">{displayText(item.asset_username)}</td>;
                      case 'asset_password': return <td key={c.key} className="table-td"><PasswordCell password={item.asset_password} canView={canViewPw}/></td>;
                      case 'submitted_by':   return <td key={c.key} className="table-td text-xs text-gray-500">{displayText(item.submitted_by)}</td>;
                      case 'updated_at':     return <td key={c.key} className="table-td text-xs text-gray-400 whitespace-nowrap">{item.updated_at?new Date(item.updated_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'-'}</td>;
                      default: return null;
                    }
                  })}
                  {customFields.map(cf=><td key={cf.field_key} className="table-td">{renderCustomVal(item,cf)}</td>)}
                  <td className="table-td">
                    <div className="flex gap-1 justify-center">
                      <button onClick={()=>onEdit(item)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors" title="Edit"><Edit2 size={13}/></button>
                      {canWrite&&<button onClick={()=>handleDelete(item)} className="p-1.5 text-red-500 hover:bg-red-100 rounded transition-colors" title="Delete"><Trash2 size={13}/></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages>1&&(
          <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between bg-gray-50">
            <p className="text-xs text-gray-500">Showing {(page-1)*limit+1}-{Math.min(page*limit,total)} of {total}</p>
            <div className="flex items-center gap-1">
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="p-1.5 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100"><ChevronLeft size={13}/></button>
              {Array.from({length:Math.min(7,totalPages)},(_,i)=>{const pg=page<=4?i+1:page-3+i;if(pg<1||pg>totalPages)return null;return<button key={pg} onClick={()=>setPage(pg)} className={`px-3 py-1 text-xs rounded border ${pg===page?'bg-blue-800 text-white border-blue-800':'border-gray-300 hover:bg-gray-100'}`}>{pg}</button>;})}
              <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="p-1.5 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100"><ChevronRight size={13}/></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 
// COMBINED PAGE
// 
export default function ExtAssetListCombinedPage() {
  const { canViewPage } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'list';
  const [activeTab, setActiveTab] = useState(
    (requestedTab === 'add' && !canViewPage('ext-asset-list-add')) ? 'list' : requestedTab
  );
  const [editItem, setEditItem]   = useState(null);

  // Handle navigation from ExtAssetDetailPage "Edit" button
  useEffect(() => {
    const state = location.state;
    if (state?.editItemId) {
      extendedInventoryAPI.getById(state.editItemId).then(r => {
        setEditItem(r.data);
        setActiveTab('add');
        setSearchParams({ tab: 'add' });
      }).catch(() => {});
      window.history.replaceState({}, '', window.location.href);
    }
  }, []); // eslint-disable-line
  const [refreshKey, setRefreshKey] = useState(0);

  const switchTab = (tab) => { setActiveTab(tab); setSearchParams({tab}); };

  const handleEdit = (item) => { setEditItem(item); switchTab('add'); };
  const handleSaved = () => { setEditItem(null); setRefreshKey(k=>k+1); switchTab('list'); };

  const TABS = [
    { key:'add',  label:'Add New Ext. Asset',   icon:Plus },
    { key:'list', label:'Ext. Asset Inventory',  icon:List },
  ];

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-800">Ext. Asset List</h1>
        <p className="text-sm text-gray-500 mt-0.5">Extended inventory  switches, printers, UPS, and other network devices</p>
      </div>
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {TABS.filter(t => t.key==='list' ? canViewPage('ext-asset-list-inventory') : canViewPage('ext-asset-list-add')).map(({key,label,icon:Icon})=>(
          <button key={key} onClick={()=>switchTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab===key?'bg-white text-blue-800 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
            <Icon size={15}/>{label}
          </button>
        ))}
      </div>
      {activeTab==='add' && <AddExtTab editItem={editItem} onSaved={handleSaved} onClearEdit={()=>setEditItem(null)}/>}
      {activeTab==='list' && <ExtListTab onEdit={handleEdit} refreshKey={refreshKey}/>}
    </div>
  );
}

