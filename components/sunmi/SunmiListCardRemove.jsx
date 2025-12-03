"use client";

import { X } from "lucide-react";
import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiListCardRemove({ onClick }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  const hoverBg =
    theme.table?.row?.includes("hover:")
      ? theme.table.row.split(" ").find((c) => c.startsWith("hover:"))
      : "hover:bg-slate-800/50";

  return (
    <button
      onClick={onClick}
      className={`
        flex items-center justify-center
        rounded-md
        transition
        ${hoverBg}
      `}
      style={{
        width: ui.density.iconSize + ui.gap * 2,
        height: ui.density.iconSize + ui.gap * 2,
        transform: `scale(${ui.scale})`,
      }}
    >
      <X size={ui.density.iconSize} />
    </button>
  );
}
