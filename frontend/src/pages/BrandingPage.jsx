import React, { useState, useEffect, useRef } from 'react';
import { settingsAPI } from '../services/api';
import { useBranding } from '../context/BrandingContext';
import toast from 'react-hot-toast';
import { Palette, Save, Upload, Trash2, Image, Eye } from 'lucide-react';

export default function BrandingPage() {
  const { updateBranding } = useBranding();
  const [form, setForm] = useState({ app_name: '', company_name: '', theme_color: '#1e40af', me_agent_icon_url: '', tenable_agent_icon_url: '' });
  const [logoData, setLogoData] = useState('');
  const [logoFilename, setLogoFilename] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewLogo, setPreviewLogo] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    settingsAPI.getBranding().then(r => {
      const d = r.data;
      setForm({ app_name: d.app_name || '', company_name: d.company_name || '', theme_color: d.theme_color || '#1e40af', me_agent_icon_url: d.me_agent_icon_url || '', tenable_agent_icon_url: d.tenable_agent_icon_url || '' });
      setLogoData(d.logo_data || '');
      setLogoFilename(d.logo_filename || '');
      setPreviewLogo(d.logo_data || '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsAPI.updateBranding(form);
      // Push to ConfigContext — updates footer, sidebar, document.title instantly everywhere
      updateBranding(form);
      toast.success('Branding saved — tool name updated across all pages.');
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const handleLogoSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2 MB'); return; }
    setUploading(true);
    try {
      const r = await settingsAPI.uploadLogo(file);
      setLogoData(r.data.logo_data);
      setLogoFilename(r.data.filename);
      setPreviewLogo(r.data.logo_data);
      toast.success('Logo uploaded!');
    } catch (err) { toast.error(err.response?.data?.error || 'Upload failed'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleLogoDelete = async () => {
    if (!confirm('Remove current logo?')) return;
    try {
      await settingsAPI.deleteLogo();
      setLogoData(''); setLogoFilename(''); setPreviewLogo('');
      toast.success('Logo removed');
    } catch { toast.error('Remove failed'); }
  };

  if (loading) return <div className="card h-48 animate-pulse bg-gray-100" />;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Palette size={20} className="text-blue-700" />
        <h1 className="text-2xl font-bold text-gray-800">Branding & Customization</h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Settings form */}
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-5">Application Settings</h2>
          <form onSubmit={handleSave} className="space-y-5">

            {/* Tool / Application Name — prominent */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <label className="block text-sm font-semibold text-blue-800 mb-1.5">
                🏷️ Tool Name <span className="text-blue-500 font-normal text-xs ml-1">(appears everywhere)</span>
              </label>
              <input
                className="input-field text-base font-semibold"
                placeholder="InfraInventory"
                value={form.app_name}
                onChange={e => setForm(p => ({ ...p, app_name: e.target.value }))}
              />
              <p className="text-xs text-blue-600 mt-1.5 leading-relaxed">
                Appears in: sidebar logo · browser tab title · login page · page footer
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Company Name</label>
              <input className="input-field" placeholder="Your Company" value={form.company_name}
                onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} />
              <p className="text-xs text-gray-400 mt-1">Shown on the login page subtitle</p>
            </div>

            {/* Logo upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Company Logo</label>
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-4">
                {previewLogo ? (
                  <div className="flex items-center gap-4">
                    <img src={previewLogo} alt="Logo preview" className="w-16 h-16 object-contain rounded-lg border border-gray-200 bg-gray-50 p-1" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-700">{logoFilename || 'Logo uploaded'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Click replace to upload a new file</p>
                      <div className="flex gap-2 mt-2">
                        <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary text-xs py-1.5">
                          <Upload size={12} /> Replace
                        </button>
                        <button type="button" onClick={handleLogoDelete} className="btn-danger text-xs py-1.5">
                          <Trash2 size={12} /> Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Image size={32} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500 mb-1">Upload your company logo</p>
                    <p className="text-xs text-gray-400 mb-3">PNG, JPG, SVG or WebP · Max 2 MB</p>
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                      className="btn-secondary text-sm">
                      <Upload size={14} />{uploading ? 'Uploading…' : 'Choose File'}
                    </button>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/jpg,image/gif,image/svg+xml,image/webp"
                  className="hidden" onChange={handleLogoSelect} />
              </div>
            </div>

            {/* Agent Icon URLs */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Agent Icon URLs</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                    {form.me_agent_icon_url && <img src={form.me_agent_icon_url} alt="ME" className="w-5 h-5 object-contain rounded" onError={e => e.target.style.display='none'} />}
                    ManageEngine Agent Icon URL
                  </label>
                  <input className="input-field text-xs font-mono" placeholder="https://…" value={form.me_agent_icon_url}
                    onChange={e => setForm(p => ({ ...p, me_agent_icon_url: e.target.value }))} />
                  <p className="text-xs text-gray-400 mt-1">Shown in the ME column of Asset Inventory</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                    {form.tenable_agent_icon_url && <img src={form.tenable_agent_icon_url} alt="Tenable" className="w-5 h-5 object-contain rounded" onError={e => e.target.style.display='none'} />}
                    Tenable Agent Icon URL
                  </label>
                  <input className="input-field text-xs font-mono" placeholder="https://…" value={form.tenable_agent_icon_url}
                    onChange={e => setForm(p => ({ ...p, tenable_agent_icon_url: e.target.value }))} />
                  <p className="text-xs text-gray-400 mt-1">Shown in the Tenable column of Asset Inventory</p>
                </div>
              </div>
            </div>

            <button type="submit" disabled={saving} className="btn-primary">
              <Save size={15} />{saving ? 'Saving…' : 'Save Settings'}
            </button>
          </form>
        </div>

        {/* Preview */}
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-5 flex items-center gap-2"><Eye size={15} /> Live Preview</h2>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Sidebar preview */}
            <div className="bg-gray-900 px-4 py-3 flex items-center gap-3">
              {previewLogo
                ? <img src={previewLogo} alt="logo" className="w-8 h-8 object-contain rounded" />
                : <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center text-white text-xs font-bold">⚙</div>}
              <span className="text-white text-sm font-semibold">{form.app_name || 'InfraInventory'}</span>
            </div>
            {/* Login preview */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-10 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-700 rounded-2xl mb-3">
                {previewLogo
                  ? <img src={previewLogo} alt="logo" className="w-10 h-10 object-contain" />
                  : <span className="text-white text-2xl">⚙</span>}
              </div>
              <p className="text-white font-bold text-lg">{form.app_name || 'InfraInventory'}</p>
              <p className="text-gray-400 text-sm">{form.company_name || 'Your Company'} · Infrastructure</p>
            </div>

            {/* Footer preview */}
            <div className="bg-white border-t border-gray-200 px-4 py-2 text-center">
              <p className="text-xs text-gray-400">
                © {new Date().getFullYear()} {form.app_name || 'InfraInventory'}. All rights reserved.
                {' '}|{' '}
                Developed by <span className="font-medium text-gray-500">Sharansakthi</span>
                {' – '}
                <span className="text-gray-400">Senior System Engineer</span>
              </p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700">
              The tool name updates instantly in the browser tab on save. The sidebar and login page
              update after a browser reload.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
