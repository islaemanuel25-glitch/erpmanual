"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiCardHeader({
  title = "",
  children,
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  return (
    <div
      className="
        flex items-center justify-between
        px-1
      "
      style={{
        marginBottom: ui.gap,
        transform: `scale(${ui.scale})`,
      }}
    >
      <h2
        className={`font-semibold tracking-wide ${
          theme.layout.split(" ")[1] || "text-slate-200"
        }`}
        style={{
          fontSize: ui.font.fontSize,
          lineHeight: ui.font.lineHeight,
        }}
      >
        {title}
      </h2>

      <div
        className="flex items-center"
        style={{ gap: ui.gap }}
      >
        {children}
      </div>
    </div>
  );
}
