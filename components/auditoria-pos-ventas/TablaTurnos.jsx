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

function formatFecha(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

const TD = "px-1.5 sm:px-2 py-1.5 whitespace-nowrap text-[11px] sm:text-xs";
const TD_MONO = `${TD} text-right font-mono`;

export default function TablaTurnos({ items }) {
  if (!items || items.length === 0) {
    return (
      <SunmiCard className="p-3">
        <SunmiSeparator label="Turnos" />
        <p className="text-sm sunmi-text-muted py-4 text-center">Sin turnos en el período</p>
      </SunmiCard>
    );
  }

  const totales = items.reduce(
    (acc, t) => ({
      ventasCount: acc.ventasCount + (t.ventasCount ?? 0),
      ventaBruta: acc.ventaBruta + (t.ventaBruta ?? 0),
      comision: acc.comision + (t.comision ?? 0),
      neto: acc.neto + (t.neto ?? 0),
      costo: acc.costo + (t.costo ?? 0),
      gananciaTurno: acc.gananciaTurno + (t.gananciaTurno ?? 0),
    }),
    { ventasCount: 0, ventaBruta: 0, comision: 0, neto: 0, costo: 0, gananciaTurno: 0 }
  );

  return (
    <SunmiCard className="p-3">
      <SunmiSeparator label="Turnos" />
      <p className="text-[11px] sunmi-text-muted mt-1 mb-2">
        Turnos con apertura en el rango. Ventas y montos agregados solo para ventas del mismo
        período y local.
      </p>
      <p className="md:hidden text-[10px] sunmi-text-muted mt-1 mb-1">
        Deslizá horizontalmente para ver todas las columnas.
      </p>
      <div className="overflow-x-auto mt-2 sunmi-scroll-hint sunmi-scroll-area">
        <div className="min-w-[840px] md:min-w-[920px]">
          <SunmiTable
            headers={[
              "Apertura",
              "Cierre",
              "Esperado",
              "Real",
              "Diferencia",
              "Ventas",
              "Bruto",
              "Comisión",
              "Neto",
              "Costo",
              "Ganancia",
              "Cajero",
            ]}
          >
            {items.map((t) => (
              <tr key={t.id} className="hover:bg-[var(--hover-bg)]">
                <td className={TD}>{formatFecha(t.apertura)}</td>
                <td className={TD}>{formatFecha(t.cierre)}</td>
                <td className={TD_MONO}>
                  {t.montoEsperadoEfectivo != null ? `$${formatPrecio(t.montoEsperadoEfectivo)}` : "—"}
                </td>
                <td className={TD_MONO}>
                  {t.montoRealEfectivo != null ? `$${formatPrecio(t.montoRealEfectivo)}` : "—"}
                </td>
                <td className={TD_MONO}>
                  {t.diferenciaEfectivo != null ? `$${formatPrecio(t.diferenciaEfectivo)}` : "—"}
                </td>
                <td className={`${TD} text-center`}>{t.ventasCount}</td>
                <td className={TD_MONO}>${formatPrecio(t.ventaBruta)}</td>
                <td className={TD_MONO}>${formatPrecio(t.comision)}</td>
                <td className={TD_MONO}>${formatPrecio(t.neto)}</td>
                <td className={TD_MONO}>${formatPrecio(t.costo)}</td>
                <td className={`${TD_MONO} font-semibold`}>${formatPrecio(t.gananciaTurno)}</td>
                <td className={`${TD} max-w-[120px] truncate`}>
                  {t.vendedor?.nombre || t.vendedor?.email || "—"}
                </td>
              </tr>
            ))}
            <tr className="sunmi-thead font-semibold">
              <td className={TD} colSpan={5}>Total</td>
              <td className={`${TD} text-center`}>{totales.ventasCount}</td>
              <td className={TD_MONO}>${formatPrecio(totales.ventaBruta)}</td>
              <td className={TD_MONO}>${formatPrecio(totales.comision)}</td>
              <td className={TD_MONO}>${formatPrecio(totales.neto)}</td>
              <td className={TD_MONO}>${formatPrecio(totales.costo)}</td>
              <td className={`${TD_MONO} font-bold`}>${formatPrecio(totales.gananciaTurno)}</td>
              <td className={TD}></td>
            </tr>
          </SunmiTable>
        </div>
      </div>
    </SunmiCard>
  );
}
