"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";

const COMISION_PCT = 7;

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

export default function FormaPago({
  subtotal,
  descuento = 0,
  descuentoPorPuntos = 0,
  formaPago,
  onFormaPagoChange,
  onCobrar,
  cobrando,
  disabled,
}) {
  const forma = FORMAS_PAGO.find((f) => f.key === formaPago);
  const tieneComision = forma?.tieneComision || false;
  const base = subtotal - descuento - descuentoPorPuntos;
  const total = base; // Cliente paga subtotal - descuentos, SIN comision
  const comisionBancaria = tieneComision ? base * (COMISION_PCT / 100) : 0;
  const netoRecibido = total - comisionBancaria;

  return (
    <SunmiCard className="p-2 lg:p-3">
      {/* Botones de forma de pago: 2x2 */}
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-2">
        {FORMAS_PAGO.map((fp) => (
          <SunmiButton
            key={fp.key}
            color={formaPago === fp.key ? "amber" : "cyan"}
            onClick={() => onFormaPagoChange(fp.key)}
            className="min-h-12 lg:min-h-10 text-sm !py-2"
          >
            {fp.label}
          </SunmiButton>
        ))}
      </div>

      {/* Descuento */}
      {descuento > 0 && (
        <div className="mt-2 px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-center">
          Descuento:{" "}
          <span className="font-semibold text-emerald-300">
            -${formatPrecio(descuento)}
          </span>
        </div>
      )}

      {/* Descuento por puntos */}
      {descuentoPorPuntos > 0 && (
        <div className="mt-2 px-2 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-xs text-center">
          Descuento por puntos:{" "}
          <span className="font-semibold text-purple-300">
            -${formatPrecio(descuentoPorPuntos)}
          </span>
        </div>
      )}

      {/* Comision bancaria - info interna para el vendedor */}
      {tieneComision && subtotal > 0 && (
        <div className="mt-2 px-2 py-1.5 rounded-lg bg-slate-700/40 border border-slate-600/30 text-xs text-center text-slate-400">
          Comision bancaria {COMISION_PCT}%:{" "}
          <span className="font-semibold text-slate-300">
            -${formatPrecio(comisionBancaria)}
          </span>
          <span className="ml-1 text-[10px]">(neto: ${formatPrecio(netoRecibido)})</span>
        </div>
      )}

      {/* Total */}
      <div className="mt-3 text-center">
        <div className="text-xs text-slate-400 uppercase tracking-wide">
          Total a cobrar
        </div>
        <div className="text-3xl lg:text-2xl font-bold text-amber-400 mt-1">
          ${formatPrecio(total)}
        </div>
      </div>

      {/* Boton cobrar */}
      <div className="mt-3">
        <SunmiButton
          color="amber"
          onClick={() => onCobrar({ formaPago, total })}
          disabled={cobrando || disabled || !formaPago || subtotal <= 0}
          className="!w-full min-h-16 lg:min-h-12 !text-xl lg:!text-lg !font-bold"
        >
          {cobrando ? "Procesando..." : `COBRAR $${formatPrecio(total)}`}
        </SunmiButton>
      </div>
    </SunmiCard>
  );
}

export { COMISION_PCT, FORMAS_PAGO };
