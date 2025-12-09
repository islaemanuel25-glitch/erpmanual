"use client";

import { useEffect } from "react";
import { SunmiThemeProvider } from "./SunmiThemeProvider";

const CUSTOM_THEME_STORAGE_KEY = "erp-theme-custom";

/**
 * Aplica overrides de theme guardados en localStorage.
 * No toca UIConfig ni la definición de themes base.
 * Solo setea CSS variables que empiecen con --sunmi-.
 */
function applyStoredCustomTheme() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  try {
    const raw = window.localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    const root = document.documentElement;

    Object.entries(parsed).forEach(([name, value]) => {
      if (
        typeof name === "string" &&
        name.startsWith("--sunmi-") &&
        typeof value === "string" &&
        value.trim() !== ""
      ) {
        root.style.setProperty(name, value);
      }
    });
  } catch (err) {
    console.error("Error aplicando theme custom:", err);
  }
}

export default function ThemeClientWrapper({ children }) {
  // Aplica overrides una vez que el theme base ya fue montado.
  useEffect(() => {
    applyStoredCustomTheme();
  }, []);

  return (
    <SunmiThemeProvider>
      <ThemeBody>{children}</ThemeBody>
    </SunmiThemeProvider>
  );
}

function ThemeBody({ children }) {
  return (
    <div
      className="h-full w-full"
      style={{
        backgroundColor: "var(--sunmi-bg)",
        color: "var(--sunmi-text)",
      }}
    >
      {children}
    </div>
  );
}
