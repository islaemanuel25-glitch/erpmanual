"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "erp-ui-config";

// ======================================
// MODELO UNIFICADO — COMPATIBLE CON SUNMI
// ======================================
const DEFAULT_CONFIG = {
  // ======================================
  // ESCALA GLOBAL
  // ======================================
  scale: 1,

  // ======================================
  // TIPOGRAFÍA
  // ======================================
  font: {
    selected: "md",
    fontSize: 13,
    lineHeight: "16px",

    sizes: {
      xs: { fontSize: 11, lineHeight: "13px" },
      sm: { fontSize: 12, lineHeight: "14px" },
      md: { fontSize: 13, lineHeight: "16px" },
      lg: { fontSize: 15, lineHeight: "18px" },
    },
  },

  // ======================================
  // ESPACIADO
  // ======================================
  spacing: "md",

  spacingScale: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
  },

  // ======================================
  // BORDES / RADIOS
  // ======================================
  rounded: "md",

  roundedScale: {
    sm: 4,
    md: 8,
    lg: 12,
    full: 9999,
  },

  // ======================================
  // DENSIDAD (heights y paddings globales)
  // ======================================
  density: {
    selected: "md",

    tableRowHeight: 34,
    inputHeight: 32,
    selectHeight: 32,
    buttonHeight: 36,

    paddingY: {
      sm: 2,
      md: 4,
      lg: 6,
    },

    paddingX: {
      sm: 4,
      md: 8,
      lg: 12,
    },
  },

  // ======================================
  // SOMBRAS
  // ======================================
  shadows: {
    cardBlur: 12,
    cardSpread: -2,
    cardOffsetY: 2,
    cardOpacity: 0.25,

    inputBlur: 4,
    inputOpacity: 0.20,

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

    focusScale: 1.01,
    focusDuration: 120,

    fadeFrom: 0.2,
    fadeDuration: 160,

    slideOffsetY: 6,
    slideDuration: 160,

    modalScale: 0.95,
    modalBackdropBlur: "md",
    modalDuration: 180,

    tableFade: 120,
    tableSlideY: 4,
  },
};

// ======================================
// CONTEXT
// ======================================
const UIConfigContext = createContext({
  ui: DEFAULT_CONFIG,
  updateUIConfig: () => {},
  resetUIConfig: () => {},
});

export function useUIConfig() {
  return useContext(UIConfigContext);
}

// ======================================
// PROVIDER
// ======================================
export function UIConfigProvider({ children }) {
  const [ui, setUI] = useState(DEFAULT_CONFIG);

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setUI(JSON.parse(stored));
      }
    } catch {}
  }, []);

  // Save updates
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
