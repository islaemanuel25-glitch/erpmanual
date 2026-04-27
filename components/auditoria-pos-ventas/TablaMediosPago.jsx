"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";

function formatPrecio(n) {
  return Number(n ?? 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const LABELS = {
  efectivo: "Efectivo",
  debito: "Débito",
  credito: "Crédito",
  mercadopago: "Mercado Pago",
  fiado: "Fiado",
  otros: "Otros",
};

const TD = "px-1.5 sm:px-2 py-1.5 whitespace-nowrap text-[11px] sm:text-xs";
const TD_MONO = `${TD} text-right font-mono`;

export default function TablaMediosPago({ items }) {
  if (!items || items.length === 0) return null;

  const conMovimiento = items.filter(
    (r) => r.bruto !== 0 || r.comision !== 0 || r.neto !== 0 || r.costo !== 0 || r.ganancia !== 0
  );
  const sinMovimiento = items.length - conMovimiento.length;
  const filas = conMovimiento.length > 0 ? conMovimiento : items;

  const totales = filas.reduce(
    (acc, r) => ({
      bruto: acc.bruto + (r.bruto ?? 0),
      comision: acc.comision + (r.comision ?? 0),
      neto: acc.neto + (r.neto ?? 0),
      costo: acc.costo + (r.costo ?? 0),
      ganancia: acc.ganancia + (r.ganancia ?? 0),
    }),
    { bruto: 0, comision: 0, neto: 0, costo: 0, ganancia: 0 }
  );

  return (
    <div>
      <p className="text-[10px] sunmi-text-muted mb-1.5">
        Fiado prioriza <code className="text-[9px]">esFiado</code>. Valores desde Venta persistida.
      </p>
      <div className="overflow-x-auto sunmi-scroll-hint sunmi-scroll-area">
        <div className="min-w-[520px] md:min-w-[540px]">
          <SunmiTable
            headers={["Medio", "Bruto", "Comisión", "Neto", "Costo", "Ganancia"]}
          >
            {filas.map((row) => (
              <tr key={row.medio} className="hover:bg-[var(--hover-bg)]">
                <td className={`${TD} font-medium`}>
                  {LABELS[row.medio] || row.medio}
                </td>
                <td className={TD_MONO}>${formatPrecio(row.bruto)}</td>
                <td className={TD_MONO}>${formatPrecio(row.comision)}</td>
                <td className={`${TD_MONO} sunmi-text-success`}>${formatPrecio(row.neto)}</td>
                <td className={`${TD_MONO} sunmi-text-muted`}>${formatPrecio(row.costo)}</td>
                <td className={`${TD_MONO} font-semibold`}>${formatPrecio(row.ganancia)}</td>
              </tr>
            ))}
            <tr className="sunmi-thead font-semibold">
              <td className={TD}>Total</td>
              <td className={TD_MONO}>${formatPrecio(totales.bruto)}</td>
              <td className={TD_MONO}>${formatPrecio(totales.comision)}</td>
              <td className={`${TD_MONO} sunmi-text-success`}>${formatPrecio(totales.neto)}</td>
              <td className={`${TD_MONO} sunmi-text-muted`}>${formatPrecio(totales.costo)}</td>
              <td className={`${TD_MONO} font-bold`}>${formatPrecio(totales.ganancia)}</td>
            </tr>
          </SunmiTable>
        </div>
      </div>
      {sinMovimiento > 0 && conMovimiento.length > 0 && (
        <p className="text-[9px] sunmi-text-muted mt-1">
          {sinMovimiento} medio(s) sin movimiento no mostrado(s).
        </p>
      )}
    </div>
  );
}
