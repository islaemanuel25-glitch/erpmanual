"use client";

import { useState } from "react";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiToggle({
  value = false,
  onChange = () => {},
  label = "",
}) {
  const { ui } = useUIConfig();
  const [checked, setChecked] = useState(value);

  const toggle = () => {
    const newVal = !checked;
    setChecked(newVal);
    onChange(newVal);
  };

  const trackHeight = parseInt(ui.helpers.controlHeight()) * 0.4;
  const thumbSize = trackHeight * 0.9;
  const trackWidth = trackHeight * 2;
  const translateX = checked ? trackWidth - thumbSize - 2 : 2;

  return (
    <div
      className="flex items-center cursor-pointer select-none"
      onClick={toggle}
      style={{
        gap: ui.helpers.spacing("sm"),
      }}
    >
      {/* TRACK */}
      <div
        className="rounded-full transition-all"
        style={{
          backgroundColor: checked ? "#fbbf24" : "#475569", // amber-400 : slate-600
          width: trackWidth,
          height: trackHeight,
        }}
      >
        {/* THUMB */}
        <div
          className="bg-white rounded-full shadow transform transition-all"
          style={{
            width: thumbSize,
            height: thumbSize,
            transform: `translateX(${translateX}px)`,
          }}
        />
      </div>

      {label && (
        <span
          style={{
            color: "var(--sunmi-text)",
            fontSize: ui.helpers.font("xs"),
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
