"use client";

import { createContext, useContext, useState, useEffect } from "react";

const UIConfigContext = createContext(null);

// ======================================================
// BASE CONFIG — Sunmi V3 (identidad visual estable)
// ======================================================
const BASE_CONFIG = {
  scale: 1, // se modifica por preset
  fontSizes: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
  },
  spacingScale: {
    xs: 0.25,
    sm: 0.5,
    md: 1,
    lg: 1.5,
    xl: 2,
  },
  radius: {
    sm: "4px",
    md: "8px",
    lg: "12px",
  },
  density: {
    compact: 32,
    normal: 40,
    comfortable: 48,
  },
  animation: {
    fast: "120ms",
    normal: "180ms",
    slow: "250ms",
  },
};

// ======================================================
// PRESETS PROFESIONALES SUNMI (12 niveles)
// ======================================================
const PRESETS = {
  super_mini: {
    scale: 0.72,
    density: 30,
    fontScale: 0.78,
    spacingScale: 0.70,
    radiusScale: 0.7,
  },
  ultra_mini: {
    scale: 0.80,
    density: 32,
    fontScale: 0.85,
    spacingScale: 0.80,
    radiusScale: 0.8,
  },
  mini: {
    scale: 0.90,
    density: 34,
    fontScale: 0.92,
    spacingScale: 0.90,
    radiusScale: 0.9,
  },
  mini_mas: {
    scale: 0.95,
    density: 36,
    fontScale: 0.96,
    spacingScale: 0.95,
    radiusScale: 0.95,
  },
  chico: {
    scale: 1.00,
    density: 40,
    fontScale: 1.00,
    spacingScale: 1.00,
    radiusScale: 1.0,
  },
  chico_mas: {
    scale: 1.05,
    density: 42,
    fontScale: 1.05,
    spacingScale: 1.05,
    radiusScale: 1.05,
  },
  normal: {
    scale: 1.10,
    density: 44,
    fontScale: 1.10,
    spacingScale: 1.10,
    radiusScale: 1.10,
  },
  normal_mas: {
    scale: 1.15,
    density: 46,
    fontScale: 1.15,
    spacingScale: 1.15,
    radiusScale: 1.15,
  },
  grande: {
    scale: 1.20,
    density: 48,
    fontScale: 1.20,
    spacingScale: 1.20,
    radiusScale: 1.20,
  },
  grande_mas: {
    scale: 1.28,
    density: 50,
    fontScale: 1.28,
    spacingScale: 1.28,
    radiusScale: 1.28,
  },
  extra_grande: {
    scale: 1.35,
    density: 52,
    fontScale: 1.35,
    spacingScale: 1.35,
    radiusScale: 1.35,
  },
  maximo: {
    scale: 1.45,
    density: 56,
    fontScale: 1.45,
    spacingScale: 1.45,
    radiusScale: 1.45,
  },
};

// ======================================================
// Construcción del objeto ui final según preset
// ======================================================
function buildUIConfig(presetKey) {
  const preset = PRESETS[presetKey] ?? PRESETS["normal"];

  return {
    ...BASE_CONFIG,
    scale: preset.scale,
    densityValue: preset.density,

    // Tipografía escalada
    fontSizes: {
      xs: `calc(${BASE_CONFIG.fontSizes.xs} * ${preset.fontScale})`,
      sm: `calc(${BASE_CONFIG.fontSizes.sm} * ${preset.fontScale})`,
      base: `calc(${BASE_CONFIG.fontSizes.base} * ${preset.fontScale})`,
      lg: `calc(${BASE_CONFIG.fontSizes.lg} * ${preset.fontScale})`,
      xl: `calc(${BASE_CONFIG.fontSizes.xl} * ${preset.fontScale})`,
    },

    // Espaciado escalado
    spacingScale: {
      xs: BASE_CONFIG.spacingScale.xs * preset.spacingScale,
      sm: BASE_CONFIG.spacingScale.sm * preset.spacingScale,
      md: BASE_CONFIG.spacingScale.md * preset.spacingScale,
      lg: BASE_CONFIG.spacingScale.lg * preset.spacingScale,
      xl: BASE_CONFIG.spacingScale.xl * preset.spacingScale,
    },

    // Bordes escalados
    radius: {
      sm: `calc(${BASE_CONFIG.radius.sm} * ${preset.radiusScale})`,
      md: `calc(${BASE_CONFIG.radius.md} * ${preset.radiusScale})`,
      lg: `calc(${BASE_CONFIG.radius.lg} * ${preset.radiusScale})`,
    },
  };
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
