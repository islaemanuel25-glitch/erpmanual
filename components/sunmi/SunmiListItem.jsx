"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiListItem({
  label,
  description,
  left = null,
  right = null,
  onClick,
  clickable = false,
  className = "",
}) {
  const { theme } = useSunmiTheme();
  
  const base = `
    flex items-center justify-between 
    gap-3 py-2
  `;

  // Extraer colores del theme
  const textColor = theme.layout.split(' ').find(c => c.startsWith('text-')) || 'text-slate-100';
  const hoverBg = theme.table?.row?.includes('hover:') ? theme.table.row : 'hover:bg-slate-900/70';
  
  const clickableCls = clickable
    ? `cursor-pointer ${hoverBg}`
    : "";

  return (
    <div
      className={`${base} ${clickableCls} ${className}`}
      onClick={clickable ? onClick : undefined}
    >
      <div className="flex items-start gap-2 min-w-0">
        {left && <div className="mt-[2px]">{left}</div>}
        <div className="flex flex-col min-w-0">
          <span className={`text-[13px] ${textColor} truncate`}>
            {label}
          </span>
          {description && (
            <span className="text-[11px] text-slate-400 truncate">
              {description}
            </span>
          )}
        </div>
      </div>

      {right && (
        <div className="flex items-center gap-2 shrink-0">
          {right}
        </div>
      )}
    </div>
  );
}
