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
  const [themeKey, setThemeKeyState] = useState(DEFAULT_SUNMI_THEME_KEY);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && SUNMI_THEMES[saved]) {
        setThemeKeyState(saved);
      }
    } catch (e) {
      console.error("Error leyendo theme:", e);
    }
  }, []);

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
