"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

export default function SunmiToggle({ value = false, onChange = () => {}, label }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const { hover, focus } = useSunmiAnimation();
  const t = theme.toggle;

  const [checked, setChecked] = useState(value);

  useEffect(() => setChecked(value), [value]);

  const toggle = () => {
    const v = !checked;
    setChecked(v);
    onChange(v);
  };

  return (
    <div
      className="flex items-center cursor-pointer select-none"
      onClick={toggle}
      style={{
        gap: ui.gap,
        transform: `scale(${ui.scale})`,
        transitionDuration: `${focus.duration}ms`,
        transitionTimingFunction: focus.easing,
      }}
    >
      {/* TRACK */}
      <div
        className={cn(
          "rounded-full transition-all",
          checked ? t.on : t.off
        )}
        style={{
          width: ui.density.inputHeight * 1.4,
          height: ui.density.inputHeight * 0.6,
        }}
      >
        {/* THUMB */}
        <div
          className={cn("rounded-full shadow transition-all", t.thumb)}
          style={{
            width: ui.density.inputHeight * 0.6,
            height: ui.density.inputHeight * 0.6,
            transform: checked
              ? `translateX(${ui.density.inputHeight * 0.8}px)`
              : "translateX(0)",
          }}
        />
      </div>

      {label && (
        <span
          className={theme.layout}
          style={{
            fontSize: ui.font.fontSize,
            lineHeight: ui.font.lineHeight,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
