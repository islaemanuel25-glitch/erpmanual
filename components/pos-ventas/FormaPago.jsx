"use client";

import { memo, useMemo, useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import { showError } from "@/components/sunmi/SunmiToast";
import { aCentavos } from "@/lib/pos-ventas/pagos";
import { componerCobroSimple } from "@/lib/pos-ventas/servicios";

const COMISION_DEFAULT = 7;

const FORMAS_PAGO = [
  { key: "efectivo", label: "Efectivo", tieneComision: false },
  { key: "mercadopago", label: "MercadoPago", tieneComision: true },
  { key: "debito", label: "Debito", tieneComision: true },
  { key: "credito", label: "Credito", tieneComision: true },
  { key: "fiado", label: "Fiado", tieneComision: false },
];

// Medios grandes del cobro simple (fiado se muestra aparte, solo sin servicios).
const MEDIOS_COBRO = [
  { key: "efectivo", label: "Efectivo" },
  { key: "debito", label: "Débito" },
  { key: "credito", label: "Crédito" },
  { key: "mercadopago", label: "Mercado Pago" },
];

// Medios seleccionables en el modo avanzado (fiado se maneja aparte: único tender).
const MEDIOS_SPLIT = FORMAS_PAGO.filter((f) => f.key !== "fiado");

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function FormaPago({
  subtotal,
  descuento = 0,
  descuentoPorPuntos = 0,
  formaPago,
  onFormaPagoChange,
  onCobrar,
  cobrando,
  disabled,
  offlineMode = false,
  queueLength = 0,
  onProcesarCola,
  procesandoCola = false,
  comisiones = null,
  clienteSeleccionado = null,
  minEfectivoServicios = 0,
}) {
  const base = subtotal - descuento - descuentoPorPuntos;
  const total = base; // Cliente paga subtotal - descuentos, SIN comisión

  // ── Servicios de importe variable: mínimo a cubrir en EFECTIVO ────────────
  const minEf = Math.max(0, Number(minEfectivoServicios) || 0);
  const totalCent = aCentavos(total);
  const minEfCent = aCentavos(minEf);
  const hayServicios = minEfCent > 0;
  const soloServicios = hayServicios && minEfCent >= totalCent; // totalServicios == totalVenta
  const restoCent = Math.max(0, totalCent - minEfCent);
  const resto = restoCent / 100;
  const puedeVender = !disabled && !cobrando && subtotal > 0;

  // ── Modo: simple (por defecto) o avanzado (constructor de pagos) ──────────
  const [modo, setModo] = useState("simple");
  const [tenders, setTenders] = useState([]); // [{ medio, monto }] (avanzado)
  const [medioSel, setMedioSel] = useState("efectivo");
  const [montoSel, setMontoSel] = useState("");

  // Recalcular ante cambios del carrito: si cambió el total o el mínimo de servicios,
  // limpiar la distribución avanzada para no arrastrar pagos obsoletos que ya no
  // coinciden. Patrón React de "ajustar estado al cambiar props durante el render"
  // (sin useEffect → sin render en cascada).
  const carritoKey = `${totalCent}-${minEfCent}`;
  const [prevCarritoKey, setPrevCarritoKey] = useState(carritoKey);
  if (carritoKey !== prevCarritoKey) {
    setPrevCarritoKey(carritoKey);
    if (tenders.length > 0) setTenders([]);
    if (montoSel !== "") setMontoSel("");
  }

  // ── Cobro SIMPLE: un medio → componer payload server-authoritative ─────────
  const cobrarSimple = (medio) => {
    if (!puedeVender) return;
    if (medio === "fiado" && hayServicios) {
      return showError("No se puede fiar una venta que contiene servicios");
    }
    onCobrar(componerCobroSimple({ medio, total, minEfectivoServicios: minEf }));
  };

  // ── Modo AVANZADO (constructor de tenders) ────────────────────────────────
  const pagadoCent = tenders.reduce((a, t) => a + aCentavos(t.monto), 0);
  const restanteCent = totalCent - pagadoCent;
  const restante = restanteCent / 100;

  const tendersConsolidados = useMemo(() => {
    const m = new Map();
    for (const t of tenders) m.set(t.medio, (m.get(t.medio) || 0) + Number(t.monto));
    return [...m.entries()].map(([medio, monto]) => ({ medio, monto }));
  }, [tenders]);

  const esFiadoDiv = tenders.length === 1 && tenders[0].medio === "fiado";
  const efectivoDivCent = tendersConsolidados
    .filter((t) => t.medio === "efectivo")
    .reduce((a, t) => a + aCentavos(t.monto), 0);
  const cumpleEfectivoDiv = !hayServicios || efectivoDivCent >= minEfCent;
  const puedeCobrarDiv =
    totalCent > 0 && restanteCent === 0 && (!esFiadoDiv || !!clienteSeleccionado) && cumpleEfectivoDiv && !(hayServicios && esFiadoDiv);

  const comisionDivPct = (medio) =>
    medio === "efectivo" || medio === "fiado" ? 0 : Number(comisiones?.[medio] ?? COMISION_DEFAULT);
  const comisionDiv = tendersConsolidados.reduce((a, t) => a + t.monto * (comisionDivPct(t.medio) / 100), 0);

  const agregarTender = () => {
    if (esFiadoDiv) return;
    const m = Number(montoSel);
    if (!Number.isFinite(m) || m <= 0) return showError("Ingresá un monto válido");
    if (aCentavos(m) > restanteCent) return showError("El monto supera el restante");
    setTenders((prev) => [...prev, { medio: medioSel, monto: m }]);
    setMontoSel("");
  };
  const completarRestante = () => {
    if (restanteCent <= 0 || esFiadoDiv) return;
    setTenders((prev) => [...prev, { medio: medioSel, monto: restanteCent / 100 }]);
    setMontoSel("");
  };
  const quitarTender = (i) => setTenders((prev) => prev.filter((_, idx) => idx !== i));
  const ponerFiadoTotal = () => {
    if (hayServicios) return showError("No se puede fiar una venta que contiene servicios");
    if (!clienteSeleccionado) return showError("Seleccioná un cliente para vender fiado");
    setTenders([{ medio: "fiado", monto: total }]);
  };
  const cobrarDividido = () => {
    if (!puedeCobrarDiv) return;
    const fp = tendersConsolidados.length === 1 ? tendersConsolidados[0].medio : "mixto";
    onCobrar({ formaPago: fp, total, pagos: tendersConsolidados });
  };
  const volverSimple = () => {
    setModo("simple");
    setTenders([]);
    setMontoSel("");
  };

  const BTN_PRIMARIO = "sunmi-btn sunmi-pos-btn-primary w-full min-h-14 lg:min-h-16 text-lg lg:text-xl font-bold rounded-md";
  const BTN_MEDIO = "sunmi-btn sunmi-pos-btn-secondary min-h-14 text-sm font-semibold rounded-md";

  return (
    <SunmiCard className="p-3 lg:p-4 flex flex-col gap-3">
      {/* 1) TOTAL */}
      <div className="text-center py-1">
        <div className="text-[11px] pos-text-muted uppercase tracking-widest font-medium">Total a cobrar</div>
        <div className="text-4xl lg:text-5xl font-black pos-text-accent mt-1 tabular-nums tracking-tight">
          ${formatPrecio(total)}
        </div>
      </div>

      {offlineMode ? (
        /* OFFLINE: solo efectivo, guardar pendiente */
        <button type="button" onClick={() => onCobrar({ formaPago: "efectivo", total })}
          disabled={!puedeVender}
          className={BTN_PRIMARIO}>
          {cobrando ? "Guardando..." : `GUARDAR PENDIENTE $${formatPrecio(total)}`}
        </button>
      ) : modo === "avanzado" ? (
        /* ───────── MODO AVANZADO: constructor de pagos ───────── */
        <>
          {hayServicios && (
            <div className="text-xs text-center pos-text-muted">
              Efectivo mínimo por servicios: <b className="pos-text-accent">${formatPrecio(minEf)}</b>
            </div>
          )}
          <div className="flex flex-col gap-2 rounded-lg border border-[var(--app-border)] p-2">
            <div className="grid grid-cols-2 gap-1.5">
              <select value={medioSel} onChange={(e) => setMedioSel(e.target.value)} disabled={esFiadoDiv}
                className="sunmi-control min-h-10 text-xs rounded-md px-2">
                {MEDIOS_SPLIT.map((m) => (<option key={m.key} value={m.key}>{m.label}</option>))}
              </select>
              <input type="number" inputMode="decimal" value={montoSel} placeholder="Monto"
                onChange={(e) => setMontoSel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") agregarTender(); }}
                disabled={esFiadoDiv} className="sunmi-control min-h-10 text-sm text-right rounded-md px-2" />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={agregarTender} disabled={esFiadoDiv || restanteCent <= 0}
                className="sunmi-btn sunmi-pos-btn-secondary min-h-9 text-xs rounded-md">Agregar</button>
              <button type="button" onClick={completarRestante} disabled={esFiadoDiv || restanteCent <= 0}
                className="sunmi-btn sunmi-pos-btn-secondary min-h-9 text-xs rounded-md">Completar resto</button>
            </div>

            {tenders.length > 0 && (
              <div className="flex flex-col gap-1">
                {tenders.map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-xs px-1">
                    <span className="capitalize">{t.medio}</span>
                    <span className="tabular-nums">
                      ${formatPrecio(t.monto)}
                      <button type="button" onClick={() => quitarTender(i)} className="ml-2 pos-text-danger">✕</button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between text-xs pt-1 border-t border-[var(--app-border)]">
              <span>Pagado: <b className="tabular-nums">${formatPrecio(pagadoCent / 100)}</b></span>
              <span className={restanteCent === 0 ? "pos-text-success-soft" : "pos-text-danger"}>
                Restante: <b className="tabular-nums">${formatPrecio(restante)}</b>
              </span>
            </div>
            {comisionDiv > 0 && (
              <div className="text-[11px] pos-text-muted text-center">
                Comisión estimada: -${formatPrecio(comisionDiv)} (neto ${formatPrecio(total - comisionDiv)})
              </div>
            )}

            {!hayServicios && (
              <button type="button" onClick={ponerFiadoTotal}
                className={`sunmi-btn min-h-9 text-xs rounded-md ${esFiadoDiv ? "sunmi-pos-btn-primary" : "sunmi-pos-btn-secondary"}`}>
                {esFiadoDiv ? "Fiado (todo el total) ✓" : "Fiado (todo el total)"}
              </button>
            )}
          </div>

          <button type="button" onClick={cobrarDividido} disabled={cobrando || disabled || !puedeCobrarDiv}
            className={BTN_PRIMARIO}>
            {cobrando ? "Procesando..." : restanteCent === 0 ? `COBRAR $${formatPrecio(total)}` : "COMPLETAR PAGO"}
          </button>

          <button type="button" onClick={volverSimple}
            className="text-xs pos-text-link text-center underline-offset-2 hover:underline">
            Volver al pago simple
          </button>
        </>
      ) : soloServicios ? (
        /* ───────── CASO A: venta 100% servicios → efectivo ───────── */
        <>
          <div className="text-sm text-center pos-text-muted">
            Este servicio debe abonarse en efectivo
          </div>
          <button type="button" onClick={() => cobrarSimple("efectivo")} disabled={!puedeVender}
            className={BTN_PRIMARIO}>
            {cobrando ? "Procesando..." : "COBRAR EN EFECTIVO"}
          </button>
        </>
      ) : (
        /* ───────── CASO B (normal) / CASO C (servicios + mercadería) ───────── */
        <>
          {hayServicios && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg px-3 py-2 text-center"
                style={{ background: "color-mix(in srgb, var(--pos-accent) 12%, transparent)" }}>
                <div className="text-[10px] pos-text-muted uppercase tracking-wide">Efectivo obligatorio</div>
                <div className="text-lg font-bold pos-text-accent tabular-nums">${formatPrecio(minEf)}</div>
              </div>
              <div className="rounded-lg px-3 py-2 text-center pos-bg-panel">
                <div className="text-[10px] pos-text-muted uppercase tracking-wide">Resta pagar</div>
                <div className="text-lg font-bold tabular-nums">${formatPrecio(resto)}</div>
              </div>
            </div>
          )}

          <div className="text-sm font-medium text-center pos-text-muted-strong">
            {hayServicios ? `Elegí cómo pagar $${formatPrecio(resto)}` : "Elegí cómo cobrar"}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {MEDIOS_COBRO.map((m) => (
              <button key={m.key} type="button" onClick={() => cobrarSimple(m.key)} disabled={!puedeVender}
                className={BTN_MEDIO}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Fiado: solo en venta sin servicios */}
          {!hayServicios && (
            <>
              {formaPago === "fiado" && !clienteSeleccionado && subtotal > 0 && (
                <div className="px-2 py-1.5 rounded-lg text-xs text-center font-medium"
                  style={{ background: "color-mix(in srgb, var(--pos-danger) 12%, transparent)", color: "var(--pos-danger)" }}>
                  Seleccioná un cliente para vender fiado
                </div>
              )}
              <button type="button" onClick={() => cobrarSimple("fiado")} disabled={!puedeVender}
                className="sunmi-btn sunmi-pos-btn-secondary w-full min-h-11 text-sm rounded-md">
                Fiado
              </button>
            </>
          )}

          {/* Acción avanzada discreta */}
          <button type="button" onClick={() => setModo("avanzado")}
            className="text-xs pos-text-link text-center underline-offset-2 hover:underline">
            {hayServicios ? "Dividir de otra manera" : "Dividir pago"}
          </button>

          {queueLength > 0 && onProcesarCola && (
            <button type="button" onClick={onProcesarCola} disabled={procesandoCola || offlineMode}
              className="sunmi-btn sunmi-pos-btn-secondary w-full min-h-12 text-base font-semibold rounded-md">
              {procesandoCola ? "Procesando..." : `PROCESAR COLA (${queueLength})`}
            </button>
          )}
        </>
      )}

      {/* Info compacta de descuentos/puntos (si aplica) */}
      {(descuento > 0 || descuentoPorPuntos > 0) && (
        <div className="flex flex-wrap justify-center gap-2 text-[11px]">
          {descuento > 0 && (
            <span className="pos-text-success-soft">Descuento -${formatPrecio(descuento)}</span>
          )}
          {descuentoPorPuntos > 0 && (
            <span className="pos-text-points">Puntos -${formatPrecio(descuentoPorPuntos)}</span>
          )}
        </div>
      )}
    </SunmiCard>
  );
}

export default memo(FormaPago);
export { COMISION_DEFAULT, FORMAS_PAGO };
