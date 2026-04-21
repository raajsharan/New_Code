import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { settingsAPI } from '../services/api';

const BrandingContext = createContext(null);

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState({
    app_name:              'InfraInventory',
    company_name:          'Your Company',
    logo_data:             '',
    logo_filename:         '',
    theme_color:           '#1e40af',
    me_agent_icon_url:     '',
    tenable_agent_icon_url:'',
  });
  const [loaded, setLoaded] = useState(false);

  const fetchBranding = useCallback(async () => {
    try {
      const r = await settingsAPI.getBranding();
      setBranding(prev => ({ ...prev, ...r.data }));
      if (r.data.app_name) document.title = r.data.app_name;
    } catch {
      // keep defaults
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { fetchBranding(); }, [fetchBranding]);

  // Called by BrandingPage after a successful save so all consumers update immediately
  const updateBranding = useCallback((updates) => {
    setBranding(prev => {
      const next = { ...prev, ...updates };
      if (updates.app_name) document.title = updates.app_name;
      return next;
    });
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, loaded, fetchBranding, updateBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => useContext(BrandingContext);
