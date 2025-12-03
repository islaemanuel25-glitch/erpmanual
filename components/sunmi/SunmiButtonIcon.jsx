"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiButtonIcon({
  icon: Icon,
  color = "amber",
  onClick = () => {},
}) {
  const { ui } = useUIConfig();

  const colors = {
    amber: "text-amber-300 hover:text-amber-200",
    red: "text-red-400 hover:text-red-300",
    slate: "text-slate-400 hover:text-slate-200",
  };

  return (
    <button
      onClick={onClick}
      className={`rounded transition ${colors[color]}`}
      style={{
        padding: ui.gap,
        transform: `scale(${ui.scale})`,
      }}
    >
      <Icon size={ui.density.iconSize} strokeWidth={2} />
    </button>
  );
}
