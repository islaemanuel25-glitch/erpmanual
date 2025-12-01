"use client";

import { useState } from "react";
import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiToggle({
  value = false,
  onChange = () => {},
  label = "",
}) {
  const { theme } = useSunmiTheme();
  const [checked, setChecked] = useState(value);

  const toggle = () => {
    const newVal = !checked;
    setChecked(newVal);
    onChange(newVal);
  };

  // Extraer color de texto del layout
  const textColor = theme.layout.split(' ').find(c => c.startsWith('text-'))?.replace('text-slate-50', 'text-slate-300') || 'text-slate-300';

  return (
    <div
      className="flex items-center gap-2 cursor-pointer select-none"
      onClick={toggle}
    >
      {/* TRACK */}
      <div
        className={`
          w-8 h-4                 /* antes w-10 h-5 */
          rounded-full
          transition-all
          ${checked ? "bg-amber-400" : "bg-slate-600"}
        `}
      >
        {/* THUMB */}
        <div
          className={`
            w-4 h-4               /* antes w-5 h-5 */
            bg-white rounded-full
            shadow
            transform transition-all
            ${checked ? "translate-x-4" : "translate-x-0"}
          `}
        />
      </div>

      {label && (
        <span className={`text-[12px] ${textColor}`}>{label}</span>
      )}
    </div>
  );
}
