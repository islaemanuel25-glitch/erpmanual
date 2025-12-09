"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiButton({ color = "cyan", children, ...props }) {
  const { ui } = useUIConfig();

  const colorStyles = {
    amber: {
      backgroundColor: "#fbbf24", // amber-400
      color: "#0f172a", // slate-900
      hoverBackgroundColor: "#fcd34d", // amber-300
    },
    red: {
      backgroundColor: "#ef4444", // red-500
      color: "#ffffff", // white
      hoverBackgroundColor: "#f87171", // red-400
    },
    cyan: {
      backgroundColor: "#06b6d4", // cyan-500
      color: "#0f172a", // slate-900
      hoverBackgroundColor: "#22d3ee", // cyan-400
    },
  };

  const style = colorStyles[color] || colorStyles.cyan;

  return (
    <button
      {...props}
      className="transition-all font-medium"
      style={{
        backgroundColor: style.backgroundColor,
        color: style.color,
        height: ui.helpers.controlHeight(),
        paddingLeft: ui.helpers.spacing("lg"),
        paddingRight: ui.helpers.spacing("lg"),
        borderRadius: ui.helpers.radius("md"),
        fontSize: ui.helpers.font("sm"),
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = style.hoverBackgroundColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = style.backgroundColor;
      }}
    >
      {children}
    </button>
  );
}
