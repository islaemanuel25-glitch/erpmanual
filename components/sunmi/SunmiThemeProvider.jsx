"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { SUNMI_THEMES, DEFAULT_SUNMI_THEME_KEY } from "@/lib/sunmiThemes";

const SunmiThemeContext = createContext({
  themeKey: DEFAULT_SUNMI_THEME_KEY,
  theme: SUNMI_THEMES[DEFAULT_SUNMI_THEME_KEY],
  layoutMode: "sidebar-left",
  setThemeKey: () => {},
  setLayoutMode: () => {},
});

export function useSunmiTheme() {
  return useContext(SunmiThemeContext);
}

const STORAGE_THEME = "erp-sunmi-theme";
const STORAGE_LAYOUT = "erp-sunmi-layout";

export function SunmiThemeProvider({ children }) {
  const [themeKey, setThemeKeyState] = useState(DEFAULT_SUNMI_THEME_KEY);
  const [layoutMode, setLayoutModeState] = useState("sidebar-left");

  // ===== LOAD STORED VALUES =====
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(STORAGE_THEME);
      const savedLayout = localStorage.getItem(STORAGE_LAYOUT);

      if (savedTheme && SUNMI_THEMES[savedTheme]) {
        setThemeKeyState(savedTheme);
      }

      if (savedLayout) {
        setLayoutModeState(savedLayout);
      }
    } catch (e) {
      console.error("Error leyendo configuración:", e);
    }
  }, []);

  // ===== SETTERS =====
  const setThemeKey = (key) => {
    if (!SUNMI_THEMES[key]) return;
    setThemeKeyState(key);
    localStorage.setItem(STORAGE_THEME, key);
  };

  const setLayoutMode = (mode) => {
    setLayoutModeState(mode);
    localStorage.setItem(STORAGE_LAYOUT, mode);
  };

  const value = {
    themeKey,
    layoutMode,
    theme: SUNMI_THEMES[themeKey],
    setThemeKey,
    setLayoutMode,
  };

  return (
    <SunmiThemeContext.Provider value={value}>
      {children}
    </SunmiThemeContext.Provider>
  );
}
