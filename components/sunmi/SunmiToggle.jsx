"use client";

import { useState, useEffect } from "react";
import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

export default function SunmiToggle({
  value = false,
  onChange = () => {},
  label = "",
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const t = theme.toggle;

  const [checked, setChecked] = useState(value);

  useEffect(() => {
    setChecked(value);
  }, [value]);

  const toggle = () => {
    const newVal = !checked;
    setChecked(newVal);
    onChange(newVal);
  };

  const trackWidth = ui.density.inputHeight * 1.4;
  const trackHeight = ui.density.inputHeight * 0.6;
  const thumbSize = ui.density.inputHeight * 0.6;
  const thumbTranslate = ui.density.inputHeight * 0.8;

  return (
    <div
      className="flex items-center cursor-pointer select-none"
      style={{
        gap: ui.spacing.sm,
        transform: `scale(${ui.scale})`,
      }}
      onClick={toggle}
    >
      {/* TRACK */}
      <div
        className={cn(
          `
          transition-all
        `,
          checked ? t.on : t.off
        )}
        style={{
          width: trackWidth,
          height: trackHeight,
          borderRadius: ui.rounded.full,
          position: "relative",
        }}
      >
        {/* THUMB */}
        <div
          className={cn(
            `
            shadow
            transition-all
          `,
            t.thumb
          )}
          style={{
            width: thumbSize,
            height: thumbSize,
            borderRadius: ui.rounded.full,
            transform: checked
              ? `translateX(${thumbTranslate}px)`
              : "translateX(0px)",
          }}
        />
      </div>

      {/* LABEL */}
      {label && (
        <span
          className={theme.layout}
          style={{
            fontSize: ui.font.base * ui.font.scaleMd,
            lineHeight: ui.font.lineHeight,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
