import React, { useState, useEffect, useCallback } from 'react';
import { notificationsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Toggle from '../components/Toggle';
import toast from 'react-hot-toast';
import {
  Mail, Save, Send, Settings, Bell, FileText,
  Plus, Trash2, Eye, EyeOff, Shield, RefreshCw,
  CheckCircle, AlertTriangle, X, ChevronDown, ChevronUp, Tag
} from 'lucide-react';

// ── Template variable reference ───────────────────────────────────────────────
const VARIABLES = [
  '{{vm_name}}','{{ip_address}}','{{asset_type}}','{{department}}',
  '{{location}}','{{status}}','{{submitted_by}}','{{os_type}}',
  '{{os_version}}','{{serial}}','{{asset_tag}}',
];

// ── SMTP Tab ──────────────────────────────────────────────────────────────────
function SmtpTab({ smtp, onSave }) {
  const [form, setForm]   = useState({ host:'', port:587, secure:false, username:'', password:'', from_name:'InfraInventory', from_email:'' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo]   = useState('');
  const [showPw, setShowPw]   = useState(false);

  useEffect(() => { if (smtp && Object.keys(smtp).length) setForm(f => ({ ...f, ...smtp })); }, [smtp]);

  const set = (k,v) => setForm(p => ({ ...p, [k]: v }));
  const setPort = (port) => setForm((p) => ({ ...p, port, secure: port === 465 }));

  const handleSave = async () => {
    if (!form.host || !form.username) { toast.error('Host and username are required'); return; }
    setSaving(true);
    try { await notificationsAPI.saveSmtp(form); await onSave(); toast.success('SMTP settings saved'); }
    catch { toast.error('Save failed'); } finally { setSaving(false); }
  };

  const handleClear = async () => {
    setForm({ host:'', port:587, secure:false, username:'', password:'', from_name:'InfraInventory', from_email:'' });
    try { await notificationsAPI.saveSmtp({ host:'', port:587, secure:false, username:'', password:'', from_name:'InfraInventory', from_email:'' }); await onSave(); toast.success('SMTP settings cleared'); }
    catch { toast.error('Failed to clear settings'); }
  };

  const handleTest = async () => {
    if (!testTo.includes('@')) { toast.error('Enter a valid email'); return; }
    setTesting(true);
    try { await notificationsAPI.testSend({ to: testTo }); toast.success(`Test email sent to ${testTo}`); }
    catch (err) { toast.error(err.response?.data?.error || 'Test failed — check SMTP settings'); }
    finally { setTesting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
        <p className="font-semibold flex items-center gap-2"><Settings size={13}/> SMTP Configuration</p>
        <p className="mt-1">Configure your outgoing mail server. Supports Gmail, Outlook, custom SMTP servers or self-hosted mail (e.g. Postfix). Credentials are stored encrypted in the database.</p>
      </div>

      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4 text-sm flex items-center gap-2"><Mail size={14}/> Mail Server</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-5">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">SMTP Host <span className="text-red-500">*</span></label>
            <input className="input-field" placeholder="smtp.gmail.com" value={form.host} onChange={e=>set('host',e.target.value)}/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Port</label>
            <select className="input-field" value={form.port} onChange={e=>setPort(parseInt(e.target.value, 10))}>
              <option value={587}>587 — STARTTLS</option>
              <option value={465}>465 — SSL/TLS</option>
              <option value={25}>25 — Plain</option>
              <option value={2525}>2525 — Alt</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Username <span className="text-red-500">*</span></label>
            <input className="input-field" placeholder="user@example.com" value={form.username} onChange={e=>set('username',e.target.value)} autoComplete="off"/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} className="input-field pr-10" placeholder="••••••••"
                value={form.password} onChange={e=>set('password',e.target.value)} autoComplete="new-password"/>
              <button type="button" onClick={()=>setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Encryption</label>
            <div className="flex items-center gap-3 h-9">
              <Toggle checked={form.secure} onChange={v=>set('secure',v)}/>
              <span className="text-sm text-gray-600">{form.secure ? 'SSL/TLS (usually port 465)' : 'STARTTLS/Plain (usually port 587)'}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Use `SSL/TLS` with port `465`. Use `STARTTLS/Plain` with port `587` in most cases.</p>
          </div>
        </div>

        <h3 className="font-semibold text-gray-800 mb-3 text-sm flex items-center gap-2"><Mail size={14}/> From Address</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Sender Name</label>
            <input className="input-field" placeholder="InfraInventory" value={form.from_name} onChange={e=>set('from_name',e.target.value)}/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Sender Email</label>
            <input className="input-field" placeholder="noreply@example.com" value={form.from_email} onChange={e=>set('from_email',e.target.value)}/>
            <p className="text-xs text-gray-400 mt-1">Leave blank to use username as sender email</p>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            <Save size={14}/> {saving ? 'Saving…' : 'Save SMTP Settings'}
          </button>
          <button onClick={handleClear} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 hover:border-red-400 transition-colors disabled:opacity-50">
            <X size={14}/> Clear Settings
          </button>
        </div>
      </div>

      {/* Test send */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-3 text-sm flex items-center gap-2"><Send size={14} className="text-green-600"/> Test Connection</h3>
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Send test email to</label>
            <input className="input-field" type="email" placeholder="recipient@example.com"
              value={testTo} onChange={e=>setTestTo(e.target.value)}/>
          </div>
          <button onClick={handleTest} disabled={testing || !form.host} className="btn-primary">
            <Send size={14}/> {testing ? 'Sending…' : 'Send Test Email'}
          </button>
        </div>
        {!form.host && <p className="text-xs text-amber-600 mt-2 flex items-center gap-1"><AlertTriangle size={11}/> Save SMTP settings before testing</p>}
      </div>

      {/* Quick setup guides */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-3 text-sm">Quick Setup Guides</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {[
            { name:'Gmail', host:'smtp.gmail.com', port:587, note:'Enable "App Password" in Google Account settings' },
            { name:'Outlook / Microsoft 365', host:'smtp.office365.com', port:587, note:'Use your Microsoft 365 credentials' },
            { name:'Custom SMTP / Postfix', host:'localhost or mail.yourdomain.com', port:25, note:'Typically no auth required for localhost' },
          ].map(g => (
            <button key={g.name} onClick={()=>setForm(p=>({...p,host:g.host,port:g.port,secure:g.port===465}))}
              className="p-3 text-left border border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors">
              <p className="font-semibold text-gray-800">{g.name}</p>
              <p className="text-gray-500 font-mono mt-0.5">{g.host}:{g.port}</p>
              <p className="text-gray-400 mt-1 leading-tight">{g.note}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Templates Tab ─────────────────────────────────────────────────────────────
function TemplatesTab({ templates: initTemplates, onSave }) {
  const [templates, setTemplates] = useState([]);
  const [activeId, setActiveId]   = useState(null);
  const [saving, setSaving]       = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => { if (initTemplates?.length) { setTemplates(initTemplates); setActiveId(initTemplates[0].id); } }, [initTemplates]);

  const active = templates.find(t => t.id === activeId);
  const setField = (k,v) => setTemplates(p => p.map(t => t.id===activeId ? {...t,[k]:v} : t));

  const handleSave = async () => {
    setSaving(true);
    try { await notificationsAPI.saveTemplates(templates); await onSave(); toast.success('Templates saved'); }
    catch { toast.error('Save failed'); } finally { setSaving(false); }
  };

  const handlePreview = () => {
    if (!active) return;
    const sampleAsset = { vm_name:'SERVER-01', ip_address:'192.168.1.10', asset_type:'VM', department:'IT', location:'DC1', status:'Alive', submitted_by:'admin', os_type:'Linux', os_version:'Ubuntu 22.04', serial:'SRV-001', asset_tag:'IT-0042' };
    let html = active.body_html;
    Object.entries(sampleAsset).forEach(([k,v]) => { html = html.replaceAll(`{{${k}}}`, v); });
    setPreviewHtml(html);
    setShowPreview(true);
  };

  const insertVar = (v) => {
    if (!active) return;
    setField('body_html', (active.body_html||'') + v);
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-4">
        {/* Template selector sidebar */}
        <div className="w-48 flex-shrink-0 space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Templates</p>
          {templates.map(t => (
            <button key={t.id} onClick={()=>setActiveId(t.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeId===t.id?'bg-blue-100 text-blue-800 font-medium':'text-gray-600 hover:bg-gray-100'}`}>
              <FileText size={12} className="inline mr-1.5"/>{t.name}
            </button>
          ))}
        </div>

        {/* Editor */}
        {active ? (
          <div className="flex-1 card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 text-sm">{active.name}</h3>
              <div className="flex gap-2">
                <button onClick={handlePreview} className="btn-secondary text-xs py-1.5"><Eye size={12}/> Preview</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary text-xs py-1.5">
                  <Save size={12}/> {saving?'Saving…':'Save All'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Subject Line</label>
              <input className="input-field font-mono text-xs" value={active.subject||''} onChange={e=>setField('subject',e.target.value)} placeholder="Email subject…"/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">HTML Body</label>
              <textarea className="input-field font-mono text-xs leading-relaxed" rows={16}
                value={active.body_html||''} onChange={e=>setField('body_html',e.target.value)}/>
            </div>
            {/* Variable chips */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2 flex items-center gap-1"><Tag size={11}/> Insert Variable</label>
              <div className="flex flex-wrap gap-1.5">
                {VARIABLES.map(v => (
                  <button key={v} onClick={()=>insertVar(v)}
                    className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs rounded-full font-mono transition-colors">
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 card flex items-center justify-center text-gray-400 text-sm">Select a template to edit</div>
        )}
      </div>

      {/* Preview modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Eye size={16}/> Email Preview</h3>
              <button onClick={()=>setShowPreview(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X size={15}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <iframe srcDoc={previewHtml} title="email-preview" className="w-full h-full min-h-[400px] border border-gray-200 rounded-xl"/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Triggers Tab ──────────────────────────────────────────────────────────────
function TriggersTab({ triggers: initTriggers, templates, onSave }) {
  const [triggers, setTriggers] = useState([]);
  const [saving, setSaving]     = useState(false);
  const [recipientInputs, setRecipientInputs] = useState({});

  useEffect(() => { if (initTriggers?.length) setTriggers(initTriggers); }, [initTriggers]);

  const updateTrigger = (id, key, val) => setTriggers(p => p.map(t => t.id===id ? {...t,[key]:val} : t));

  const addRecipient = (triggerId) => {
    const val = (recipientInputs[triggerId]||'').trim();
    if (!val.includes('@')) { toast.error('Enter a valid email'); return; }
    const trigger = triggers.find(t => t.id===triggerId);
    if (trigger.recipients?.includes(val)) { toast.error('Already added'); return; }
    updateTrigger(triggerId, 'recipients', [...(trigger.recipients||[]), val]);
    setRecipientInputs(p => ({...p, [triggerId]: ''}));
  };

  const removeRecipient = (triggerId, email) => {
    const trigger = triggers.find(t => t.id===triggerId);
    updateTrigger(triggerId, 'recipients', trigger.recipients.filter(r => r!==email));
  };

  const handleSave = async () => {
    setSaving(true);
    try { await notificationsAPI.saveTriggers(triggers); await onSave(); toast.success('Notification triggers saved'); }
    catch { toast.error('Save failed'); } finally { setSaving(false); }
  };

  const TRIGGER_COLORS = {
    new_asset:     'bg-green-100 text-green-700',
    asset_updated: 'bg-blue-100 text-blue-700',
    new_ext_asset: 'bg-indigo-100 text-indigo-700',
    transfer:      'bg-amber-100 text-amber-700',
  };

  return (
    <div className="space-y-5">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
        <p className="font-semibold flex items-center gap-2"><Bell size={13}/> Notification Triggers</p>
        <p className="mt-1">Configure which events send email notifications, who receives them, and which template is used. Multiple recipients per event are supported.</p>
      </div>

      {triggers.map(trigger => (
        <div key={trigger.id} className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${TRIGGER_COLORS[trigger.event]||'bg-gray-100 text-gray-600'}`}>
                {trigger.label}
              </span>
              {trigger.enabled && trigger.recipients?.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle size={11}/> Active — {trigger.recipients.length} recipient{trigger.recipients.length!==1?'s':''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Toggle checked={trigger.enabled} onChange={v=>updateTrigger(trigger.id,'enabled',v)}/>
              <span className="text-xs text-gray-500">{trigger.enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>

          {/* Template selector */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Email Template</label>
            <select className="input-field text-xs w-full md:w-64"
              value={trigger.template_id||''}
              onChange={e=>updateTrigger(trigger.id,'template_id',e.target.value)}>
              {(templates||[]).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Recipients</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {(trigger.recipients||[]).map(email => (
                <span key={email} className="flex items-center gap-1.5 bg-blue-50 text-blue-800 text-xs px-2.5 py-1 rounded-full">
                  <Mail size={10}/> {email}
                  <button onClick={()=>removeRecipient(trigger.id, email)} className="text-blue-400 hover:text-red-500 ml-0.5"><X size={11}/></button>
                </span>
              ))}
              {(!trigger.recipients||trigger.recipients.length===0) && (
                <span className="text-xs text-gray-400 italic">No recipients added yet</span>
              )}
            </div>
            <div className="flex gap-2">
              <input type="email" className="input-field text-xs flex-1 max-w-xs" placeholder="Add recipient email…"
                value={recipientInputs[trigger.id]||''}
                onChange={e=>setRecipientInputs(p=>({...p,[trigger.id]:e.target.value}))}
                onKeyDown={e=>e.key==='Enter'&&addRecipient(trigger.id)}/>
              <button onClick={()=>addRecipient(trigger.id)} className="btn-secondary text-xs py-1.5 px-3">
                <Plus size={12}/> Add
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          <Save size={14}/> {saving?'Saving…':'Save All Triggers'}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function EmailNotificationsPage() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('smtp');
  const [config, setConfig]       = useState(null);
  const [loading, setLoading]     = useState(true);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try { const r = await notificationsAPI.getConfig(); setConfig(r.data); }
    catch { toast.error('Failed to load notification config'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <Shield size={40} className="text-gray-300 mb-3"/>
      <p className="text-gray-500">Admin access required</p>
    </div>
  );

  const TABS = [
    { key:'smtp',      label:'SMTP Setup',    icon:Settings },
    { key:'templates', label:'Templates',     icon:FileText },
    { key:'triggers',  label:'Triggers',      icon:Bell     },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-blue-800 rounded-xl flex items-center justify-center">
          <Mail size={18} className="text-white"/>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Email Notifications</h1>
          <p className="text-sm text-gray-500 mt-0.5">Send automatic emails when assets are added or updated</p>
        </div>
        <button onClick={fetchConfig} className="ml-auto p-2 text-gray-400 hover:text-gray-600 rounded-lg"><RefreshCw size={14}/></button>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key ? 'bg-white text-blue-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={14}/>{label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4 animate-pulse">{Array(3).fill(0).map((_,i)=><div key={i} className="card h-24 bg-gray-100"/>)}</div>
      ) : (
        <>
          {activeTab==='smtp'      && <SmtpTab      smtp={config?.smtp}           onSave={fetchConfig}/>}
          {activeTab==='templates' && <TemplatesTab templates={config?.templates} onSave={fetchConfig}/>}
          {activeTab==='triggers'  && <TriggersTab  triggers={config?.triggers}   templates={config?.templates} onSave={fetchConfig}/>}
        </>
      )}
    </div>
  );
}
