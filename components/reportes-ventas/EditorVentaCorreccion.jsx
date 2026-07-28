"use client";

// EditorVentaCorreccion — corrección COMPLETA de una venta (Fase B), rediseñado
// con el patrón visual de Compras → Ver compra → Recibir mercadería:
//   · Encabezado con metadatos (ticket, cliente, local, fecha, estado, versión,
//     badge turno abierto).
//   · Tarjetas por producto (original → corregido) con estados de consumo legacy.
//   · Pagos en tarjeta separada.
//   · Resumen final + footer fijo "Revisar cambios" (safe-area Android).
// Fullscreen por portal (z-[10000], por encima de SunmiModalLayout z-[9999]).
// Solo habilitado si el turno ORIGINAL sigue abierto (lo decide el backend).

import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import LineaEditableCard from "@/components/reportes-ventas/LineaEditableCard";
import ModalBuscarProducto from "@/components/reportes-ventas/ModalBuscarProducto";

const TZ_AR = "America/Argentina/Cordoba";
const money = (n) => `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MEDIOS = ["EFECTIVO", "DEBITO", "CREDITO", "MERCADOPAGO", "FIADO"];
const MEDIO_LABEL = { EFECTIVO: "Efectivo", DEBITO: "Débito", CREDITO: "Crédito", MERCADOPAGO: "Mercado Pago", FIADO: "Fiado" };
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
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const [revision, setRevision] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/pos-ventas/venta/${ventaId}/editar`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        if (!d.ok) { setError(d.error || "No se pudo cargar."); return; }
        setData(d);
        setLineas((d.venta.lineas || []).map((l) => ({
          key: nextKey(), origenDetalleId: l.detalleId, productoBaseId: l.productoBaseId, nombre: l.nombre,
          codigo: l.codigo || null, presentacion: l.unidad || null,
          cantidad: num(l.cantidad), precio: num(l.precio), precioCosto: num(l.precioCosto),
          cantidadOriginal: num(l.cantidad), precioOriginal: num(l.precio),
          esServicio: l.esServicio, esCombo: l.esCombo, reconstruccion: l.reconstruccion || null,
          modalidadConfirmada: null, removed: false,
        })));
        setClienteSel(d.venta.cliente ? { id: d.venta.cliente.id, nombre: d.venta.cliente.nombre } : null);
        setPagos((d.venta.pagos || []).map((p) => ({ medio: String(p.medio).toUpperCase(), monto: num(p.monto) })));
      })
      .catch(() => { if (vivo) setError("Error de conexión."); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [ventaId]);

  const c = data?.correccion || {};
  const bloqueado = data && !c.puedeCorregirCompleta;
  const activas = lineas.filter((l) => !l.removed);
  const total = useMemo(() => lineas.filter((l) => !l.removed).reduce((a, l) => a + num(l.precio) * num(l.cantidad), 0), [lineas]);
  const sumaPagos = pagos.reduce((a, p) => a + num(p.monto), 0);
  const pagosCuadran = Math.abs(sumaPagos - total) < 0.01;
  const permiteEditarPrecio = !!data?.permisos?.editarPrecioManual;

  // Líneas legacy ambiguas TOCADAS (modificadas/eliminadas) sin modalidad resuelta → bloquean Revisar.
  const ambiguasSinResolver = lineas.filter((l) =>
    l.reconstruccion?.estado === "ambiguo" &&
    (l.removed || num(l.cantidad) !== num(l.cantidadOriginal) || num(l.precio) !== num(l.precioOriginal)) &&
    !l.modalidadConfirmada
  );
  const puedeRevisar = pagosCuadran && activas.length > 0 && ambiguasSinResolver.length === 0;

  const setLinea = (key, patch) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function buscarCliente(q) {
    setBuscaCli(q);
    if (!q || q.length < 2) { setResCli([]); return; }
    try { const r = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(q)}`, { credentials: "include" }); const d = await r.json(); setResCli((d.items || []).slice(0, 6)); } catch { setResCli([]); }
  }
  function agregarProducto(item) {
    setLineas((ls) => [...ls, {
      key: nextKey(), origenDetalleId: null, productoBaseId: item.productoBaseId, nombre: item.nombre,
      codigo: null, presentacion: null, cantidad: 1, precio: num(item.precio), precioCosto: undefined,
      cantidadOriginal: 0, precioOriginal: num(item.precio), esServicio: !!item.esServicio, esCombo: !!item.esCombo,
      reconstruccion: null, modalidadConfirmada: null, removed: false,
    }]);
    setBuscadorAbierto(false);
  }

  function payloadLineas() {
    return activas.map((l) => {
      const base = { origenDetalleId: l.origenDetalleId, productoBaseId: l.productoBaseId, cantidad: num(l.cantidad), precio: num(l.precio) };
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
        body: JSON.stringify({ version: data.venta.version, cliente: clienteSel ? { id: clienteSel.id } : null, lineas: payloadLineas(), pagos, confirmaciones: payloadConfirmaciones() }),
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
        body: JSON.stringify({ motivo: motivo.trim(), idempotencyKey, version: data.venta.version, cliente: clienteSel ? { id: clienteSel.id } : null, lineas: payloadLineas(), pagos, confirmaciones: payloadConfirmaciones() }),
      });
      const d = await r.json();
      if (!d.ok) { setError(d.error || "No se pudo aplicar la corrección."); setConfirmando(false); return; }
      onCorregido && onCorregido(d); onClose && onClose();
    } catch { setError("Error de conexión."); }
    finally { setConfirmando(false); }
  }

  if (!montado) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] sunmi-bg flex flex-col" style={{ overflowX: "hidden" }}>
      {/* Encabezado */}
      <div className="shrink-0 border-b sunmi-divider p-3">
        <div className="flex items-center justify-between gap-2">
          <SunmiButton color="slate" onClick={onClose} className="text-sm">← Volver</SunmiButton>
          <SunmiHeader title="Corregir venta" />
          <div className="w-16" />
        </div>
        {data?.venta && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 mt-2 text-[11px]">
            <div><span className="sunmi-text-muted">Ticket</span> <span className="font-mono font-semibold">#{data.venta.numero}</span></div>
            <div><span className="sunmi-text-muted">Cliente</span> <span className="font-medium">{clienteSel?.nombre || "Consumidor final"}</span></div>
            <div><span className="sunmi-text-muted">Local</span> <span className="font-medium">{data.venta.local?.nombre || "—"}</span></div>
            <div><span className="sunmi-text-muted">Fecha</span> {fmtFecha(data.venta.fecha)}</div>
            <div><span className="sunmi-text-muted">Estado</span> <span className="capitalize">{data.venta.estado}</span></div>
            <div><span className="sunmi-text-muted">Versión</span> {data.venta.version}</div>
            {data.turno?.turnoAbierto && <div className="px-1.5 py-0.5 rounded-full sunmi-state-success sunmi-text-success text-[10px] w-fit">● Turno abierto</div>}
          </div>
        )}
      </div>

      {cargando && <div className="flex-1 grid place-items-center"><SunmiLoader /></div>}
      {!cargando && error && !revision && <div className="p-3"><div className="text-[13px] sunmi-state-danger sunmi-text-danger rounded px-2 py-1.5">{error}</div></div>}
      {!cargando && data && bloqueado && (
        <div className="p-4"><div className="sunmi-state-warning sunmi-text-accent rounded p-3 text-sm">
          No se puede corregir esta venta.{" "}
          {c.motivoBloqueo === "turno_cerrado_no_corregible" ? "El turno original ya está cerrado."
            : c.motivoBloqueo === "fuera_de_ventana" ? "Pasó la ventana de 30 días."
            : c.motivoBloqueo === "flag_no_habilitado" ? "Función en beta: no habilitada para tu usuario."
            : c.motivoBloqueo === "sin_permiso" ? "No tenés permiso." : "Turno no disponible."}
        </div></div>
      )}

      {!cargando && data && !bloqueado && (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-4" style={{ overflowX: "hidden" }}>
            {/* Cliente */}
            <div>
              <div className="text-[11px] sunmi-text-muted mb-1">Cliente</div>
              <div className="flex items-center gap-2 mb-1 text-sm">
                <span className="font-medium">{clienteSel ? clienteSel.nombre : "Consumidor final"}</span>
                {clienteSel && <button type="button" className="text-[11px] sunmi-text-link underline" onClick={() => setClienteSel(null)}>quitar</button>}
              </div>
              <SunmiInput value={buscaCli} onChange={(e) => buscarCliente(e.target.value)} placeholder="Buscar cliente…" className="text-sm" />
              {resCli.length > 0 && (
                <div className="mt-1 sunmi-surface rounded max-h-40 overflow-auto">
                  {resCli.map((cl) => (
                    <button key={cl.id} type="button" className="block w-full text-left px-2 py-1.5 text-[12px]" onClick={() => { setClienteSel({ id: cl.id, nombre: cl.nombre }); setResCli([]); setBuscaCli(""); }}>
                      {cl.nombre}{cl.documento ? <span className="sunmi-text-muted ml-1">({cl.documento})</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Productos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] sunmi-text-muted">Productos</div>
                <SunmiButton color="cyan" onClick={() => setBuscadorAbierto(true)} className="text-xs">+ Agregar producto</SunmiButton>
              </div>
              {activas.map((l) => (
                <LineaEditableCard key={l.key} linea={l} permiteEditarPrecio={permiteEditarPrecio}
                  onChange={(patch) => setLinea(l.key, patch)} onRemove={() => setLinea(l.key, { removed: true })} />
              ))}
              {ambiguasSinResolver.length > 0 && (
                <div className="text-[11px] sunmi-text-danger">Resolvé el consumo original de las líneas marcadas para poder revisar.</div>
              )}
            </div>

            {/* Pagos (tarjeta separada) */}
            <div className="sunmi-surface rounded-lg p-3 space-y-2">
              <div className="text-[11px] sunmi-text-muted">Pagos</div>
              {pagos.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={p.medio} onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, medio: e.target.value } : x)))} className="sunmi-input text-sm">
                    {MEDIOS.map((m) => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
                  </select>
                  <input type="number" min="0" step="0.01" value={p.monto} onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, monto: e.target.value === "" ? 0 : Number(e.target.value) } : x)))} className="sunmi-input w-28 text-sm" />
                  <button type="button" className="text-[11px] sunmi-text-danger underline" onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))}>quitar</button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <SunmiButton color="slate" onClick={() => setPagos((ps) => [...ps, { medio: "EFECTIVO", monto: 0 }])} className="text-xs">+ medio</SunmiButton>
                <span className={`text-[12px] ${pagosCuadran ? "sunmi-text-success" : "sunmi-text-danger"}`}>Σ {money(sumaPagos)} {pagosCuadran ? "= total" : `≠ ${money(total)}`}</span>
              </div>
            </div>
          </div>

          {/* Footer fijo con safe-area */}
          <div className="shrink-0 border-t sunmi-divider p-3 space-y-2" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
            <div className="flex justify-between items-baseline">
              <span className="text-sm sunmi-text-muted">Total corregido</span>
              <span className="text-lg font-bold tabular-nums">{money(total)}</span>
            </div>
            {error && <div className="text-[12px] sunmi-text-danger">{error}</div>}
            <SunmiButton color="amber" onClick={revisar} disabled={revisando || !puedeRevisar} className="w-full">
              {revisando ? "Revisando…" : "Revisar cambios"}
            </SunmiButton>
          </div>
        </>
      )}

      {buscadorAbierto && data?.venta?.local && (
        <ModalBuscarProducto localId={data.venta.local.id} onSelect={agregarProducto} onClose={() => setBuscadorAbierto(false)} />
      )}
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
  const cl = revision.diff?.clasificacion || {};
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
