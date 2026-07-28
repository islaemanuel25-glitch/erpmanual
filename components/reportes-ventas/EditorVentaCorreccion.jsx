"use client";

// EditorVentaCorreccion — editor de CORRECCIÓN COMPLETA de una venta (Fase B).
// Fullscreen (mobile-first), prop-driven, SIN efectos del POS (no navegación, no
// turnos, no modo offline). Flujo: cargar → editar líneas/cliente/pagos →
// "Revisar cambios" (POST revisar, no escribe) → confirmar (POST corregir).
// Solo habilitado si el turno ORIGINAL sigue abierto (lo decide el backend).

import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

const money = (n) => `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MEDIOS = ["EFECTIVO", "DEBITO", "CREDITO", "MERCADOPAGO", "FIADO"];
const MEDIO_LABEL = { EFECTIVO: "Efectivo", DEBITO: "Débito", CREDITO: "Crédito", MERCADOPAGO: "Mercado Pago", FIADO: "Fiado" };

let _key = 0;
const nextKey = () => `l${++_key}`;

export default function EditorVentaCorreccion({ ventaId, onClose, onCorregido }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [clienteSel, setClienteSel] = useState(null);
  const [pagos, setPagos] = useState([]);
  const [buscaProd, setBuscaProd] = useState("");
  const [resProd, setResProd] = useState([]);
  const [buscaCli, setBuscaCli] = useState("");
  const [resCli, setResCli] = useState([]);
  const [revision, setRevision] = useState(null); // resultado de revisar
  const [motivo, setMotivo] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  // Portal a document.body: el editor es fullscreen y debe escapar cualquier
  // ancestro con transform/filter (el layout de /modulos crea un containing
  // block que rompería `position: fixed`). Solo tras montar (evita SSR).
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
          key: nextKey(), origenDetalleId: l.detalleId, productoBaseId: l.productoBaseId,
          nombre: l.nombre, cantidad: Number(l.cantidad), precio: Number(l.precio), precioCosto: Number(l.precioCosto),
          esServicio: l.esServicio, esCombo: l.esCombo, legacyAmbiguo: l.legacyAmbiguo, removed: false,
        })));
        setClienteSel(d.venta.cliente ? { id: d.venta.cliente.id, nombre: d.venta.cliente.nombre } : null);
        setPagos((d.venta.pagos || []).map((p) => ({ medio: String(p.medio).toUpperCase(), monto: Number(p.monto) })));
      })
      .catch(() => { if (vivo) setError("Error de conexión."); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [ventaId]);

  const activas = lineas.filter((l) => !l.removed);
  const total = useMemo(
    () => lineas.filter((l) => !l.removed).reduce((a, l) => a + Number(l.precio) * Number(l.cantidad), 0),
    [lineas]
  );
  const sumaPagos = pagos.reduce((a, p) => a + Number(p.monto || 0), 0);
  const bloqueado = data && !data.correccion?.puedeCorregirCompleta;

  function setLinea(key, patch) { setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); }

  async function buscarProducto(q) {
    setBuscaProd(q);
    if (!q || q.length < 2) { setResProd([]); return; }
    try {
      // buscar-producto exige localId explícito: el del LOCAL de la venta (mismo
      // local que se corrige → nunca cruza productos de otro local).
      const localId = data?.venta?.local?.id;
      const r = await fetch(`/api/pos-ventas/buscar-producto?q=${encodeURIComponent(q)}&localId=${localId}`, { credentials: "include" });
      const d = await r.json();
      setResProd((d.items || d.productos || []).slice(0, 8));
    } catch { setResProd([]); }
  }
  function agregarProducto(item) {
    setLineas((ls) => [...ls, {
      key: nextKey(), origenDetalleId: null, productoBaseId: item.productoBaseId ?? item.baseId,
      nombre: item.nombre, cantidad: 1, precio: Number(item.precioVenta ?? item.precio ?? item.precio_venta ?? 0),
      precioCosto: undefined, esServicio: !!item.esServicioImporteVariable, esCombo: !!item.esCombo, legacyAmbiguo: false, removed: false,
    }]);
    setBuscaProd(""); setResProd([]);
  }
  async function buscarCliente(q) {
    setBuscaCli(q);
    if (!q || q.length < 2) { setResCli([]); return; }
    try {
      const r = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(q)}`, { credentials: "include" });
      const d = await r.json();
      setResCli((d.items || []).slice(0, 6));
    } catch { setResCli([]); }
  }

  function payloadLineas() {
    return activas.map((l) => {
      const base = { origenDetalleId: l.origenDetalleId, productoBaseId: l.productoBaseId, cantidad: Number(l.cantidad), precio: Number(l.precio) };
      if (l.precioCosto != null && Number.isFinite(l.precioCosto)) base.precioCosto = l.precioCosto;
      if (l.esServicio) base.importeServicio = Number(l.precio);
      return base;
    });
  }

  async function revisar() {
    setRevisando(true); setError("");
    try {
      const r = await fetch(`/api/pos-ventas/venta/${ventaId}/revisar`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ version: data.venta.version, cliente: clienteSel ? { id: clienteSel.id } : null, lineas: payloadLineas(), pagos }),
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
        body: JSON.stringify({ motivo: motivo.trim(), idempotencyKey, version: data.venta.version, cliente: clienteSel ? { id: clienteSel.id } : null, lineas: payloadLineas(), pagos }),
      });
      const d = await r.json();
      if (!d.ok) { setError(d.error || "No se pudo aplicar la corrección."); setConfirmando(false); return; }
      onCorregido && onCorregido(d);
      onClose && onClose();
    } catch { setError("Error de conexión."); }
    finally { setConfirmando(false); }
  }

  if (!montado) return null;

  return createPortal(
    // z por encima de SunmiModalLayout (z-[9999]): el editor se abre desde el
    // modal de detalle, así que debe quedar por ARRIBA o queda oculto detrás.
    <div className="fixed inset-0 z-[10000] sunmi-bg flex flex-col" style={{ overflowX: "hidden" }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 p-3 border-b sunmi-divider shrink-0">
        <div className="min-w-0">
          <div className="text-[11px] sunmi-text-muted">Corregir venta</div>
          <div className="font-bold truncate">Ticket #{data?.venta?.numero ?? ventaId}</div>
        </div>
        <SunmiButton color="slate" onClick={onClose} className="text-sm shrink-0">Cerrar</SunmiButton>
      </div>

      {cargando && <div className="flex-1 grid place-items-center"><SunmiLoader /></div>}

      {!cargando && error && !revision && (
        <div className="p-3"><div className="text-[13px] sunmi-state-danger sunmi-text-danger rounded px-2 py-1.5">{error}</div></div>
      )}

      {!cargando && data && bloqueado && (
        <div className="p-4">
          <div className="sunmi-state-warning sunmi-text-accent rounded p-3 text-sm">
            No se puede corregir esta venta.
            {data.correccion?.motivoBloqueo === "turno_cerrado_no_corregible"
              ? " El turno original ya está cerrado."
              : data.correccion?.motivoBloqueo === "fuera_de_ventana" ? " Pasó la ventana de 30 días."
              : data.correccion?.motivoBloqueo === "sin_permiso" ? " No tenés permiso."
              : " Turno no disponible."}
          </div>
        </div>
      )}

      {!cargando && data && !bloqueado && (
        <>
          {/* Cuerpo scrolleable */}
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
                  {resCli.map((c) => (
                    <button key={c.id} type="button" className="block w-full text-left px-2 py-1.5 text-[12px]" onClick={() => { setClienteSel({ id: c.id, nombre: c.nombre }); setResCli([]); setBuscaCli(""); }}>
                      {c.nombre}{c.documento ? <span className="sunmi-text-muted ml-1">({c.documento})</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Líneas */}
            <div>
              <div className="text-[11px] sunmi-text-muted mb-1">Productos</div>
              <div className="space-y-2">
                {activas.map((l) => (
                  <div key={l.key} className="sunmi-surface rounded-lg p-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <div className="font-medium truncate">
                        {l.nombre}
                        {l.esCombo ? <span className="ml-1 text-[10px] sunmi-text-muted">(combo)</span> : null}
                        {l.esServicio ? <span className="ml-1 text-[10px] sunmi-text-muted">(servicio)</span> : null}
                        {l.legacyAmbiguo ? <span className="ml-1 text-[10px] sunmi-text-danger">(no editable: sin consumo congelado)</span> : null}
                      </div>
                      <button type="button" className="text-[11px] sunmi-text-danger underline shrink-0" onClick={() => setLinea(l.key, { removed: true })}>quitar</button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <label className="text-[11px] sunmi-text-muted">Cant.
                        <input type="number" min="0" step="0.001" value={l.cantidad} disabled={l.legacyAmbiguo}
                          onChange={(e) => setLinea(l.key, { cantidad: e.target.value === "" ? 0 : Number(e.target.value) })}
                          className="sunmi-input ml-1 w-20 text-sm disabled:opacity-50" />
                      </label>
                      <label className="text-[11px] sunmi-text-muted">P. unit.
                        <input type="number" min="0" step="0.01" value={l.precio} disabled={l.esCombo || l.esServicio || l.legacyAmbiguo}
                          onChange={(e) => setLinea(l.key, { precio: e.target.value === "" ? 0 : Number(e.target.value) })}
                          className="sunmi-input ml-1 w-24 text-sm disabled:opacity-50" />
                      </label>
                      <span className="ml-auto tabular-nums font-mono">{money(Number(l.precio) * Number(l.cantidad))}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Agregar producto */}
              <div className="mt-2">
                <SunmiInput value={buscaProd} onChange={(e) => buscarProducto(e.target.value)} placeholder="Agregar producto…" className="text-sm" />
                {resProd.length > 0 && (
                  <div className="mt-1 sunmi-surface rounded max-h-40 overflow-auto">
                    {resProd.map((p) => (
                      <button key={p.productoLocalId ?? p.productoBaseId ?? p.baseId} type="button" className="block w-full text-left px-2 py-1.5 text-[12px]" onClick={() => agregarProducto(p)}>
                        {p.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Pagos */}
            <div>
              <div className="text-[11px] sunmi-text-muted mb-1">Pagos</div>
              <div className="space-y-2">
                {pagos.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select value={p.medio} onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, medio: e.target.value } : x)))} className="sunmi-input text-sm">
                      {MEDIOS.map((m) => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
                    </select>
                    <input type="number" min="0" step="0.01" value={p.monto} onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, monto: e.target.value === "" ? 0 : Number(e.target.value) } : x)))} className="sunmi-input w-28 text-sm" />
                    <button type="button" className="text-[11px] sunmi-text-danger underline" onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))}>quitar</button>
                  </div>
                ))}
                <SunmiButton color="slate" onClick={() => setPagos((ps) => [...ps, { medio: "EFECTIVO", monto: 0 }])} className="text-xs">+ medio</SunmiButton>
                <div className={`text-[12px] ${Math.abs(sumaPagos - total) < 0.01 ? "sunmi-text-success" : "sunmi-text-danger"}`}>
                  Σ pagos {money(sumaPagos)} {Math.abs(sumaPagos - total) < 0.01 ? "= total" : `≠ total ${money(total)}`}
                </div>
              </div>
            </div>
          </div>

          {/* Total fijo + acción */}
          <div className="shrink-0 border-t sunmi-divider p-3 space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm sunmi-text-muted">Total corregido</span>
              <span className="text-lg font-bold tabular-nums">{money(total)}</span>
            </div>
            {error && <div className="text-[12px] sunmi-text-danger">{error}</div>}
            <SunmiButton color="amber" onClick={revisar} disabled={revisando || activas.length === 0} className="w-full">
              {revisando ? "Revisando…" : "Revisar cambios"}
            </SunmiButton>
          </div>
        </>
      )}

      {/* Modal Revisar cambios */}
      {revision && (
        <ModalRevisarCambios
          revision={revision}
          motivo={motivo}
          setMotivo={setMotivo}
          error={error}
          confirmando={confirmando}
          onCancel={() => { setRevision(null); setError(""); }}
          onConfirm={confirmar}
        />
      )}
    </div>,
    document.body
  );
}

