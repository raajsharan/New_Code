import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { authAPI } from '../services/api';

export default function DeleteConfirmModal({ label, onConfirmed, onCancel }) {
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) { setError('Enter your password'); return; }
    setLoading(true);
    setError('');
    try {
      await authAPI.verifyPassword(password);
      onConfirmed();
    } catch (err) {
      setError(err?.response?.data?.error || 'Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-red-50 border-b border-red-100 px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div>
            <p className="font-bold text-red-800 text-sm">Confirm Delete</p>
            <p className="text-xs text-red-600 mt-0.5">This action cannot be undone</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700">
            You are about to delete{' '}
            <span className="font-semibold text-slate-900 break-all">"{label}"</span>.
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Enter your password to confirm
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                className={`w-full rounded-xl border px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 ${
                  error ? 'border-red-400 bg-red-50' : 'border-gray-300'
                }`}
                placeholder="Your password"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {error && <p className="mt-1.5 text-xs text-red-600 font-medium">{error}</p>}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? 'Verifying…' : 'Delete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
