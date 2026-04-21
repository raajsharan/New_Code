import React, { createContext, useContext, useState, useCallback } from 'react';

// ConfigContext handles inventory config version bumping only.
// Branding state lives in BrandingContext.

const ConfigContext = createContext(null);

export function ConfigProvider({ children }) {
  const [configVersion, setConfigVersion] = useState(0);
  const bumpConfig = useCallback(() => setConfigVersion(v => v + 1), []);
  return (
    <ConfigContext.Provider value={{ configVersion, bumpConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

export const useConfig = () => useContext(ConfigContext);
