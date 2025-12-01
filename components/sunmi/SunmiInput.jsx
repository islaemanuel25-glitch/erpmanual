"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiInput({ className = "", ...props }) {
  const { theme } = useSunmiTheme();
  
  // Extraer color de texto del layout
  const textColor = theme.layout.split(' ').find(c => c.startsWith('text-')) || 'text-slate-100';
  
  return (
    <input
      {...props}
      className={`
        px-2 py-1.5          /* reducido */
        w-full rounded-md
        ${theme.card.split(' ').find(c => c.startsWith('bg-')) || 'bg-slate-900'} ${textColor}
        placeholder-slate-500
        border ${theme.card.split(' ').find(c => c.startsWith('border-')) || 'border-slate-700'}
        text-[13px]
        focus:border-amber-400
        outline-none
        ${className}
      `}
    />
  );
}
