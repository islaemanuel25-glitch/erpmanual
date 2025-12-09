"use client";

import { createContext, useContext, useState } from "react";

const UIConfigContext = createContext(null);

// ======================================================
// BASE CONFIG (identidad visual Sunmi V3)
// ======================================================
const BASE_CONFIG = {
  scale: 1,
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
  fontSizes: {
    xs: 12,
    sm: 13,
    base: 14,
    lg: 16,
    xl: 18,
  },
  spacingScale: {
    xs: 2,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
  },
  density: {
    compact: 30,
    normal: 36,
    comfortable: 44,
  },
  lineThickness: 1,
  iconBase: 16,
};

// ======================================================
// PRESETS PROFESIONALES SUNMI (12 niveles)
// ======================================================
const PRESETS = {
  super_mini: {
    scale: 0.72,
    fontScale: 0.78,
    spacingScale: 0.70,
    density: 28,
    radiusScale: 0.7,
  },
  ultra_mini: {
    scale: 0.80,
    fontScale: 0.85,
    spacingScale: 0.80,
    density: 30,
    radiusScale: 0.8,
  },
  mini: {
    scale: 0.90,
    fontScale: 0.92,
    spacingScale: 0.90,
    density: 32,
    radiusScale: 0.9,
  },
  mini_mas: {
    scale: 0.95,
    fontScale: 0.96,
    spacingScale: 0.95,
    density: 34,
    radiusScale: 0.95,
  },
  chico: {
    scale: 1.00,
    fontScale: 1.00,
    spacingScale: 1.00,
    density: 36,
    radiusScale: 1.0,
  },
  chico_mas: {
    scale: 1.05,
    fontScale: 1.05,
    spacingScale: 1.05,
    density: 38,
    radiusScale: 1.05,
  },
  normal: {
    scale: 1.10,
    fontScale: 1.10,
    spacingScale: 1.10,
    density: 40,
    radiusScale: 1.10,
  },
  normal_mas: {
    scale: 1.15,
    fontScale: 1.15,
    spacingScale: 1.15,
    density: 42,
    radiusScale: 1.15,
  },
  grande: {
    scale: 1.20,
    fontScale: 1.20,
    spacingScale: 1.20,
    density: 44,
    radiusScale: 1.20,
  },
  grande_mas: {
    scale: 1.28,
    fontScale: 1.28,
    spacingScale: 1.28,
    density: 46,
    radiusScale: 1.28,
  },
  extra_grande: {
    scale: 1.35,
    fontScale: 1.35,
    spacingScale: 1.35,
    density: 48,
    radiusScale: 1.35,
  },
  maximo: {
    scale: 1.45,
    fontScale: 1.45,
    spacingScale: 1.45,
    density: 52,
    radiusScale: 1.45,
  },
};

// ======================================================
// HELPERS — API profesional para componentes Sunmi
// ======================================================
function buildHelpers(config) {
  return {
    font: (key) => `${config.fontSizes[key]}px`,

    spacing: (key) => `${config.spacingScale[key]}px`,

    radius: (key) => `${config.radius[key]}px`,

    controlHeight: () => `${config.density}px`,

    icon: (factor = 1) => `${config.iconBase * factor * config.scale}px`,

    line: () => `${config.lineThickness * config.scale}px`,

    // ======================================================
    // ✔ MAX-WIDTH REAL — NO ESCALADO
    //    (Normal, Wide y Full SIEMPRE se ven distintos)
    // ======================================================
    contentMaxWidth: (key) => {
      const widths = {
        normal: "1100px",
        wide: "1400px",
        full: "100%",
      };
      return widths[key] ?? "1100px";
    },
  };
}

// ======================================================
// Construcción final del UI según preset
// ======================================================
function buildUIConfig(presetKey) {
  const preset = PRESETS[presetKey] ?? PRESETS["normal"];

  const config = {
    scale: preset.scale,

    fontSizes: {
      xs: BASE_CONFIG.fontSizes.xs * preset.fontScale,
      sm: BASE_CONFIG.fontSizes.sm * preset.fontScale,
      base: BASE_CONFIG.fontSizes.base * preset.fontScale,
      lg: BASE_CONFIG.fontSizes.lg * preset.fontScale,
      xl: BASE_CONFIG.fontSizes.xl * preset.fontScale,
    },

    spacingScale: {
      xs: BASE_CONFIG.spacingScale.xs * preset.spacingScale,
      sm: BASE_CONFIG.spacingScale.sm * preset.spacingScale,
      md: BASE_CONFIG.spacingScale.md * preset.spacingScale,
      lg: BASE_CONFIG.spacingScale.lg * preset.spacingScale,
      xl: BASE_CONFIG.spacingScale.xl * preset.spacingScale,
    },

    density: preset.density,

    radius: {
      sm: BASE_CONFIG.radius.sm * preset.radiusScale,
      md: BASE_CONFIG.radius.md * preset.radiusScale,
      lg: BASE_CONFIG.radius.lg * preset.radiusScale,
      xl: BASE_CONFIG.radius.xl * preset.radiusScale,
      full: BASE_CONFIG.radius.full,
    },

    lineThickness: BASE_CONFIG.lineThickness,
    iconBase: BASE_CONFIG.iconBase,
  };

  config.helpers = buildHelpers(config);

  return config;
}

// ======================================================
// Provider
// ======================================================
export function UIConfigProvider({ children }) {
  const [tamanoNivel, setTamanoNivel] = useState("normal");

  const ui = buildUIConfig(tamanoNivel);

  return (
    <UIConfigContext.Provider value={{ ui, tamanoNivel, setTamanoNivel }}>
      {children}
    </UIConfigContext.Provider>
  );
}

export function useUIConfig() {
  return useContext(UIConfigContext);
}
