"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

export default function SunmiButton({
  children,
  variant = "primary",
  className = "",
  ...props
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  const styles = {
    primary: `${theme.button.primary.bg} ${theme.button.primary.text} ${theme.button.primary.hover}`,
    danger: `${theme.button.danger.bg} ${theme.button.danger.text} ${theme.button.danger.hover}`,
    secondary: `${theme.button.secondary.bg} ${theme.button.secondary.text} ${theme.button.secondary.hover}`,
    ghost: `
      bg-transparent 
      ${theme.layout.includes("text-slate") ? "text-slate-200" : "text-slate-900"}
      hover:bg-slate-700/30
    `,
  };

  return (
    <button
      {...props}
      className={cn(
        "transition-all font-medium",
        styles[variant],
        className
      )}
      style={{
        height: ui.density.buttonHeight,
        paddingLeft: ui.spacing.sm,
        paddingRight: ui.spacing.sm,
        borderRadius: ui.rounded.md,
        fontSize: ui.font.base * ui.font.scaleMd,
        lineHeight: ui.font.lineHeight,
        transform: `scale(${ui.scale})`,
      }}
    >
      {children}
    </button>
  );
}
