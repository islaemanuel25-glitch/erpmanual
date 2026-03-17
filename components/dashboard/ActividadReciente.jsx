"use client";

import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import SunmiCard from "@/components/sunmi/SunmiCard";
import { ShoppingCart, Package, Clock } from "lucide-react";

const ICONO_TIPO = {
  venta: ShoppingCart,
  stock: Package,
};

function formatHora(fecha) {
  const d = new Date(fecha);
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function formatFechaCorta(fecha) {
  const d = new Date(fecha);
  const hoy = new Date();
  const esHoy =
    d.getDate() === hoy.getDate() &&
    d.getMonth() === hoy.getMonth() &&
    d.getFullYear() === hoy.getFullYear();

  if (esHoy) return formatHora(fecha);

  return (
    d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) +
    " " +
    formatHora(fecha)
  );
}

export default function ActividadReciente({ actividad = [], cargando = false }) {
  const { theme } = useSunmiTheme();

  if (cargando) {
    return (
      <SunmiCard className="p-4">
        <h3 className="text-sm font-semibold mb-3 opacity-70">
          Actividad reciente
        </h3>
        <div className="flex items-center justify-center py-8 opacity-40">
          <Clock size={20} className="animate-spin" />
        </div>
      </SunmiCard>
    );
  }

  if (!actividad.length) {
    return (
      <SunmiCard className="p-4">
        <h3 className="text-sm font-semibold mb-3 opacity-70">
          Actividad reciente
        </h3>
        <p className="text-sm opacity-50 py-4 text-center">
          Sin actividad reciente
        </p>
      </SunmiCard>
    );
  }

  return (
    <SunmiCard className="p-4 overflow-hidden">
      <h3 className="text-sm font-semibold mb-3 opacity-70">
        Actividad reciente
      </h3>
      <ul className="flex flex-col gap-0.5">
        {actividad.map((item, i) => {
          const Icono = ICONO_TIPO[item.tipo] || Clock;
          return (
            <li
              key={`${item.tipo}-${item.id}-${i}`}
              className={`
                flex items-start gap-3 py-2.5 px-3 rounded-lg text-sm
                ${theme.sidebar?.dropdownItemHover || "hover:opacity-80"}
              `}
            >
              <Icono size={16} className="shrink-0 mt-0.5 opacity-50" />
              <div className="min-w-0 flex-1">
                <p className="truncate">{item.descripcion}</p>
                <p className="text-xs opacity-50 mt-0.5">
                  {item.usuario && <span>{item.usuario} · </span>}
                  {formatFechaCorta(item.fecha)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </SunmiCard>
  );
}
