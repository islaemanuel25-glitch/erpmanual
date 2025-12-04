"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";
import { cn } from "@/lib/utils";

export default function SunmiTableRow({ children, selected = false, onClick }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const { table } = useSunmiAnimation();
  const t = theme.table;

  return (
    <tr
      onClick={onClick}
      className={cn(
        `
        transition-all
      `,
        onClick && "cursor-pointer",
        selected ? t.selected : t.row
      )}
      style={{
        height: ui.density.tableRowHeight,
        fontSize: ui.font.fontSize,
        lineHeight: ui.font.lineHeight,
        transform: `translateY(${table.slideOffsetY}px)`,
        animation: `tableSlide ${table.fadeDuration}ms ease forwards`,
      }}
    >
      <style>
        {`
      @keyframes tableSlide {
        from {
          opacity: ${table.fadeDuration ? 0.2 : 1};
          transform: translateY(${table.slideOffsetY}px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      `}
      </style>

      {children}
    </tr>
  );
}
