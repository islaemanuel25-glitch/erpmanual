"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiPill({ children }) {
  const { theme } = useSunmiTheme();
  
  // Usar color del header para el pill
  const pillBg = theme.header.bg.includes('amber') ? 'bg-amber-400' : 'bg-cyan-400';
  
  return (
    <span
      className={`
        inline-block 
        px-1.5 py-[1px]            /* reducido */
        rounded-md                 /* antes rounded-lg */
        text-[10.5px]              /* fino, uniforme con badges */
        font-semibold
        ${pillBg} text-slate-900
        leading-none               /* elimina altura fantasma */
        whitespace-nowrap
      `}
    >
      {children}
    </span>
  );
}
