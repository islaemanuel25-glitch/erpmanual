"use client";

import Link from "next/link";
import KpiCard from "./KpiCard";
import AccesosRapidos from "./AccesosRapidos";
import UltimasVentas from "./UltimasVentas";
import ActividadReciente from "./ActividadReciente";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import {
  DollarSign,
  Receipt,
  TrendingUp,
  ShoppingBag,
  Plus,
  ClipboardList,
  UserPlus,
} from "lucide-react";

function formatMoneda(valor) {
  return `$${valor.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
}

export default function DashboardDesktop({
  nombre = "",
  resumen,
  ventas,
  actividad,
  cargandoResumen,
  cargandoVentas,
  cargandoActividad,
}) {
  const { theme } = useSunmiTheme();

  const kpis = resumen
    ? [
        {
          titulo: "Ventas hoy",
          valor: formatMoneda(resumen.totalVentas),
          icono: DollarSign,
          color: "blue",
        },
        {
          titulo: "Tickets",
          valor: resumen.cantidadVentas,
          icono: Receipt,
          color: "green",
        },
        {
          titulo: "Ticket promedio",
          valor: formatMoneda(resumen.ticketPromedio),
          icono: TrendingUp,
          color: "orange",
        },
        {
          titulo: "Items vendidos",
          valor: resumen.itemsVendidos,
          icono: ShoppingBag,
          color: "purple",
        },
      ]
    : [];

  return (
    <div className="hidden md:flex flex-col gap-5 max-w-6xl">
      {/* Título Panel + CTAs opcionales */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold opacity-90">Panel</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/modulos/pos-ventas"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-amber-500 text-slate-900 hover:bg-amber-400 transition"
          >
            <Plus size={16} />
            Nueva Venta
          </Link>
          <Link
            href="/modulos/pedidos"
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${theme.card} border border-current/15 hover:opacity-90 transition`}
          >
            <ClipboardList size={15} />
            Pedido
          </Link>
          <Link
            href="/modulos/clientes"
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${theme.card} border border-current/15 hover:opacity-90 transition`}
          >
            <UserPlus size={15} />
            Cliente
          </Link>
        </div>
      </div>

      {/* KPIs: 4 cards compactas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cargandoResumen
          ? Array.from({ length: 4 }).map((_, i) => (
              <KpiCard key={i} titulo="Cargando..." valor="—" />
            ))
          : kpis.map((kpi) => (
              <KpiCard
                key={kpi.titulo}
                titulo={kpi.titulo}
                valor={kpi.valor}
                icono={kpi.icono}
                color={kpi.color}
              />
            ))}
      </div>

      {/* Dos columnas: Accesos rápidos | Últimas ventas */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className={`lg:col-span-2 ${theme.card} rounded-xl p-4 shadow-sm`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold opacity-80">Accesos rápidos</h3>
            <Link
              href="/modulos/configuracion"
              className="text-xs font-medium opacity-60 hover:opacity-90 transition"
            >
              Personalizar
            </Link>
          </div>
          <AccesosRapidos variant="desktop" />
        </div>
        <div className="lg:col-span-3">
          <UltimasVentas ventas={ventas} cargando={cargandoVentas} />
        </div>
      </div>

      <ActividadReciente actividad={actividad} cargando={cargandoActividad} />
    </div>
  );
}
