"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "erp-ui-config";

// ============================================================
//  BASE CONFIG – SUNMI UI V3 REAL (NO EDITABLE)
// ============================================================
const BASE_CONFIG = {
  scale: 1,

  font: {
    sizes: {
      xs: { fontSize: 11, lineHeight: "13px" },
      sm: { fontSize: 12, lineHeight: "14px" },
      md: { fontSize: 13, lineHeight: "16px" },
      lg: { fontSize: 15, lineHeight: "18px" },
    },
  },

  spacingScale: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },

  roundedScale: {
    sm: 4,
    md: 8,
    lg: 12,
    full: 9999,
  },

  density: {
    tableRowHeight: 34,
    inputHeight: 32,
    selectHeight: 32,
    buttonHeight: 36,
    iconSize: 18,
    avatarSize: 32,
    dropdownMaxHeight: 240,
    modalMaxHeight: 520,
  },

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

// ============================================================
// PRESETS PROFESIONALES – DEL MÁS CHICO AL MÁS GRANDE
// ============================================================
const createPreset = (factor) => ({
  scale: factor,

  font: {
    sizes: {
      xs: { fontSize: Math.round(11 * factor), lineHeight: "13px" },
      sm: { fontSize: Math.round(12 * factor), lineHeight: "14px" },
      md: { fontSize: Math.round(13 * factor), lineHeight: "16px" },
      lg: { fontSize: Math.round(15 * factor), lineHeight: "18px" },
    },
  },

  spacingScale: {
    xs: Math.round(4 * factor),
    sm: Math.round(8 * factor),
    md: Math.round(12 * factor),
    lg: Math.round(16 * factor),
    xl: Math.round(20 * factor),
  },

  density: {
    tableRowHeight: Math.round(34 * factor),
    inputHeight: Math.round(32 * factor),
    selectHeight: Math.round(32 * factor),
    buttonHeight: Math.round(36 * factor),
    iconSize: Math.round(18 * factor),
    avatarSize: Math.round(32 * factor),
  },
});

const TAMANOS_PREDEFINIDOS = {
  super_mini: createPreset(0.70),
  ultra_mini: createPreset(0.78),
  mini: createPreset(0.86),
  mini_mas: createPreset(0.92),
  chico: createPreset(0.97),
  chico_mas: createPreset(0.99),
  normal: createPreset(1.0),
  normal_mas: createPreset(1.06),
  grande: createPreset(1.12),
  grande_mas: createPreset(1.18),
  extra_grande: createPreset(1.26),
  maximo: createPreset(1.34),
};

const DEFAULT_TAMANO_NIVEL = "normal";

const applyPreset = (nivel, overrides = {}) => {
  const preset = TAMANOS_PREDEFINIDOS[nivel] || TAMANOS_PREDEFINIDOS.normal;

  return {
    ...BASE_CONFIG,
    ...preset,
    ...overrides,

    font: {
      ...BASE_CONFIG.font,
      ...(preset.font || {}),
      ...(overrides.font || {}),
      sizes: {
        ...BASE_CONFIG.font.sizes,
        ...(preset.font?.sizes || {}),
        ...(overrides.font?.sizes || {}),
      },
    },

    spacingScale: {
      ...BASE_CONFIG.spacingScale,
      ...(preset.spacingScale || {}),
      ...(overrides.spacingScale || {}),
    },

    density: {
      ...BASE_CONFIG.density,
      ...(preset.density || {}),
      ...(overrides.density || {}),
    },

    tamanoNivel: nivel,
  };
};

// ============================================================
// CONTEXT
// ============================================================
const UIConfigContext = createContext({
  ui: BASE_CONFIG,
  updateUIConfig: () => {},
  resetUIConfig: () => {},
  setTamanoNivel: () => {},
});

export function useUIConfig() {
  return useContext(UIConfigContext);
}

// ============================================================
// PROVIDER
// ============================================================
export function UIConfigProvider({ children }) {
  const [tamanoNivel, setTamanoNivelState] = useState(DEFAULT_TAMANO_NIVEL);
  const [overrides, setOverrides] = useState({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.tamanoNivel) setTamanoNivelState(parsed.tamanoNivel);
        setOverrides(parsed.overrides || {});
      }
    } catch {}

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tamanoNivel,
        overrides,
      })
    );
  }, [tamanoNivel, overrides, hydrated]);

  const ui = useMemo(
    () => applyPreset(tamanoNivel, overrides),
    [tamanoNivel, overrides]
  );

  const updateUIConfig = (partial) => {
    setOverrides((prev) => ({ ...prev, ...partial }));
  };

  const resetUIConfig = () => {
    setOverrides({});
    setTamanoNivelState(DEFAULT_TAMANO_NIVEL);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tamanoNivel: DEFAULT_TAMANO_NIVEL,
        overrides: {},
      })
    );
  };

  const setTamanoNivel = (nivel) => {
    if (!TAMANOS_PREDEFINIDOS[nivel]) return;
    setTamanoNivelState(nivel);
  };

  return (
    <UIConfigContext.Provider
      value={{ ui, updateUIConfig, resetUIConfig, setTamanoNivel }}
    >
      {children}
    </UIConfigContext.Provider>
  );
}
