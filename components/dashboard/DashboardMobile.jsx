"use client";

import Link from "next/link";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import AccesosRapidos from "./AccesosRapidos";
import UltimasVentas from "./UltimasVentas";
import ActividadReciente from "./ActividadReciente";
import { useRouter } from "next/navigation";
import { Plus, AlertCircle, Store } from "lucide-react";

export default function DashboardMobile({
  nombre,
  resumen,
  ventas = [],
  actividad,
  cargandoResumen,
  cargandoVentas,
  cargandoActividad,
  errorCarga,
}) {
  const { theme } = useSunmiTheme();
  const router = useRouter();

  const totalHoy = resumen
    ? `$${resumen.totalVentas.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
    : "$0,00";
  const ticketsHoy = resumen ? resumen.cantidadVentas : 0;

  const cardSoft = `${theme.card} rounded-2xl border border-current/[0.06] shadow-sm`;

  return (
    <div className="flex flex-col gap-5 md:hidden pb-4">
      <div className={`${cardSoft} p-5`}>
        <p className="text-xs font-medium uppercase tracking-wider sunmi-text-muted mb-1">
          ERP Azul
        </p>
        <p className="text-lg font-semibold">
          {nombre ? `Hola, ${nombre}` : "Dashboard"}
        </p>
        <p className="text-2xl font-bold mt-2">
          {cargandoResumen ? "Cargando..." : totalHoy}
        </p>
        <p className="text-xs sunmi-text-muted mt-0.5">
          {cargandoResumen
            ? "Obteniendo datos del día..."
            : `Ventas del día · ${ticketsHoy} tickets`}
        </p>
        <Link
          href="/modulos/pos-ventas"
          className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium sunmi-pill-link hover:opacity-90 transition"
        >
          <Plus size={18} />
          Nueva Venta
        </Link>
      </div>

      {errorCarga && !cargandoResumen && (
        <div className={`${cardSoft} p-4`}>
          {errorCarga === "contexto" ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5">
                <Store size={18} className="shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">No hay un local activo</p>
                  <p className="text-xs sunmi-text-muted mt-0.5">Seleccioná un local de trabajo para ver los datos.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push("/inicio")}
                className="w-full py-2 rounded-xl text-sm font-medium sunmi-pill-link hover:opacity-90 transition text-center"
              >
                Seleccionar local
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <AlertCircle size={18} className="shrink-0 text-red-400" />
              <p className="text-sm">
                <span className="font-medium">Error al cargar datos.</span>
                <span className="sunmi-text-muted"> Intentá recargar.</span>
              </p>
            </div>
          )}
        </div>
      )}

      <div className={`${cardSoft} p-4`}>
        <h3 className="text-[11px] font-medium mb-3 sunmi-text-muted uppercase tracking-widest">
          Accesos rápidos
        </h3>
        <AccesosRapidos variant="mobile" />
      </div>

      <UltimasVentas ventas={ventas} cargando={cargandoVentas} />
      <ActividadReciente actividad={actividad} cargando={cargandoActividad} />
    </div>
  );
}
