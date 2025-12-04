"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";
import { cn } from "@/lib/utils";

export default function SunmiButton({
  children,
  variant = "primary",
  className = "",
  ...props
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const { hover, focus } = useSunmiAnimation();

  const styles = {
    primary: `${theme.button.primary.bg} ${theme.button.primary.text} ${theme.button.primary.hover}`,
    danger: `${theme.button.danger.bg} ${theme.button.danger.text} ${theme.button.danger.hover}`,
    secondary: `${theme.button.secondary.bg} ${theme.button.secondary.text} ${theme.button.secondary.hover}`,
    ghost: `
      bg-transparent
      ${theme.layout.includes("text-slate") ? "text-slate-200" : "text-slate-900"}
    `,
  };

  return (
    <button
      {...props}
      className={cn(
        `
          outline-none
          select-none
          transition-all
        `,
        styles[variant],
        className
      )}
      style={{
        height: ui.buttonHeight,
        fontSize: ui.fontSize,
        lineHeight: `${ui.fontLineHeight}px`,
        paddingLeft: ui.gap,
        paddingRight: ui.gap,
        borderRadius: ui.roundedScale[ui.rounded],
        transform: `scale(${ui.scale})`,
        transitionProperty: "background-color, transform, opacity",
        transitionDuration: `${ui.animations.duration}ms`,
        transitionTimingFunction: ui.animations.easing,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = `scale(${
          ui.scale * ui.animations.hoverScale
        })`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = `scale(${ui.scale})`;
      }}
      onFocus={(e) => {
        e.currentTarget.style.transform = `scale(${
          ui.scale * ui.animations.focusScale
        })`;
      }}
      onBlur={(e) => {
        e.currentTarget.style.transform = `scale(${ui.scale})`;
      }}
    >
      {children}
    </button>
  );
}
