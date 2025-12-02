"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { cn } from "@/lib/utils";

export default function SunmiTableRow({ children, selected = false, onClick }) {
  const { theme } = useSunmiTheme();
  const t = theme.table;

  return (
    <tr
      onClick={onClick}
      className={cn(
        `
        text-[12px]
        transition-colors
      `,
        onClick && "cursor-pointer",
        selected ? t.selected : t.row
      )}
    >
      {children}
    </tr>
  );
}
