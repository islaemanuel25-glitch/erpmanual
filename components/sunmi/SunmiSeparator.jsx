"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiSeparator({ label, className = "" }) {
  const { theme } = useSunmiTheme();
  
  // Usar color de borde del card para el separador
  const separatorColor = theme.card.split(' ').find(c => c.startsWith('border-'))?.replace('border-', 'bg-') || 'bg-slate-700/60';
  
  return (
    <div
      className={`
        flex items-center gap-2
        text-[12px] text-slate-400
        my-2          /* antes my-4 o my-6 */
        ${className}
      `}
    >
      <div className={`flex-1 h-px ${separatorColor}`} />
      {label && <span className="whitespace-nowrap">{label}</span>}
      <div className={`flex-1 h-px ${separatorColor}`} />
    </div>
  );
}
