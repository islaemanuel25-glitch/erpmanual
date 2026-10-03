"use client";

// LAS VENTAS SIN CONEXIÓN GUARDADAS EN ESTE EQUIPO.
//
// Cada una dice en qué está (ver `estadoParaMostrar`). No hay "Vaciar" ni se
// borra una venta que el servidor no tiene: es plata cobrada, y la única copia
// es la de este equipo. Se puede quitar solo la que el servidor ya tiene en
// revisión, porque su evidencia queda allá.

import { AlertTriangle } from "lucide-react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";
import { estadoParaMostrar } from "@/lib/pos-ventas/sincronizacionOffline";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatFecha(timestamp) {
  // Zona de Argentina y 24 horas: ver `lib/fechas/formatearFechaHora.js`.
  return fechaHoraAR(timestamp);
}

const CLASE_TONO = {
  neutral: "sunmi-text-muted",
  warning: "sunmi-text-warning",
  danger: "sunmi-text-danger",
};

export default function ModalPendientesOffline({
  open,
  onClose,
  queue,
  localId,
  colaIlegible,
  colasApartadas,
  onImprimir,
  onEliminar,
  onProcesarCola,
  puedeProcesar,
  procesandoCola,
}) {
  if (!open) return null;

  const delLocal = queue.filter((item) => Number(item?.localId) === Number(localId)).length;

  return (
    <div className="fixed inset-0 sunmi-overlay flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-lg p-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-sm font-bold sunmi-text-accent">
            Ventas sin conexión ({queue.length})
          </h3>
          <button
            onClick={onClose}
            className="sunmi-link-muted text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {colaIlegible && (
          <SunmiAviso icon={AlertTriangle} titulo="No se pueden leer" tono="danger" className="mb-3 shrink-0">
            Las ventas sin conexión de este equipo no se pueden leer. No se borró nada y no se puede cerrar la caja desde
            este equipo: avisá al encargado.
          </SunmiAviso>
        )}
        {colasApartadas > 0 && (
          <SunmiAviso icon={AlertTriangle} titulo="Ventas ilegibles apartadas" tono="warning" className="mb-3 shrink-0">
            Había ventas guardadas en este equipo que no se pudieron leer. Se guardaron aparte, sin borrarlas: avisá al
            encargado.
          </SunmiAviso>
        )}

        {/* Acción global: el mismo motor que corre solo */}
        {puedeProcesar && onProcesarCola && (
          <div className="flex gap-2 mb-3 shrink-0">
            <SunmiButton
              color="cyan"
              onClick={onProcesarCola}
              disabled={procesandoCola}
              className="flex-1 text-xs py-2"
            >
              {procesandoCola ? "Sincronizando..." : `SINCRONIZAR AHORA (${delLocal})`}
            </SunmiButton>
          </div>
        )}

        {/* Lista */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
          {queue.length === 0 ? (
            <div className="text-center text-sm sunmi-text-muted py-8">
              No hay ventas pendientes.
            </div>
          ) : (
            queue.map((item, idx) => {
              const idCorto = (item?.clientVentaId || "").slice(-8).toUpperCase();
              const cantItems = item?.items?.length || 0;
              const estado = estadoParaMostrar(item, localId);

              return (
                <div
                  key={item?.clientVentaId || `ilegible-${idx}`}
                  className="rounded-lg sunmi-surface-soft sunmi-border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono sunmi-text-accent font-bold">{idCorto || "—"}</span>
                        <span className="sunmi-text-muted">{formatFecha(item?.createdAt)}</span>
                      </div>
                      <div className="text-xs sunmi-text-muted mt-1">
                        {cantItems} producto{cantItems !== 1 ? "s" : ""} · {(item?.formaPago || "efectivo").toUpperCase()}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold sunmi-text-accent">
                        ${formatPrecio(item?.total)}
                      </div>
                    </div>
                  </div>
                  {/* Estado de la sincronización */}
                  <div className={`mt-2 text-xs ${CLASE_TONO[estado.tono] ?? CLASE_TONO.neutral}`}>
                    {estado.texto}
                    {estado.detalle && <div className="sunmi-text-muted mt-0.5">{estado.detalle}</div>}
                  </div>
                  {/* Items preview */}
                  <div className="mt-2 text-sm2 sunmi-text-muted truncate">
                    {item?.items?.map((p) => `${p.cantidad}x ${p.nombre}`).join(", ")}
                  </div>
                  {/* Acciones */}
                  <div className="flex gap-2 mt-2">
                    {item?.clientVentaId && (
                      <button
                        onClick={() => onImprimir(item)}
                        className="text-sm2 sunmi-link transition-colors"
                      >
                        Imprimir
                      </button>
                    )}
                    {estado.puedeQuitar && (
                      <button
                        onClick={() => {
                          const ok = confirm(
                            `¿Quitar de este equipo la venta ${idCorto}? Ya está en el sistema, en revisión: la resuelve el encargado.`
                          );
                          if (ok) onEliminar(item.clientVentaId);
                        }}
                        className="text-sm2 sunmi-link-danger transition-colors"
                      >
                        Quitar de este equipo
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="mt-3 shrink-0">
          <SunmiButton
            color="slate"
            onClick={onClose}
            className="w-full py-2 text-sm"
          >
            Cerrar
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}
