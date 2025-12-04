"use client";

import { SunmiThemeProvider } from "./SunmiThemeProvider";
import { SunmiLayoutProvider } from "./SunmiLayoutProvider";
import {
  UIConfigProvider,
  useUIConfig,
} from "@/components/providers/UIConfigProvider";
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
      className={theme.layout}
      style={{
        minHeight: "100vh",
        fontSize: ui.fontSize,
        lineHeight: `${ui.fontLineHeight}px`,
      }}
    >
      {children}
    </body>
  );
}
