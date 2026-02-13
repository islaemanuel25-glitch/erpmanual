"use client";

import { useState, useEffect } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function HistorialDia({ localId, onReimprimir }) {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState(null);

  const cargar = async () => {
    if (!localId) return;
    try {
      setLoading(true);
      const res = await fetch(
        `/api/pos-ventas/historial-dia?localId=${localId}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (data.ok) setVentas(data.items || []);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [localId]);

  const totalVendido = ventas.reduce((s, v) => s + Number(v.total), 0);

  return (
    <>
      <SunmiCard className="p-2 lg:p-3 flex flex-col">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-slate-300">
            Ventas hoy ({ventas.length})
          </span>
          <button
            onClick={cargar}
            className="text-[11px] text-cyan-400 hover:text-cyan-300"
          >
            Actualizar
          </button>
        </div>

        {/* Resumen */}
        {ventas.length > 0 && (
          <div className="bg-slate-800/60 p-2 rounded-lg text-center mb-2">
            <span className="text-xs text-slate-400">Total del dia: </span>
            <span className="text-sm font-bold text-amber-400">
              ${formatPrecio(totalVendido)}
            </span>
          </div>
        )}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto space-y-1 max-h-60 lg:max-h-80">
          {loading ? (
            <div className="text-xs text-slate-500 text-center py-4">
              Cargando...
            </div>
          ) : ventas.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-4">
              Sin ventas aun
            </div>
          ) : (
            ventas.map((v) => (
              <div
                key={v.id}
                onClick={() => setDetalle(v)}
                className="bg-slate-800/40 p-2 rounded-lg cursor-pointer hover:bg-slate-700/60 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-sm font-medium">#{v.numero}</span>
                    <span className="text-[11px] text-slate-400 ml-2">
                      {new Date(v.fecha).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-amber-400">
                      ${formatPrecio(Number(v.total))}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {v.formaPago}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </SunmiCard>

      {/* Modal detalle */}
      {detalle && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <SunmiCard className="w-full max-w-md p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold">Ticket #{detalle.numero}</h3>
              <span className="text-xs text-slate-400">
                {new Date(detalle.fecha).toLocaleString("es-AR")}
              </span>
            </div>

            {/* Items */}
            <div className="space-y-1 mb-3 max-h-48 overflow-y-auto">
              {detalle.detalles?.map((d, i) => (
                <div
                  key={i}
                  className="flex justify-between text-sm bg-slate-800/40 px-2 py-1 rounded"
                >
                  <span className="truncate flex-1 mr-2">{d.nombre}</span>
                  <span className="text-slate-400 shrink-0">
                    {d.cantidad} x ${formatPrecio(Number(d.precio))}
                  </span>
                  <span className="font-medium ml-2 shrink-0">
                    ${formatPrecio(Number(d.subtotal))}
                  </span>
                </div>
              ))}
            </div>

            {/* Totales */}
            <div className="border-t border-slate-700 pt-2 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Subtotal</span>
                <span>${formatPrecio(Number(detalle.subtotal))}</span>
              </div>
              {Number(detalle.descuento) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-400">Descuento</span>
                  <span className="text-emerald-400">
                    -${formatPrecio(Number(detalle.descuento))}
                  </span>
                </div>
              )}
              {Number(detalle.comision) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Comision</span>
                  <span>+${formatPrecio(Number(detalle.comision))}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-amber-400">
                  ${formatPrecio(Number(detalle.total))}
                </span>
              </div>
              <div className="text-xs text-slate-400">
                Pago: {detalle.formaPago}
              </div>
            </div>

            {/* Acciones */}
            <div className="flex gap-2 mt-4">
              <SunmiButton
                color="cyan"
                onClick={() => {
                  if (onReimprimir) {
                    onReimprimir({
                      numero: detalle.numero,
                      items: detalle.detalles.map((d) => ({
                        nombre: d.nombre,
                        precio: Number(d.precio),
                        cantidad: d.cantidad,
                      })),
                      subtotal: Number(detalle.subtotal),
                      comision: Number(detalle.comision),
                      descuento: Number(detalle.descuento),
                      total: Number(detalle.total),
                      formaPago: detalle.formaPago,
                    });
                  }
                  setDetalle(null);
                }}
                className="flex-1 !text-sm"
              >
                Reimprimir
              </SunmiButton>
              <SunmiButton
                color="slate"
                onClick={() => setDetalle(null)}
                className="flex-1 !text-sm"
              >
                Cerrar
              </SunmiButton>
            </div>
          </SunmiCard>
        </div>
      )}
    </>
  );
}
