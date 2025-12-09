"use client";

import { createContext, useContext, useEffect, useState } from "react";

const LayoutModeContext = createContext({
  layoutMode: "sidebar-left",
  setLayoutMode: () => {},
});

export function LayoutModeProvider({ children }) {
  const [layoutMode, setLayoutModeState] = useState("sidebar-left");

  // Cargar desde localStorage al montar
  useEffect(() => {
    try {
      const saved = localStorage.getItem("erp-layout-mode");
      if (saved && ["sidebar-left", "sidebar-top"].includes(saved)) {
        setLayoutModeState(saved);
      }
    } catch (e) {
      // Ignorar errores de localStorage
    }
  }, []);

  // Función para actualizar layoutMode y localStorage
  const setLayoutMode = (mode) => {
    if (!["sidebar-left", "sidebar-top"].includes(mode)) {
      return;
    }
    setLayoutModeState(mode);
    try {
      localStorage.setItem("erp-layout-mode", mode);
      // Disparar evento personalizado para sincronizar entre tabs
      window.dispatchEvent(new StorageEvent("storage", {
        key: "erp-layout-mode",
        newValue: mode,
      }));
    } catch (e) {
      // Ignorar errores de localStorage
    }
  };

  // Escuchar cambios desde otras tabs
  useEffect(() => {
    function handleStorageChange(e) {
      if (e.key === "erp-layout-mode" && e.newValue) {
        if (["sidebar-left", "sidebar-top"].includes(e.newValue)) {
          setLayoutModeState(e.newValue);
        }
      }
    }

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  return (
    <LayoutModeContext.Provider value={{ layoutMode, setLayoutMode }}>
      {children}
    </LayoutModeContext.Provider>
  );
}

export function useLayoutMode() {
  const context = useContext(LayoutModeContext);
  if (!context) {
    throw new Error("useLayoutMode must be used within LayoutModeProvider");
  }
  return context;
}
