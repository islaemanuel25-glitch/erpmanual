"use client";

import { SunmiThemeProvider } from "./SunmiThemeProvider";
import { SunmiToaster } from "./SunmiToast";

export default function ThemeClientWrapper({ children, institucionalInicial = null }) {
  return (
    <SunmiThemeProvider institucionalInicial={institucionalInicial}>
      <ThemeBody>{children}</ThemeBody>
    </SunmiThemeProvider>
  );
}

function ThemeBody({ children }) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden">
      {children}
      <SunmiToaster />
    </div>
  );
}
