"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";

function formatPrecio(n) {
  return Number(n ?? 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function badgeEstado(estado) {
  const base = "text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap";
  if (estado === "pérdida") return `${base} sunmi-badge-danger`;
  if (estado === "margen bajo") return `${base} sunmi-badge-accent`;
  return `${base} sunmi-badge-success`;
}

const TD = "px-1.5 sm:px-2 py-1.5 whitespace-nowrap text-[11px] sm:text-xs";
const TD_MONO = `${TD} text-right font-mono`;

export default function TablaRentabilidadProductos({ items, nota }) {
  if (!items || items.length === 0) {
    return (
      <p className="text-sm sunmi-text-muted py-3 text-center">Sin líneas en el período.</p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0 mb-1.5">
        <p className="text-[10px] sunmi-text-muted">
          Comisión por línea (persistida desde E1, prorrateada en datos anteriores).
        </p>
        {nota && (
          <details className="text-[9px] sunmi-text-muted inline">
            <summary className="cursor-pointer hover:underline">Detalle del cálculo</summary>
            <p className="mt-0.5 pl-2">{nota}</p>
          </details>
        )}
      </div>
      <div className="overflow-x-auto sunmi-scroll-hint sunmi-scroll-area">
        <div className="min-w-[700px] md:min-w-[780px]">
          <SunmiTable
            headers={[
              "Producto",
              "Cant.",
              "Venta",
              "Costo",
              "Com. prorrat.",
              "Resultado",
              "Margen %",
              "Estado",
            ]}
          >
            {items.map((row) => (
              <tr key={row.productoBaseId} className="hover:bg-[var(--hover-bg)]">
                <td className={`${TD} max-w-[260px] truncate font-medium`} title={row.nombre}>
                  {row.nombre}
                </td>
                <td className={TD_MONO}>{row.cantidad}</td>
                <td className={TD_MONO}>${formatPrecio(row.venta)}</td>
                <td className={`${TD_MONO} sunmi-text-muted`}>${formatPrecio(row.costo)}</td>
                <td className={TD_MONO}>${formatPrecio(row.comisionProrrateada)}</td>
                <td className={`${TD_MONO} font-semibold`}>${formatPrecio(row.resultadoReal)}</td>
                <td className={TD_MONO}>
                  {row.margenPct == null ? "—" : `${formatPrecio(row.margenPct)} %`}
                </td>
                <td className={TD}>
                  <span className={badgeEstado(row.estado)}>{row.estado}</span>
                </td>
              </tr>
            ))}
          </SunmiTable>
        </div>
      </div>
    </div>
  );
}
