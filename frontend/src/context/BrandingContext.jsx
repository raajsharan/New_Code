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

  const setFavicon = (url) => {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = url || '';
    if (!url) link.remove();
  };

  const fetchBranding = useCallback(async () => {
    try {
      const r = await settingsAPI.getBranding();
      setBranding(prev => ({ ...prev, ...r.data }));
      if (r.data.app_name) document.title = r.data.app_name;
      setFavicon(r.data.logo_data || '');
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
      if ('logo_data' in updates) setFavicon(updates.logo_data || '');
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
