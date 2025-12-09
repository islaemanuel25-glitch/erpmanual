"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiButtonIcon({
  icon: Icon,
  color = "amber",
  size = 16,
  onClick = () => {},
}) {
  const { ui } = useUIConfig();
  
  const colorStyles = {
    amber: {
      color: "#fcd34d", // amber-300
      hoverColor: "#fde047", // amber-200
    },
    red: {
      color: "#f87171", // red-400
      hoverColor: "#fca5a5", // red-300
    },
    slate: {
      color: "#94a3b8", // slate-400
      hoverColor: "#e2e8f0", // slate-200
    },
  };

  const style = colorStyles[color] || colorStyles.amber;
  const iconSize = size || parseInt(ui.helpers.icon(1));

  return (
    <button
      onClick={onClick}
      className="transition"
      style={{
        padding: ui.helpers.spacing("xs"),
        borderRadius: ui.helpers.radius("sm"),
        color: style.color,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = style.hoverColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = style.color;
      }}
    >
      <Icon size={iconSize} strokeWidth={2} />
    </button>
  );
}
