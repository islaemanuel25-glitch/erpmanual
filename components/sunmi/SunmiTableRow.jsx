"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";
import { cn } from "@/lib/utils";

export default function SunmiTableRow({
  children,
  selected = false,
  onClick,
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const t = theme.table;
  const tableAnim = ui.animations;

  return (
    <tr
      onClick={onClick}
      className={cn(
        "transition-all",
        onClick && "cursor-pointer",
        selected ? t.selected : t.row
      )}
      style={{
        height: ui.tableRowHeight,
        fontSize: ui.fontSize,
        lineHeight: `${ui.fontLineHeight}px`,
        transform: `translateY(${tableAnim.tableSlideY}px)`,
        animation: `sunmiTableSlide ${tableAnim.tableFade}ms ${tableAnim.easing} forwards`,
      }}
    >
      <style>{`
        @keyframes sunmiTableSlide {
          from {
            opacity: ${tableAnim.fadeFrom};
            transform: translateY(${tableAnim.tableSlideY}px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {children}
    </tr>
  );
}
