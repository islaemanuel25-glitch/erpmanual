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
        bg-gradient-to-r 
        ${bgClass}
        ${theme.header.border}
        ${theme.header.text}
        border
      `}
      style={{
        padding: ui.spacing.md,
        marginBottom: ui.spacing.sm,
        borderRadius: ui.rounded.lg,
        boxShadow: ui.shadow.sm,
        fontSize: ui.font.base * ui.font.scaleMd,
        lineHeight: ui.font.lineHeight,
        letterSpacing: ui.font.letterSpacing,
        textTransform: "uppercase",
        fontWeight: ui.font.weightBold,
        transform: `scale(${ui.scale})`,
      }}
    >
      {title}
      {children}
    </div>
  );
}
