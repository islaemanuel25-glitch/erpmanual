"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

export default function SunmiPanel({
  children,
  className = "",
  noPadding = false,
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  return (
    <div
      className={cn(theme.card, className)}
      style={{
        padding: noPadding ? 0 : ui.spacingScale[ui.spacing],
        borderRadius: ui.roundedScale[ui.rounded],
        boxShadow: ui.shadowSm,
        backdropFilter: `blur(${ui.cardShadowBlur}px)`,
        transform: `scale(${ui.scale})`,
      }}
    >
      {children}
    </div>
  );
}
