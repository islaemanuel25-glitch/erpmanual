"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "erp-ui-config";

const DEFAULT_CONFIG = {
  // ======================================
  // ESCALA GLOBAL
  // ======================================
  scale: 1,

  // ======================================
  // TIPOGRAFÍA
  // ======================================
  font: {
    base: 13, // reemplaza fontSize
    lineHeight: "16px",

    scaleXs: 0.85,
    scaleSm: 0.92,
    scaleMd: 1,
    scaleLg: 1.12,
    letterSpacing: "0.04em",
    weightBold: 700,
  },

  // ======================================
  // ESPACIADO
  // ======================================
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
  },

  // para componentes antiguos que usan spacingScale
  spacingScale: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
  },

  // ======================================
  // BORDES
  // ======================================
  rounded: {
    sm: 4,
    md: 8,
    lg: 12,
    full: 9999,
  },

  border: {
    widthThin: "1px",
    widthMd: "2px",
  },

  // ======================================
  // SHADOW — ESTÁNDAR PARA COMPONENTES SUNMI
  // ======================================
  shadow: {
    none: "none",
    xs: "0 0 2px rgba(0,0,0,0.20)",
    sm: "0 0 4px rgba(0,0,0,0.25)",
    md: "0 0 8px rgba(0,0,0,0.30)",
    lg: "0 0 12px rgba(0,0,0,0.35)",
  },

  // ======================================
  // DENSIDAD
  // ======================================
  density: {
    inputHeight: 32,
    selectHeight: 32,
    buttonHeight: 36,
    tableRowHeight: 34,
    iconSize: 18,
    iconStrokeWidth: 2,
    avatarSize: 32,
    cardMinWidth: 260,
    dropdownMaxHeight: 208,
    modalMaxHeight: 520,
  },

  // ======================================
  // SOMBRAS AVANZADAS (builder interno)
  // ======================================
  shadows: {
    cardBlur: 12,
    cardSpread: -2,
    cardOffsetY: 2,
    cardOpacity: 0.25,

    inputBlur: 4,
    inputOpacity: 0.2,

    buttonBlur: 6,
    buttonOpacity: 0.25,

    layoutBlur: 10,
    layoutOpacity: 0.25,
    layoutOffsetY: 2,
  },

  // ======================================
  // ANIMACIONES
  // ======================================
  animations: {
    duration: 160,
    easing: "ease",
    hoverScale: 1.02,
    hoverDuration: 120,
  },
};

const UIConfigContext = createContext({
  ui: DEFAULT_CONFIG,
  updateUIConfig: () => {},
  resetUIConfig: () => {},
});

export function useUIConfig() {
  return useContext(UIConfigContext);
}

export function UIConfigProvider({ children }) {
  const [ui, setUI] = useState(DEFAULT_CONFIG);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setUI(JSON.parse(stored));
      }
    } catch {}
  }, []);

  const updateUIConfig = (partial) => {
    setUI((prev) => {
      const updated = { ...prev, ...partial };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const resetUIConfig = () => {
    setUI(DEFAULT_CONFIG);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CONFIG));
  };

  return (
    <UIConfigContext.Provider value={{ ui, updateUIConfig, resetUIConfig }}>
      {children}
    </UIConfigContext.Provider>
  );
}
