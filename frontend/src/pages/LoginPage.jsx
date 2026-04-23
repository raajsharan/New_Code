import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useTheme } from '../context/ThemeContext';
import { authAPI } from '../services/api';
import {
  Eye, EyeOff, Sun, Moon, Lock, User, Mail, UserPlus,
  ArrowRight, Server, Shield, Activity, Database
} from 'lucide-react';
import toast from 'react-hot-toast';

const FEATURES = [
  { Icon: Database, title: 'Unified Asset Tracking',    desc: 'One source of truth across all infrastructure' },
  { Icon: Shield,   title: 'Role-Based Access Control', desc: 'Granular permissions for every team member' },
  { Icon: Activity, title: 'Real-Time Audit Trails',    desc: 'Every change logged with timestamp and actor' },
];

const STATS = [
  { val: '10K+',   label: 'Assets' },
  { val: '99.9%',  label: 'Uptime' },
  { val: 'AES-256', label: 'Encryption' },
];

function InputRow({ icon: Icon, children }) {
  return (
    <div className="flex items-center rounded-xl border-2 border-slate-200 dark:border-slate-700
      bg-slate-50 dark:bg-slate-800/80
      focus-within:border-blue-500 dark:focus-within:border-blue-400
      focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]
      transition-all duration-200">
      <span className="pl-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0">
        <Icon size={16} />
      </span>
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-widest">
      {children}
    </label>
  );
}

function SubmitBtn({ loading, children }) {
  return (
    <button type="submit" disabled={loading}
      className="w-full py-3.5 rounded-xl text-sm font-bold text-white
        bg-gradient-to-r from-blue-600 to-indigo-600
        hover:from-blue-500 hover:to-indigo-500
        shadow-[0_8px_24px_rgba(59,130,246,0.35)]
        hover:shadow-[0_12px_30px_rgba(59,130,246,0.5)]
        active:scale-[0.98] transition-all duration-200
        disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100
        flex items-center justify-center gap-2 mt-1">
      {loading ? (
        <>
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {children[1]}
        </>
      ) : children}
    </button>
  );
}

