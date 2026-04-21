import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    if (!localStorage.getItem('token')) { setLoading(false); return; }
    try { const r = await authAPI.me(); setUser(r.data); }
    catch { localStorage.removeItem('token'); setUser(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const login = async (creds) => {
    const r = await authAPI.login(creds);
    localStorage.setItem('token', r.data.token);
    if (r.data?.user) {
      setUser({
        ...r.data.user,
        page_permissions: Array.isArray(r.data.user.page_permissions) ? r.data.user.page_permissions : [],
        can_view_passwords: !!r.data.user.can_view_passwords,
      });
      setLoading(false);
    } else {
      await fetchMe();
    }
    return r.data;
  };

  const logout = () => { localStorage.removeItem('token'); setUser(null); };

  // Optimistically update user fields after profile save
  const updateUserLocally = (updates) => setUser(prev => ({ ...prev, ...updates }));

  const canWrite      = user?.role === 'admin' || user?.role === 'readwrite' || user?.role === 'superadmin';
  const isAdmin       = user?.role === 'admin' || user?.role === 'superadmin';
  const isSuperAdmin  = user?.role === 'superadmin';

  const canViewPage = (key) => {
    if (!user) return false;
    // Superadmin always has full access
    if (user.role === 'superadmin') return true;
    // For admin users, respect per-page permissions set by superadmin
    const p = user.page_permissions?.find(p => p.page_key === key);
    if (!p && key === 'audit-explorer') return false;
    return p ? p.is_visible : true;
  };

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout,
      canWrite, isAdmin, isSuperAdmin, canViewPage,
      refreshUser: fetchMe, updateUserLocally,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

