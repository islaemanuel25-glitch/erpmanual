"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "@/components/sunmi/useSunmiAnimation";
import { cn } from "@/lib/utils";

export default function SunmiInput({
  value,
  onChange,
  className = "",
  ...props
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const { focus } = useSunmiAnimation();
  const t = theme.input;

  const isControlled = value !== undefined;

  return (
    <input
      {...props}
      value={isControlled ? value : ""}
      onChange={onChange}
      className={cn(
        `
        w-full
        rounded-md
        outline-none
        transition-all
        ${t.bg}
        ${t.text}
        ${t.border}
        ${t.placeholder}
        ${t.focus}
      `,
        className
      )}
      style={{
        padding: `${ui.gap}`,
        height: ui.density.inputHeight,
        fontSize: ui.font.fontSize,
        lineHeight: ui.font.lineHeight,
        transform: `scale(${ui.scale})`,
        transitionProperty: "border-color, transform, opacity",
        transitionDuration: `${focus.duration}ms`,
        transitionTimingFunction: focus.easing,
      }}
      onFocus={(e) => {
        e.currentTarget.style.transform = `scale(${ui.scale * focus.scale})`;
      }}
      onBlur={(e) => {
        e.currentTarget.style.transform = `scale(${ui.scale})`;
      }}
    />
  );
}
