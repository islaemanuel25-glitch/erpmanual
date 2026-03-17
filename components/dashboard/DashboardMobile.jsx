"use client";

import Link from "next/link";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import AccesosRapidos from "./AccesosRapidos";
import UltimasVentas from "./UltimasVentas";
import ActividadReciente from "./ActividadReciente";
import { Plus } from "lucide-react";

export default function DashboardMobile({
  nombre,
  resumen,
  ventas = [],
  actividad,
  cargandoResumen,
  cargandoVentas,
  cargandoActividad,
}) {
  const { theme } = useSunmiTheme();

  const totalHoy = resumen
    ? `$${resumen.totalVentas.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
    : "—";
  const ticketsHoy = resumen ? resumen.cantidadVentas : "—";

  return (
    <div className="flex flex-col gap-5 md:hidden pb-4">
      {/* Hero: ERP Azul + saludo + ventas del día */}
      <div
        className={`
          ${theme.card}
          rounded-2xl p-5 shadow-lg
          border border-current/10
        `}
      >
        <p className="text-xs font-medium uppercase tracking-wider opacity-50 mb-1">
          ERP Azul
        </p>
        <p className="text-lg font-semibold">
          {nombre ? `Hola, ${nombre}` : "Dashboard"}
        </p>
        <p className="text-2xl font-bold mt-2">
          {cargandoResumen ? "..." : totalHoy}
        </p>
        <p className="text-xs opacity-60 mt-0.5">
          Ventas del día · {cargandoResumen ? "..." : ticketsHoy} tickets
        </p>
        <Link
          href="/modulos/pos-ventas"
          className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-amber-500 text-slate-900"
        >
          <Plus size={18} />
          Nueva Venta
        </Link>
      </div>

      {/* Accesos rápidos tipo app */}
      <div className={`${theme.card} rounded-xl p-3 shadow-sm`}>
        <h3 className="text-[11px] font-medium mb-1 opacity-40 uppercase tracking-widest px-1">
          Accesos rápidos
        </h3>
        <AccesosRapidos variant="mobile" />
      </div>

      {/* Últimas ventas y Actividad en cards */}
      <UltimasVentas ventas={ventas} cargando={cargandoVentas} />
      <ActividadReciente actividad={actividad} cargando={cargandoActividad} />
    </div>
  );
}
