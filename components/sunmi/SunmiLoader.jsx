"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiLoader({ size = 20 }) {
  const { theme } = useSunmiTheme();
  
  // Usar color del header para el spinner
  const spinnerColor = theme.header.bg.includes('amber') ? 'border-t-amber-400' : 'border-t-cyan-400';
  const borderColor = theme.card.split(' ').find(c => c.startsWith('border-'))?.replace('border-', 'border-') || 'border-slate-700';
  
  return (
    <div className="flex justify-center py-2">    {/* antes py-4 */}
      <div
        className={`
          animate-spin 
          rounded-full 
          ${borderColor}       /* antes border-2 */
          ${spinnerColor}
        `}
        style={{
          width: size,                  /* antes 28 by default */
          height: size,
        }}
      />
    </div>
  );
}