function ModalRevisarCambios({ revision, motivo, setMotivo, error, confirmando, onCancel, onConfirm }) {
  const t = revision.totales || {};
  const dp = revision.diff?.productos || {};
  const puede = revision.puedeConfirmar === true;
  return (
    <div className="fixed inset-0 z-[10001] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ overflowX: "hidden" }}>
      <div className="sunmi-bg w-full sm:max-w-lg sm:rounded-lg max-h-[90vh] overflow-y-auto p-4 space-y-3">
        <div className="text-base font-bold">Revisar cambios</div>

        {/* Totales */}
        <div className="sunmi-surface rounded p-2 text-sm space-y-1">
          <div className="flex justify-between"><span className="sunmi-text-muted">Total anterior</span><span className="tabular-nums">{money(t.totalAnterior)}</span></div>
          <div className="flex justify-between"><span className="sunmi-text-muted">Total nuevo</span><span className="tabular-nums font-semibold">{money(t.totalNuevo)}</span></div>
          <div className="flex justify-between">
            <span className="sunmi-text-muted">Diferencia</span>
            <span className={`tabular-nums font-semibold ${Number(t.diferencia) < 0 ? "sunmi-text-danger" : Number(t.diferencia) > 0 ? "sunmi-text-accent" : ""}`}>
              {Number(t.diferencia) > 0 ? "+" : ""}{money(t.diferencia)}
            </span>
          </div>
          {Number(t.diferencia) < 0 && <div className="text-[11px] sunmi-text-muted">A devolver / acreditar según los pagos definidos.</div>}
          {Number(t.diferencia) > 0 && <div className="text-[11px] sunmi-text-muted">A cobrar según los pagos definidos.</div>}
        </div>

        {/* Diff productos */}
        <div className="text-[12px] space-y-1">
          {(dp.agregadas || []).map((l, i) => <div key={`a${i}`} className="sunmi-text-success">+ {l.nombre} × {l.cantidad} ({money(l.subtotal)})</div>)}
          {(dp.eliminadas || []).map((l, i) => <div key={`e${i}`} className="sunmi-text-danger">− {l.nombre} × {l.cantidad}</div>)}
          {(dp.modificadas || []).map((l, i) => <div key={`m${i}`} className="sunmi-text-accent">~ {l.nombre}: {l.cantidadAntes}→{l.cantidadDespues} u, {money(l.precioAntes)}→{money(l.precioDespues)}</div>)}
        </div>

        {/* Impacto stock */}
        {(revision.impactoStock || []).length > 0 && (
          <div className="text-[11px] sunmi-text-muted">
            Stock: {revision.impactoStock.map((s) => `#${s.productoLocalId} ${s.delta > 0 ? "+" : ""}${s.delta}`).join(" · ")}
          </div>
        )}

        {/* Cuenta corriente */}
        {revision.cuentaCorriente?.aplica && (
          <div className="text-[12px] sunmi-state-warning sunmi-text-accent rounded px-2 py-1.5">
            Cuenta corriente: {revision.cuentaCorriente.tipo.replaceAll("_", " ")}
          </div>
        )}

        {/* Advertencias / bloqueos */}
        {(revision.bloqueosLegacy || []).length > 0 && (
          <div className="text-[12px] sunmi-state-danger sunmi-text-danger rounded px-2 py-1.5">
            Hay líneas sin consumo congelado que no se pueden corregir: {revision.bloqueosLegacy.map((b) => b.nombre).join(", ")}
          </div>
        )}
        {(revision.advertencias || []).map((a, i) => (
          <div key={i} className="text-[12px] sunmi-text-danger">{a.tipo === "pagos_no_cuadran" ? "Los pagos no cuadran con el total." : a.tipo === "fiado_sin_cliente" ? "Una venta fiada requiere cliente." : a.tipo === "stock_insuficiente" ? "Stock insuficiente." : a.detalle || a.tipo}</div>
        ))}

        {/* Motivo */}
        <div>
          <div className="text-[11px] sunmi-text-muted mb-1">Motivo de la corrección *</div>
          <SunmiInput value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se corrige (obligatorio)" className="text-sm" maxLength={300} />
        </div>

        {error && <div className="text-[12px] sunmi-text-danger">{error}</div>}

        <div className="flex gap-2 justify-end pt-1">
          <SunmiButton color="slate" onClick={onCancel} disabled={confirmando} className="text-sm">Volver</SunmiButton>
          <SunmiButton color="amber" onClick={onConfirm} disabled={confirmando || !puede || !motivo.trim()} className="text-sm">
            {confirmando ? "Aplicando…" : "Confirmar corrección"}
          </SunmiButton>
        </div>
      </div>
    </div>
  );
}
