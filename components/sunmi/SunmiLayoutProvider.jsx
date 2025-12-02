"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { SUNMI_LAYOUTS, DEFAULT_SUNMI_LAYOUT_KEY } from "@/lib/sunmiLayouts";

const SunmiLayoutContext = createContext({
  layoutKey: DEFAULT_SUNMI_LAYOUT_KEY,
  setLayoutKey: () => {},
});

export function useSunmiLayout() {
  return useContext(SunmiLayoutContext);
}

const STORAGE_KEY = "erp-sunmi-layout";

export function SunmiLayoutProvider({ children }) {
  const [layoutKey, setLayoutKeyState] = useState(DEFAULT_SUNMI_LAYOUT_KEY);

  // recuperar de localStorage
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && SUNMI_LAYOUTS[saved]) {
        setLayoutKeyState(saved);
      }
    } catch {}
  }, []);

  const setLayoutKey = (key) => {
    if (!SUNMI_LAYOUTS[key]) return;
    setLayoutKeyState(key);
    try {
      window.localStorage.setItem(STORAGE_KEY, key);
    } catch {}
  };

  return (
    <SunmiLayoutContext.Provider value={{ layoutKey, setLayoutKey }}>
      {children}
    </SunmiLayoutContext.Provider>
  );
}
