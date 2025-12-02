"use client";

import { SunmiThemeProvider } from "./SunmiThemeProvider";
import { SunmiLayoutProvider } from "./SunmiLayoutProvider";
import { useSunmiTheme } from "./SunmiThemeProvider";

export default function ThemeClientWrapper({ children }) {
  return (
    <SunmiThemeProvider>
      <SunmiLayoutProvider>
        <ThemeBody>{children}</ThemeBody>
      </SunmiLayoutProvider>
    </SunmiThemeProvider>
  );
}

function ThemeBody({ children }) {
  const { theme } = useSunmiTheme();

  return (
    <body className={`h-screen w-screen overflow-hidden ${theme.layout}`}>
      {children}
    </body>
  );
}
