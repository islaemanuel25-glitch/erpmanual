"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "erp-ui-config";

// ============================================================
//  SUNMI UI V3 — CONFIG OFICIAL ANIDADA
// ============================================================
const DEFAULT_CONFIG = {

  scale: 1,

  font: {
    fontSize: "13px",
    lineHeight: "16px",
    letterSpacing: "0.04em",
    weightBold: 700,

    sizes: {
      xs: { fontSize: "11px", lineHeight: "14px" },
      sm: { fontSize: "12px", lineHeight: "15px" },
      md: { fontSize: "13px", lineHeight: "16px" },
      lg: { fontSize: "15px", lineHeight: "18px" },
    },
  },

  gap: 8,

  spacing: "md",

  spacingScale: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
  },

  rounded: "md",

  roundedScale: {
    sm: 4,
    md: 8,
    lg: 12,
    full: 9999,
  },

  borders: {
    thin: 1,
    md: 2,
  },

  shadows: {
    none: "none",
    xs: "0 0 2px rgba(0,0,0,0.20)",
    sm: "0 0 4px rgba(0,0,0,0.25)",
    md: "0 0 8px rgba(0,0,0,0.30)",
    lg: "0 0 12px rgba(0,0,0,0.35)",

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

  animSpeed: "normal",

  animSpeedMultipliers: {
    fast: 0.7,
    normal: 1,
    slow: 1.3,
  },

  animations: {
    duration: 160,
    easing: "ease",

    hoverScale: 1.02,
    hoverDuration: 120,

    focusScale: 1.03,
    focusDuration: 140,

    fadeFrom: 0.85,
    fadeDuration: 150,

    slideOffsetY: 6,
    slideDuration: 150,

    modalScale: 0.96,
    modalBackdropBlur: 4,
    modalDuration: 160,

    tableFade: 0.92,
    tableSlideY: 4,
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
        const parsed = JSON.parse(stored);

        setUI({
          ...DEFAULT_CONFIG,
          ...parsed,

          font: {
            ...DEFAULT_CONFIG.font,
            ...(parsed.font || {}),
            sizes: {
              ...DEFAULT_CONFIG.font.sizes,
              ...(parsed.font?.sizes || {}),
            },
          },

          spacingScale: {
            ...DEFAULT_CONFIG.spacingScale,
            ...(parsed.spacingScale || {}),
          },

          roundedScale: {
            ...DEFAULT_CONFIG.roundedScale,
            ...(parsed.roundedScale || {}),
          },

          borders: {
            ...DEFAULT_CONFIG.borders,
            ...(parsed.bborders || {}),
          },

          shadows: {
            ...DEFAULT_CONFIG.shadows,
            ...(parsed.shadows || {}),
          },

          density: {
            ...DEFAULT_CONFIG.density,
            ...(parsed.density || {}),
          },

          animations: {
            ...DEFAULT_CONFIG.animations,
            ...(parsed.animations || {}),
          },
        });
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
