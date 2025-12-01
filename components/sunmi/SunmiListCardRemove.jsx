"use client";

import { X } from "lucide-react";
import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiListCardRemove({ onClick }) {
  const { theme } = useSunmiTheme();
  
  // Usar hover del table row o un hover genérico basado en el card
  const hoverBg = theme.table?.row?.includes('hover:') 
    ? theme.table.row.split(' ').find(c => c.startsWith('hover:')) 
    : 'hover:bg-slate-800/50';
  
  return (
    <button
      onClick={onClick}
      className={`
        w-6 h-6
        flex items-center justify-center
        rounded-md
        ${hoverBg}
        transition
      `}
    >
      <X size={14} />
    </button>
  );
}
