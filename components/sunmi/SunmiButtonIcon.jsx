"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiButtonIcon({
  icon: Icon,
  color = "amber",
  size = 16,
  onClick = () => {},
}) {
  const { ui } = useUIConfig();
  
  const colors = {
    amber: "text-amber-300 hover:text-amber-200",
    red: "text-red-400 hover:text-red-300",
    slate: "text-slate-400 hover:text-slate-200",
  };

  const iconSize = size || parseInt(ui.helpers.icon(1));

  return (
    <button
      onClick={onClick}
      className={`transition ${colors[color]}`}
      style={{
        padding: ui.helpers.spacing("xs"),
        borderRadius: ui.helpers.radius("sm"),
      }}
    >
      <Icon size={iconSize} strokeWidth={2} />
    </button>
  );
}
