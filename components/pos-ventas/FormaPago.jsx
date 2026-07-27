"use client";

import { memo, useMemo, useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import { showError } from "@/components/sunmi/SunmiToast";
import { aCentavos } from "@/lib/pos-ventas/pagos";

const COMISION_DEFAULT = 7;

const FORMAS_PAGO = [
  { key: "efectivo", label: "Efectivo", tieneComision: false },
  { key: "mercadopago", label: "MercadoPago", tieneComision: true },
  { key: "debito", label: "Debito", tieneComision: true },
  { key: "credito", label: "Credito", tieneComision: true },
  { key: "fiado", label: "Fiado", tieneComision: false },
];

// Medios seleccionables en el pago dividido (fiado se maneja aparte: único tender).
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
  const forma = FORMAS_PAGO.find((f) => f.key === formaPago);
  const tieneComision = forma?.tieneComision || false;
  const comisionPct = tieneComision ? Number(comisiones?.[formaPago] ?? COMISION_DEFAULT) : 0;
  const base = subtotal - descuento - descuentoPorPuntos;
  const total = base; // Cliente paga subtotal - descuentos, SIN comision
  const comisionBancaria = tieneComision ? base * (comisionPct / 100) : 0;
  const netoRecibido = total - comisionBancaria;
  const fiadoSinCliente = formaPago === "fiado" && !clienteSeleccionado;

  // ── Servicios de importe variable: mínimo a cubrir en EFECTIVO ────────────
  // La venta con servicios no puede fiarse y su total de servicios debe quedar
  // cubierto en efectivo. El backend es la autoridad final; acá es UX/bloqueo.
  const hayServicios = Number(minEfectivoServicios) > 0;
  const minEfCent = aCentavos(minEfectivoServicios || 0);

  // ── Pago dividido (múltiples tenders). El backend recalcula todo. ──────────
  const [dividido, setDividido] = useState(false);
  const [tenders, setTenders] = useState([]); // [{ medio, monto }]
  const [medioSel, setMedioSel] = useState("efectivo");
  const [montoSel, setMontoSel] = useState("");

  const totalCent = aCentavos(total);
  const pagadoCent = tenders.reduce((a, t) => a + aCentavos(t.monto), 0);
  const restanteCent = totalCent - pagadoCent;
  const restante = restanteCent / 100;

  // Consolidación por medio (máx. 1 por medio) para el payload y el resumen.
  const tendersConsolidados = useMemo(() => {
    const m = new Map();
    for (const t of tenders) m.set(t.medio, (m.get(t.medio) || 0) + Number(t.monto));
    return [...m.entries()].map(([medio, monto]) => ({ medio, monto }));
  }, [tenders]);

  const esFiadoDiv = tenders.length === 1 && tenders[0].medio === "fiado";
  // Efectivo cubierto por los tenders de efectivo (para la regla de servicios).
  const efectivoDivCent = tendersConsolidados
    .filter((t) => t.medio === "efectivo")
    .reduce((a, t) => a + aCentavos(t.monto), 0);
  const cumpleEfectivoDiv = !hayServicios || efectivoDivCent >= minEfCent;
  const puedeCobrarDiv =
    totalCent > 0 && restanteCent === 0 && (!esFiadoDiv || !!clienteSeleccionado) && cumpleEfectivoDiv && !(hayServicios && esFiadoDiv);
  // En "un medio": con servicios el único medio válido es efectivo (cubre el total ≥ mínimo).
  const cumpleEfectivoSingle = !hayServicios || (formaPago === "efectivo" && totalCent >= minEfCent);

  const comisionDivPct = (medio) =>
    medio === "efectivo" || medio === "fiado" ? 0 : Number(comisiones?.[medio] ?? COMISION_DEFAULT);
  const comisionDiv = tendersConsolidados.reduce((a, t) => a + t.monto * (comisionDivPct(t.medio) / 100), 0);

  const agregarTender = () => {
    if (esFiadoDiv) return; // fiado ocupa todo
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
    // formaPago="mixto" evita el modal de efectivo del padre; el backend deriva el real.
    const fp = tendersConsolidados.length === 1 ? tendersConsolidados[0].medio : "mixto";
    onCobrar({ formaPago: fp, total, pagos: tendersConsolidados });
  };

  return (
    <SunmiCard className="p-3 lg:p-4 flex flex-col gap-3">
      <div className="text-center py-2">
        <div className="text-[11px] pos-text-muted uppercase tracking-widest font-medium">Total a cobrar</div>
        <div className="text-4xl lg:text-5xl font-black pos-text-accent mt-1 tabular-nums tracking-tight">
          ${formatPrecio(total)}
        </div>
      </div>

      {/* Servicios: mínimo obligatorio en efectivo */}
      {hayServicios && (
        <div
          className="px-2 py-1.5 rounded-lg text-xs text-center font-medium"
          style={{
            background: "color-mix(in srgb, var(--pos-accent) 12%, transparent)",
            color: "var(--pos-accent)",
          }}
        >
          Esta venta contiene servicios. Debe abonarse al menos{" "}
          <b>${formatPrecio(minEfectivoServicios)}</b> en efectivo.
        </div>
      )}

      {/* Toggle un-medio / pago dividido (solo online) */}
      {!offlineMode && (
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => setDividido(false)}
            className={`sunmi-btn min-h-10 text-xs rounded-md ${!dividido ? "sunmi-pos-btn-primary" : "sunmi-pos-btn-secondary"}`}>
            Un medio
          </button>
          <button type="button" onClick={() => setDividido(true)}
            className={`sunmi-btn min-h-10 text-xs rounded-md ${dividido ? "sunmi-pos-btn-primary" : "sunmi-pos-btn-secondary"}`}>
            Pago dividido
          </button>
        </div>
      )}

      {offlineMode ? (
        <button type="button" onClick={() => onCobrar({ formaPago, total })}
          disabled={cobrando || disabled || formaPago !== "efectivo" || subtotal <= 0}
          className="sunmi-btn sunmi-pos-btn-primary w-full min-h-14 lg:min-h-16 text-lg lg:text-xl font-bold rounded-md">
          {cobrando ? "Guardando..." : `GUARDAR PENDIENTE $${formatPrecio(total)}`}
        </button>
      ) : dividido ? (
        <>
          {/* Constructor de tenders */}
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
              <span>Pagado: <b className="tabular-nums">${formatPrecio((pagadoCent / 100))}</b></span>
              <span className={restanteCent === 0 ? "pos-text-success-soft" : "pos-text-danger"}>
                Restante: <b className="tabular-nums">${formatPrecio(restante)}</b>
              </span>
            </div>
            {comisionDiv > 0 && (
              <div className="text-[11px] pos-text-muted text-center">
                Comisión estimada: -${formatPrecio(comisionDiv)} (neto ${formatPrecio(total - comisionDiv)})
              </div>
            )}

            {/* Fiado: único tender por el total */}
            <button type="button" onClick={ponerFiadoTotal}
              className={`sunmi-btn min-h-9 text-xs rounded-md ${esFiadoDiv ? "sunmi-pos-btn-primary" : "sunmi-pos-btn-secondary"}`}>
              {esFiadoDiv ? "Fiado (todo el total) ✓" : "Fiado (todo el total)"}
            </button>
          </div>

          <button type="button" onClick={cobrarDividido}
            disabled={cobrando || disabled || !puedeCobrarDiv}
            className="sunmi-btn sunmi-pos-btn-primary w-full min-h-14 lg:min-h-16 text-lg lg:text-xl font-bold rounded-md">
            {cobrando ? "Procesando..." : restanteCent === 0 ? `COBRAR $${formatPrecio(total)}` : `Falta $${formatPrecio(restante)}`}
          </button>
        </>
      ) : (
        <>
          {fiadoSinCliente && subtotal > 0 && (
            <div className="px-2 py-1.5 rounded-lg text-xs text-center font-medium" style={{ background: "color-mix(in srgb, var(--pos-danger) 12%, transparent)", color: "var(--pos-danger)" }}>
              Seleccione un cliente para vender fiado
            </div>
          )}
          <button type="button" onClick={() => onCobrar({ formaPago, total })}
            disabled={cobrando || disabled || !formaPago || subtotal <= 0 || fiadoSinCliente || !cumpleEfectivoSingle}
            className="sunmi-btn sunmi-pos-btn-primary w-full min-h-14 lg:min-h-16 text-lg lg:text-xl font-bold rounded-md">
            {cobrando ? "Procesando..." : hayServicios && !cumpleEfectivoSingle ? "Pagá en efectivo" : `COBRAR $${formatPrecio(total)}`}
          </button>

          {queueLength > 0 && onProcesarCola && (
            <button type="button" onClick={onProcesarCola} disabled={procesandoCola || offlineMode}
              className="sunmi-btn sunmi-pos-btn-secondary w-full min-h-12 text-base font-semibold mt-2 rounded-md">
              {procesandoCola ? "Procesando..." : `PROCESAR COLA (${queueLength})`}
            </button>
          )}

          <div className="grid grid-cols-3 gap-1.5">
            {FORMAS_PAGO.map((fp) => {
              const esEfectivo = fp.key === "efectivo";
              // Con servicios, en "un medio" solo efectivo (para pagar parte con digital
              // usar "Pago dividido"). Fiado nunca con servicios.
              const bloqueadoServicios = hayServicios && !esEfectivo;
              const estaDeshabilitado = (offlineMode && !esEfectivo) || bloqueadoServicios;
              const selected = formaPago === fp.key;
              const btnClass = estaDeshabilitado
                ? "sunmi-btn pos-control opacity-50 cursor-not-allowed"
                : selected ? "sunmi-btn sunmi-pos-btn-primary" : "sunmi-btn sunmi-pos-btn-secondary";
              return (
                <button key={fp.key} type="button"
                  onClick={() => {
                    if (offlineMode && !esEfectivo) { showError("Sin internet: solo efectivo disponible"); return; }
                    if (bloqueadoServicios) { showError(fp.key === "fiado" ? "No se puede fiar una venta con servicios" : "Con servicios: usá 'Pago dividido' para combinar con digital"); return; }
                    onFormaPagoChange(fp.key);
                  }}
                  disabled={estaDeshabilitado} className={`min-h-11 text-xs py-1.5 rounded-md ${btnClass}`}>
                  {fp.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            {descuento > 0 && (
              <div className="px-2 py-1.5 rounded-lg pos-success-box text-xs text-center">
                Descuento: <span className="font-semibold pos-text-success-soft">-${formatPrecio(descuento)}</span>
              </div>
            )}
            {descuentoPorPuntos > 0 && (
              <div className="px-2 py-1.5 rounded-lg pos-points-box text-xs text-center">
                Puntos: <span className="font-semibold pos-text-points">-${formatPrecio(descuentoPorPuntos)}</span>
              </div>
            )}
            {tieneComision && subtotal > 0 && (
              <div className="px-2 py-1.5 rounded-lg pos-commission-box text-xs text-center pos-text-muted">
                Comision {comisionPct}%: <span className="font-semibold pos-text-muted-strong">-${formatPrecio(comisionBancaria)}</span>
                <span className="ml-1 text-[10px]">(neto: ${formatPrecio(netoRecibido)})</span>
              </div>
            )}
          </div>
        </>
      )}
    </SunmiCard>
  );
}

export default memo(FormaPago);
export { COMISION_DEFAULT, FORMAS_PAGO };