export default function LoginPage() {
  const { login }    = useAuth();
  const { branding } = useBranding();
  const { dark, toggle: toggleTheme } = useTheme();
  const navigate     = useNavigate();

  const [mode, setMode]   = useState('login');
  const [login_form, setLoginForm] = useState({ username: '', password: '' });
  const [signup_form, setSignupForm] = useState({ full_name: '', email: '', password: '', confirmPassword: '' });

  const [showPw,        setShowPw]        = useState(false);
  const [showSignupPw,  setShowSignupPw]  = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [keepSignedIn,  setKeepSignedIn]  = useState(true);
  const [loading,       setLoading]       = useState(false);
  const [loadingSignup, setLoadingSignup] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (!login_form.username || !login_form.password) return toast.error('Enter username and password');
    setLoading(true);
    try {
      await login({ username: login_form.username, password: login_form.password });
      if (!keepSignedIn) {
        const t = localStorage.getItem('token');
        if (t) sessionStorage.setItem('token_temp', t);
      }
      navigate('/dashboard');
      toast.success('Welcome back!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  }

  async function handleSignup(e) {
    e.preventDefault();
    const { full_name, email, password, confirmPassword } = signup_form;
    if (!full_name || !email || !password || !confirmPassword) return toast.error('All fields are required');
    if (password !== confirmPassword) return toast.error('Passwords do not match');
    if (password.length < 6) return toast.error('Password must be at least 6 characters');
    setLoadingSignup(true);
    try {
      await authAPI.register({ username: email, email, password, full_name });
      await login({ username: email, password });
      navigate('/dashboard');
      toast.success('Account created successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Signup failed');
    } finally { setLoadingSignup(false); }
  }

  const appName     = branding.app_name     || 'InfraInventory';
  const companyName = branding.company_name || 'Netbrain Technologies';

  return (
    <div className={`relative min-h-screen overflow-hidden flex items-center justify-center p-4 sm:p-6
      transition-colors duration-500
      bg-gradient-to-br from-slate-100 via-blue-50 to-cyan-50
      dark:from-slate-950 dark:via-blue-950 dark:to-slate-900`}>

      {/* ── Animated background ──────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="anim-float-a absolute top-[8%] left-[5%] w-80 h-80 rounded-full
          bg-blue-400/20 dark:bg-blue-600/10 blur-3xl" />
        <div className="anim-float-b absolute top-[38%] right-[3%] w-96 h-96 rounded-full
          bg-cyan-400/18 dark:bg-cyan-600/10 blur-3xl" />
        <div className="anim-float-c absolute bottom-[6%] left-[22%] w-72 h-72 rounded-full
          bg-indigo-400/18 dark:bg-indigo-600/10 blur-3xl" />
        <div className="anim-float-a absolute top-[62%] right-[28%] w-52 h-52 rounded-full
          bg-teal-400/12 dark:bg-teal-600/8 blur-2xl"
          style={{ animationDelay: '3.5s', animationDuration: '13s' }} />
        {/* Dot grid */}
        <div className="absolute inset-0 opacity-40 dark:opacity-15"
          style={{
            backgroundImage: 'radial-gradient(rgba(59,130,246,0.45) 1px, transparent 1px)',
            backgroundSize: '30px 30px',
            maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black, transparent)',
          }} />
      </div>

      {/* ── Theme toggle ─────────────────────────────────────────────────── */}
      <button onClick={toggleTheme}
        className="absolute top-5 right-5 z-30 p-2.5 rounded-xl
          bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm
          border border-white/60 dark:border-white/10
          text-slate-600 dark:text-slate-300
          hover:bg-white dark:hover:bg-slate-700
          shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {/* ── Main card ────────────────────────────────────────────────────── */}
      <div className="anim-scale-in relative z-10 w-full max-w-5xl overflow-hidden
        grid grid-cols-1 lg:grid-cols-[1fr_1.15fr]
        rounded-3xl
        border border-white/70 dark:border-white/8
        shadow-[0_32px_80px_rgba(15,23,42,0.18)] dark:shadow-[0_32px_80px_rgba(0,0,0,0.6)]
        bg-white/75 dark:bg-slate-900/85 backdrop-blur-2xl">

        {/* ── LEFT HERO PANEL ──────────────────────────────────────────── */}
        <div className="relative overflow-hidden p-9 flex flex-col justify-between
          bg-gradient-to-br from-blue-600 via-indigo-700 to-cyan-500
          dark:from-[#0f172a] dark:via-blue-950 dark:to-indigo-950
          min-h-[340px] lg:min-h-0">

          {/* Decorative rings */}
          <div className="anim-spin-slow pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            w-[520px] h-[520px] rounded-full border border-white/10" />
          <div className="anim-spin-slow-r pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            w-[380px] h-[380px] rounded-full border border-white/8" />
          <div className="pointer-events-none absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/5 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative z-10">
            {/* Brand pill */}
            <div className="anim-fade-in-up mb-8 inline-flex items-center gap-3
              bg-white/15 dark:bg-white/8 backdrop-blur-sm
              rounded-2xl px-4 py-3 border border-white/25 dark:border-white/15">
              <div className="w-8 h-8 bg-white dark:bg-blue-700 rounded-lg flex items-center justify-center flex-shrink-0 shadow">
                <Server size={16} className="text-blue-600 dark:text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-tight">{appName}</p>
                <p className="text-white/65 dark:text-white/50 text-xs leading-tight">{companyName}</p>
              </div>
            </div>

            {/* Headline */}
            <div className="anim-fade-in-up delay-1">
              <p className="text-white/70 dark:text-blue-400/80 text-[11px] font-bold uppercase tracking-[0.22em] mb-2">
                Asset Intelligence Platform
              </p>
              <h2 className="text-white text-4xl font-extrabold leading-[1.12] mb-4">
                Infrastructure<br />at your fingertips
              </h2>
              <p className="text-white/75 dark:text-slate-400 text-[15px] leading-relaxed max-w-[300px]">
                Centralised visibility, lifecycle tracking, and operational control across your entire infrastructure.
              </p>
            </div>

            {/* Feature list */}
            <div className="mt-8 space-y-4">
              {FEATURES.map(({ Icon, title, desc }, i) => (
                <div key={title}
                  className="anim-fade-in-up flex items-start gap-3"
                  style={{ animationDelay: `${(i + 2) * 0.13}s` }}>
                  <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg
                    bg-white/15 dark:bg-white/8 backdrop-blur-sm border border-white/20 dark:border-white/12
                    flex items-center justify-center">
                    <Icon size={15} className="text-white" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold leading-tight">{title}</p>
                    <p className="text-white/60 dark:text-white/45 text-xs mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats row */}
          <div className="anim-fade-in-up delay-5 relative z-10 mt-8 grid grid-cols-3 gap-3">
            {STATS.map(({ val, label }) => (
              <div key={label}
                className="bg-white/12 dark:bg-white/6 rounded-xl p-3 text-center
                  border border-white/18 dark:border-white/10 backdrop-blur-sm">
                <p className="text-white font-extrabold text-lg leading-tight">{val}</p>
                <p className="text-white/60 dark:text-white/45 text-xs mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT FORM PANEL ─────────────────────────────────────────── */}
        <div className="flex flex-col justify-center
          p-8 lg:p-12
          bg-white dark:bg-slate-900
          min-h-[540px]">

          {/* Mode tabs with sliding pill */}
          <div className="relative mb-7 self-start
            inline-flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1
            border border-slate-200 dark:border-slate-700 shadow-inner">
            <div className="absolute top-1 bottom-1 rounded-lg bg-white dark:bg-slate-700
              shadow-md transition-all duration-300 ease-out"
              style={{ left: mode === 'login' ? '4px' : 'calc(50% + 2px)', width: 'calc(50% - 6px)' }} />
            {['login', 'signup'].map(m => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`relative z-10 px-6 py-2 text-sm font-semibold rounded-lg transition-colors capitalize ${
                  mode === m
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}>
                {m === 'login' ? 'Log In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {/* Heading (changes with tab) */}
          <div className="mb-6">
            <h1 className="text-[2rem] font-extrabold text-slate-900 dark:text-white leading-tight">
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {mode === 'login'
                ? 'Sign in to access your infrastructure dashboard'
                : "Join your team's infrastructure workspace"}
            </p>
          </div>

          {/* Sliding forms */}
          <div className="overflow-hidden">
            <div className="flex w-[200%] transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{ transform: mode === 'signup' ? 'translateX(-50%)' : 'translateX(0)' }}>

              {/* ── LOGIN FORM ── */}
              <form className="w-1/2 pr-6 space-y-4" onSubmit={handleLogin}>
                <div>
                  <FieldLabel>Username</FieldLabel>
                  <InputRow icon={User}>
                    <input type="text" value={login_form.username} autoFocus
                      onChange={e => setLoginForm(p => ({ ...p, username: e.target.value }))}
                      placeholder="Enter your username"
                      className="flex-1 bg-transparent px-3 py-3 text-sm
                        text-slate-800 dark:text-slate-200
                        placeholder-slate-400 dark:placeholder-slate-500 outline-none" />
                  </InputRow>
                </div>

                <div>
                  <FieldLabel>Password</FieldLabel>
                  <InputRow icon={Lock}>
                    <input type={showPw ? 'text' : 'password'} value={login_form.password}
                      onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="Enter your password"
                      className="flex-1 bg-transparent px-3 py-3 text-sm
                        text-slate-800 dark:text-slate-200
                        placeholder-slate-400 dark:placeholder-slate-500 outline-none" />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="pr-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </InputRow>
                </div>

                {/* Toggle + forgot */}
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => setKeepSignedIn(v => !v)}
                    className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 select-none">
                    <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${
                      keepSignedIn ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'
                    }`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm
                        transition-all duration-200 ${keepSignedIn ? 'left-[18px]' : 'left-0.5'}`} />
                    </div>
                    Keep me signed in
                  </button>
                  <button type="button"
                    onClick={() => toast('Password reset is not yet configured')}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                    Forgot password?
                  </button>
                </div>

                <SubmitBtn loading={loading}>
                  Sign In <ArrowRight size={16} />
                  <span>Signing in…</span>
                </SubmitBtn>

                <p className="text-center text-xs text-slate-500 dark:text-slate-400 pt-1">
                  Don't have an account?{' '}
                  <button type="button" onClick={() => setMode('signup')}
                    className="font-bold text-blue-600 dark:text-blue-400 hover:underline">
                    Sign up
                  </button>
                </p>

                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-600 pt-1">
                  <Lock size={11} />
                  <span>Secured with AES-256 encryption</span>
                </div>
              </form>

              {/* ── SIGN UP FORM ── */}
              <form className="w-1/2 pl-6 space-y-3.5" onSubmit={handleSignup}>
                <div>
                  <FieldLabel>Full Name</FieldLabel>
                  <InputRow icon={User}>
                    <input type="text" value={signup_form.full_name}
                      onChange={e => setSignupForm(p => ({ ...p, full_name: e.target.value }))}
                      placeholder="Your full name"
                      className="flex-1 bg-transparent px-3 py-2.5 text-sm
                        text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none" />
                  </InputRow>
                </div>

                <div>
                  <FieldLabel>Email Address</FieldLabel>
                  <InputRow icon={Mail}>
                    <input type="email" value={signup_form.email}
                      onChange={e => setSignupForm(p => ({ ...p, email: e.target.value }))}
                      placeholder="you@company.com"
                      className="flex-1 bg-transparent px-3 py-2.5 text-sm
                        text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none" />
                  </InputRow>
                </div>

                <div>
                  <FieldLabel>Password</FieldLabel>
                  <InputRow icon={Lock}>
                    <input type={showSignupPw ? 'text' : 'password'} value={signup_form.password}
                      onChange={e => setSignupForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="At least 6 characters"
                      className="flex-1 bg-transparent px-3 py-2.5 text-sm
                        text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none" />
                    <button type="button" onClick={() => setShowSignupPw(v => !v)}
                      className="pr-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                      {showSignupPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </InputRow>
                </div>

                <div>
                  <FieldLabel>Confirm Password</FieldLabel>
                  <InputRow icon={Lock}>
                    <input type={showConfirmPw ? 'text' : 'password'} value={signup_form.confirmPassword}
                      onChange={e => setSignupForm(p => ({ ...p, confirmPassword: e.target.value }))}
                      placeholder="Repeat password"
                      className="flex-1 bg-transparent px-3 py-2.5 text-sm
                        text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none" />
                    <button type="button" onClick={() => setShowConfirmPw(v => !v)}
                      className="pr-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                      {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </InputRow>
                </div>

                <SubmitBtn loading={loadingSignup}>
                  Create Account <UserPlus size={16} />
                  <span>Creating account…</span>
                </SubmitBtn>

                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  Already have an account?{' '}
                  <button type="button" onClick={() => setMode('login')}
                    className="font-bold text-blue-600 dark:text-blue-400 hover:underline">
                    Log in
                  </button>
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="absolute bottom-4 left-1/2 -translate-x-1/2
        text-[11px] text-slate-400 dark:text-slate-700 whitespace-nowrap pointer-events-none">
        © {new Date().getFullYear()} {companyName} · All rights reserved
      </p>
    </div>
  );
}
