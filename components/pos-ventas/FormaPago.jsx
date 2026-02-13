"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

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
    <SunmiCard className="p-3">
      <SunmiSeparator label="Forma de pago" className="!mt-0 !mb-2" />

      {/* Botones de forma de pago: 2x2 en mobile, 4 en fila en desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {FORMAS_PAGO.map((fp) => (
          <SunmiButton
            key={fp.key}
            color={formaPago === fp.key ? "amber" : "cyan"}
            onClick={() => onFormaPagoChange(fp.key)}
            className="min-h-14 lg:min-h-10 text-base lg:text-sm !py-2"
          >
            {fp.label}
          </SunmiButton>
        ))}
      </div>

      {/* Comision */}
      {tieneComision && subtotal > 0 && (
        <div className="mt-3 px-2 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
          Comision {COMISION_PCT}%:{" "}
          <span className="font-semibold text-amber-300">
            +$ {formatPrecio(comision)}
          </span>
        </div>
      )}

      {/* Total */}
      <div className="mt-4 text-center lg:text-right">
        <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">
          Total a cobrar
        </div>
        <div className="text-4xl lg:text-2xl font-bold text-amber-400">
          $ {formatPrecio(total)}
        </div>
      </div>

      {/* Boton cobrar: sticky en mobile */}
      <div className="mt-4 lg:relative fixed bottom-0 left-0 right-0 lg:bottom-auto bg-slate-950 lg:bg-transparent p-3 lg:p-0 border-t lg:border-0 border-slate-700 z-10">
        <SunmiButton
          color="amber"
          onClick={() => onCobrar({ formaPago, comision, total })}
          disabled={cobrando || disabled || !formaPago || subtotal <= 0}
          className="!w-full min-h-20 lg:min-h-12 !text-2xl lg:!text-lg !font-bold"
        >
          {cobrando ? "Procesando..." : `COBRAR $${formatPrecio(total)}`}
        </SunmiButton>
      </div>
    </SunmiCard>
  );
}

export { COMISION_PCT, FORMAS_PAGO };
