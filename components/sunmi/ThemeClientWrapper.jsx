"use client";

import { SunmiThemeProvider, useSunmiTheme } from "./SunmiThemeProvider";

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
    <body className={`h-screen w-screen overflow-hidden ${theme.layout}`}>
      {children}
    </body>
  );
}
