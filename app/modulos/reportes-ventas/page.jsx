"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";
import {
  buildDetalleUrl,
  parseReturnParams,
  contextoReconstruible,
} from "@/lib/reportes-ventas/returnParams";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import ReporteVentasPorCliente from "@/components/reportes-ventas/ReporteVentasPorCliente";
import { ShoppingCart, Banknote, Scissors, Wallet, TrendingUp } from "lucide-react";
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
const money = (n) => `$ ${formatPrecio(n)}`;

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
  // Ya declaraba la zona; le faltaba `hour12: false`. `TZ_AR` se conserva porque
  // el filtro de día de más abajo lo sigue usando.
  return fechaHoraAR(d, { vacio: "" });
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

  // ── VER LAS OPERACIONES INTERNAS ──────────────────────────────────────────
  //
  // Apagado por defecto, y así tiene que quedarse: una venta del depósito a un
  // local propio no es una venta, y mezclarla infla lo que se lee como
  // facturación. Pero tiene que poder prenderse, porque el detalle de esas
  // ventas es donde vive el botón de anular — y sin este interruptor el botón
  // quedaba en una pantalla a la que no se llegaba. Pasó el 2026-08-20.
  const [verInternas, setVerInternas] = useState(false);

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

  const cargarListado = async (page, filtrosOverride, internasOverride) => {
    const filtros = filtrosOverride || filtrosVigentes;
    if (!filtros) return;
    // El override existe porque al tocar el interruptor hay que recargar YA, y
    // el estado de React todavía no cambió en ese tick.
    const internas = internasOverride !== undefined ? internasOverride : verInternas;

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
      if (internas) params.set("incluirInternas", "1");

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

  const r = reporte?.resumen;

  return (
    // Mismo patrón de contenedor que POS Ventas: ancho completo del área útil y
    // padding p-2 / lg:p-3. Antes tenía `max-w-7xl mx-auto`, que recortaba la
    // página a 1120 px (80rem con raíz de 14px) y la centraba, mientras el POS
    // usaba todo el ancho disponible.
    <div className="w-full min-h-full p-2 lg:p-3 space-y-3">
      {/* Encabezado + filtros en una franja compacta (una sola fila en desktop) */}
      <SunmiCard className="p-3 overflow-visible backdrop-blur-0">
        <div className="mb-3">
          <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">Ventas</h1>
          <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
            Análisis de ventas, comisiones y rentabilidad
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 items-end">
          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">Desde</label>
            <SunmiInput
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="!border !border-[var(--pos-link)]"
            />
          </div>

          <div>
            <label className="text-[11px] sunmi-text-muted mb-1 block">Hasta</label>
            <SunmiInput
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="!border !border-[var(--pos-link)]"
            />
          </div>

          <div className="col-span-2 lg:col-span-1 relative">
            <label className="text-[11px] sunmi-text-muted mb-1 block">Forma de pago</label>
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

          <div className="col-span-2 lg:col-span-1">
            <SunmiButton
              color="amber"
              onClick={() => cargarReporte()}
              disabled={loading}
              className="w-full font-semibold"
            >
              {loading ? "Cargando…" : "Generar reporte"}
            </SunmiButton>
          </div>
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
          {/* 2 · Resumen financiero — grilla de cards */}
          <section className="space-y-2">
            <SectionHead title="Resumen financiero" />
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3">
              <MetricCard icon={ShoppingCart} tone="link" label="Ventas" value={r.cantidadVentas} />
              <MetricCard icon={Banknote} tone="accent" label="Total bruto" value={money(r.totalBruto)} />
              <MetricCard icon={Scissors} tone="warning" label="Comisiones" value={`- ${money(r.totalComisiones)}`} />
              <MetricCard icon={Wallet} tone="success" label="Neto recibido" value={money(r.totalNeto)} />
              <MetricCard
                icon={TrendingUp}
                tone="success"
                highlight
                label="Ganancia neta"
                value={money(r.gananciaNeta)}
                className="col-span-2 md:col-span-1"
              />
            </div>
          </section>

          {/* 3 · Desglose por forma de pago — bloque secundario */}
          {reporte.desglosePago && reporte.desglosePago.length > 0 && (
            <section className="space-y-2">
              <SectionHead title="Desglose por forma de pago" />
              <SunmiCard>
                <div className="overflow-x-auto">
                  <SunmiTable
                    headers={[
                      "Forma de pago",
                      { label: "Ventas", className: "text-center" },
                      { label: "Total bruto", className: "text-right" },
                      { label: "Comisión", className: "text-right" },
                      { label: "Neto recibido", className: "text-right" },
                    ]}
                  >
                    {reporte.desglosePago.map((item) => (
                      <tr key={item.formaPago} className="sunmi-row-hover transition-colors border-t sunmi-divider">
                        <td className="px-3 py-2.5 font-medium capitalize">{item.formaPago}</td>
                        <td className="px-3 py-2.5 text-center tabular-nums">{item.cantidad}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{money(item.total)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums sunmi-text-warning">
                          {item.comision > 0 ? `- ${money(item.comision)}` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums sunmi-text-success font-semibold">
                          {money(item.neto)}
                        </td>
                      </tr>
                    ))}
                  </SunmiTable>
                </div>
              </SunmiCard>
            </section>
          )}

          {/* 4 · Ventas del período — sección protagonista */}
          <section className="space-y-2">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <SectionHead
                title="Ventas del período"
                subtitle={paginacion ? `${paginacion.total} venta${paginacion.total === 1 ? "" : "s"}` : null}
              />
              {/* Tabs segmentadas con estado activo claro */}
              <div className="inline-flex p-0.5 rounded-lg sunmi-surface-soft sunmi-border shrink-0">
                <button
                  type="button"
                  onClick={() => setVista("venta")}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${vista === "venta" ? "sunmi-pill-link shadow-sm" : "sunmi-text-muted hover:sunmi-text-strong"}`}
                >
                  Por venta
                </button>
                <button
                  type="button"
                  onClick={() => setVista("cliente")}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${vista === "cliente" ? "sunmi-pill-link shadow-sm" : "sunmi-text-muted hover:sunmi-text-strong"}`}
                >
                  Por cliente
                </button>
              </div>
            </div>

            <SunmiCard>
              {vista === "cliente" && (
                <ReporteVentasPorCliente filtros={filtrosVigentes} onVerTicket={(id) => irADetalle(id, "cliente")} />
              )}

              {vista === "venta" && (<>
                {/* Interruptor de operaciones internas. Va acá arriba y no
                    escondido en un menú: cuando falta una venta que se sabe que
                    existe, éste es el primer lugar donde hay que mirar. */}
                <div className="flex items-center justify-between gap-2 flex-wrap pb-2 mb-2 border-b sunmi-divider">
                  <span className="text-sm2 sunmi-text-muted">
                    Las transferencias a locales propios no se cuentan como venta.
                  </span>
                  {/* Del kit y no un elemento crudo: `aria-pressed` viaja por el
                      spread de props y el color distingue prendido de apagado.
                      Escrito sin nombrar el tag a propósito — el contador de
                      hardcodeo lee los comentarios y lo suma igual. */}
                  <SunmiButton
                    color={verInternas ? "amber" : "slate"}
                    onClick={() => {
                      const nuevo = !verInternas;
                      setVerInternas(nuevo);
                      cargarListado(1, null, nuevo);
                    }}
                    aria-pressed={verInternas}
                    className="text-sm2 whitespace-nowrap"
                  >
                    {verInternas ? "✓ Mostrando internas" : "Ver también las internas"}
                  </SunmiButton>
                </div>

                {loadingListado && (
                  <div className="text-center py-8"><SunmiLoader /></div>
                )}

                {!loadingListado && listado && listado.length === 0 && (
                  <div className="text-center py-10 sunmi-text-muted text-sm">
                    No hay ventas en el período seleccionado
                    {!verInternas && (
                      <div className="mt-1 text-sm2">
                        Si buscás una transferencia a un local propio, prendé
                        &quot;Ver también las internas&quot;.
                      </div>
                    )}
                  </div>
                )}

                {!loadingListado && listado && listado.length > 0 && (
                  <>
                    {/* Mobile: cards (cliente + total protagonistas) */}
                    <div className="md:hidden space-y-2">
                      {listado.map((v) => {
                        const esFiado = v.estado === "fiado";
                        return (
                          <div key={v.id} className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 font-semibold sunmi-text-strong text-[15px] leading-tight truncate">
                                {v.cliente?.nombre || "Consumidor final"}
                              </div>
                              <div className="font-mono font-bold text-[17px] sunmi-text-strong whitespace-nowrap tabular-nums">
                                {money(v.total)}
                              </div>
                            </div>
                            <div className="text-[11px] sunmi-text-muted">
                              Ticket #{v.numero ?? v.id} · {formatFechaHoraAR(v.fecha)}
                            </div>
                            <div className="text-[12px] sunmi-text-muted truncate">
                              {v.local?.nombre || "—"} · {v.vendedor?.nombre || "—"} · {v.items} ítem{v.items === 1 ? "" : "s"}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              <EstadoBadge fiado={esFiado} />
                              <span className="text-[12px] sunmi-text-muted capitalize">{v.formaPago}</span>
                              {v.anulada && <AnuladaBadge />}
                              {v.interna && <InternaBadge remitoId={v.remitoId} />}
                              {v.corregida && <CorregidaBadge version={v.version} />}
                            </div>
                            <SunmiButton color="amber" size="sm" onClick={() => irADetalle(v.id)} className="w-full mt-1">
                              Ver venta
                            </SunmiButton>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop: tabla */}
                    <div className="hidden md:block overflow-x-auto">
                      <SunmiTable
                        headers={[
                          "Fecha / hora",
                          "Cliente",
                          "Local",
                          { label: "Ítems", className: "text-center" },
                          "Forma de pago",
                          "Estado",
                          { label: "Total", className: "text-right" },
                          { label: "", className: "text-right" },
                        ]}
                      >
                        {listado.map((v) => {
                          const esFiado = v.estado === "fiado";
                          return (
                            <tr key={v.id} className="align-middle sunmi-row-hover transition-colors border-t sunmi-divider">
                              <td className="px-2.5 py-3 font-mono text-[11px] whitespace-nowrap sunmi-text-muted">
                                {formatFechaHoraAR(v.fecha)}
                              </td>
                              {/* Cliente protagonista + ticket secundario debajo */}
                              <td className="px-2.5 py-3 max-w-[200px]">
                                <div className="font-semibold sunmi-text-strong truncate text-[13px]">
                                  {v.cliente?.nombre || "Consumidor final"}
                                </div>
                                <div className="font-mono text-[11px] sunmi-text-muted">
                                  Ticket #{v.numero ?? v.id}
                                </div>
                              </td>
                              {/* Local + cajero (subtítulo muted) */}
                              <td className="px-2.5 py-3 max-w-[150px]">
                                <div className="truncate sunmi-text-strong">{v.local?.nombre || "—"}</div>
                                <div className="text-[11px] sunmi-text-muted truncate">{v.vendedor?.nombre || "—"}</div>
                              </td>
                              <td className="px-2.5 py-3 text-center tabular-nums">{v.items}</td>
                              <td className="px-2.5 py-3 capitalize">{v.formaPago}</td>
                              <td className="px-2.5 py-3">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <EstadoBadge fiado={esFiado} />
                                  {v.anulada && <AnuladaBadge />}
                              {v.interna && <InternaBadge remitoId={v.remitoId} />}
                              {v.corregida && <CorregidaBadge version={v.version} />}
                                </div>
                              </td>
                              <td className="px-2.5 py-3 text-right font-mono font-bold text-[14px] sunmi-text-strong whitespace-nowrap tabular-nums">
                                {money(v.total)}
                              </td>
                              <td className="px-2.5 py-3 text-right">
                                <SunmiButton color="amber" size="sm" onClick={() => irADetalle(v.id)} className="whitespace-nowrap">
                                  Ver venta
                                </SunmiButton>
                              </td>
                            </tr>
                          );
                        })}
                      </SunmiTable>
                    </div>

                    {paginacion && paginacion.totalPaginas > 1 && (
                      <div className="flex items-center justify-between gap-2 flex-wrap mt-3 pt-3 border-t sunmi-divider text-xs sunmi-text-muted">
                        <div>
                          Página {paginacion.page} de {paginacion.totalPaginas} · {paginacion.total} venta{paginacion.total === 1 ? "" : "s"}
                        </div>
                        <div className="flex gap-2">
                          <SunmiButton onClick={() => cargarListado(pageVentas - 1)} disabled={pageVentas <= 1 || loadingListado}>
                            Anterior
                          </SunmiButton>
                          <SunmiButton
                            onClick={() => cargarListado(pageVentas + 1)}
                            disabled={pageVentas >= paginacion.totalPaginas || loadingListado}
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
          </section>

          {/* Top productos */}
          {reporte.topProductos && reporte.topProductos.length > 0 && (
            <section className="space-y-2">
              <SectionHead title="Productos más vendidos" />
              <SunmiCard>
                <div className="overflow-x-auto">
                  <SunmiTable
                    headers={[
                      "Producto",
                      { label: "Cant", className: "text-center" },
                      { label: "Total venta", className: "text-right" },
                      { label: "Costo", className: "text-right" },
                      { label: "Ganancia", className: "text-right" },
                      { label: "Margen %", className: "text-right" },
                    ]}
                  >
                    {reporte.topProductos.map((item, idx) => {
                      const margen =
                        item.totalVenta > 0
                          ? ((item.ganancia / item.totalVenta) * 100).toFixed(1)
                          : "0.0";
                      return (
                        <tr key={idx} className="sunmi-row-hover transition-colors border-t sunmi-divider">
                          <td className="px-3 py-2.5 font-medium truncate max-w-[220px]">{item.nombre}</td>
                          <td className="px-3 py-2.5 text-center tabular-nums">{formatCantidad(item.cantidad)}</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums">{money(item.totalVenta)}</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums sunmi-text-muted">{money(item.totalCosto)}</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums sunmi-text-success">{money(item.ganancia)}</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                            <span className={margen > 30 ? "sunmi-text-success" : margen > 15 ? "sunmi-text-accent" : "sunmi-text-danger"}>
                              {margen}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </SunmiTable>
                </div>
              </SunmiCard>
            </section>
          )}
        </>
      )}

      {/* Sin datos */}
      {!reporte && !loading && (
        <SunmiCard className="p-3">
          <div className="text-center py-12 sunmi-text-muted">
            Seleccioná las fechas y generá el reporte
          </div>
        </SunmiCard>
      )}
    </div>
  );
}

// ── Subcomponentes de presentación (solo UI) ─────────────────────────────────

// Título de sección: reemplaza el separador centrado por un encabezado alineado a
// la izquierda, más legible y con jerarquía clara.
function SectionHead({ title, subtitle }) {
  return (
    <div className="min-w-0">
      <h2 className="text-sm font-bold sunmi-text-strong leading-tight">{title}</h2>
      {subtitle && <p className="text-[11px] sunmi-text-muted leading-tight">{subtitle}</p>}
    </div>
  );
}

// Card de métrica del resumen financiero: icono + label muted + valor fuerte, con
// color semántico. `highlight` resalta la Ganancia neta con fondo de estado.
function MetricCard({ icon: Icon, label, value, tone = "neutral", highlight = false, className = "" }) {
  const toneColor = {
    neutral: "sunmi-text-strong",
    link: "sunmi-text-link",
    accent: "sunmi-text-accent",
    warning: "sunmi-text-warning",
    success: "sunmi-text-success",
  }[tone] || "sunmi-text-strong";
  const box = highlight ? "sunmi-state-success" : "sunmi-surface sunmi-border";
  return (
    // Móvil: icono arriba y valor a ancho completo (no se truncan importes grandes).
    // Desktop (sm+): icono a la izquierda con el texto al lado.
    <div className={`${box} rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 ${className}`}>
      <div className={`shrink-0 grid place-items-center w-9 h-9 rounded-lg sunmi-surface-soft ${toneColor}`}>
        <Icon size={18} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] sunmi-text-muted leading-tight">{label}</div>
        <div className={`text-base sm:text-lg font-bold tabular-nums leading-tight ${toneColor}`}>{value}</div>
      </div>
    </div>
  );
}

// Badge de estado de la venta (Cobrado / Pendiente).
function EstadoBadge({ fiado }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${fiado ? "sunmi-state-warning sunmi-text-accent" : "sunmi-state-success sunmi-text-success"}`}
    >
      {fiado ? "Pendiente" : "Cobrado"}
    </span>
  );
}

// Badge de venta corregida (limpio, sin duplicar).
function CorregidaBadge({ version }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium sunmi-state-warning sunmi-text-accent whitespace-nowrap">
      ✎ Corregida{version ? ` · v${version}` : ""}
    </span>
  );
}

// Badge de venta ANULADA. Misma forma que el de corregida, en tono de peligro:
// una anulada sigue apareciendo en el listado —si desapareciera, quien la anuló
// por error no tendría dónde encontrarla— pero no suma en ningún total.
function AnuladaBadge() {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs2 font-semibold sunmi-state-danger sunmi-text-danger whitespace-nowrap">
      ⛔ Anulada
    </span>
  );
}

// Badge de operación INTERNA: la venta generó un remito a un local propio, así
// que no es una venta y no suma en los totales. Solo aparece con el interruptor
// prendido, y por eso tiene que decir POR QUÉ está ahí: sin la marca, con el
// interruptor puesto una interna se lee como una venta más.
function InternaBadge({ remitoId }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs2 font-medium sunmi-state-success sunmi-text-success whitespace-nowrap">
      ⇄ Interna{remitoId ? ` · remito #${remitoId}` : ""}
    </span>
  );
}
