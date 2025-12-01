"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiListCardItem({
  children,
  className = "",
}) {
  const { theme } = useSunmiTheme();
  
  // Usar color de borde del card para el separador
  const separatorColor = theme.card.split(' ').find(c => c.startsWith('border-'))?.replace('border-', '') || 'slate-800';
  
  return (
    <div
      className={`
        flex items-center justify-between
        py-2
        relative
        ${className}
      `}
    >
      {/* Separador soft Sunmi → super leve, theme-friendly */}
      <div className={`
        absolute -bottom-[1px] left-0 right-0
        h-[1px]
        bg-${separatorColor}/20
      `} />

      {/* Contenido */}
      <div className="flex-1 truncate">
        {children}
      </div>
    </div>
  );
}
