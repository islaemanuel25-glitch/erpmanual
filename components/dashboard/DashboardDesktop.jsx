"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import KpiCard from "./KpiCard";
import AccesosRapidos from "./AccesosRapidos";
import UltimasVentas from "./UltimasVentas";
import ActividadReciente from "./ActividadReciente";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useMenu } from "@/hooks/useMenu";
import { isHrefVisible } from "@/lib/menu/lookup";
import {
  DollarSign,
  Receipt,
  TrendingUp,
  ShoppingBag,
  Plus,
  ClipboardList,
  UserPlus,
  AlertCircle,
  Store,
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
  errorCarga,
}) {
  const { theme } = useSunmiTheme();
  const router = useRouter();
  const { menu } = useMenu();

  const kpisDefs = [
    { titulo: "Ventas hoy", campo: "totalVentas", formato: true, icono: DollarSign, color: "blue" },
    { titulo: "Tickets", campo: "cantidadVentas", formato: false, icono: Receipt, color: "green" },
    { titulo: "Ticket promedio", campo: "ticketPromedio", formato: true, icono: TrendingUp, color: "orange" },
    { titulo: "Items vendidos", campo: "itemsVendidos", formato: false, icono: ShoppingBag, color: "purple" },
  ];

  const kpis = kpisDefs.map((def) => ({
    titulo: def.titulo,
    valor: resumen
      ? (def.formato ? formatMoneda(resumen[def.campo]) : resumen[def.campo])
      : "—",
    icono: def.icono,
    color: def.color,
  }));

  const cardSoft = `${theme.card} rounded-xl border border-current/[0.06] shadow-sm`;

  return (
    <div className="hidden md:flex flex-col gap-5">
      <div className="flex items-center justify-end gap-2">
        {isHrefVisible(menu, "/modulos/pos-ventas") && (
          <Link
            href="/modulos/pos-ventas"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium sunmi-pill-link hover:opacity-90 transition"
          >
            <Plus size={16} />
            Nueva Venta
          </Link>
        )}
        {isHrefVisible(menu, "/modulos/pedidos") && (
          <Link
            href="/modulos/pedidos"
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium ${theme.card} border border-current/[0.08] hover:bg-current/[0.03] transition`}
          >
            <ClipboardList size={15} />
            Pedido
          </Link>
        )}
        {isHrefVisible(menu, "/modulos/clientes") && (
          <Link
            href="/modulos/clientes"
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium ${theme.card} border border-current/[0.08] hover:bg-current/[0.03] transition`}
          >
            <UserPlus size={15} />
            Cliente
          </Link>
        )}
      </div>

      {errorCarga && !cargandoResumen && (
        <div className={`${cardSoft} p-4 flex items-center gap-3`}>
          {errorCarga === "contexto" ? (
            <>
              <Store size={20} className="shrink-0 text-amber-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">No hay un local activo</p>
                <p className="text-xs sunmi-text-muted mt-0.5">Para ver los datos del dashboard, primero seleccioná un local de trabajo.</p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/inicio")}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium sunmi-pill-link hover:opacity-90 transition"
              >
                Seleccionar local
              </button>
            </>
          ) : (
            <>
              <AlertCircle size={20} className="shrink-0 text-red-400" />
              <p className="text-sm">
                <span className="font-medium">No se pudieron cargar los datos.</span>
                <span className="sunmi-text-muted"> Verificá la conexión e intentá recargar la página.</span>
              </p>
            </>
          )}
        </div>
      )}

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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:h-[300px]">
        <div className={`lg:col-span-2 flex flex-col min-h-0 ${cardSoft} p-3.5`}>
          <div className="flex items-center justify-between gap-2 mb-2.5 shrink-0">
            <h3 className="text-sm font-semibold">Accesos rápidos</h3>
            {isHrefVisible(menu, "/modulos/configuracion") && (
              <Link
                href="/modulos/configuracion"
                className="text-[11px] font-normal sunmi-text-muted hover:opacity-80 transition"
              >
                Personalizar
              </Link>
            )}
          </div>
          <div className="flex-1 flex items-center min-h-0">
            <AccesosRapidos variant="desktop" />
          </div>
        </div>
        <div className="lg:col-span-3 min-h-[280px] lg:h-full lg:min-h-0">
          <UltimasVentas ventas={ventas} cargando={cargandoVentas} fixedHeight />
        </div>
      </div>

      <ActividadReciente actividad={actividad} cargando={cargandoActividad} />
    </div>
  );
}
