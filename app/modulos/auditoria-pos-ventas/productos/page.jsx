"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import { useAuditoriaProductos } from "@/hooks/useAuditoriaProductos";
import SinPermisos from "@/components/auth/SinPermisos";

import TablaRentabilidadProductos from "@/components/auditoria-pos-ventas/TablaRentabilidadProductos";
import TablaTicketsConflictivos from "@/components/auditoria-pos-ventas/TablaTicketsConflictivos";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";

const TABS = [
  { key: "productos", label: "Rentabilidad" },
  { key: "tickets", label: "Tickets a revisar" },
];

export default function AuditoriaProductosPage() {
  const router = useRouter();
  const { perfil, cargando: cargandoUsuario } = useUser();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [ticketsPage, setTicketsPage] = useState(1);
  const [activeTab, setActiveTab] = useState("productos");
  const [sortMode, setSortMode] = useState("rentabilidad");
  const [filtroCategoriaId, setFiltroCategoriaId] = useState(null);
  const TICKETS_PAGE_SIZE = 25;

  const {
    loading,
    loadingTickets,
    error,
    productos,
    categorias,
    productosNota,
    tickets,
    ticketsPagination,
    ticketsCriterio,
    cargar,
    cargarTicketsPage,
  } = useAuditoriaProductos();

  useEffect(() => {
    const hoy = hoyArgentinaISO();
    setFechaDesde(hoy);
    setFechaHasta(hoy);
  }, []);

  const ejecutarConsulta = useCallback(() => {
    setTicketsPage(1);
    setActiveTab("productos");
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

  const productosFiltrados = useMemo(() => {
    if (!productos) return null;
    if (!filtroCategoriaId) return productos;
    return productos.filter((p) => p.categoriaId === filtroCategoriaId);
  }, [productos, filtroCategoriaId]);

  const productosSorted = useMemo(() => {
    if (!productosFiltrados) return null;
    const sorted = [...productosFiltrados];
    switch (sortMode) {
      case "cantidad": return sorted.sort((a, b) => b.cantidad - a.cantidad);
      case "facturacion": return sorted.sort((a, b) => b.venta - a.venta);
      case "masRentable": return sorted.sort((a, b) => b.resultadoReal - a.resultadoReal);
      case "perdida": return sorted.filter((p) => p.resultadoReal < 0).sort((a, b) => a.resultadoReal - b.resultadoReal);
      case "rentabilidad":
      default: return sorted.sort((a, b) => a.resultadoReal - b.resultadoReal);
    }
  }, [productosFiltrados, sortMode]);

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
  const rangoLabel =
    fechaDesde && fechaHasta && productos
      ? `${fechaDesde} → ${fechaHasta}`
      : "";

  return (
    <div className="p-2 lg:p-3 space-y-2 max-w-7xl mx-auto pb-20">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold leading-tight">Productos</h1>
          <p className="text-[11px] sunmi-text-muted">
            {localNombre || "—"}
            {rangoLabel && <span className="ml-1">· {rangoLabel}</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <SunmiBackButton href="/modulos/auditoria-pos-ventas" />
          <div className="flex flex-wrap items-end justify-end gap-1.5">
            <div>
              <label className="text-[9px] sunmi-text-muted mb-0.5 block">Desde</label>
              <SunmiInput
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="!py-1 text-xs !border !border-[var(--pos-link)]"
              />
            </div>
            <div>
              <label className="text-[9px] sunmi-text-muted mb-0.5 block">Hasta</label>
              <SunmiInput
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="!py-1 text-xs !border !border-[var(--pos-link)]"
              />
            </div>
            <SunmiButton color="amber" onClick={ejecutarConsulta} disabled={loading} className="!py-1 text-xs">
              {loading ? "Cargando..." : "Consultar"}
            </SunmiButton>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-xs sunmi-text-danger text-center sunmi-state-danger rounded px-2 py-1.5">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-10">
          <SunmiLoader />
        </div>
      )}

      {!loading && productos && (
        <>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] sunmi-text-muted">Ordenar:</span>
            {[
              { key: "rentabilidad", label: "Menos rentable" },
              { key: "masRentable", label: "Más rentable" },
              { key: "cantidad", label: "Más vendido (cant.)" },
              { key: "facturacion", label: "Mayor facturación" },
              { key: "perdida", label: "Solo con pérdida" },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setSortMode(s.key)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  sortMode === s.key
                    ? "bg-[var(--accent)] text-white"
                    : "sunmi-surface sunmi-text-muted hover:sunmi-text-primary"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {categorias.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] sunmi-text-muted">Categoría:</span>
              <button
                onClick={() => setFiltroCategoriaId(null)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  !filtroCategoriaId
                    ? "bg-[var(--accent)] text-white"
                    : "sunmi-surface sunmi-text-muted hover:sunmi-text-primary"
                }`}
              >
                Todas
              </button>
              {categorias.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setFiltroCategoriaId(c.id)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    filtroCategoriaId === c.id
                      ? "bg-[var(--accent)] text-white"
                      : "sunmi-surface sunmi-text-muted hover:sunmi-text-primary"
                  }`}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
        <SunmiCard className="p-0 overflow-hidden">
          <div className="flex gap-0 overflow-x-auto sunmi-surface rounded-t-lg">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all relative ${
                  activeTab === tab.key
                    ? "sunmi-text-accent bg-[var(--card-bg)]"
                    : "sunmi-text-muted hover:sunmi-text-primary"
                }`}
              >
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--accent)] rounded-t" />
                )}
                {tab.label}
                {tab.key === "tickets" && ticketsPagination?.total > 0 && (
                  <span className="ml-1 text-[9px] sunmi-badge-danger px-1.5 py-0.5 rounded-full font-bold">
                    {ticketsPagination.total}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="p-3">
            {activeTab === "productos" && (
              <TablaRentabilidadProductos items={productosSorted} nota={productosNota} />
            )}
            {activeTab === "tickets" && (
              <TablaTicketsConflictivos
                items={tickets}
                pagination={ticketsPagination}
                loadingTickets={loadingTickets}
                criterio={ticketsCriterio}
                onPrevPage={handlePrevTickets}
                onNextPage={handleNextTickets}
              />
            )}
          </div>
        </SunmiCard>
        </>
      )}

      {!loading && !productos && !error && (
        <SunmiCard className="p-3">
          <p className="text-center py-4 sunmi-text-muted text-sm">
            Seleccioná un rango de fechas y pulsá <strong>Consultar</strong> para auditar los datos.
          </p>
        </SunmiCard>
      )}
    </div>
  );
}
