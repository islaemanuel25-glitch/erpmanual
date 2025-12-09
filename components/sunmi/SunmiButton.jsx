"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiButton({ color = "cyan", children, ...props }) {
  const { ui } = useUIConfig();

  const colorStyles = {
    amber: "bg-amber-400 text-slate-900 hover:bg-amber-300",
    red: "bg-red-500 text-white hover:bg-red-400",
    cyan: "bg-cyan-500 text-slate-900 hover:bg-cyan-400",
  };

  return (
    <button
      {...props}
      className={`transition-all font-medium ${colorStyles[color] || colorStyles.cyan}`}
      style={{
        height: ui.helpers.controlHeight(),
        paddingLeft: ui.helpers.spacing("lg"),
        paddingRight: ui.helpers.spacing("lg"),
        borderRadius: ui.helpers.radius("md"),
        fontSize: ui.helpers.font("sm"),
      }}
    >
      {children}
    </button>
  );
}
