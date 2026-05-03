"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { SUNMI_THEMES, DEFAULT_SUNMI_THEME_KEY } from "@/lib/sunmiThemes";

const SunmiThemeContext = createContext({
  themeKey: DEFAULT_SUNMI_THEME_KEY,
  theme: SUNMI_THEMES[DEFAULT_SUNMI_THEME_KEY],
  setThemeKey: () => {},
});

export function useSunmiTheme() {
  return useContext(SunmiThemeContext);
}

const STORAGE_KEY = "erp-sunmi-theme";

export function SunmiThemeProvider({ children }) {
  // Server y primer client render siempre arrancan con el default,
  // para evitar hydration mismatch. El tema real se aplica en el useEffect.
  const [themeKey, setThemeKeyState] = useState(DEFAULT_SUNMI_THEME_KEY);

  // Sincronizar con localStorage / data-theme al montar.
  // setState en mount-effect es necesario: el server no puede leer localStorage,
  // así que hidratamos desde acá para evitar mismatch con SSR.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && SUNMI_THEMES[saved]) {
        setThemeKeyState(saved);
        document.documentElement.dataset.theme = saved;
        return;
      }
      const fromHtml = document.documentElement.dataset.theme;
      if (fromHtml && SUNMI_THEMES[fromHtml]) {
        setThemeKeyState(fromHtml);
      }
    } catch (e) {
      console.error("Error leyendo theme:", e);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Sincronizar data-theme en <html> cuando cambia themeKey
  useEffect(() => {
    document.documentElement.dataset.theme = themeKey;
  }, [themeKey]);

  const setThemeKey = (key) => {
    if (!SUNMI_THEMES[key]) return;
    setThemeKeyState(key);
    try {
      window.localStorage.setItem(STORAGE_KEY, key);
    } catch (e) {
      console.error("Error guardando theme:", e);
    }
  };

  const value = {
    themeKey,
    theme: SUNMI_THEMES[themeKey] || SUNMI_THEMES[DEFAULT_SUNMI_THEME_KEY],
    setThemeKey,
  };

  return (
    <SunmiThemeContext.Provider value={value}>
      {children}
    </SunmiThemeContext.Provider>
  );
}
