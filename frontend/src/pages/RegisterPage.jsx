import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '', full_name: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username || !form.email || !form.password) {
      toast.error('All fields required');
      return;
    }
    setLoading(true);
    try {
      await authAPI.register(form);
      await login({ username: form.username, password: form.password });
      navigate('/dashboard');
      toast.success('Account created! You have read-only access.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #1a2332 0%, #223046 55%, #2d8b8b 100%)' }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold" style={{ color: '#f1faee' }}>
            InfraInventory
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(241, 250, 238, 0.76)' }}>
            Create a new enterprise account
          </p>
        </div>

        <div
          className="rounded-3xl p-8 border"
          style={{
            background: 'rgba(255,255,255,0.94)',
            borderColor: 'rgba(168, 218, 220, 0.42)',
            boxShadow: '0 24px 60px rgba(12, 20, 34, 0.28)',
          }}
        >
          <h2 className="text-2xl font-semibold mb-2" style={{ color: '#1a2332' }}>
            Register
          </h2>
          <p className="text-sm mb-6" style={{ color: 'rgba(26, 35, 50, 0.62)' }}>
            Provision a new account for controlled access
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { label: 'Full Name', key: 'full_name', type: 'text', placeholder: 'John Doe', required: false },
              { label: 'Username', key: 'username', type: 'text', placeholder: 'johndoe', required: true },
              { label: 'Email', key: 'email', type: 'email', placeholder: 'john@company.com', required: true },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#1a2332' }}>
                  {f.label}
                  {f.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <input
                  type={f.type}
                  className="input-field"
                  placeholder={f.placeholder}
                  required={f.required}
                  value={form[f.key]}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                />
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#1a2332' }}>
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input-field pr-10"
                  placeholder="Min 6 chars"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full btn-primary justify-center py-3 mt-2">
              <UserPlus size={18} />
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </form>

          <div
            className="mt-4 p-3 rounded-lg"
            style={{ background: 'rgba(168, 218, 220, 0.24)', border: '1px solid rgba(45, 139, 139, 0.18)' }}
          >
            <p className="text-xs" style={{ color: '#1a2332' }}>
              New accounts start with <strong>read-only</strong> access. An admin can upgrade your role.
            </p>
          </div>

          <div className="mt-4 text-center">
            <Link to="/login" className="text-sm hover:underline" style={{ color: '#2d8b8b' }}>
              ← Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

