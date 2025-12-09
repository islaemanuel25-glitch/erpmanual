"use client";

import { createContext, useContext, useEffect, useState } from "react";

const SidebarConfigContext = createContext(null);

export function SidebarConfigProvider({ children }) {
  const [sidebarMode, setSidebarModeState] = useState("icons"); // icons | icons-text
  const [sidebarGroup, setSidebarGroupState] = useState("flat"); // grouped | flat

  // Cargar desde localStorage al montar
  useEffect(() => {
    try {
      const m = localStorage.getItem("erp-sidebar-mode");
      if (m && (m === "icons" || m === "icons-text")) {
        setSidebarModeState(m);
      }

      const g = localStorage.getItem("erp-sidebar-group");
      if (g && (g === "grouped" || g === "flat")) {
        setSidebarGroupState(g);
      }
    } catch (e) {
      // Ignorar errores de localStorage
    }
  }, []);

  // Función para actualizar sidebarMode y localStorage
  const setSidebarMode = (mode) => {
    if (!["icons", "icons-text"].includes(mode)) return;
    setSidebarModeState(mode);
    try {
      localStorage.setItem("erp-sidebar-mode", mode);
    } catch (e) {
      // Ignorar errores de localStorage
    }
  };

  // Función para actualizar sidebarGroup y localStorage
  const setSidebarGroup = (group) => {
    if (!["grouped", "flat"].includes(group)) return;
    setSidebarGroupState(group);
    try {
      localStorage.setItem("erp-sidebar-group", group);
    } catch (e) {
      // Ignorar errores de localStorage
    }
  };

  return (
    <SidebarConfigContext.Provider
      value={{ sidebarMode, setSidebarMode, sidebarGroup, setSidebarGroup }}
    >
      {children}
    </SidebarConfigContext.Provider>
  );
}

export function useSidebarConfig() {
  const context = useContext(SidebarConfigContext);
  if (!context) {
    throw new Error("useSidebarConfig must be used within SidebarConfigProvider");
  }
  return context;
}
