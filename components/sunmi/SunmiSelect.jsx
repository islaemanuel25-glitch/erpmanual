"use client";

import { ChevronDown } from "lucide-react";

export default function SunmiSelect({ className = "", children, ...props }) {
  return (
    <div className="relative w-full">
      <select
        {...props}
        className={`
          w-full
          px-2.5 py-1.5
          rounded-md
          sunmi-select-trigger
          text-[13px]
          appearance-none
          transition
          ${className}
        `}
      >
        {children}
      </select>

      {/* Flecha compacta */}
      <ChevronDown
        size={14}
        className="
          absolute right-2 top-1/2 -translate-y-1/2
          sunmi-text-accent opacity-70
          pointer-events-none
        "
      />
    </div>
  );
}
