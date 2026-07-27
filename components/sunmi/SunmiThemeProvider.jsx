"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { SUNMI_THEMES, DEFAULT_SUNMI_THEME_KEY } from "@/lib/sunmiThemes";
import { resolverTemaEfectivo } from "@/lib/apariencia/resolver";
import { crearSyncDataTheme } from "@/lib/apariencia/syncDataTheme";

const SunmiThemeContext = createContext({
  themeKey: DEFAULT_SUNMI_THEME_KEY,
  theme: SUNMI_THEMES[DEFAULT_SUNMI_THEME_KEY],
  setThemeKey: () => {},
  limpiarPreferenciaPersonal: () => {},
  setInstitucional: () => {},
  tienePreferenciaPersonal: false,
  personalKey: null,
  institucionalKey: null,
});

export function useSunmiTheme() {
  return useContext(SunmiThemeContext);
}

const STORAGE_KEY = "erp-sunmi-theme";

// Resolución del tema efectivo:
//   preferencia personal del dispositivo (localStorage)
//   → apariencia institucional del local (fetch)
//   → tema predeterminado del sistema
// La preferencia personal NUNCA se sobrescribe por la institucional; y cambiar la
// institucional no toca el localStorage de otros dispositivos.
export function SunmiThemeProvider({ children, institucionalInicial = null }) {
  // Preferencia personal (este navegador). null = sin preferencia. Se hidrata en
  // un efecto (post-hidratación) para no diferir del HTML del server.
  const [personalKey, setPersonalKey] = useState(null);
  // Apariencia institucional del local. Se SIEMBRA con el valor resuelto en SSR
  // (mismo en server y cliente → sin mismatch de hidratación), así el tema
  // efectivo del primer render ya coincide con el `data-theme` que pintó el server
  // y no hay reescritura a default.
  const [institucionalKey, setInstitucionalKeyState] = useState(
    institucionalInicial && SUNMI_THEMES[institucionalInicial] ? institucionalInicial : null
  );

  // Hidratar la preferencia personal desde localStorage al montar (el server no
  // puede leerla; el <script> del <head> ya aplicó data-theme para evitar flash).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && SUNMI_THEMES[saved]) setPersonalKey(saved);
    } catch (e) {
      console.error("Error leyendo theme:", e);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { key: themeKey } = resolverTemaEfectivo(personalKey, institucionalKey, {
    esValido: (k) => !!SUNMI_THEMES[k],
    porDefecto: DEFAULT_SUNMI_THEME_KEY,
  });

  // Reflejar el tema efectivo en <html data-theme>. En el PRIMER sync NO se pisa:
  // el <script> pre-hidratación (preferencia personal) o el SSR (institucional) ya
  // dejaron el data-theme correcto; escribir acá reintroduciría el flash B→A→B. Solo
  // se escribe ante cambios REALES posteriores (elegir tema, o llegar la institucional
  // por fetch si difiere de la sembrada). Lógica en lib/apariencia/syncDataTheme.js.
  // useState con inicializador perezoso → una única instancia estable (no muta refs
  // en render); el arrow no toca document hasta que el efecto lo invoca (SSR-safe).
  const [syncDataTheme] = useState(() =>
    crearSyncDataTheme((key) => {
      document.documentElement.dataset.theme = key;
    })
  );
  useEffect(() => {
    syncDataTheme(themeKey);
  }, [themeKey, syncDataTheme]);

  // Preferencia PERSONAL (este dispositivo): persiste en localStorage.
  const setThemeKey = useCallback((key) => {
    if (!SUNMI_THEMES[key]) return;
    setPersonalKey(key);
    try {
      window.localStorage.setItem(STORAGE_KEY, key);
    } catch (e) {
      console.error("Error guardando theme:", e);
    }
  }, []);

  // Borrar la preferencia personal → vuelve a verse la institucional (o el default).
  const limpiarPreferenciaPersonal = useCallback(() => {
    setPersonalKey(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error("Error limpiando theme:", e);
    }
  }, []);

  // Apariencia INSTITUCIONAL del local (no toca localStorage). null = sin institucional.
  const setInstitucional = useCallback((key) => {
    setInstitucionalKeyState(key && SUNMI_THEMES[key] ? key : null);
  }, []);

  const value = {
    themeKey,
    theme: SUNMI_THEMES[themeKey] || SUNMI_THEMES[DEFAULT_SUNMI_THEME_KEY],
    setThemeKey,
    limpiarPreferenciaPersonal,
    setInstitucional,
    tienePreferenciaPersonal: !!personalKey,
    personalKey,
    institucionalKey,
  };

  return (
    <SunmiThemeContext.Provider value={value}>
      {children}
    </SunmiThemeContext.Provider>
  );
}
