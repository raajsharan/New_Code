import React, { useState, useEffect } from 'react';
import { settingsAPI } from '../services/api';
import { ShieldCheck } from 'lucide-react';

// Cached icons — fetched once on first use
let _cachedIcons = null;
let _fetchPromise = null;

async function fetchIcons() {
  if (_cachedIcons) return _cachedIcons;
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = settingsAPI.getBranding()
    .then(r => {
      _cachedIcons = {
        me_url:     r.data.me_agent_icon_url     || '',
        tenable_url:r.data.tenable_agent_icon_url || '',
      };
      return _cachedIcons;
    })
    .catch(() => ({ me_url: '', tenable_url: '' }));
  return _fetchPromise;
}

// Shared hook to load icon URLs once
export function useAgentIcons() {
  const [icons, setIcons] = useState(_cachedIcons || { me_url: '', tenable_url: '' });
  useEffect(() => {
    if (!_cachedIcons) {
      fetchIcons().then(setIcons);
    }
  }, []);
  return icons;
}

// ManageEngine agent icon indicator
export function MEIcon({ installed, size = 18 }) {
  const icons = useAgentIcons();
  const [imgError, setImgError] = useState(false);

  if (!installed) return <span className="text-gray-300 text-xs">—</span>;

  if (icons.me_url && !imgError) {
    return (
      <span title="ManageEngine Agent Installed" className="inline-flex items-center">
        <img
          src={icons.me_url}
          alt="ManageEngine"
          style={{ width: size, height: size }}
          className="object-contain rounded"
          onError={() => setImgError(true)}
        />
      </span>
    );
  }

  return (
    <span title="ManageEngine Agent Installed" className="text-teal-600 font-medium text-xs">✓ ME</span>
  );
}

// Tenable agent icon indicator
export function TenableIcon({ installed, size = 18 }) {
  const icons = useAgentIcons();
  const [imgError, setImgError] = useState(false);

  if (!installed) return <span className="text-gray-300 text-xs">—</span>;

  if (icons.tenable_url && !imgError) {
    return (
      <span title="Tenable Agent Installed" className="inline-flex items-center">
        <img
          src={icons.tenable_url}
          alt="Tenable"
          style={{ width: size, height: size }}
          className="object-contain rounded"
          onError={() => setImgError(true)}
        />
      </span>
    );
  }

  return (
    <span title="Tenable Agent Installed" className="text-cyan-600 font-medium text-xs">✓ TNL</span>
  );
}
