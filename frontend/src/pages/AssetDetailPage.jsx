import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { assetsAPI, auditAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { MEIcon, TenableIcon } from '../components/AgentIcon';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Edit2, Server, Monitor, Shield, Zap,
  CheckCircle, Power, AlertCircle, MapPin, Building2,
  HardDrive, Key, Tag, ExternalLink, RefreshCw, Layers
} from 'lucide-react';

const InfoRow = ({ label, value, mono, badge, badgeCls }) => (
  <div className="flex items-start py-2 border-b border-gray-50 last:border-0">
    <span className="text-xs font-medium text-gray-500 w-40 flex-shrink-0">{label}</span>
    {badge
      ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeCls||'bg-gray-100 text-gray-600'}`}>{value||'—'}</span>
      : <span className={`text-sm text-gray-800 flex-1 ${mono?'font-mono':''} ${!value?'text-gray-400 italic':''}`}>{value||'—'}</span>}
  </div>
);

const Section = ({ icon: Icon, title, color='text-blue-700', children }) => (
  <div className="card">
    <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
      <Icon size={15} className={color}/> {title}
    </h3>
    <div>{children}</div>
  </div>
);

const statusCls = (s) => ({
  'Alive':'bg-green-100 text-green-700','Powered Off':'bg-orange-100 text-orange-700','Not Alive':'bg-red-100 text-red-700'
}[s]||'bg-gray-100 text-gray-500');

const patchCls = (s) => ({
  'Auto':'bg-green-100 text-green-700','Manual':'bg-blue-100 text-blue-700',
  'Exception':'bg-amber-100 text-amber-700','EOL - No Patches':'bg-red-100 text-red-700',
  'On Hold':'bg-gray-100 text-gray-600','Onboard Pending':'bg-cyan-100 text-cyan-700',
}[s]||'bg-gray-100 text-gray-500');

const eolCls = (s) => ({
  'InSupport':'bg-green-100 text-green-700','EOL':'bg-orange-100 text-orange-700','Decom':'bg-red-100 text-red-700'
}[s]||'bg-gray-100 text-gray-500');

const oemCls = (s) => ({
  'YES':'bg-green-100 text-green-700','NO':'bg-red-100 text-red-600','NA':'bg-gray-100 text-gray-500'
}[s]||'bg-gray-100 text-gray-500');

export default function AssetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canWrite } = useAuth();
  const [asset, setAsset]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditDenied, setAuditDenied] = useState(false);

  const summarizeAudit = (log) => {
    if (log.action === 'create') return 'Asset created';
    if (log.action === 'delete') return 'Asset deleted';
    if (log.action === 'create-from-transfer') return 'Created from extended inventory transfer';
    if (log.action !== 'update') return log.action;

    const before = log.before_json || {};
    const after = log.after_json || {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changed = [];
    keys.forEach((k) => {
      if (k === 'updated_at') return;
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changed.push(k);
    });
    if (!changed.length) return 'Updated (no field diff available)';
    const preview = changed.slice(0, 5).join(', ');
    return `Updated ${changed.length} field${changed.length > 1 ? 's' : ''}: ${preview}${changed.length > 5 ? ', ...' : ''}`;
  };

  const fetchAsset = useCallback(async () => {
    setLoading(true);
    try {
      const r = await assetsAPI.getById(id);
      setAsset(r.data);
    } catch (err) {
      toast.error('Asset not found');
      navigate('/asset-list');
    } finally { setLoading(false); }
  }, [id, navigate]);

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    setAuditDenied(false);
    try {
      const r = await auditAPI.getEntityLogs('asset', id, { page: 1, limit: 20 });
      setAuditLogs(r.data.logs || []);
    } catch (err) {
      if (err?.response?.status === 403) setAuditDenied(true);
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchAsset(); fetchAuditLogs(); }, [fetchAsset, fetchAuditLogs]);

  if (loading) return (
    <div className="max-w-5xl mx-auto animate-pulse space-y-4">
      {Array(3).fill(0).map((_, i) => <div key={i} className="card h-32 bg-gray-100"/>)}
    </div>
  );
  if (!asset) return null;

  const customEntries = Object.entries(asset.custom_field_values || {}).filter(([,v]) => v !== '' && v !== null && v !== undefined);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={18}/>
          </button>
          <div className="w-10 h-10 bg-blue-800 rounded-xl flex items-center justify-center">
            <Server size={20} className="text-white"/>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">{asset.vm_name || asset.os_hostname || `Asset #${asset.id}`}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <code className="text-sm font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{asset.ip_address}</code>
              {asset.server_status && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCls(asset.server_status)}`}>
                  {asset.server_status}
                </span>
              )}
              {asset.asset_tag && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium font-mono">
                  #{asset.asset_tag}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAsset} className="btn-secondary text-xs p-2" title="Refresh">
            <RefreshCw size={14}/>
          </button>
          <button
            onClick={() => navigate(`/audit-explorer?q=${encodeURIComponent(asset.ip_address||asset.vm_name||'')}&entity_type=asset`)}
            className="btn-secondary text-xs flex items-center gap-1"
            title="View full audit trail"
          >
            <Layers size={13}/> Audit Trail
          </button>
          {canWrite && (
            <button onClick={() => navigate('/asset-list', { state: { editAssetId: asset.id, tab: 'add' } })}
              className="btn-primary text-xs">
              <Edit2 size={13}/> Edit Asset
            </button>
          )}
        </div>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label:'Asset Type',  value: asset.asset_type,     cls:'bg-blue-50 text-blue-800' },
          { label:'OS',          value: `${asset.os_type||''}${asset.os_version?' · '+asset.os_version:''}` || '—', cls:'bg-violet-50 text-violet-800' },
          { label:'Department',  value: asset.department,     cls:'bg-teal-50 text-teal-800' },
          { label:'Location',    value: asset.location,       cls:'bg-amber-50 text-amber-800' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-3 ${s.cls}`}>
            <p className="text-xs opacity-70 mb-0.5">{s.label}</p>
            <p className="text-sm font-bold leading-tight">{s.value || '—'}</p>
          </div>
        ))}
      </div>

      {/* Detail sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Basic Info */}
        <Section icon={Server} title="Basic Information">
          <InfoRow label="VM Name"       value={asset.vm_name}       mono/>
          <InfoRow label="OS Hostname"   value={asset.os_hostname}   mono/>
          <InfoRow label="IP Address"    value={asset.ip_address}    mono/>
          <InfoRow label="Asset Type"    value={asset.asset_type}/>
          <InfoRow label="OS Type"       value={asset.os_type}/>
          <InfoRow label="OS Version"    value={asset.os_version}/>
        </Section>

        {/* Ownership */}
        <Section icon={Building2} title="Ownership" color="text-teal-700">
          <InfoRow label="Assigned User"   value={asset.assigned_user}/>
          <InfoRow label="Department"      value={asset.department}/>
          <InfoRow label="Business Purpose"value={asset.business_purpose}/>
          <InfoRow label="Asset Tag"       value={asset.asset_tag}       mono/>
          <InfoRow label="Serial Number"   value={asset.serial_number}   mono/>
        </Section>

        {/* Status & Patching */}
        <Section icon={Shield} title="Status & Patching" color="text-green-700">
          <InfoRow label="Server Status"  value={asset.server_status}     badge badgeCls={statusCls(asset.server_status)}/>
          <InfoRow label="Patching Type"  value={asset.patching_type}     badge badgeCls={patchCls(asset.patching_type)}/>
          <InfoRow label="Patch Schedule" value={asset.patching_schedule}/>
          <InfoRow label="Patch Type"     value={asset.server_patch_type}/>
          <InfoRow label="Location"       value={asset.location}/>
          <InfoRow label="EOL Status"     value={asset.eol_status}        badge badgeCls={eolCls(asset.eol_status)}/>
        </Section>

        {/* Agents */}
        <Section icon={Zap} title="Agent Status" color="text-amber-600">
          <div className="flex items-center py-2 border-b border-gray-50">
            <span className="text-xs font-medium text-gray-500 w-40 flex-shrink-0">ManageEngine</span>
            <MEIcon installed={asset.me_installed_status} size={20}/>
            <span className="ml-2 text-sm text-gray-700">{asset.me_installed_status ? 'Installed' : 'Not Installed'}</span>
          </div>
          <div className="flex items-center py-2 border-b border-gray-50">
            <span className="text-xs font-medium text-gray-500 w-40 flex-shrink-0">Tenable</span>
            <TenableIcon installed={asset.tenable_installed_status} size={20}/>
            <span className="ml-2 text-sm text-gray-700">{asset.tenable_installed_status ? 'Installed' : 'Not Installed'}</span>
          </div>
        </Section>

        {/* Host Details */}
        <Section icon={HardDrive} title="Host Details" color="text-violet-700">
          <InfoRow label="iDRAC" value={asset.idrac_enabled ? `Enabled${asset.idrac_ip?' ('+asset.idrac_ip+')':''}` : 'Disabled'}/>
          <InfoRow label="OME Status" value={asset.oem_status} badge badgeCls={oemCls(asset.oem_status)}/>
          <div className="py-2 border-b border-gray-50 flex items-start">
            <span className="text-xs font-medium text-gray-500 w-40 flex-shrink-0">Hosted IP</span>
            {asset.hosted_ip
              ? <div className="flex items-center gap-2">
                  <button onClick={() => navigate(`/physical-assets?ip=${encodeURIComponent(asset.hosted_ip)}`)}
                    className="text-sm font-mono text-blue-700 hover:underline flex items-center gap-1">
                    <Server size={12}/>{asset.hosted_ip}
                  </button>
                  <a href={`https://${asset.hosted_ip}/ui/#/login`} target="_blank" rel="noopener noreferrer"
                    className="p-0.5 text-gray-400 hover:text-blue-600" title="Open ESXi UI">
                    <ExternalLink size={12}/>
                  </a>
                </div>
              : <span className="text-sm text-gray-400 italic">—</span>}
          </div>
        </Section>

        {/* Credentials */}
        <Section icon={Key} title="Credentials" color="text-rose-700">
          <InfoRow label="Username" value={asset.asset_username} mono/>
          <div className="flex items-center py-2 border-b border-gray-50">
            <span className="text-xs font-medium text-gray-500 w-40 flex-shrink-0">Password</span>
            <span className="text-sm font-mono text-gray-400 tracking-widest">••••••••</span>
            <span className="ml-2 text-xs text-gray-400">(view in list)</span>
          </div>
        </Section>

        {/* Additional Remarks - full width */}
        {asset.additional_remarks && (
          <div className="card md:col-span-2">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Layers size={15} className="text-gray-500"/> Additional Remarks
            </h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{asset.additional_remarks}</p>
          </div>
        )}

        {/* Custom fields - full width */}
        {customEntries.length > 0 && (
          <div className="card md:col-span-2">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Tag size={15} className="text-purple-600"/> Custom Fields
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8">
              {customEntries.map(([key, val]) => (
                <InfoRow key={key} label={key.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
                  value={val === true ? 'Yes' : val === false ? 'No' : String(val)}/>
              ))}
            </div>
          </div>
        )}

        <div className="card md:col-span-2">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Layers size={15} className="text-blue-600"/> Audit Trail
          </h3>
          {auditLoading ? (
            <p className="text-sm text-gray-400">Loading audit history...</p>
          ) : auditDenied ? (
            <p className="text-sm text-amber-600">You do not have permission to view audit history for this entity.</p>
          ) : auditLogs.length === 0 ? (
            <p className="text-sm text-gray-400">No audit entries yet.</p>
          ) : (
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div key={log.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-800">{summarizeAudit(log)}</p>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {log.created_at ? new Date(log.created_at).toLocaleString('en-GB',{ day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    By: <strong>{log.actor_username || 'system'}</strong>
                    {log.ip_address ? ` · IP: ${log.ip_address}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 flex items-center justify-between text-xs text-gray-400 border-t border-gray-100 pt-4">
        <p>Submitted by <strong>{asset.submitted_by||'—'}</strong></p>
        <p>
          Created: {asset.created_at ? new Date(asset.created_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}
          {asset.updated_at && asset.updated_at !== asset.created_at && (
            <span className="ml-3">Updated: {new Date(asset.updated_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
          )}
        </p>
      </div>
    </div>
  );
}
