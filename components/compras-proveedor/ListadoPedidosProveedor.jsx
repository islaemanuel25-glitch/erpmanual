"use client";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import { diasDesde, DIAS_OPERATIVO } from "@/components/compras-proveedor/usePedidosProveedor";

function formatFecha(f) {
  if (!f) return "-";
  return new Date(f).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function estadoBadgeClass(estado) {
  return [
    estado === "BORRADOR" ? "sunmi-badge-accent" : "",
    estado === "CONFIRMADO" ? "sunmi-badge-accent" : "",
    estado === "ENVIADO" ? "sunmi-badge-link" : "",
    estado === "RECIBIDO" ? "sunmi-badge-success" : "",
    estado === "ANULADO" ? "sunmi-badge-danger" : "",
  ].join(" ");
}

function estadoLabel(estado) {
  return estado === "BORRADOR" ? "EN CURSO" : estado;
}

// Marca de atraso: pedidos con más de 7 días no son operación normal.
// ENVIADO atrasado = problema de recepción; CONFIRMADO/BORRADOR antiguo = revisar.
function atrasoInfo(item, marcar) {
  if (!marcar) return null;
  const d = diasDesde(item.createdAt);
  if (d <= DIAS_OPERATIVO) return null;
  const antiguo = item.estado !== "ENVIADO";
  return {
    dias: d,
    texto: antiguo ? "Antiguo · revisar" : "Atrasado · revisar",
    cls: antiguo ? "sunmi-badge-accent" : "sunmi-badge-danger",
  };
}

/**
 * Listado compartido de pedidos a proveedor (tabla desktop + cards mobile).
 * Presentacional: cada página define la acción de fila con renderAccion(item).
 *
 * Props: items, loading, renderAccion, page, totalPages, onPrev, onNext.
 */
export default function ListadoPedidosProveedor({
  items = [],
  loading = false,
  renderAccion,
  marcarAtrasados = false,
  page = 1,
  totalPages = 1,
  onPrev,
  onNext,
}) {
  return (
    <>
      {/* DESKTOP: tabla */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border sunmi-border">
        <SunmiTable
          headers={["#", "Proveedor", "Depósito", "Items", "Estado", "Creado", "Acciones"]}
        >
          {loading ? (
            <SunmiTableEmpty label="Cargando..." />
          ) : items.length === 0 ? (
            <SunmiTableEmpty label="Sin pedidos" />
          ) : (
            items.map((item) => {
              const atraso = atrasoInfo(item, marcarAtrasados);
              return (
                <SunmiTableRow key={item.id}>
                  <td className="px-3 py-2 font-mono text-xs">#{item.id}</td>
                  <td className="px-3 py-2">{item.proveedorNombre}</td>
                  <td className="px-3 py-2">{item.depositoNombre}</td>
                  <td className="px-3 py-2 text-center">{item.cantItems}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${estadoBadgeClass(item.estado)}`}>
                        {estadoLabel(item.estado)}
                      </span>
                      {atraso && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${atraso.cls}`}>
                          {atraso.texto}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {formatFecha(item.createdAt)}
                    {atraso && <span className="sunmi-text-muted"> · hace {atraso.dias}d</span>}
                  </td>
                  <td className="px-3 py-2">{renderAccion ? renderAccion(item) : null}</td>
                </SunmiTableRow>
              );
            })
          )}
        </SunmiTable>
      </div>

      {/* MOBILE: cards */}
      <div className="md:hidden flex flex-col gap-2">
        {loading ? (
          <p className="text-xs sunmi-text-muted italic px-1">Cargando...</p>
        ) : items.length === 0 ? (
          <p className="text-xs sunmi-text-muted italic px-1">Sin pedidos</p>
        ) : (
          items.map((item) => {
            const atraso = atrasoInfo(item, marcarAtrasados);
            return (
              <div
                key={item.id}
                className="rounded-xl border sunmi-border p-3 sunmi-surface flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium sunmi-text-strong truncate">
                    {item.proveedorNombre}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {atraso && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${atraso.cls}`}>
                        {atraso.texto}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${estadoBadgeClass(item.estado)}`}>
                      {estadoLabel(item.estado)}
                    </span>
                  </div>
                </div>
                <div className="text-[12px] sunmi-text-muted flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="font-mono">#{item.id}</span>
                  <span>{item.depositoNombre}</span>
                  <span>{item.cantItems} ítems</span>
                  <span>
                    {formatFecha(item.createdAt)}
                    {atraso ? ` · hace ${atraso.dias}d` : ""}
                  </span>
                </div>
                <div className="flex justify-end">{renderAccion ? renderAccion(item) : null}</div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex justify-between pt-4 px-2">
        <SunmiButton color="slate" disabled={page <= 1} onClick={onPrev}>
          « Anterior
        </SunmiButton>
        <span className="sunmi-text-muted text-sm self-center">
          Página {page} de {totalPages || 1}
        </span>
        <SunmiButton color="slate" disabled={page >= totalPages} onClick={onNext}>
          Siguiente »
        </SunmiButton>
      </div>
    </>
  );
}
