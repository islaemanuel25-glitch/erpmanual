"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiList({
  children,
  className = "",
}) {
  const { theme } = useSunmiTheme();
  
  // Usar color de borde del card para el divider
  const dividerColor = theme.card.split(' ').find(c => c.startsWith('border-'))?.replace('border-', 'divide-') || 'divide-slate-800/80';
  
  return (
    <div
      className={`
        flex flex-col 
        divide-y ${dividerColor}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
