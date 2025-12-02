"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { cn } from "@/lib/utils";

export default function SunmiButton({
  children,
  variant = "primary", // primary | danger | secondary | ghost
  className = "",
  ...props
}) {
  const { theme } = useSunmiTheme();

  const styles = {
    primary: `${theme.button.primary.bg} ${theme.button.primary.text} ${theme.button.primary.hover}`,
    danger: `${theme.button.danger.bg} ${theme.button.danger.text} ${theme.button.danger.hover}`,
    secondary: `${theme.button.secondary.bg} ${theme.button.secondary.text} ${theme.button.secondary.hover}`,

    // Nuevo: botón "ghost"
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
        "h-[36px] px-4 rounded-md text-[13px] font-medium transition-all",
        styles[variant],
        className
      )}
    >
      {children}
    </button>
  );
}
