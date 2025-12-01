"use client";

import { ChevronDown } from "lucide-react";
import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiSelect({ className = "", children, ...props }) {
  const { theme } = useSunmiTheme();
  
  // Extraer colores del theme
  const bgColor = theme.card.split(' ').find(c => c.startsWith('bg-')) || 'bg-slate-950/60';
  const borderColor = theme.card.split(' ').find(c => c.startsWith('border-')) || 'border-slate-700';
  const textColor = theme.layout.split(' ').find(c => c.startsWith('text-')) || 'text-slate-100';
  
  return (
    <div className="relative w-full">
      <select
        {...props}
        className={`
          w-full 
          px-2.5 py-1.5              /* antes px-3 py-2 */
          rounded-md                 /* antes rounded-xl */
          ${bgColor}
          border ${borderColor}
          ${textColor}
          text-[13px]                /* más compacto */
          appearance-none
          focus:outline-none
          focus:border-amber-400     /* sin ring gigante */
          transition
          ${className}
        `}
      >
        {children}
      </select>

      {/* Flecha compacta */}
      <ChevronDown
        size={14}                    /* antes 16 */
        className="
          absolute right-2 top-1/2 -translate-y-1/2
          text-amber-400 opacity-70 
          pointer-events-none
        "
      />
    </div>
  );
}
