"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiHeader({ title, color = "amber", children }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  const bgClass =
    color === "cyan"
      ? theme.header.bg.includes("cyan")
        ? theme.header.bg
        : theme.header.bg.replace("amber", "cyan")
      : theme.header.bg;

  return (
    <div
      className={`
        bg-gradient-to-r ${bgClass}
        ${theme.header.border}
        ${theme.header.text}
        rounded-xl 
        shadow-md
        border
      `}
      style={{
        padding: ui.spacingScale[ui.spacing],
        marginBottom: ui.gap,
        fontSize: ui.font.fontSize,
        lineHeight: ui.font.lineHeight,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        fontWeight: 700,
        transform: `scale(${ui.scale})`,
      }}
    >
      {title}
      {children}
    </div>
  );
}
