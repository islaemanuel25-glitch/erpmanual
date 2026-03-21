"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiButton from "@/components/sunmi/SunmiButton";

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

function badgeEstado(estado) {
  const base = "text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap";
  if (estado === "pérdida") return `${base} sunmi-badge-danger`;
  if (estado === "margen bajo") return `${base} sunmi-badge-accent`;
  return `${base} sunmi-badge-success`;
}

const TD = "px-1.5 sm:px-2 py-1.5 whitespace-nowrap text-[11px] sm:text-xs";
const TD_MONO = `${TD} text-right font-mono`;

export default function TablaTicketsConflictivos({
  items,
  pagination,
  loadingTickets,
  criterio,
  onPrevPage,
  onNextPage,
}) {
  const page = pagination?.page ?? 1;
  const totalPages = pagination?.totalPages ?? 0;
  const total = pagination?.total ?? 0;

  return (
    <SunmiCard className="p-3">
      <SunmiSeparator label="Tickets conflictivos" />
      <p className="text-[11px] sunmi-text-muted mt-1 mb-2">{criterio || ""}</p>

      {loadingTickets && (
        <p className="text-xs sunmi-text-muted py-2">Actualizando lista…</p>
      )}

      {!loadingTickets && (!items || items.length === 0) && (
        <p className="text-sm sunmi-text-muted py-4 text-center">
          Ningún ticket cumple el criterio en el período
        </p>
      )}

      {!loadingTickets && items && items.length > 0 && (
        <>
          <p className="md:hidden text-[10px] sunmi-text-muted mt-1 mb-1">
            Deslizá horizontalmente para ver todas las columnas.
          </p>
          <div className="overflow-x-auto mt-2 sunmi-scroll-hint sunmi-scroll-area">
            <div className="min-w-[820px] md:min-w-[960px]">
              <SunmiTable
                headers={[
                  "Ticket",
                  "Fecha / hora",
                  "Turno",
                  "Cajero",
                  "Forma pago",
                  "Total",
                  "Comisión",
                  "Costo",
                  "Ganancia neta",
                  "Margen %",
                  "Estado",
                ]}
              >
                {items.map((row) => (
                  <tr key={row.id} className="hover:bg-[var(--hover-bg)]">
                    <td className={`${TD} font-mono font-semibold`}>#{row.numero}</td>
                    <td className={TD}>{formatFecha(row.fecha)}</td>
                    <td className={TD}>
                      {row.turno ? (
                        <>
                          #{row.turno.id}{" "}
                          <span className="sunmi-text-muted">
                            ({formatFecha(row.turno.apertura)})
                          </span>
                        </>
                      ) : (
                        <span className="sunmi-text-muted">Sin turno</span>
                      )}
                    </td>
                    <td className={`${TD} max-w-[100px] truncate`} title={row.cajero?.nombre}>
                      {row.cajero?.nombre || "—"}
                    </td>
                    <td className={`${TD} capitalize`}>{row.formaPago}</td>
                    <td className={TD_MONO}>${formatPrecio(row.total)}</td>
                    <td className={TD_MONO}>${formatPrecio(row.comision)}</td>
                    <td className={`${TD_MONO} sunmi-text-muted`}>${formatPrecio(row.costo)}</td>
                    <td className={`${TD_MONO} font-semibold`}>${formatPrecio(row.gananciaNeta)}</td>
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

          <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
            <p className="text-[11px] sunmi-text-muted">
              Página {page} de {totalPages || 1} — {total} ticket(s)
            </p>
            <div className="flex gap-2">
              <SunmiButton
                type="button"
                color="neutral"
                disabled={page <= 1 || loadingTickets}
                onClick={onPrevPage}
              >
                Anterior
              </SunmiButton>
              <SunmiButton
                type="button"
                color="neutral"
                disabled={page >= totalPages || loadingTickets || totalPages <= 1}
                onClick={onNextPage}
              >
                Siguiente
              </SunmiButton>
            </div>
          </div>
        </>
      )}
    </SunmiCard>
  );
}
