"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatFecha(timestamp) {
  const fecha = new Date(timestamp);
  return fecha.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ModalPendientesOffline({
  open,
  onClose,
  queue,
  onImprimir,
  onEliminar,
  onVaciar,
  onProcesarCola,
  puedeProcesar,
  procesandoCola,
}) {
  if (!open) return null;

  const handleVaciar = () => {
    if (queue.length === 0) return;
    const ok = confirm(`¿Vaciar ${queue.length} venta(s) pendiente(s)? Esta acción no se puede deshacer.`);
    if (ok) onVaciar();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-lg p-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-sm font-bold text-amber-400">
            Pendientes de sincronización ({queue.length})
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Acciones globales */}
        {queue.length > 0 && (
          <div className="flex gap-2 mb-3 shrink-0">
            {puedeProcesar && onProcesarCola && (
              <SunmiButton
                color="cyan"
                onClick={onProcesarCola}
                disabled={procesandoCola}
                className="flex-1 !text-xs !py-2"
              >
                {procesandoCola ? "Procesando..." : `PROCESAR COLA (${queue.length})`}
              </SunmiButton>
            )}
            <SunmiButton
              color="slate"
              onClick={handleVaciar}
              className="!text-xs !py-2"
            >
              Vaciar
            </SunmiButton>
          </div>
        )}

        {/* Lista */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
          {queue.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-8">
              No hay ventas pendientes.
            </div>
          ) : (
            queue.map((item) => {
              const idCorto = (item.clientVentaId || "").slice(-8).toUpperCase();
              const cantItems = item.items?.length || 0;

              return (
                <div
                  key={item.clientVentaId}
                  className="rounded-lg bg-slate-800/60 border border-slate-700/50 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-amber-400 font-bold">{idCorto}</span>
                        <span className="text-slate-500">{formatFecha(item.createdAt)}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {cantItems} producto{cantItems !== 1 ? "s" : ""} · {(item.formaPago || "efectivo").toUpperCase()}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-amber-400">
                        ${formatPrecio(item.total)}
                      </div>
                    </div>
                  </div>
                  {/* Items preview */}
                  <div className="mt-2 text-[11px] text-slate-500 truncate">
                    {item.items?.map((p) => `${p.cantidad}x ${p.nombre}`).join(", ")}
                  </div>
                  {/* Acciones */}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => onImprimir(item)}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      Imprimir
                    </button>
                    <button
                      onClick={() => {
                        const ok = confirm(`¿Eliminar venta pendiente ${idCorto}?`);
                        if (ok) onEliminar(item.clientVentaId);
                      }}
                      className="text-[11px] text-red-400 hover:text-red-300 transition-colors"
                    >
                      Eliminar
                    </button>
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
            className="w-full !py-2 !text-sm"
          >
            Cerrar
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}
