"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import { useAuditoriaPosVentas } from "@/hooks/useAuditoriaPosVentas";
import SinPermisos from "@/components/auth/SinPermisos";

import ResumenKpis from "@/components/auditoria-pos-ventas/ResumenKpis";
import TablaTurnos from "@/components/auditoria-pos-ventas/TablaTurnos";
import TablaMediosPago from "@/components/auditoria-pos-ventas/TablaMediosPago";
import TablaRentabilidadProductos from "@/components/auditoria-pos-ventas/TablaRentabilidadProductos";
import TablaTicketsConflictivos from "@/components/auditoria-pos-ventas/TablaTicketsConflictivos";

export default function AuditoriaPosVentasPage() {
  const router = useRouter();
  const { perfil, cargando: cargandoUsuario } = useUser();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [ticketsPage, setTicketsPage] = useState(1);
  const TICKETS_PAGE_SIZE = 25;

  const {
    loading,
    loadingTickets,
    error,
    resumen,
    turnos,
    medios,
    productos,
    productosNota,
    tickets,
    ticketsPagination,
    ticketsCriterio,
    cargar,
    cargarTicketsPage,
  } = useAuditoriaPosVentas();

  useEffect(() => {
    const hoy = new Date().toISOString().split("T")[0];
    setFechaDesde(hoy);
    setFechaHasta(hoy);
  }, []);

  const ejecutarConsulta = useCallback(() => {
    setTicketsPage(1);
    cargar(fechaDesde, fechaHasta, 1, TICKETS_PAGE_SIZE);
  }, [cargar, fechaDesde, fechaHasta]);

  const handlePrevTickets = useCallback(() => {
    if (ticketsPage <= 1) return;
    const p = ticketsPage - 1;
    setTicketsPage(p);
    cargarTicketsPage(fechaDesde, fechaHasta, p, TICKETS_PAGE_SIZE);
  }, [ticketsPage, cargarTicketsPage, fechaDesde, fechaHasta]);

  const handleNextTickets = useCallback(() => {
    const max = ticketsPagination?.totalPages ?? 0;
    if (ticketsPage >= max) return;
    const p = ticketsPage + 1;
    setTicketsPage(p);
    cargarTicketsPage(fechaDesde, fechaHasta, p, TICKETS_PAGE_SIZE);
  }, [ticketsPage, ticketsPagination, cargarTicketsPage, fechaDesde, fechaHasta]);

  if (!perfil || cargandoUsuario) return null;
  if (loadingCtx) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  if (!esAdmin && !permisos.includes("reportes.ver")) {
    return <SinPermisos />;
  }

  const localNombre = contexto?.nombre || "";

  return (
    <div className="p-2 lg:p-3 space-y-3 max-w-7xl mx-auto pb-20">
      <div>
        <h1 className="text-xl font-bold">Auditoría POS Ventas</h1>
        <p className="text-sm sunmi-text-muted">
          Solo lectura · Local activo: <strong>{localNombre || "—"}</strong>
        </p>
      </div>

      <SunmiCard className="p-3 overflow-visible !backdrop-blur-0">
        <SunmiSeparator label="Filtros" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">Desde</label>
            <SunmiInput
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">Hasta</label>
            <SunmiInput
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
            />
          </div>
          <div className="col-span-2 flex items-end pt-1">
            <SunmiButton color="amber" className="w-full md:w-auto" onClick={ejecutarConsulta} disabled={loading}>
              {loading ? "Cargando…" : "Consultar"}
            </SunmiButton>
          </div>
        </div>
        {error && (
          <div className="mt-2 text-xs sunmi-text-danger text-center sunmi-state-danger rounded px-2 py-1.5">
            {error}
          </div>
        )}
      </SunmiCard>

      {loading && (
        <div className="text-center py-8">
          <SunmiLoader />
        </div>
      )}

      {!loading && resumen && (
        <>
          <ResumenKpis resumen={resumen} />
          <TablaTurnos items={turnos} />
          <TablaMediosPago items={medios} />
          <TablaRentabilidadProductos items={productos} nota={productosNota} />
          <TablaTicketsConflictivos
            items={tickets}
            pagination={ticketsPagination}
            loadingTickets={loadingTickets}
            criterio={ticketsCriterio}
            onPrevPage={handlePrevTickets}
            onNextPage={handleNextTickets}
          />
        </>
      )}

      {!loading && !resumen && !error && (
        <SunmiCard className="p-3">
          <p className="text-center py-8 sunmi-text-muted text-sm">
            Elegí el rango de fechas y pulsá <strong>Consultar</strong>.
          </p>
        </SunmiCard>
      )}
    </div>
  );
}
