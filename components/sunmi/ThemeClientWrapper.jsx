"use client";

import { SunmiThemeProvider } from "./SunmiThemeProvider";

export default function ThemeClientWrapper({ children }) {
  return (
    <SunmiThemeProvider>
      <ThemeBody>{children}</ThemeBody>
    </SunmiThemeProvider>
  );
}

function ThemeBody({ children }) {
  return (
    <div
      className="min-h-screen w-full"
      style={{
        backgroundColor: "var(--sunmi-bg)",
        color: "var(--sunmi-text)",
      }}
    >
      {children}
    </div>
  );
}
