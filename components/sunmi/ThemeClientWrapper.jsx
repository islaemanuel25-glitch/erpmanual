"use client";

import { SunmiThemeProvider, useSunmiTheme } from "./SunmiThemeProvider";
import { SunmiToaster } from "./SunmiToast";

export default function ThemeClientWrapper({ children }) {
  return (
    <SunmiThemeProvider>
      <ThemeBody>{children}</ThemeBody>
    </SunmiThemeProvider>
  );
}

function ThemeBody({ children }) {
  const { theme } = useSunmiTheme();

  return (
    <div className={`min-h-screen w-full overflow-x-hidden ${theme.layout}`}>
      {children}
      <SunmiToaster />
    </div>
  );
}
