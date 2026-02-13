"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";

const COMISION_PCT = 7;

const FORMAS_PAGO = [
  { key: "efectivo", label: "Efectivo", tieneComision: false },
  { key: "mercadopago", label: "MercadoPago", tieneComision: true },
  { key: "debito", label: "Debito", tieneComision: true },
  { key: "credito", label: "Credito", tieneComision: true },
];

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function FormaPago({
  subtotal,
  formaPago,
  onFormaPagoChange,
  onCobrar,
  cobrando,
  disabled,
}) {
  const forma = FORMAS_PAGO.find((f) => f.key === formaPago);
  const tieneComision = forma?.tieneComision || false;
  const comision = tieneComision ? subtotal * (COMISION_PCT / 100) : 0;
  const total = subtotal + comision;

  return (
    <SunmiCard className="p-2 lg:p-3">
      {/* Botones de forma de pago: 2x2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
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

      {/* Comision */}
      {tieneComision && subtotal > 0 && (
        <div className="mt-2 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-center">
          Comision {COMISION_PCT}%:{" "}
          <span className="font-semibold text-amber-300">
            +${formatPrecio(comision)}
          </span>
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
          onClick={() => onCobrar({ formaPago, comision, total })}
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
