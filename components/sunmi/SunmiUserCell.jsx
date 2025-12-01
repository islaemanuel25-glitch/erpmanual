"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiUserCell({ nombre = "", email = "" }) {
  const { theme } = useSunmiTheme();
  const inicial = nombre?.[0]?.toUpperCase() ?? "?";

  // Usar color del header para el avatar (amber o cyan según theme)
  const avatarBg = theme.header.bg.includes('amber') ? 'bg-amber-400' : 'bg-cyan-400';
  const textColor = theme.layout.split(' ').find(c => c.startsWith('text-')) || 'text-slate-100';

  return (
    <div className="flex items-center gap-2">
      <div className={`w-8 h-8 rounded-full ${avatarBg} text-slate-900 flex items-center justify-center text-sm font-bold`}>
        {inicial}
      </div>

      <div className="flex flex-col">
        <span className={`font-medium ${textColor}`}>{nombre || "Sin nombre"}</span>
        <span className="text-xs text-slate-400">{email || "Sin email"}</span>
      </div>
    </div>
  );
}
