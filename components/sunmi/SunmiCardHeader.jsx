"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiCardHeader({
  title = "",
  children,
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  return (
    <div
      className="flex items-center justify-between"
      style={{
        marginBottom: ui.spacing.sm,
        paddingLeft: ui.spacing.sm,
        paddingRight: ui.spacing.sm,
        transform: `scale(${ui.scale})`,
      }}
    >
      <h2
        className={`font-semibold tracking-wide ${theme.text}`}
        style={{
          fontSize: ui.font.base * ui.font.scaleLg,
          lineHeight: ui.font.lineHeight,
        }}
      >
        {title}
      </h2>

      <div
        className="flex items-center"
        style={{
          gap: ui.spacing.xs,
        }}
      >
        {children}
      </div>
    </div>
  );
}
