"use client";

import { SunmiThemeProvider, useSunmiTheme } from "./SunmiThemeProvider";
import { UIConfigProvider } from "@/components/providers/UIConfigProvider";

export default function ThemeClientWrapper({ children }) {
  return (
    <UIConfigProvider>
      <SunmiThemeProvider>
        <ThemeBody>{children}</ThemeBody>
      </SunmiThemeProvider>
    </UIConfigProvider>
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
