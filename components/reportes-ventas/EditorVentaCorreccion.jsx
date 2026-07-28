"use client";

// EditorVentaCorreccion — corrección COMPLETA de una venta (Fase B) con el MISMO
// sistema responsive que Compras → Ver compra → Recibir mercadería. Se copia la
// estructura/clases/breakpoints de esa pantalla y solo se adaptan los datos de
// ventas:
//   · Página (overlay por portal, scrolleable) → SunmiCard → SunmiPanels.
//   · Encabezado: flex justify-between (SunmiHeader "Corregir venta" + badge estado
//     / botón Volver) + panel de metadatos grid-cols-2 md:grid-cols-4.
//   · Detalle: DESKTOP tabla (hidden md:block) · MÓVIL cards (md:hidden), con el
//     control de cantidad − [n] + idéntico a "Recibir mercadería".
//   · "Agregar producto": SunmiPanel inline (SunmiInput + tabla de resultados).
//   · Pagos: SunmiPanel con SunmiSelectAdv + SunmiInput.
//   · Resumen (Total original / corregido / Diferencia) + acciones inline
//     (flex justify-end gap-3). SIN footer flotante — scrollea con el contenido.
// Overlay por portal (z-[10000], por encima de SunmiModalLayout z-[9999]).
// Solo habilitado si el turno ORIGINAL sigue abierto (lo decide el backend).

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiPanel from "@/components/sunmi/SunmiPanel";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import LineaEditableCard from "@/components/reportes-ventas/LineaEditableCard";
import {
  aCent, desdeCent, totalCentDeLineas, crearPago, esFiado, normalizarAjustador,
  recomputar, setMontoCent, setAjustador, agregarPago, quitarPago, cambiarMedio,
  payloadPagos, payloadValido,
} from "@/lib/pos-ventas/pagosAjuste";
import {
  MODO_PACK, MODO_UNIDAD, permiteToggleDeposito, inferirModo,
  escalasDeLineaExistente, rescalarLinea, cantidadStockLinea, costoResoluble,
} from "@/lib/pos-ventas/lineaModoDeposito";

