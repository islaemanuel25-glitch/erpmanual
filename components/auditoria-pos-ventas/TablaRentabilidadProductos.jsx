"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
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
      <SunmiCard className="p-3">
        <SunmiSeparator label="Rentabilidad por producto" />
        <p className="text-sm sunmi-text-muted py-4 text-center">Sin líneas en el período</p>
      </SunmiCard>
    );
  }

  return (
    <SunmiCard className="p-3">
      <SunmiSeparator label="Rentabilidad por producto" />
      <p className="text-[11px] sunmi-text-muted mt-1 mb-2">
        Comisión <strong>prorrateada</strong> por línea (no persistida en DB).
      </p>
      {nota && (
        <details className="text-[10px] sunmi-text-muted mb-2">
          <summary className="cursor-pointer hover:underline">Ver detalle del cálculo</summary>
          <p className="mt-1 pl-2">{nota}</p>
        </details>
      )}
      <p className="md:hidden text-[10px] sunmi-text-muted mt-1 mb-1">
        Deslizá horizontalmente para ver todas las columnas.
      </p>
      <div className="overflow-x-auto mt-2 sunmi-scroll-hint sunmi-scroll-area">
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
    </SunmiCard>
  );
}
