"use client";

import { memo } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import { showError } from "@/components/sunmi/SunmiToast";

const COMISION_DEFAULT = 7;

const FORMAS_PAGO = [
  { key: "efectivo", label: "Efectivo", tieneComision: false },
  { key: "mercadopago", label: "MercadoPago", tieneComision: true },
  { key: "debito", label: "Debito", tieneComision: true },
  { key: "credito", label: "Credito", tieneComision: true },
  { key: "fiado", label: "Fiado", tieneComision: false },
];

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
}) {
  const forma = FORMAS_PAGO.find((f) => f.key === formaPago);
  const tieneComision = forma?.tieneComision || false;
  const comisionPct = tieneComision
    ? Number(comisiones?.[formaPago] ?? COMISION_DEFAULT)
    : 0;
  const base = subtotal - descuento - descuentoPorPuntos;
  const total = base; // Cliente paga subtotal - descuentos, SIN comision
  const comisionBancaria = tieneComision ? base * (comisionPct / 100) : 0;
  const netoRecibido = total - comisionBancaria;
  const fiadoSinCliente = formaPago === "fiado" && !clienteSeleccionado;

  return (
    <SunmiCard className="p-3 lg:p-4 flex flex-col gap-3">
      {/* Total a cobrar - bloque dominante */}
      <div className="text-center py-2">
        <div className="text-[11px] pos-text-muted uppercase tracking-widest font-medium">
          Total a cobrar
        </div>
        <div className="text-4xl lg:text-5xl font-black pos-text-accent mt-1 tabular-nums tracking-tight">
          ${formatPrecio(total)}
        </div>
      </div>

      {/* Botones según modo offline/online */}
      {offlineMode ? (
        <>
          {/* Botón guardar pendiente (offline) - solo efectivo */}
          <button
            type="button"
            onClick={() => onCobrar({ formaPago, total })}
            disabled={cobrando || disabled || formaPago !== "efectivo" || subtotal <= 0}
            className="sunmi-btn sunmi-pos-btn-primary w-full min-h-14 lg:min-h-16 text-lg lg:text-xl font-bold rounded-md"
          >
            {cobrando ? "Guardando..." : `GUARDAR PENDIENTE $${formatPrecio(total)}`}
          </button>
        </>
      ) : (
        <>
          {/* Aviso fiado sin cliente */}
          {fiadoSinCliente && subtotal > 0 && (
            <div className="px-2 py-1.5 rounded-lg text-xs text-center font-medium" style={{ background: 'color-mix(in srgb, var(--pos-danger) 12%, transparent)', color: 'var(--pos-danger)' }}>
              Seleccione un cliente para vender fiado
            </div>
          )}

          {/* Botón principal COBRAR */}
          <button
            type="button"
            onClick={() => onCobrar({ formaPago, total })}
            disabled={cobrando || disabled || !formaPago || subtotal <= 0 || fiadoSinCliente}
            className="sunmi-btn sunmi-pos-btn-primary w-full min-h-14 lg:min-h-16 text-lg lg:text-xl font-bold rounded-md"
          >
            {cobrando ? "Procesando..." : `COBRAR $${formatPrecio(total)}`}
          </button>

          {/* Botón procesar cola (solo si hay items en cola y está online) */}
          {queueLength > 0 && onProcesarCola && (
            <button
              type="button"
              onClick={onProcesarCola}
              disabled={procesandoCola || offlineMode}
              className="sunmi-btn sunmi-pos-btn-secondary w-full min-h-12 text-base font-semibold mt-2 rounded-md"
            >
              {procesandoCola ? "Procesando..." : `PROCESAR COLA (${queueLength})`}
            </button>
          )}
        </>
      )}

      {/* Formas de pago: grid 3x2 — theme-safe (sunmi-pos-btn-*) */}
      <div className="grid grid-cols-3 gap-1.5">
        {FORMAS_PAGO.map((fp) => {
          const esEfectivo = fp.key === "efectivo";
          const estaDeshabilitado = offlineMode && !esEfectivo;
          const selected = formaPago === fp.key;
          const btnClass = estaDeshabilitado
            ? "sunmi-btn pos-control opacity-50 cursor-not-allowed"
            : selected
            ? "sunmi-btn sunmi-pos-btn-primary"
            : "sunmi-btn sunmi-pos-btn-secondary";
          return (
            <button
              key={fp.key}
              type="button"
              onClick={() => {
                if (offlineMode && !esEfectivo) {
                  showError("Sin internet: solo efectivo disponible");
                  return;
                }
                onFormaPagoChange(fp.key);
              }}
              disabled={estaDeshabilitado}
              className={`min-h-11 text-xs py-1.5 rounded-md ${btnClass}`}
            >
              {fp.label}
            </button>
          );
        })}
      </div>

      {/* Info descuentos y comisiones */}
      <div className="space-y-1.5">
        {descuento > 0 && (
          <div className="px-2 py-1.5 rounded-lg pos-success-box text-xs text-center">
            Descuento:{" "}
            <span className="font-semibold pos-text-success-soft">
              -${formatPrecio(descuento)}
            </span>
          </div>
        )}

        {descuentoPorPuntos > 0 && (
          <div className="px-2 py-1.5 rounded-lg pos-points-box text-xs text-center">
            Puntos:{" "}
            <span className="font-semibold pos-text-points">
              -${formatPrecio(descuentoPorPuntos)}
            </span>
          </div>
        )}

        {tieneComision && subtotal > 0 && (
          <div className="px-2 py-1.5 rounded-lg pos-commission-box text-xs text-center pos-text-muted">
            Comision {comisionPct}%:{" "}
            <span className="font-semibold pos-text-muted-strong">
              -${formatPrecio(comisionBancaria)}
            </span>
            <span className="ml-1 text-[10px]">(neto: ${formatPrecio(netoRecibido)})</span>
          </div>
        )}
      </div>
    </SunmiCard>
  );
}

export default memo(FormaPago);
export { COMISION_DEFAULT, FORMAS_PAGO };
