"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiTableRow({ children, selected = false, onClick }) {
  const { ui } = useUIConfig();
  
  return (
    <tr
      onClick={onClick}
      className={onClick ? "cursor-pointer" : ""}
      style={{
        fontSize: ui.helpers.font("xs"),
        backgroundColor: selected ? "var(--sunmi-table-row-bg)" : "transparent",
        ...(onClick && !selected ? {
          transition: "background-color 0.2s",
        } : {}),
      }}
      onMouseEnter={(e) => {
        if (onClick && !selected) {
          e.currentTarget.style.backgroundColor = "var(--sunmi-table-row-bg)";
        }
      }}
      onMouseLeave={(e) => {
        if (onClick && !selected) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      {children}
    </tr>
  );
}
