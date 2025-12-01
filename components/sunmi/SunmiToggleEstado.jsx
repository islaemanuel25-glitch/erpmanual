"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiToggleEstado({
  value = true,
  onChange = () => {},
}) {
  const { theme } = useSunmiTheme();
  
  // Normalizar valor del backend / formulario
  const normalized =
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "activo";

  const toggle = () => {
    onChange(!normalized);
  };

  // Usar badgeActivo para el estado activo
  const activeBg = theme.badgeActivo.split(' ').find(c => c.startsWith('bg-')) || 'bg-green-400';
  
  // Extraer color de texto del layout
  const textColor = theme.layout.split(' ').find(c => c.startsWith('text-'))?.replace('text-slate-50', 'text-slate-300') || 'text-slate-300';

  return (
    <div
      className="flex items-center gap-2 cursor-pointer select-none"
      onClick={toggle}
    >
      {/* Switch */}
      <div
        className={`w-10 h-5 rounded-full transition-all ${
          normalized ? activeBg : "bg-slate-600"
        }`}
      >
        <div
          className={`w-5 h-5 bg-white rounded-full shadow transform transition-all ${
            normalized ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </div>

      {/* Texto */}
      <span className={`text-[12px] ${textColor}`}>
        {normalized ? "Habilitado" : "Inactivo"}
      </span>
    </div>
  );
}