const TZ_AR = "America/Argentina/Cordoba";
const money = (n) => `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCant = (n) => { const x = Number(n); return Number.isInteger(x) ? String(x) : x.toLocaleString("es-AR", { maximumFractionDigits: 3 }); };
const MEDIOS = ["EFECTIVO", "DEBITO", "CREDITO", "MERCADOPAGO", "FIADO"];
const MEDIO_LABEL = { EFECTIVO: "Efectivo", DEBITO: "Débito", CREDITO: "Crédito", MERCADOPAGO: "Mercado Pago", FIADO: "Fiado" };
const ESTADO_BADGE = { cobrado: "sunmi-badge-success", fiado: "sunmi-badge-accent" };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
function fmtFecha(iso) {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", { timeZone: TZ_AR, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}
let _k = 0;
const nextKey = () => `l${++_k}`;

export default function EditorVentaCorreccion({ ventaId, onClose, onCorregido }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [clienteSel, setClienteSel] = useState(null);
  const [pagos, setPagos] = useState([]);
  const [buscaCli, setBuscaCli] = useState("");
  const [resCli, setResCli] = useState([]);
  const [revision, setRevision] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [montado, setMontado] = useState(false);

  // Buscar producto (bloque "Agregar producto" inline)
  const [extraSearch, setExtraSearch] = useState("");
  const [extraResults, setExtraResults] = useState([]);
  const [extraLoading, setExtraLoading] = useState(false);
  const [extraAdding, setExtraAdding] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => { setMontado(true); }, []);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/pos-ventas/venta/${ventaId}/editar`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        if (!d.ok) { setError(d.error || "No se pudo cargar."); return; }
        setData(d);
        const esDepositoVenta = d.venta.local?.esDeposito === true;
        setLineas((d.venta.lineas || []).map((l) => {
          const factorPack = Math.max(1, Number(l.baseStock?.factorPack) || 1);
          const modoEnvio = l.baseStock?.modo_envio || null;
          const puedeToggle = permiteToggleDeposito({ esDeposito: esDepositoVenta, factorPack, modoEnvio }) && !l.esServicio && !l.esCombo;
          // Modo con el que se persistió la línea (inferido de cantidadStock físico).
          const modoActual = puedeToggle
            ? inferirModo({ cantidad: num(l.cantidad), cantidadStock: l.cantidadStock, factorPack })
            : MODO_PACK;
          // Escalas bulto/unidad DERIVADAS del precio/costo congelado (sin re-consultar maestro).
          const escalas = escalasDeLineaExistente({ precio: num(l.precio), precioCosto: num(l.precioCosto), modoActual, factorPack });
          return {
            key: nextKey(), origenDetalleId: l.detalleId, productoBaseId: l.productoBaseId, nombre: l.nombre,
            codigo: l.codigo || null, presentacion: l.unidad || null,
            cantidad: num(l.cantidad), precio: num(l.precio), precioCosto: num(l.precioCosto),
            cantidadOriginal: num(l.cantidad), precioOriginal: num(l.precio),
            esServicio: l.esServicio, esCombo: l.esCombo, reconstruccion: l.reconstruccion || null,
            modalidadConfirmada: null, removed: false,
            // Depósito pack/unidad (Opción A): un modo por línea + escalas congeladas.
            esDeposito: esDepositoVenta, factorPack, modoEnvio, puedeToggle,
            modoVentaLinea: modoActual, ...escalas, costoResoluble: true,
          };
        }));
        setClienteSel(d.venta.cliente ? { id: d.venta.cliente.id, nombre: d.venta.cliente.nombre } : null);
        setPagos(normalizarAjustador((d.venta.pagos || []).map((p) => crearPago(String(p.medio).toUpperCase(), aCent(num(p.monto)), false))));
      })
      .catch(() => { if (vivo) setError("Error de conexión."); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [ventaId]);

  const c = data?.correccion || {};
  const bloqueado = data && !c.puedeCorregirCompleta;
  const activas = lineas.filter((l) => !l.removed);
  // Total corregido en CENTAVOS (fuente de verdad; redondeo por línea = backend).
  const totalCent = useMemo(() => totalCentDeLineas(lineas), [lineas]);
  const total = desdeCent(totalCent);
  const sumSubOrig = activas.reduce((a, l) => a + num(l.precioOriginal) * num(l.cantidadOriginal), 0);
  const totalOriginalVenta = num(data?.venta?.total);
  const difVsVenta = total - totalOriginalVenta;
  // Pagos SIEMPRE == total: el tender "Saldo automático" (ajustador) absorbe la
  // diferencia. Se recalcula al cambiar líneas o pagos. Todo en centavos.
  const pagosCalc = useMemo(() => recomputar(pagos, totalCent), [pagos, totalCent]);
  const permiteEditarPrecio = !!data?.permisos?.editarPrecioManual;

  // Líneas legacy ambiguas TOCADAS (modificadas/eliminadas) sin modalidad resuelta → bloquean Revisar.
  const ambiguasSinResolver = lineas.filter((l) =>
    l.reconstruccion?.estado === "ambiguo" &&
    (l.removed || num(l.cantidad) !== num(l.cantidadOriginal) || num(l.precio) !== num(l.precioOriginal)) &&
    !l.modalidadConfirmada
  );
  // Líneas agregadas sin costo resoluble → bloquean Revisar (no guardar costo 0 silencioso).
  const agregadasSinCosto = lineas.filter((l) => !l.removed && l.origenDetalleId == null && !l.esServicio && l.costoResoluble === false);
  // La UI impide pagos != total; este guard defensivo evita enviar un estado inválido.
  const pagosOk = payloadValido(pagosCalc.pagos, totalCent) && !pagosCalc.negativo;
  const puedeRevisar = activas.length > 0 && ambiguasSinResolver.length === 0 && pagosOk && agregadasSinCosto.length === 0;

  const setLinea = (key, patch) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // --- Handlers de pagos (operan sobre la lista YA sincronizada) ---
  const onPagoMonto = (id, valueStr) => {
    const cents = valueStr === "" ? 0 : aCent(Number(String(valueStr).replace(",", ".")));
    setPagos(setMontoCent(pagosCalc.pagos, id, cents, totalCent));
  };
  const onPagoAjustar = (id) => setPagos(setAjustador(pagosCalc.pagos, id));
  const onPagoQuitar = (id) => setPagos(quitarPago(pagosCalc.pagos, id));
  const onPagoAgregar = () => {
    const usados = new Set(pagos.map((p) => p.medio));
    const medio = MEDIOS.find((m) => m !== "FIADO" && !usados.has(m)) || "EFECTIVO";
    setPagos(agregarPago(pagosCalc.pagos, medio));
  };
  const onPagoMedio = (id, medio) => {
    if (medio === "FIADO" && pagos.length > 1) {
      if (!window.confirm("FIADO debe ser el único medio de pago. Se reemplazará la distribución actual por FIADO = total corregido. ¿Continuar?")) return;
    }
    setPagos(cambiarMedio(pagosCalc.pagos, id, medio, totalCent));
  };

  async function buscarCliente(q) {
    setBuscaCli(q);
    if (!q || q.length < 2) { setResCli([]); return; }
    try { const r = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(q)}`, { credentials: "include" }); const d = await r.json(); setResCli((d.items || []).slice(0, 6)); } catch { setResCli([]); }
  }

  // --- Buscar producto extra (debounced) — mismo patrón que Recibir mercadería ---
  const buscarExtra = useCallback((text) => {
    setExtraSearch(text);
    setExtraResults([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim() || !data?.venta?.local?.id) { setExtraLoading(false); return; }
    setExtraLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/pos-ventas/buscar-producto?q=${encodeURIComponent(text.trim())}&localId=${data.venta.local.id}`, { credentials: "include" });
        const d = await r.json();
        const items = (d.items || d.productos || []);
        setExtraResults(items.slice(0, 10));
      } catch { /* silenciar */ }
      finally { setExtraLoading(false); }
    }, 350);
  }, [data]);

  // Cambia el modo Pack/Unidad de una línea de depósito, reescalando precio/costo
  // con las escalas ya congeladas en la línea (no divide/multiplica a mano).
  const onModoVenta = (key, modo) => setLinea(key, rescalarLinea(lineas.find((l) => l.key === key) || {}, modo));

  function agregarProducto(item) {
    setExtraAdding(item.key);
    const esDeposito = data?.venta?.local?.esDeposito === true;
    const factorPack = Math.max(1, Number(item.factorPack) || 1);
    const modoEnvio = item.modoEnvio || null;
    const puedeToggle = permiteToggleDeposito({ esDeposito, factorPack, modoEnvio }) && !item.esServicio && !item.esCombo;
    // Modo inicial = el de salida por defecto del POS (BULTO en depósito, UNIDAD en local/solo_unidad).
    const modoInicial = String(item.modoSalidaDefault || "").toUpperCase() === "UNIDAD" ? MODO_UNIDAD : MODO_PACK;
    // Congelar escalas capturadas de buscar-producto (precio/costo de pack y unidad).
    const precioBulto = num(item.precioVentaBulto ?? item.precio);
    const precioUnitario = num(item.precioVentaUnitario ?? item.precio);
    const costoBulto = item.precioCostoBulto != null ? num(item.precioCostoBulto) : null;
    const costoUnitario = item.precioCostoUnitario != null ? num(item.precioCostoUnitario) : null;
    const resoluble = item.esServicio ? true : costoResoluble({ precioCostoBulto: costoBulto, precioCostoUnitario: costoUnitario });
    const precio = modoInicial === MODO_UNIDAD ? precioUnitario : precioBulto;
    const precioCosto = item.esServicio ? undefined : (modoInicial === MODO_UNIDAD ? costoUnitario : costoBulto);
    setLineas((ls) => [...ls, {
      key: nextKey(), origenDetalleId: null, productoBaseId: item.productoBaseId, nombre: item.nombre,
      codigo: null, presentacion: null, cantidad: 1, precio, precioCosto: precioCosto ?? undefined,
      cantidadOriginal: 0, precioOriginal: precio, esServicio: !!item.esServicio, esCombo: !!item.esCombo,
      reconstruccion: null, modalidadConfirmada: null, removed: false,
      esDeposito, factorPack, modoEnvio, puedeToggle, modoVentaLinea: modoInicial,
      precioBulto, precioUnitario, costoBulto, costoUnitario, costoResoluble: resoluble,
    }]);
    setExtraSearch(""); setExtraResults([]); setExtraAdding(null);
  }

  function payloadLineas() {
    return activas.map((l) => {
      const cantidad = num(l.cantidad);
      const base = {
        origenDetalleId: l.origenDetalleId, productoBaseId: l.productoBaseId,
        cantidad, precio: num(l.precio),
        // Modo explícito (Pack/Unidad) — el backend recalcula cantidadStock, no confía en el front.
        modoVentaLinea: l.modoVentaLinea || MODO_PACK,
        factorPack: Math.max(1, Number(l.factorPack) || 1),
        cantidadStock: l.esServicio || l.esCombo ? null : cantidadStockLinea({ cantidad, modoVentaLinea: l.modoVentaLinea, factorPack: l.factorPack, modoEnvio: l.modoEnvio, esDeposito: l.esDeposito }),
      };
      if (l.precioCosto != null && Number.isFinite(l.precioCosto)) base.precioCosto = l.precioCosto;
      if (l.esServicio) base.importeServicio = num(l.precio);
      return base;
    });
  }
  function payloadConfirmaciones() {
    return lineas.filter((l) => l.origenDetalleId != null && l.modalidadConfirmada).map((l) => ({ origenDetalleId: l.origenDetalleId, modalidad: l.modalidadConfirmada }));
  }

  async function revisar() {
    setRevisando(true); setError("");
    try {
      const r = await fetch(`/api/pos-ventas/venta/${ventaId}/revisar`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ version: data.venta.version, cliente: clienteSel ? { id: clienteSel.id } : null, lineas: payloadLineas(), pagos: payloadPagos(pagosCalc.pagos), confirmaciones: payloadConfirmaciones() }),
      });
      const d = await r.json();
      if (!d.ok) { setError(d.error || "No se pudo revisar."); setRevisando(false); return; }
      setRevision(d);
    } catch { setError("Error de conexión."); }
    finally { setRevisando(false); }
  }
  async function confirmar() {
    if (!motivo.trim()) { setError("El motivo es obligatorio."); return; }
    setConfirmando(true); setError("");
    try {
      const idempotencyKey = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `idem-${ventaId}-${Math.round(performance.now())}`;
      const r = await fetch(`/api/pos-ventas/venta/${ventaId}/corregir`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ motivo: motivo.trim(), idempotencyKey, version: data.venta.version, cliente: clienteSel ? { id: clienteSel.id } : null, lineas: payloadLineas(), pagos: payloadPagos(pagosCalc.pagos), confirmaciones: payloadConfirmaciones() }),
      });
      const d = await r.json();
      if (!d.ok) { setError(d.error || "No se pudo aplicar la corrección."); setConfirmando(false); return; }
      onCorregido && onCorregido(d); onClose && onClose();
    } catch { setError("Error de conexión."); }
    finally { setConfirmando(false); }
  }

  if (!montado) return null;

  const idsEnLineas = new Set(activas.map((l) => l.productoBaseId));

  return createPortal(
    <div className="fixed inset-0 z-[10000] sunmi-bg overflow-y-auto" style={{ overflowX: "hidden" }}>
      <div className="w-full min-h-full p-4">
        <SunmiCard>
          {/* Encabezado — patrón Ver / Recibir compra */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <SunmiHeader title="Corregir venta" />
              {data?.venta && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO_BADGE[data.venta.estado] || ""}`}>
                  {String(data.venta.estado || "").toUpperCase()}
                </span>
              )}
            </div>
            <button type="button" onClick={onClose} className="sunmi-btn-base sunmi-btn-slate inline-flex items-center gap-1.5">
              <ArrowLeft size={15} /> Volver
            </button>
          </div>

          {cargando && <SunmiLoader />}
          {!cargando && error && !revision && (
            <div className="text-[13px] sunmi-state-danger sunmi-text-danger rounded px-2 py-1.5">{error}</div>
          )}

          {!cargando && data && bloqueado && (
            <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm">
              <div className="sunmi-state-warning sunmi-text-accent rounded p-3 text-sm">
                No se puede corregir esta venta.{" "}
                {c.motivoBloqueo === "turno_cerrado_no_corregible" ? "El turno original ya está cerrado."
                  : c.motivoBloqueo === "fuera_de_ventana" ? "Pasó la ventana de 30 días."
                  : c.motivoBloqueo === "flag_no_habilitado" ? "Función en beta: no habilitada para tu usuario."
                  : c.motivoBloqueo === "sin_permiso" ? "No tenés permiso." : "Turno no disponible."}
              </div>
            </SunmiPanel>
          )}

          {!cargando && data && !bloqueado && (
            <>
              {/* Metadatos del ticket */}
              <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="sunmi-text-muted text-xs">Ticket</span>
                    <p className="sunmi-text-strong font-mono">#{data.venta.numero}</p>
                  </div>
                  <div>
                    <span className="sunmi-text-muted text-xs">Cliente</span>
                    <p className="sunmi-text-strong">{clienteSel?.nombre || "Consumidor final"}</p>
                  </div>
                  <div>
                    <span className="sunmi-text-muted text-xs">Local</span>
                    <p className="sunmi-text-strong">{data.venta.local?.nombre || "—"}</p>
                  </div>
                  <div>
                    <span className="sunmi-text-muted text-xs">Fecha</span>
                    <p className="sunmi-text-strong">{fmtFecha(data.venta.fecha)}</p>
                  </div>
                  <div>
                    <span className="sunmi-text-muted text-xs">Estado</span>
                    <p className="sunmi-text-strong capitalize">{data.venta.estado}</p>
                  </div>
                  <div>
                    <span className="sunmi-text-muted text-xs">Versión</span>
                    <p className="sunmi-text-strong">{data.venta.version}</p>
                  </div>
                  <div>
                    <span className="sunmi-text-muted text-xs">Turno</span>
                    <p className={data.turno?.turnoAbierto ? "sunmi-text-success font-medium" : "sunmi-text-danger font-medium"}>
                      {data.turno?.turnoAbierto ? "● Abierto" : "Cerrado"}
                    </p>
                  </div>
                </div>
              </SunmiPanel>

              {/* Cliente */}
              <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
                <div className="flex items-center justify-between pb-2 mb-3 border-b sunmi-divider">
                  <h3 className="text-[13px] font-semibold sunmi-text-strong">Cliente</h3>
                  <span className="text-xs sunmi-text-muted">{clienteSel ? clienteSel.nombre : "Consumidor final"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <SunmiInput value={buscaCli} onChange={(e) => buscarCliente(e.target.value)} placeholder="Buscar cliente…" />
                  {clienteSel && <SunmiButton color="slate" type="button" onClick={() => setClienteSel(null)}>Quitar</SunmiButton>}
                </div>
                {resCli.length > 0 && (
                  <div className="mt-2 overflow-x-auto rounded border sunmi-border">
                    <SunmiTable headers={["Cliente", "Documento", ""]}>
                      {resCli.map((cl) => (
                        <SunmiTableRow key={cl.id}>
                          <td className="px-3 py-1.5 text-sm">{cl.nombre}</td>
                          <td className="px-3 py-1.5 text-xs sunmi-text-muted">{cl.documento || "-"}</td>
                          <td className="px-3 py-1.5">
                            <SunmiButton color="cyan" size="xs" onClick={() => { setClienteSel({ id: cl.id, nombre: cl.nombre }); setResCli([]); setBuscaCli(""); }}>Elegir</SunmiButton>
                          </td>
                        </SunmiTableRow>
                      ))}
                    </SunmiTable>
                  </div>
                )}
              </SunmiPanel>

              {/* Detalle de productos */}
              <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
                <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
                  <h3 className="text-[13px] font-semibold sunmi-text-strong">Detalle ({activas.length} items)</h3>
                </div>

                {/* DESKTOP: tabla */}
                <div className="hidden md:block overflow-x-auto rounded border sunmi-border">
                  <SunmiTable headers={["Producto", "Cant. original", "Cant. corregida", "Precio original", "Precio corregido", "Subtotal orig.", "Subtotal corr.", "Diferencia", ""]}>
                    {activas.length === 0 ? (
                      <SunmiTableEmpty message="Sin items" />
                    ) : (
                      activas.map((l) => {
                        const subOrig = num(l.precioOriginal) * num(l.cantidadOriginal);
                        const subCorr = num(l.precio) * num(l.cantidad);
                        const dif = subCorr - subOrig;
                        const rec = l.reconstruccion || null;
                        const precioDeshab = l.esCombo || l.esServicio || !permiteEditarPrecio;
                        const esNuevo = l.origenDetalleId == null;
                        return (
                          <SunmiTableRow key={l.key}>
                            <td className="px-3 py-1.5 text-sm">
                              <div className="font-medium sunmi-text-strong">
                                {l.nombre}
                                {l.esCombo && <span className="ml-2 text-[10px] sunmi-text-link font-medium">COMBO</span>}
                                {l.esServicio && <span className="ml-2 text-[10px] sunmi-text-link font-medium">SERVICIO</span>}
                                {esNuevo && <span className="ml-2 text-[10px] sunmi-text-success font-medium">NUEVO</span>}
                              </div>
                              {l.puedeToggle && (
                                <div className="mt-1 flex items-center gap-2 flex-wrap">
                                  <div className="inline-flex rounded-lg overflow-hidden border sunmi-border">
                                    <button type="button" onClick={() => setLinea(l.key, rescalarLinea(l, MODO_PACK))}
                                      className={`px-2 py-0.5 text-[11px] font-medium ${(l.modoVentaLinea || MODO_PACK) === MODO_PACK ? "sunmi-state-success sunmi-text-success" : "sunmi-text-muted"}`}>Pack</button>
                                    <button type="button" onClick={() => setLinea(l.key, rescalarLinea(l, MODO_UNIDAD))}
                                      className={`px-2 py-0.5 text-[11px] font-medium ${l.modoVentaLinea === MODO_UNIDAD ? "sunmi-state-success sunmi-text-success" : "sunmi-text-muted"}`}>Unidad</button>
                                  </div>
                                  <span className="text-[10px] sunmi-text-muted">1 pack = {Math.max(1, Number(l.factorPack) || 1)} u</span>
                                </div>
                              )}
                              {l.costoResoluble === false && (
                                <div className="text-[10px] sunmi-text-danger mt-0.5">⚠ Sin costo resoluble — no se puede revisar</div>
                              )}
                              {rec?.estado === "reconstruido" && (
                                <div className="text-[10px] sunmi-text-success mt-0.5">✓ Consumo reconstruido — {rec.modalidad} · {fmtCant(rec.cantidadFisica)} u</div>
                              )}
                              {rec?.estado === "ambiguo" && (
                                <div className="mt-1 max-w-[240px] space-y-1">
                                  <div className="text-[10px] sunmi-text-accent">⚠ Consumo original no registrado</div>
                                  <SunmiSelectAdv value={l.modalidadConfirmada || ""} onChange={(v) => setLinea(l.key, { modalidadConfirmada: v || null })}>
                                    <SunmiSelectOption value="">Elegí la modalidad…</SunmiSelectOption>
                                    {(rec.modalidadesPosibles || []).map((m) => (
                                      <SunmiSelectOption key={m.modalidad} value={m.modalidad}>{m.label}{rec.recomendada === m.modalidad ? " — recomendado" : ""}</SunmiSelectOption>
                                    ))}
                                  </SunmiSelectAdv>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-center sunmi-text-muted line-through tabular-nums">{esNuevo ? "—" : fmtCant(l.cantidadOriginal)}</td>
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1 justify-center">
                                <SunmiButton color="slate" type="button" onClick={() => setLinea(l.key, { cantidad: Math.max(0, num(l.cantidad) - 1) })}>−</SunmiButton>
                                <SunmiInput
                                  type="text" inputMode="decimal" value={l.cantidad}
                                  onChange={(e) => { const raw = e.target.value; if (raw === "") { setLinea(l.key, { cantidad: "" }); return; } const v = Number(raw.replace(",", ".")); setLinea(l.key, { cantidad: Number.isFinite(v) ? Math.max(0, v) : 0 }); }}
                                  onBlur={() => { const cur = Number(l.cantidad); if (!Number.isFinite(cur) || cur < 0) setLinea(l.key, { cantidad: 0 }); }}
                                  className="w-[56px] text-center"
                                />
                                <SunmiButton color="slate" type="button" onClick={() => setLinea(l.key, { cantidad: num(l.cantidad) + 1 })}>+</SunmiButton>
                              </div>
                            </td>
                            <td className="px-3 py-1.5 text-center sunmi-text-muted line-through tabular-nums">{esNuevo ? "—" : money(l.precioOriginal)}</td>
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-0.5 justify-center">
                                <span className="sunmi-text-muted text-xs">$</span>
                                <SunmiInput
                                  type="text" inputMode="decimal" value={l.precio} disabled={precioDeshab}
                                  onChange={(e) => setLinea(l.key, { precio: e.target.value === "" ? 0 : Number(e.target.value.replace(",", ".")) })}
                                  className="w-[90px] text-center"
                                />
                              </div>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums sunmi-text-muted">{money(subOrig)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-medium">{money(subCorr)}</td>
                            <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${dif < 0 ? "sunmi-text-danger" : dif > 0 ? "sunmi-text-accent" : "sunmi-text-muted"}`}>{dif > 0 ? "+" : ""}{money(dif)}</td>
                            <td className="px-3 py-1.5 text-center">
                              <SunmiButton color="red" type="button" onClick={() => setLinea(l.key, { removed: true })}>Quitar</SunmiButton>
                            </td>
                          </SunmiTableRow>
                        );
                      })
                    )}
                    {activas.length > 0 && (
                      <tr className="border-t sunmi-divider">
                        <td colSpan={5} className="px-3 py-2 text-sm font-semibold text-right sunmi-text-strong">TOTAL CORREGIDO</td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums sunmi-text-muted">{money(sumSubOrig)}</td>
                        <td className="px-3 py-2 text-sm font-bold text-right sunmi-text-accent">{money(total)}</td>
                        <td className={`px-3 py-2 text-sm font-bold text-right tabular-nums ${(total - sumSubOrig) < 0 ? "sunmi-text-danger" : (total - sumSubOrig) > 0 ? "sunmi-text-accent" : "sunmi-text-muted"}`}>{(total - sumSubOrig) > 0 ? "+" : ""}{money(total - sumSubOrig)}</td>
                        <td />
                      </tr>
                    )}
                  </SunmiTable>
                </div>

                {/* MÓVIL: cards */}
                <div className="md:hidden flex flex-col gap-2">
                  {activas.length === 0 ? (
                    <p className="text-xs sunmi-text-muted italic px-1">Sin items</p>
                  ) : (
                    activas.map((l) => (
                      <LineaEditableCard
                        key={l.key} linea={l} permiteEditarPrecio={permiteEditarPrecio}
                        onChange={(patch) => setLinea(l.key, patch)} onRemove={() => setLinea(l.key, { removed: true })}
                        onModoVenta={(modo) => onModoVenta(l.key, modo)}
                      />
                    ))
                  )}
                  {activas.length > 0 && (
                    <div className="flex items-center justify-between rounded-xl border sunmi-border p-3 sunmi-surface">
                      <span className="text-sm font-semibold sunmi-text-strong">TOTAL CORREGIDO</span>
                      <span className="text-base font-bold sunmi-text-accent">{money(total)}</span>
                    </div>
                  )}
                </div>

                {ambiguasSinResolver.length > 0 && (
                  <div className="text-[11px] sunmi-text-danger mt-2">Resolvé el consumo original de las líneas marcadas para poder revisar.</div>
                )}
              </SunmiPanel>

              {/* Agregar producto — bloque inline (patrón "Agregar producto extra") */}
              <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
                <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
                  <h3 className="text-[13px] font-semibold sunmi-text-strong">Agregar producto</h3>
                </div>

                <SunmiInput
                  type="text" placeholder="Buscar producto (nombre / código de barra)"
                  autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                  value={extraSearch} onChange={(e) => buscarExtra(e.target.value)} className="mb-3"
                />

                {extraLoading && <p className="text-xs sunmi-text-muted">Buscando...</p>}
                {!extraLoading && extraSearch.trim() && extraResults.length === 0 && <p className="text-xs sunmi-text-muted">Sin resultados</p>}

                {extraResults.length > 0 && (
                  <div className="overflow-x-auto rounded border sunmi-border">
                    <SunmiTable headers={["Producto", "Cód. barra", "Presentación", "Precio", ""]}>
                      {extraResults.map((p) => {
                        const baseId = p.productoBaseId ?? p.baseId;
                        const precio = Number(p.precioVenta ?? p.precio ?? p.precio_venta ?? 0);
                        const presentacion = p.esServicioImporteVariable ? "Servicio" : (p.modoSalidaDefault === "BULTO" ? "Bulto" : "Unidad");
                        const rowKey = p.productoLocalId ?? baseId;
                        // Se permiten productos repetidos (Pack y Unidad son líneas distintas).
                        const yaEsta = idsEnLineas.has(baseId);
                        return (
                          <SunmiTableRow key={rowKey}>
                            <td className="px-3 py-1.5 text-sm">{p.nombre}{yaEsta ? <span className="ml-1 text-[10px] sunmi-text-muted">(en carrito)</span> : null}</td>
                            <td className="px-3 py-1.5 text-xs sunmi-text-muted">{p.codigoBarra || "-"}</td>
                            <td className="px-3 py-1.5 text-xs">{presentacion}</td>
                            <td className="px-3 py-1.5 text-xs">{precio > 0 ? money(precio) : "-"}</td>
                            <td className="px-3 py-1.5">
                              <SunmiButton
                                color="cyan" size="xs" disabled={extraAdding === rowKey}
                                onClick={() => agregarProducto({
                                  productoBaseId: baseId, nombre: p.nombre, precio,
                                  esServicio: !!p.esServicioImporteVariable, esCombo: !!p.esCombo, key: rowKey,
                                  // Escalas para congelar precio/costo de pack y unidad + modo.
                                  factorPack: p.factorPack, modoEnvio: p.modoEnvio, modoSalidaDefault: p.modoSalidaDefault,
                                  precioVentaBulto: p.precioVentaBulto, precioVentaUnitario: p.precioVentaUnitario,
                                  precioCostoBulto: p.precioCostoBulto, precioCostoUnitario: p.precioCostoUnitario,
                                })}
                              >
                                {extraAdding === rowKey ? "..." : "Agregar"}
                              </SunmiButton>
                            </td>
                          </SunmiTableRow>
                        );
                      })}
                    </SunmiTable>
                  </div>
                )}
              </SunmiPanel>

              {/* Pagos */}
              <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
                <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
                  <h3 className="text-[13px] font-semibold sunmi-text-strong">Pagos</h3>
                </div>

                <div className="flex flex-col gap-3">
                  {pagosCalc.pagos.map((p) => {
                    const esAj = p.id === pagosCalc.ajustadorId;
                    const varios = pagosCalc.pagos.length > 1;
                    const esFiadoRow = p.medio === "FIADO";
                    return (
                      <div key={p.id} className="flex flex-wrap items-end gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] sunmi-text-muted">Medio</span>
                          <div className="w-40">
                            <SunmiSelectAdv value={p.medio} onChange={(v) => onPagoMedio(p.id, v)}>
                              {MEDIOS.map((m) => <SunmiSelectOption key={m} value={m}>{MEDIO_LABEL[m]}</SunmiSelectOption>)}
                            </SunmiSelectAdv>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] sunmi-text-muted">
                            Importe{esAj && varios ? <span className="sunmi-text-accent font-medium"> · Saldo automático</span> : null}
                          </span>
                          <div className="flex items-center gap-0.5">
                            <span className="sunmi-text-muted text-xs">$</span>
                            <SunmiInput
                              type="text" inputMode="decimal" value={desdeCent(p.montoCent)} disabled={esAj}
                              onChange={(e) => onPagoMonto(p.id, e.target.value)}
                              className="w-[110px] text-center"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-3 pb-1.5">
                          {!esAj && !esFiadoRow && (
                            <button type="button" className="text-[11px] sunmi-text-link underline" onClick={() => onPagoAjustar(p.id)}>Ajustar saldo aquí</button>
                          )}
                          <SunmiButton color="red" type="button" disabled={pagosCalc.pagos.length === 1} onClick={() => onPagoQuitar(p.id)}>Quitar</SunmiButton>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t sunmi-divider gap-2 flex-wrap">
                  <SunmiButton color="slate" type="button" disabled={esFiado(pagos)} onClick={onPagoAgregar}>+ Medio de pago</SunmiButton>
                  <span className={`text-sm ${pagosCalc.negativo ? "sunmi-text-danger font-bold" : "sunmi-text-muted"}`}>
                    Disponible para asignar: <span className="font-semibold tabular-nums">{money(desdeCent(pagosCalc.disponibleCent))}</span>
                  </span>
                </div>
              </SunmiPanel>

              {/* Resumen */}
              <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="sunmi-text-muted text-xs">Total original</span>
                    <p className="sunmi-text-strong tabular-nums">{money(totalOriginalVenta)}</p>
                  </div>
                  <div>
                    <span className="sunmi-text-muted text-xs">Total corregido</span>
                    <p className="text-lg font-bold sunmi-text-accent tabular-nums">{money(total)}</p>
                  </div>
                  <div>
                    <span className="sunmi-text-muted text-xs">Diferencia</span>
                    <p className={`font-bold tabular-nums ${difVsVenta < 0 ? "sunmi-text-danger" : difVsVenta > 0 ? "sunmi-text-accent" : "sunmi-text-muted"}`}>{difVsVenta > 0 ? "+" : ""}{money(difVsVenta)}</p>
                  </div>
                </div>
              </SunmiPanel>

              {error && <div className="text-[13px] sunmi-state-danger sunmi-text-danger rounded px-2 py-1.5 mb-4">{error}</div>}

              {/* Acciones — inline (flex justify-end gap-3), como Compras */}
              <div className="flex justify-end gap-3">
                <SunmiButton color="slate" onClick={onClose}>Volver</SunmiButton>
                <SunmiButton color="amber" onClick={revisar} disabled={revisando || !puedeRevisar}>
                  {revisando ? "Revisando..." : "Revisar cambios"}
                </SunmiButton>
              </div>
            </>
          )}
        </SunmiCard>
      </div>

      {revision && (
        <ModalRevisarCambios revision={revision} motivo={motivo} setMotivo={setMotivo} error={error} confirmando={confirmando}
          onCancel={() => { setRevision(null); setError(""); }} onConfirm={confirmar} />
      )}
    </div>,
    document.body
  );
}

