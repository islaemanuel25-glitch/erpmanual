"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

export default function SunmiListCardItem({
  children,
  className = "",
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const t = theme.list;

  return (
    <div
      className={cn(
        `
        flex items-center justify-between
        relative
      `,
        className
      )}
      style={{
        paddingTop: ui.gap,
        paddingBottom: ui.gap,
        transform: `scale(${ui.scale})`,
      }}
    >
      <div
        className={cn(
          `
          absolute left-0 right-0
          h-[1px]
        `,
          t.separator
        )}
        style={{
          bottom: ui.gap * -0.5,
        }}
      />

      <div
        className="flex-1 truncate"
        style={{
          fontSize: ui.font.fontSize,
          lineHeight: ui.font.lineHeight,
        }}
      >
        {children}
      </div>
    </div>
  );
}
