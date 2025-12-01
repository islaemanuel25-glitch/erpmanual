"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiTableRow({ children, selected = false, onClick }) {
  const { theme } = useSunmiTheme();
  
  const hoverClass = theme.table?.row || "hover:bg-slate-800/40";
  const selectedClass = selected ? (theme.table?.row?.replace('hover:', '') || "bg-slate-800") : "";
  
  return (
    <tr
      onClick={onClick}
      className={`
        text-[12px]
        ${onClick ? "cursor-pointer" : ""}
        ${selected ? selectedClass : hoverClass}
      `}
    >
      {children}
    </tr>
  );
}
