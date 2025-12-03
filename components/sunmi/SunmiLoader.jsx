"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

export default function SunmiLoader({ size = 20, className = "" }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const t = theme.loader;

  const finalSize = size * ui.scale;

  return (
    <div
      className="flex justify-center"
      style={{
        paddingTop: ui.spacing.sm,
        paddingBottom: ui.spacing.sm,
        transform: `scale(${ui.scale})`,
      }}
    >
      <div
        className={cn(
          `
          animate-spin
        `,
          t.border,
          t.accent,
          className
        )}
        style={{
          width: finalSize,
          height: finalSize,
          borderRadius: ui.rounded.full,
          borderWidth: ui.border.widthThin,
        }}
      />
    </div>
  );
}