function ModalRevisarCambios({ revision, motivo, setMotivo, error, confirmando, onCancel, onConfirm }) {
  const t = revision.totales || {};
  const dp = revision.diff?.productos || {};
  const puede = revision.puedeConfirmar === true;
  const unidadesMas = (dp.agregadas || []).reduce((a, l) => a + Number(l.cantidad || 0), 0) + (dp.modificadas || []).reduce((a, l) => a + Math.max(0, Number(l.cantidadDespues) - Number(l.cantidadAntes)), 0);
  const unidadesMenos = (dp.eliminadas || []).reduce((a, l) => a + Number(l.cantidad || 0), 0) + (dp.modificadas || []).reduce((a, l) => a + Math.max(0, Number(l.cantidadAntes) - Number(l.cantidadDespues)), 0);
  return (
    <div className="fixed inset-0 z-[10001] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ overflowX: "hidden" }}>
      <div className="sunmi-bg w-full sm:max-w-lg sm:rounded-lg max-h-[90vh] overflow-y-auto p-4 space-y-3">
        <div className="text-base font-bold">Revisar cambios</div>
        <div className="sunmi-surface rounded p-2 text-sm space-y-1">
          <div className="flex justify-between"><span className="sunmi-text-muted">Total anterior</span><span className="tabular-nums">{money(t.totalAnterior)}</span></div>
          <div className="flex justify-between"><span className="sunmi-text-muted">Total nuevo</span><span className="tabular-nums font-semibold">{money(t.totalNuevo)}</span></div>
          <div className="flex justify-between"><span className="sunmi-text-muted">Diferencia</span>
            <span className={`tabular-nums font-semibold ${Number(t.diferencia) < 0 ? "sunmi-text-danger" : Number(t.diferencia) > 0 ? "sunmi-text-accent" : ""}`}>{Number(t.diferencia) > 0 ? "+" : ""}{money(t.diferencia)}</span></div>
          <div className="flex justify-between text-[11px] sunmi-text-muted"><span>Unidades + {unidadesMas} · − {unidadesMenos}</span><span>{Number(t.diferencia) < 0 ? "A devolver" : Number(t.diferencia) > 0 ? "A cobrar" : ""}</span></div>
        </div>
        <div className="text-[12px] space-y-1">
          {(dp.agregadas || []).map((l, i) => <div key={`a${i}`} className="sunmi-text-success">+ {l.nombre} × {l.cantidad} ({money(l.subtotal)})</div>)}
          {(dp.eliminadas || []).map((l, i) => <div key={`e${i}`} className="sunmi-text-danger">− {l.nombre} × {l.cantidad}</div>)}
          {(dp.modificadas || []).map((l, i) => <div key={`m${i}`} className="sunmi-text-accent">~ {l.nombre}: {l.cantidadAntes}→{l.cantidadDespues} u, {money(l.precioAntes)}→{money(l.precioDespues)}</div>)}
        </div>
        {(revision.impactoStock || []).length > 0 && (
          <div className="text-[11px] sunmi-text-muted">Stock: {revision.impactoStock.map((s) => `#${s.productoLocalId} ${s.delta > 0 ? "+" : ""}${s.delta}`).join(" · ")}</div>
        )}
        {revision.cuentaCorriente?.aplica && <div className="text-[12px] sunmi-state-warning sunmi-text-accent rounded px-2 py-1.5">Cuenta corriente: {String(revision.cuentaCorriente.tipo).replaceAll("_", " ")}</div>}
        {revision.diff?.cambioCliente && <div className="text-[12px] sunmi-text-muted">Cliente: {revision.diff.cambioCliente.antes ?? "consumidor final"} → {revision.diff.cambioCliente.despues ?? "consumidor final"}</div>}
        {(revision.bloqueosLegacy || []).length > 0 && <div className="text-[12px] sunmi-state-danger sunmi-text-danger rounded px-2 py-1.5">Hay líneas sin consumo resuelto: {revision.bloqueosLegacy.map((b) => b.nombre).join(", ")}</div>}
        {(revision.advertencias || []).map((a, i) => (
          <div key={i} className="text-[12px] sunmi-text-danger">{a.tipo === "pagos_no_cuadran" ? "Los pagos no cuadran con el total." : a.tipo === "fiado_sin_cliente" ? "Una venta fiada requiere cliente." : a.tipo === "stock_insuficiente" ? "Stock insuficiente." : a.detalle || a.tipo}</div>
        ))}
        <div>
          <div className="text-[11px] sunmi-text-muted mb-1">Motivo de la corrección *</div>
          <SunmiInput value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se corrige (obligatorio)" className="text-sm" maxLength={300} />
        </div>
        {error && <div className="text-[12px] sunmi-text-danger">{error}</div>}
        <div className="flex gap-2 justify-end pt-1">
          <SunmiButton color="slate" onClick={onCancel} disabled={confirmando} className="text-sm">Volver</SunmiButton>
          <SunmiButton color="amber" onClick={onConfirm} disabled={confirmando || !puede || !motivo.trim()} className="text-sm">{confirmando ? "Aplicando…" : "Confirmar corrección"}</SunmiButton>
        </div>
      </div>
    </div>
  );
}
