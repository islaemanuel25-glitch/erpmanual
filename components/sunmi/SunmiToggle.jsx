"use client";

import { useState, useEffect } from "react";
import { useSunmiTheme } from "./SunmiThemeProvider";
import { cn } from "@/lib/utils";

export default function SunmiToggle({
  value = false,
  onChange = () => {},
  label = "",
}) {
  const { theme } = useSunmiTheme();
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

  return (
    <div
      className="flex items-center gap-2 cursor-pointer select-none"
      onClick={toggle}
    >
      {/* TRACK */}
      <div
        className={cn(
          `
          w-8 h-4
          rounded-full
          transition-all
        `,
          checked ? t.on : t.off
        )}
      >
        {/* THUMB */}
        <div
          className={cn(
            `
            w-4 h-4
            rounded-full
            shadow
            transition-all
          `,
            t.thumb,
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </div>

      {/* LABEL */}
      {label && (
        <span className={cn("text-[12px]", theme.layout)}>
          {label}
        </span>
      )}
    </div>
  );
}
