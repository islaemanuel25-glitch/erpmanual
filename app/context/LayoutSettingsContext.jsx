"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "erpazul_layout";

const VALID_MODES = ["sidebarLeft", "topbar", "launcher"];

const DEFAULTS = {
  menuMode: "sidebarLeft",
};

const LayoutSettingsContext = createContext({
  menuMode: DEFAULTS.menuMode,
  setMenuMode: () => {},
});

export function useLayoutSettings() {
  return useContext(LayoutSettingsContext);
}

export function LayoutSettingsProvider({ children }) {
  const [menuMode, setMenuModeState] = useState(DEFAULTS.menuMode);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (VALID_MODES.includes(parsed.menuMode)) {
          setMenuModeState(parsed.menuMode);
        }
      }
    } catch (e) {
      console.error("Error leyendo layout settings:", e);
    }
  }, []);

  const setMenuMode = (mode) => {
    if (!VALID_MODES.includes(mode)) return;
    setMenuModeState(mode);
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const prev = raw ? JSON.parse(raw) : {};
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...prev, menuMode: mode })
      );
    } catch (e) {
      console.error("Error guardando layout settings:", e);
    }
  };

  return (
    <LayoutSettingsContext.Provider value={{ menuMode, setMenuMode }}>
      {children}
    </LayoutSettingsContext.Provider>
  );
}
