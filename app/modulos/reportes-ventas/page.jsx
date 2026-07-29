"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  buildDetalleUrl,
  parseReturnParams,
  contextoReconstruible,
} from "@/lib/reportes-ventas/returnParams";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import ReporteVentasPorCliente from "@/components/reportes-ventas/ReporteVentasPorCliente";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

const TZ_AR = "America/Argentina/Cordoba";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Cantidad en es-AR: enteros sin decimales, fraccionarios con máx 3 útiles.
function formatCantidad(n) {
  const num = Number(n);
  if (!isFinite(num)) return "0";
  if (Number.isInteger(num)) return num.toLocaleString("es-AR");
  return num.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

// Fecha de hoy en Argentina como YYYY-MM-DD (sin tocar UTC).
function hoyArgentinaISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_AR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

// Formatea una fecha ISO (o Date) en hora argentina, ej: 13/05/2026 21:35
function formatFechaHoraAR(iso) {
  if (!iso) return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ_AR,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// Restauración de scroll acotada al módulo (por tab). El contenedor scrolleable del
// layout es <main> (mismo criterio que Productos).
const SCROLL_KEY = "reportes-ventas:scroll";
function getVentasScrollEl() {
  if (typeof document === "undefined") return null;
  return document.querySelector("main");
}

export default function ReportesVentasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { perfil } = useUser();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

  // Filtros
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [formaPago, setFormaPago] = useState("");

  // Datos
  const [reporte, setReporte] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Vista del período: "venta" (venta por venta) | "cliente" (agrupada por cliente)
  const [vista, setVista] = useState("venta");

  // Listado venta por venta
  const LIMIT_VENTAS = 50;
  const [listado, setListado] = useState(null);
  const [paginacion, setPaginacion] = useState(null);
  const [pageVentas, setPageVentas] = useState(1);
  const [loadingListado, setLoadingListado] = useState(false);
  // Filtros usados en el último "Generar Reporte". La paginación los usa para
  // no desincronizarse del resumen si el usuario cambia inputs sin re-generar.
  const [filtrosVigentes, setFiltrosVigentes] = useState(null);

  // Fecha por defecto = hoy, SALVO que volvamos con contexto (query params con
  // fechas válidas): en ese caso no pisamos, la hidratación las restaura.
  useEffect(() => {
    const ctx = parseReturnParams(searchParams);
    if (ctx.fechaDesde && ctx.fechaHasta) return;
    const hoy = hoyArgentinaISO();
    setFechaDesde(hoy);
    setFechaHasta(hoy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hidratación desde el contexto de retorno (UNA sola vez). Reconstruye el reporte
  // automáticamente cuando los params son válidos; sin params, flujo manual normal.
  // No escribe la URL (evita loops estado↔URL).
  const hidratadoRef = useRef(false);
  useEffect(() => {
    if (hidratadoRef.current) return;
    if (loadingCtx) return; // esperar a que el contexto (localId) esté resuelto
    hidratadoRef.current = true;
    const ctx = parseReturnParams(searchParams);
    if (contextoReconstruible(ctx)) {
      cargarReporte({
        fechaDesde: ctx.fechaDesde,
        fechaHasta: ctx.fechaHasta,
        formaPago: ctx.formaPago ?? "",
        vista: ctx.tab ?? "venta",
        page: ctx.tab === "cliente" ? 1 : (ctx.page ?? 1),
        localId: ctx.localId ?? contexto?.localId ?? null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingCtx, searchParams]);

  // Restauración de scroll ACOTADA: solo si venimos de "Ver venta" (hay marca), la
  // tab coincide, y ya terminó de cargar el listado. Se limpia tras restaurar.
  useEffect(() => {
    if (loadingListado) return;
    let raw = null;
    try { raw = sessionStorage.getItem(SCROLL_KEY); } catch {}
    if (!raw) return;
    let saved = null;
    try { saved = JSON.parse(raw); } catch {}
    try { sessionStorage.removeItem(SCROLL_KEY); } catch {}
    if (!saved || saved.tab !== vista) return;
    const y = Number(saved.y) || 0;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = getVentasScrollEl();
        if (el) el.scrollTop = y;
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingListado, listado]);

  // Navega a la página "Ver venta" con el contexto actual del listado, guardando
  // scroll + venta seleccionada para restaurar al volver. `tab` permite marcar el
  // origen ("venta" o "cliente").
  const irADetalle = (ventaId, tab = vista) => {
    try {
      const el = getVentasScrollEl();
      sessionStorage.setItem(
        SCROLL_KEY,
        JSON.stringify({ y: el ? el.scrollTop : 0, ventaId, tab })
      );
    } catch {}
    const ctx = {
      tab,
      page: pageVentas,
      fechaDesde,
      fechaHasta,
      localId: contexto?.localId ?? null,
      formaPago,
    };
    router.push(buildDetalleUrl(ventaId, ctx));
  };

  const cargarListado = async (page, filtrosOverride) => {
    const filtros = filtrosOverride || filtrosVigentes;
    if (!filtros) return;

    setLoadingListado(true);
    try {
      const params = new URLSearchParams({
        fechaDesde: filtros.fechaDesde,
        fechaHasta: filtros.fechaHasta,
        page: String(page),
        limit: String(LIMIT_VENTAS),
      });
      if (filtros.localId) params.set("localId", String(filtros.localId));
      if (filtros.formaPago) params.set("formaPago", filtros.formaPago);

      const res = await fetch(`/api/reportes-ventas/listado?${params}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        setListado(data.ventas || []);
        setPaginacion(data.paginacion || null);
        setPageVentas(page);
      }
    } catch (error) {
      console.error("Error listado ventas:", error);
    } finally {
      setLoadingListado(false);
    }
  };

  // Sin argumentos usa el ESTADO (botón "Generar Reporte"). Con `over` (hidratación
  // desde query params de retorno) usa esos valores, sincroniza los inputs/tab
  // visibles y carga la PÁGINA exacta — reconstruyendo el reporte tal como estaba.
  const cargarReporte = async (over = null) => {
    const fd = over?.fechaDesde ?? fechaDesde;
    const fh = over?.fechaHasta ?? fechaHasta;
    const fp = over?.formaPago ?? formaPago;
    const lid = over?.localId ?? contexto?.localId ?? null;
    const pg = over?.page ?? 1;

    if (!fd || !fh) {
      setErrorMsg("Selecciona las fechas");
      return;
    }

    if (over) {
      if (over.fechaDesde != null) setFechaDesde(over.fechaDesde);
      if (over.fechaHasta != null) setFechaHasta(over.fechaHasta);
      if (over.formaPago != null) setFormaPago(over.formaPago);
      if (over.vista != null) setVista(over.vista);
    }

    setErrorMsg("");
    setLoading(true);
    setReporte(null);
    setListado(null);
    setPaginacion(null);
    setPageVentas(pg);

    // Snapshot de filtros para que la paginación use estos valores aunque el
    // usuario cambie los inputs después.
    const filtros = { fechaDesde: fd, fechaHasta: fh, formaPago: fp, localId: lid };
    setFiltrosVigentes(filtros);

    try {
      const params = new URLSearchParams({
        fechaDesde: filtros.fechaDesde,
        fechaHasta: filtros.fechaHasta,
      });
      if (filtros.localId) params.set("localId", String(filtros.localId));
      if (filtros.formaPago) params.set("formaPago", filtros.formaPago);

      const res = await fetch(`/api/reportes-ventas/general?${params}`, {
        credentials: "include",
      });

      const data = await res.json();

      if (!data.ok) {
        setErrorMsg(data.error || "Error generando reporte");
        return;
      }

      setReporte(data);
      // Carga la PÁGINA solicitada (pg) del listado venta-por-venta.
      cargarListado(pg, filtros);
    } catch (error) {
      console.error("Error:", error);
      setErrorMsg("Error de conexion al generar reporte");
    } finally {
      setLoading(false);
    }
  };

  if (!perfil || loadingCtx) return null;
  if (needsContexto) { router.push("/inicio"); return null; }

  const permisosR = perfil?.permisos || [];
  const esAdminR = Array.isArray(permisosR) && permisosR.includes("*");
  if (!esAdminR && !permisosR.includes("reportes.ver")) return <SinPermisos />;

  return (
    <div className="p-2 lg:p-3 space-y-3 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Ventas</h1>
        <p className="text-sm sunmi-text-muted">
          Analisis de ventas, comisiones y rentabilidad
        </p>
      </div>

      {/* Filtros */}
      <SunmiCard className="p-3 overflow-visible !backdrop-blur-0">
        <SunmiSeparator label="Filtros" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 relative">
          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">
              Desde
            </label>
            <SunmiInput
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="!border !border-[var(--pos-link)]"
            />
          </div>

          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">
              Hasta
            </label>
            <SunmiInput
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="!border !border-[var(--pos-link)]"
            />
          </div>

          <div className="relative">
            <label className="text-[11px] sunmi-text-muted mb-1 block">
              Forma de pago
            </label>
            <SunmiSelectAdv
              value={formaPago}
              onChange={(val) => setFormaPago(val)}
              className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
            >
              <option value="">Todas</option>
              <option value="efectivo">Efectivo</option>
              <option value="mercadopago">MercadoPago</option>
              <option value="debito">Debito</option>
              <option value="credito">Credito</option>
            </SunmiSelectAdv>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <SunmiButton
            color="amber"
            onClick={() => cargarReporte()}
            disabled={loading}
            className="flex-1"
          >
            {loading ? "Cargando..." : "Generar Reporte"}
          </SunmiButton>
        </div>

        {errorMsg && (
          <div className="mt-2 text-xs sunmi-text-danger text-center sunmi-state-danger rounded px-2 py-1.5">
            {errorMsg}
          </div>
        )}
      </SunmiCard>

      {/* Loader */}
      {loading && (
        <div className="text-center py-8">
          <SunmiLoader />
        </div>
      )}

      {/* Reporte */}
      {reporte && !loading && (
        <>
          {/* Resumen General */}
          <SunmiCard className="p-3">
            <SunmiSeparator label="Resumen Financiero" />

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
              <div className="sunmi-surface p-3 rounded-lg text-center">
                <div className="text-[10px] sunmi-text-muted">Ventas</div>
                <div className="text-xl font-bold sunmi-text-link">
                  {reporte.resumen.cantidadVentas}
                </div>
              </div>

              <div className="sunmi-surface p-3 rounded-lg text-center">
                <div className="text-[10px] sunmi-text-muted">Total Bruto</div>
                <div className="text-xl font-bold sunmi-text-accent">
                  ${formatPrecio(reporte.resumen.totalBruto)}
                </div>
              </div>

              <div className="sunmi-surface p-3 rounded-lg text-center">
                <div className="text-[10px] sunmi-text-muted">Comisiones</div>
                <div className="text-xl font-bold sunmi-text-accent">
                  -${formatPrecio(reporte.resumen.totalComisiones)}
                </div>
              </div>

              <div className="sunmi-surface p-3 rounded-lg text-center">
                <div className="text-[10px] sunmi-text-muted">Neto Recibido</div>
                <div className="text-xl font-bold sunmi-text-success">
                  ${formatPrecio(reporte.resumen.totalNeto)}
                </div>
              </div>

              <div className="sunmi-state-success p-3 rounded-lg text-center">
                <div className="text-[10px] sunmi-text-success">
                  Ganancia Neta
                </div>
                <div className="text-xl font-bold sunmi-text-success">
                  ${formatPrecio(reporte.resumen.gananciaNeta)}
                </div>
              </div>
            </div>
          </SunmiCard>

          {/* Desglose por forma de pago */}
          {reporte.desglosePago && reporte.desglosePago.length > 0 && (
            <SunmiCard className="p-3">
              <SunmiSeparator label="Desglose por Forma de Pago" />

              <div className="overflow-x-auto mt-3">
                <SunmiTable
                  headers={[
                    "Forma de Pago",
                    "Ventas",
                    "Total Bruto",
                    "Comision",
                    "Neto Recibido",
                  ]}
                >
                  {reporte.desglosePago.map((item) => (
                    <tr key={item.formaPago} className="hover:bg-[var(--hover-bg)]">
                      <td className="px-2 py-1.5 font-medium capitalize">
                        {item.formaPago}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {item.cantidad}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        ${formatPrecio(item.total)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono sunmi-text-accent">
                        {item.comision > 0
                          ? `-$${formatPrecio(item.comision)}`
                          : "-"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono sunmi-text-success font-bold">
                        ${formatPrecio(item.neto)}
                      </td>
                    </tr>
                  ))}
                </SunmiTable>
              </div>
            </SunmiCard>
          )}

          {/* Ventas del período (venta por venta) */}
          <SunmiCard className="p-3">
            <SunmiSeparator label="Ventas del período" />

            {/* Selector de vista: por venta / por cliente */}
            <div className="flex gap-1 mt-2">
              <SunmiButton color={vista === "venta" ? "amber" : "slate"} onClick={() => setVista("venta")} className="text-xs">
                Por venta
              </SunmiButton>
              <SunmiButton color={vista === "cliente" ? "amber" : "slate"} onClick={() => setVista("cliente")} className="text-xs">
                Por cliente
              </SunmiButton>
            </div>

            {vista === "cliente" && (
              <ReporteVentasPorCliente filtros={filtrosVigentes} onVerTicket={(id) => irADetalle(id, "cliente")} />
            )}

            {vista === "venta" && (<>
            {loadingListado && (
              <div className="text-center py-6">
                <SunmiLoader />
              </div>
            )}

            {!loadingListado && listado && listado.length === 0 && (
              <div className="text-center py-8 sunmi-text-muted text-sm">
                No hay ventas en el período seleccionado
              </div>
            )}

            {!loadingListado && listado && listado.length > 0 && (
              <>
                {/* Mobile: cards */}
                <div className="md:hidden mt-3 space-y-2">
                  {listado.map((v) => {
                    const esFiado = v.estado === "fiado";
                    return (
                    <div
                      key={v.id}
                      className="sunmi-surface border sunmi-border rounded-lg p-3 space-y-1.5"
                    >
                      {/* Fila 1: cliente (dominante) + total (dominante) */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 font-semibold sunmi-text-strong text-[15px] leading-tight truncate">
                          {v.cliente?.nombre || "Consumidor final"}
                        </div>
                        <div className="font-mono font-bold text-[17px] sunmi-text-strong whitespace-nowrap tabular-nums">
                          ${formatPrecio(v.total)}
                        </div>
                      </div>

                      {/* Fila 2: ticket (referencia secundaria) + fecha/hora */}
                      <div className="text-[11px] sunmi-text-muted">
                        Ticket #{v.numero ?? v.id} · {formatFechaHoraAR(v.fecha)}
                      </div>

                      {/* Fila 3: local · cajero · ítems */}
                      <div className="text-[12px] sunmi-text-muted truncate">
                        {v.local?.nombre || "—"} · {v.vendedor?.nombre || "—"} ·{" "}
                        {v.items} ítem{v.items === 1 ? "" : "s"}
                      </div>

                      {/* Estado: badge Cobrado/Pendiente + forma de pago + Corregida */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            esFiado
                              ? "sunmi-state-warning sunmi-text-accent"
                              : "sunmi-state-success sunmi-text-success"
                          }`}
                        >
                          {esFiado ? "Pendiente" : "Cobrado"}
                        </span>
                        <span className="text-[12px] sunmi-text-muted capitalize">
                          {v.formaPago}
                        </span>
                        {v.corregida && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium sunmi-state-warning sunmi-text-accent whitespace-nowrap">
                            ✎ Corregida{v.version ? ` · v${v.version}` : ""}
                          </span>
                        )}
                      </div>

                      <SunmiButton
                        color="amber"
                        size="sm"
                        onClick={() => irADetalle(v.id)}
                        className="w-full mt-1"
                      >
                        Ver venta
                      </SunmiButton>
                    </div>
                    );
                  })}
                </div>

                {/* Desktop: tabla */}
                <div className="hidden md:block overflow-x-auto mt-3">
                  <SunmiTable
                    headers={[
                      "Fecha/hora",
                      "Cliente / Ticket",
                      "Local",
                      { label: "Ítems", className: "text-center" },
                      "Forma de pago",
                      "Estado",
                      { label: "Total", className: "text-right" },
                      "",
                    ]}
                  >
                    {listado.map((v) => {
                      const esFiado = v.estado === "fiado";
                      return (
                      <tr
                        key={v.id}
                        className="align-middle transition-colors even:sunmi-surface-soft hover:bg-[var(--hover-bg)]"
                      >
                        <td className="px-3 py-3 font-mono text-[11px] whitespace-nowrap sunmi-text-muted">
                          {formatFechaHoraAR(v.fecha)}
                        </td>
                        {/* Cliente (negrita) + ticket (secundario, debajo) */}
                        <td className="px-3 py-3 max-w-[220px]">
                          <div className="font-semibold sunmi-text-strong truncate">
                            {v.cliente?.nombre || "Consumidor final"}
                          </div>
                          <div className="font-mono text-[11px] sunmi-text-muted">
                            #{v.numero ?? v.id}
                          </div>
                        </td>
                        {/* Local + cajero (secundario, debajo) */}
                        <td className="px-3 py-3 max-w-[170px]">
                          <div className="truncate">{v.local?.nombre || "—"}</div>
                          <div className="text-[11px] sunmi-text-muted truncate">
                            {v.vendedor?.nombre || "—"}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums">{v.items}</td>
                        <td className="px-3 py-3 capitalize">{v.formaPago}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                                esFiado
                                  ? "sunmi-state-warning sunmi-text-accent"
                                  : "sunmi-state-success sunmi-text-success"
                              }`}
                            >
                              {esFiado ? "Pendiente" : "Cobrado"}
                            </span>
                            {v.corregida && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium sunmi-state-warning sunmi-text-accent whitespace-nowrap">
                                ✎ Corregida{v.version ? ` · v${v.version}` : ""}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-[13px] sunmi-text-strong whitespace-nowrap tabular-nums">
                          ${formatPrecio(v.total)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <SunmiButton
                            color="amber"
                            size="sm"
                            onClick={() => irADetalle(v.id)}
                          >
                            Ver venta
                          </SunmiButton>
                        </td>
                      </tr>
                      );
                    })}
                  </SunmiTable>
                </div>

                {paginacion && paginacion.totalPaginas > 1 && (
                  <div className="flex items-center justify-between mt-3 text-xs sunmi-text-muted">
                    <div>
                      Página {paginacion.page} de {paginacion.totalPaginas} ·{" "}
                      {paginacion.total} venta{paginacion.total === 1 ? "" : "s"}
                    </div>
                    <div className="flex gap-2">
                      <SunmiButton
                        onClick={() => cargarListado(pageVentas - 1)}
                        disabled={pageVentas <= 1 || loadingListado}
                      >
                        Anterior
                      </SunmiButton>
                      <SunmiButton
                        onClick={() => cargarListado(pageVentas + 1)}
                        disabled={
                          pageVentas >= paginacion.totalPaginas ||
                          loadingListado
                        }
                      >
                        Siguiente
                      </SunmiButton>
                    </div>
                  </div>
                )}
              </>
            )}
            </>)}
          </SunmiCard>

          {/* Top productos */}
          {reporte.topProductos && reporte.topProductos.length > 0 && (
            <SunmiCard className="p-3">
              <SunmiSeparator label="Productos Mas Vendidos" />

              <div className="overflow-x-auto mt-3">
                <SunmiTable
                  headers={[
                    "Producto",
                    "Cant",
                    "Total Venta",
                    "Costo",
                    "Ganancia",
                    "Margen %",
                  ]}
                >
                  {reporte.topProductos.map((item, idx) => {
                    const margen =
                      item.totalVenta > 0
                        ? ((item.ganancia / item.totalVenta) * 100).toFixed(1)
                        : "0.0";
                    return (
                      <tr key={idx} className="hover:bg-[var(--hover-bg)]">
                        <td className="px-2 py-1.5 font-medium truncate max-w-[200px]">
                          {item.nombre}
                        </td>
                        <td className="px-2 py-1.5 text-center tabular-nums">
                          {formatCantidad(item.cantidad)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          ${formatPrecio(item.totalVenta)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono sunmi-text-muted">
                          ${formatPrecio(item.totalCosto)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono sunmi-text-success">
                          ${formatPrecio(item.ganancia)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          <span
                            className={
                              margen > 30
                                ? "sunmi-text-success"
                                : margen > 15
                                ? "sunmi-text-accent"
                                : "sunmi-text-danger"
                            }
                          >
                            {margen}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </SunmiTable>
              </div>
            </SunmiCard>
          )}
        </>
      )}

      {/* Sin datos */}
      {!reporte && !loading && (
        <SunmiCard className="p-3">
          <div className="text-center py-12 sunmi-text-muted">
            Selecciona las fechas y genera el reporte
          </div>
        </SunmiCard>
      )}

    </div>
  );
}
