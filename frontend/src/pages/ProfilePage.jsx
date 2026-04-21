import React, { useState, useRef, useEffect } from 'react';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDeleteConfirm } from '../context/DeleteConfirmContext';
import Toggle from '../components/Toggle';
import toast from 'react-hot-toast';
import {
  User, Camera, Trash2, Save, Eye, EyeOff,
  Lock, Shield, CheckCircle, AlertCircle,
  Pencil, BadgeCheck, Mail, AtSign, Calendar
} from 'lucide-react';

// ── Strength meter ────────────────────────────────────────────────────────────
function PasswordStrength({ password }) {
  if (!password) return null;
  const checks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'Contains uppercase',    pass: /[A-Z]/.test(password) },
    { label: 'Contains number',       pass: /\d/.test(password) },
    { label: 'Contains symbol',       pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.pass).length;
  const bar   = ['bg-red-400','bg-orange-400','bg-yellow-400','bg-green-500'][score - 1] || 'bg-gray-200';
  const label = ['','Weak','Fair','Good','Strong'][score];

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-1">
          {[1,2,3,4].map(i => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= score ? bar : 'bg-gray-200'}`} />
          ))}
        </div>
        <span className={`text-xs font-medium ${score >= 3 ? 'text-green-600' : score >= 2 ? 'text-yellow-600' : 'text-red-500'}`}>{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {checks.map(c => (
          <div key={c.label} className="flex items-center gap-1.5">
            {c.pass
              ? <CheckCircle size={11} className="text-green-500 flex-shrink-0" />
              : <AlertCircle size={11} className="text-gray-300 flex-shrink-0" />}
            <span className={`text-xs ${c.pass ? 'text-gray-600' : 'text-gray-400'}`}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Avatar display / upload ───────────────────────────────────────────────────
function AvatarSection({ user, onAvatarChange }) {
  const { requestDelete } = useDeleteConfirm();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const initials = [user.first_name, user.last_name]
    .filter(Boolean).map(s => s[0].toUpperCase()).join('') ||
    user.username?.[0]?.toUpperCase() || '?';

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2 MB'); return; }
    setUploading(true);
    try {
      const r = await authAPI.uploadAvatar(file);
      onAvatarChange(r.data.profile_pic);
      toast.success('Profile picture updated');
    } catch (err) { toast.error(err.response?.data?.error || 'Upload failed'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleRemove = () => {
    requestDelete('your profile picture', async () => {
      try {
        await authAPI.deleteAvatar();
        onAvatarChange('');
        toast.success('Profile picture removed');
      } catch { toast.error('Remove failed'); }
    });
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Avatar circle */}
      <div className="relative group">
        <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-lg bg-blue-800 flex items-center justify-center">
          {user.profile_pic ? (
            <img src={user.profile_pic} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-4xl font-bold text-white">{initials}</span>
          )}
        </div>
        {/* Camera overlay */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        >
          <Camera size={22} className="text-white" />
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
          className="hidden" onChange={handleFile} />
      </div>

      {/* Upload / remove buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="btn-secondary text-xs py-1.5"
        >
          <Camera size={13} /> {uploading ? 'Uploading…' : 'Change Photo'}
        </button>
        {user.profile_pic && (
          <button onClick={handleRemove} className="btn-danger text-xs py-1.5">
            <Trash2 size={13} /> Remove
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 text-center">PNG, JPG, WebP · max 2 MB</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user, refreshUser, updateUserLocally } = useAuth();

  // Profile form state
  const [profile, setProfile] = useState({
    first_name: '', last_name: '', job_role: ''
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form state
  const [pwForm, setPwForm]     = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [showPw, setShowPw]     = useState({ current: false, new: false, confirm: false });
  const [savingPw, setSavingPw] = useState(false);

  // Populate form from user
  useEffect(() => {
    if (user) {
      setProfile({
        first_name: user.first_name || '',
        last_name:  user.last_name  || '',
        job_role:   user.job_role   || '',
      });
    }
  }, [user]);

  const handleAvatarChange = (pic) => {
    updateUserLocally({ profile_pic: pic });
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const r = await authAPI.updateProfile(profile);
      updateUserLocally({
        first_name: r.data.user.first_name,
        last_name:  r.data.user.last_name,
        full_name:  r.data.user.full_name,
        job_role:   r.data.user.job_role,
      });
      toast.success('Profile updated successfully');
    } catch (err) { toast.error(err.response?.data?.error || 'Update failed'); }
    finally { setSavingProfile(false); }
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault();
    if (!pwForm.current_password) { toast.error('Enter your current password'); return; }
    if (pwForm.new_password.length < 6) { toast.error('New password must be at least 6 characters'); return; }
    if (pwForm.new_password !== pwForm.confirm_password) { toast.error('New passwords do not match'); return; }
    if (pwForm.current_password === pwForm.new_password) { toast.error('New password must differ from current'); return; }
    setSavingPw(true);
    try {
      await authAPI.changePassword({
        current_password: pwForm.current_password,
        new_password:     pwForm.new_password,
      });
      toast.success('Password changed successfully');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) { toast.error(err.response?.data?.error || 'Password change failed'); }
    finally { setSavingPw(false); }
  };

  const roleBadge = {
    admin:     'bg-red-100 text-red-700 border-red-200',
    readwrite: 'bg-blue-100 text-blue-700 border-blue-200',
    readonly:  'bg-gray-100 text-gray-600 border-gray-200',
  }[user?.role] || 'bg-gray-100 text-gray-600';

  const togglePw = (field) => setShowPw(p => ({ ...p, [field]: !p[field] }));

  if (!user) return null;

  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username;
  const initials    = [user.first_name, user.last_name]
    .filter(Boolean).map(s => s[0].toUpperCase()).join('') ||
    user.username?.[0]?.toUpperCase() || '?';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your personal information and account security</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left column: avatar + account info card ── */}
        <div className="xl:col-span-1 space-y-4">
          {/* Avatar card */}
          <div className="card">
            <AvatarSection user={user} onAvatarChange={handleAvatarChange} />
            <div className="mt-5 text-center space-y-1 border-t border-gray-100 pt-4">
              <p className="text-base font-semibold text-gray-800">{displayName}</p>
              {user.job_role && <p className="text-sm text-gray-500">{user.job_role}</p>}
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${roleBadge}`}>
                <Shield size={11} /> {user.role}
              </span>
            </div>
          </div>

          {/* Account details card */}
          <div className="card space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">Account Details</h3>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5 text-sm">
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <AtSign size={13} className="text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-400 leading-none">Username</p>
                  <p className="text-gray-800 font-medium font-mono text-xs break-all whitespace-normal">{user.username}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 text-sm">
                <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                  <Mail size={13} className="text-green-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-400 leading-none">Email</p>
                  <p className="text-gray-800 text-xs break-all whitespace-normal">{user.email}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 text-sm">
                <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                  <BadgeCheck size={13} className="text-purple-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-400 leading-none">Role</p>
                  <p className="text-gray-800 text-xs capitalize">{user.role}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 text-sm">
                <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                  <Calendar size={13} className="text-gray-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-400 leading-none">Member Since</p>
                  <p className="text-gray-800 text-xs">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column: forms ── */}
        <div className="xl:col-span-2 space-y-5">

          {/* Personal Information */}
          <div className="card">
            <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <User size={16} className="text-blue-700" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-800">Personal Information</h2>
                <p className="text-xs text-gray-400">Update your name and job role</p>
              </div>
            </div>

            <form onSubmit={handleProfileSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">First Name</label>
                  <input
                    className="input-field"
                    placeholder="John"
                    value={profile.first_name}
                    onChange={e => setProfile(p => ({ ...p, first_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Last Name</label>
                  <input
                    className="input-field"
                    placeholder="Doe"
                    value={profile.last_name}
                    onChange={e => setProfile(p => ({ ...p, last_name: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Job Role / Title</label>
                <input
                  className="input-field"
                  placeholder="e.g. Senior Infrastructure Engineer"
                  value={profile.job_role}
                  onChange={e => setProfile(p => ({ ...p, job_role: e.target.value }))}
                />
                <p className="text-xs text-gray-400 mt-1">Displayed on your profile card</p>
              </div>

              {/* Read-only fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1.5">Username <span className="text-gray-400 font-normal">(read-only)</span></label>
                  <input className="input-field bg-gray-50 text-gray-500 cursor-not-allowed font-mono text-xs" value={user.username} readOnly />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1.5">Email <span className="text-gray-400 font-normal">(read-only)</span></label>
                  <input className="input-field bg-gray-50 text-gray-500 cursor-not-allowed text-xs" value={user.email} readOnly />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button type="submit" disabled={savingProfile} className="btn-primary">
                  <Save size={15} />{savingProfile ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>

          {/* Change Password */}
          <div className="card">
            <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                <Lock size={16} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-800">Change Password</h2>
                <p className="text-xs text-gray-400">Keep your account secure with a strong password</p>
              </div>
            </div>

            <form onSubmit={handlePasswordSave} className="space-y-4">
              {/* Current Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
                <div className="relative">
                  <input
                    type={showPw.current ? 'text' : 'password'}
                    className="input-field pr-10"
                    placeholder="Enter current password"
                    name="current_password"
                    autoComplete="current-password"
                    value={pwForm.current_password}
                    onChange={e => setPwForm(p => ({ ...p, current_password: e.target.value }))}
                  />
                  <button type="button" onClick={() => togglePw('current')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPw.current ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div className="relative border-t border-gray-100 pt-4">
                {/* New Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                  <div className="relative">
                    <input
                      type={showPw.new ? 'text' : 'password'}
                      className="input-field pr-10"
                      placeholder="Min 6 characters"
                      name="new_password"
                      autoComplete="new-password"
                      value={pwForm.new_password}
                      onChange={e => setPwForm(p => ({ ...p, new_password: e.target.value }))}
                    />
                    <button type="button" onClick={() => togglePw('new')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPw.new ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <PasswordStrength password={pwForm.new_password} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showPw.confirm ? 'text' : 'password'}
                    className={`input-field pr-10 ${
                      pwForm.confirm_password && pwForm.new_password !== pwForm.confirm_password
                        ? 'border-red-400 focus:ring-red-400'
                        : pwForm.confirm_password && pwForm.new_password === pwForm.confirm_password
                          ? 'border-green-400 focus:ring-green-400'
                          : ''
                    }`}
                    placeholder="Re-enter new password"
                    value={pwForm.confirm_password}
                    onChange={e => setPwForm(p => ({ ...p, confirm_password: e.target.value }))}
                  />
                  <button type="button" onClick={() => togglePw('confirm')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPw.confirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {pwForm.confirm_password && (
                  <p className={`text-xs mt-1 flex items-center gap-1 ${
                    pwForm.new_password === pwForm.confirm_password ? 'text-green-600' : 'text-red-500'
                  }`}>
                    {pwForm.new_password === pwForm.confirm_password
                      ? <><CheckCircle size={11} /> Passwords match</>
                      : <><AlertCircle size={11} /> Passwords do not match</>}
                  </p>
                )}
              </div>

              <div className="flex justify-end pt-1">
                <button type="submit" disabled={savingPw} className="btn-primary bg-red-700 hover:bg-red-800">
                  <Lock size={15} />{savingPw ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>

          {/* Security tips */}
          <div className="card border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3">
              <Shield size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Security Tips</p>
                <ul className="mt-1.5 space-y-1 text-xs text-amber-700 list-disc list-inside">
                  <li>Use a unique password not used on other sites</li>
                  <li>Include uppercase letters, numbers, and symbols</li>
                  <li>Avoid using your name or username in your password</li>
                  <li>Change your password regularly — at least every 90 days</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

