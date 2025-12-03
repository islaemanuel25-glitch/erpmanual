"use client";

import { SunmiThemeProvider } from "./SunmiThemeProvider";
import { SunmiLayoutProvider } from "./SunmiLayoutProvider";
import { UIConfigProvider, useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiTheme } from "./SunmiThemeProvider";

export default function ThemeClientWrapper({ children }) {
  return (
    <UIConfigProvider>
      <SunmiThemeProvider>
        <SunmiLayoutProvider>
          <ThemeBody>{children}</ThemeBody>
        </SunmiLayoutProvider>
      </SunmiThemeProvider>
    </UIConfigProvider>
  );
}

function ThemeBody({ children }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  return (
    <body
      className={`h-screen w-screen overflow-hidden ${theme.layout}`}
      style={{
        transform: `scale(${ui.scale})`,
        fontSize: ui.font.fontSize,
        lineHeight: ui.font.lineHeight,
      }}
    >
      {children}
    </body>
  );
}
