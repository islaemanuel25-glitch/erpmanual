"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiTableEmpty({ message = "Sin datos disponibles" }) {
  const { theme } = useSunmiTheme();
  
  // Usar color de texto secundario del layout o un color neutro
  const textColor = theme.layout.split(' ').find(c => c.startsWith('text-'))?.replace('text-slate-50', 'text-slate-500') || 'text-slate-500';
  
  return (
    <tr>
      <td
        colSpan={50}
        className={`
          text-center 
          py-3                 /* antes py-6 */
          ${textColor}
          text-[12px]          /* ahora igual que la tabla */
          italic
        `}
      >
        {message}
      </td>
    </tr>
  );
}
