import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { authAPI } from '../services/api';
import { Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const { branding } = useBranding();
  const navigate = useNavigate();

  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '' });
  const [signupForm, setSignupForm] = useState({
    full_name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPw, setShowPw] = useState(false);
  const [showSignupPw, setShowSignupPw] = useState(false);
  const [showSignupConfirmPw, setShowSignupConfirmPw] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingSignup, setLoadingSignup] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username || !form.password) {
      toast.error('Enter username and password');
      return;
    }

    setLoading(true);
    try {
      await login({ username: form.username, password: form.password });
      if (!keepSignedIn) {
        const token = localStorage.getItem('token');
        if (token) sessionStorage.setItem('token_temp', token);
      }
      navigate('/dashboard');
      toast.success('Welcome back!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    if (!signupForm.full_name || !signupForm.email || !signupForm.password || !signupForm.confirmPassword) {
      toast.error('All fields are required');
      return;
    }
    if (signupForm.password !== signupForm.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (signupForm.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoadingSignup(true);
    try {
      await authAPI.register({
        username: signupForm.email,
        email: signupForm.email,
        password: signupForm.password,
        full_name: signupForm.full_name,
      });
      await login({ username: signupForm.email, password: signupForm.password });
      navigate('/dashboard');
      toast.success('Account created successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Signup failed');
    } finally {
      setLoadingSignup(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_10%_10%,#d7f7ff_0%,#cde4e9_32%,#b7d6df_100%)] p-4 sm:p-6 flex items-center justify-center">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-white/35 blur-2xl" />
        <div className="absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-cyan-100/45 blur-3xl" />
        <div className="absolute top-1/4 -right-20 h-44 w-44 rounded-full border border-white/50" />
        <div className="absolute bottom-1/4 -left-14 h-36 w-36 rounded-full border border-sky-100/80" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(rgba(14,116,144,0.22) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            maskImage: 'linear-gradient(to bottom, transparent 8%, black 35%, black 65%, transparent 92%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 8%, black 35%, black 65%, transparent 92%)',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[1280px] rounded-3xl border border-white/70 bg-white/70 p-5 sm:p-8 shadow-[0_24px_60px_rgba(15,23,42,0.14)] backdrop-blur-sm">
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2 lg:gap-8">
          <section className="rounded-2xl bg-gradient-to-br from-[#f9fdff] via-[#eef9ff] to-[#edf6ff] p-6 sm:p-8 border border-[#d6eaf2] min-h-[560px]">
            <div className="mb-8 flex justify-center">
              <img
                src="/netbrain-login-logo.png"
                alt="NetBrain logo"
                className="h-10 w-auto object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>

            <div className="mx-auto flex h-[calc(100%-72px)] max-w-[520px] flex-col justify-center rounded-2xl border border-[#d6eaf2] bg-white/95 p-8 sm:p-10 shadow-[0_14px_28px_rgba(14,116,144,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0d9488]">Workspace</p>
              <h2 className="mt-3 text-4xl font-bold leading-tight text-[#1e3a5f]">
                {branding.app_name || 'Sys Spec'}
              </h2>
              <p className="mt-2 text-base font-medium text-[#3b82f6]">
                {branding.company_name || 'Netbrain Technologies'}
              </p>
              <p className="mt-7 text-lg leading-relaxed text-[#334155]">
                Centralized platform to track, verify, and manage asset inventory operations across infrastructure environments.
              </p>
              <div className="mt-7 space-y-3 text-sm text-[#1e3a5f]">
                <p>• Unified login for Asset Inventory and Extended Asset workflows</p>
                <p>• Fast visibility into lifecycle, ownership, and deployment status</p>
                <p>• Built for operational control with secure role-based access</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-gradient-to-br from-[#ffffff] to-[#f8fcff] p-6 sm:p-8 border border-[#d6eaf2] min-h-[560px] flex items-center">
            <div className="w-full max-w-[500px] mx-auto">
              <div className="mb-6 inline-flex rounded-xl border border-[#9fd8e4] bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className={`rounded-lg px-5 py-2 text-sm font-semibold transition-colors ${
                    mode === 'login' ? 'bg-gradient-to-r from-[#14b8a6] to-[#06b6d4] text-white' : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className={`rounded-lg px-5 py-2 text-sm font-semibold transition-colors ${
                    mode === 'signup' ? 'bg-gradient-to-r from-[#14b8a6] to-[#06b6d4] text-white' : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              <div className="overflow-hidden">
                <div
                  className={`flex w-[200%] transition-transform duration-500 ease-in-out ${
                    mode === 'signup' ? '-translate-x-1/2' : 'translate-x-0'
                  }`}
                >
                  <form className="w-1/2 space-y-4 pr-4" onSubmit={handleSubmit}>
                    <h1 className="text-5xl font-bold text-[#0d9488]">Log In</h1>
                    <input
                      type="text"
                      value={form.username}
                      onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                      placeholder="User name"
                      className="w-full rounded-lg border border-[#a8d7e6] bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-[#14b8a6] focus:ring-2 focus:ring-[#99f6e4]"
                      autoFocus
                    />

                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={form.password}
                        onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                        placeholder="Password"
                        className="w-full rounded-lg border border-[#a8d7e6] bg-white px-4 py-3 pr-12 text-sm text-slate-700 outline-none focus:border-[#14b8a6] focus:ring-2 focus:ring-[#99f6e4]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={keepSignedIn}
                          onChange={(e) => setKeepSignedIn(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Keep me signed in
                      </label>
                      <button
                        type="button"
                        onClick={() => toast('Forgot password flow is not configured yet')}
                        className="font-semibold text-[#0d9488] hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="mt-2 w-full rounded-lg bg-gradient-to-r from-[#1e3a8a] to-[#0f172a] px-4 py-3 text-center text-lg font-semibold text-white transition-colors hover:from-[#1d4ed8] hover:to-[#1e293b] disabled:opacity-60"
                    >
                      {loading ? 'Signing in...' : 'Log In'}
                    </button>

                    <p className="text-center text-sm text-slate-500">
                      Need an account?{' '}
                      <button
                        type="button"
                        onClick={() => setMode('signup')}
                        className="font-semibold text-[#0d9488] hover:underline"
                      >
                        Sign up
                      </button>
                    </p>
                  </form>

                  <form className="w-1/2 space-y-4 pl-4" onSubmit={handleSignupSubmit}>
                    <h1 className="text-5xl font-bold text-[#0d9488]">Sign Up</h1>
                    <input
                      type="text"
                      value={signupForm.full_name}
                      onChange={(e) => setSignupForm((p) => ({ ...p, full_name: e.target.value }))}
                      placeholder="Full name"
                      className="w-full rounded-lg border border-[#a8d7e6] bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-[#14b8a6] focus:ring-2 focus:ring-[#99f6e4]"
                    />
                    <input
                      type="email"
                      value={signupForm.email}
                      onChange={(e) => setSignupForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="Email address"
                      className="w-full rounded-lg border border-[#a8d7e6] bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-[#14b8a6] focus:ring-2 focus:ring-[#99f6e4]"
                    />

                    <div className="relative">
                      <input
                        type={showSignupPw ? 'text' : 'password'}
                        value={signupForm.password}
                        onChange={(e) => setSignupForm((p) => ({ ...p, password: e.target.value }))}
                        placeholder="Password"
                        className="w-full rounded-lg border border-[#a8d7e6] bg-white px-4 py-3 pr-12 text-sm text-slate-700 outline-none focus:border-[#14b8a6] focus:ring-2 focus:ring-[#99f6e4]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPw((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showSignupPw ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type={showSignupConfirmPw ? 'text' : 'password'}
                        value={signupForm.confirmPassword}
                        onChange={(e) => setSignupForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                        placeholder="Confirm password"
                        className="w-full rounded-lg border border-[#a8d7e6] bg-white px-4 py-3 pr-12 text-sm text-slate-700 outline-none focus:border-[#14b8a6] focus:ring-2 focus:ring-[#99f6e4]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupConfirmPw((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showSignupConfirmPw ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={loadingSignup}
                      className="mt-2 w-full rounded-lg bg-gradient-to-r from-[#1e3a8a] to-[#0f172a] px-4 py-3 text-center text-lg font-semibold text-white transition-colors hover:from-[#1d4ed8] hover:to-[#1e293b] disabled:opacity-60"
                    >
                      {loadingSignup ? 'Creating account...' : 'Create Account'}
                    </button>

                    <p className="text-center text-sm text-slate-500">
                      Already registered?{' '}
                      <button
                        type="button"
                        onClick={() => setMode('login')}
                        className="font-semibold text-[#0d9488] hover:underline"
                      >
                        Login
                      </button>
                    </p>
                  </form>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

