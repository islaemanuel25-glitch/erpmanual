"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

export default function SunmiTableRow({ children, selected = false, onClick }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const t = theme.table;

  return (
    <tr
      onClick={onClick}
      className={cn(
        `
        transition-colors
      `,
        onClick && "cursor-pointer",
        selected ? t.selected : t.row
      )}
      style={{
        height: ui.density.tableRowHeight,
        fontSize: ui.font.fontSize,
        lineHeight: ui.font.lineHeight,
        transform: `scale(${ui.scale})`,
      }}
    >
      {children}
    </tr>
  );
}
