"use client";

import { X } from "lucide-react";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiListCardRemove({ onClick }) {
  const { ui } = useUIConfig();
  
  const iconSize = parseInt(ui.helpers.icon(0.875));
  
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center transition"
      style={{
        width: parseInt(ui.helpers.icon(1.125)),
        height: parseInt(ui.helpers.icon(1.125)),
        borderRadius: ui.helpers.radius("md"),
        backgroundColor: "transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--sunmi-table-row-bg)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <X size={iconSize} />
    </button>
  );
}
