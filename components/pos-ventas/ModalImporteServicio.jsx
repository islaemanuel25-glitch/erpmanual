"use client";

import { useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import {
  validarImporteServicio,
  calcularServicio,
  IMPORTE_SERVICIO_MIN,
  IMPORTE_SERVICIO_MAX,
} from "@/lib/pos-ventas/servicios";

// Contador de respaldo para la clave de carrito cuando crypto.randomUUID no existe.
// Solo se usa (y muta) dentro del handler de confirmación (evento), nunca en render.
let __svcClaveSeq = 0;

function fmt(n) {
  return Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Modal para ingresar el IMPORTE de un servicio de importe variable (carga de
 * colectivo / carga virtual). El % de recargo lo trae el producto (resuelto
 * server-side en buscar-producto); acá solo se previsualiza. El backend RECALCULA
 * todo al crear la venta (fuente de verdad); este modal es UX.
 */
export default function ModalImporteServicio({ producto, onConfirmar, onCancelar }) {
  const [importe, setImporte] = useState("");
  const recargoPct = Number(producto?.recargoServicioPct) || 0;

  const val = validarImporteServicio(importe.trim());
  const calc = val.valido ? calcularServicio(val.importe, recargoPct) : null;

  const confirmar = () => {
    if (!val.valido || !calc) return;
    const clave = crypto?.randomUUID?.() || `svc-${producto.productoBaseId}-${++__svcClaveSeq}`;
    onConfirmar({
      claveCarrito: clave,
      productoBaseId: producto.productoBaseId,
      nombre: producto.nombre,
      importeBaseServicio: calc.importeBase,
      recargoServicioPct: calc.recargoPct,
      recargoServicioImporte: calc.recargoImporte,
      precioFinal: calc.precioFinal,
    });
  };

  return (
    <div className="fixed inset-0 sunmi-overlay flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-1">{producto?.nombre || "Servicio"}</h3>
        <p className="text-sm pos-text-muted mb-4">Servicio de importe variable</p>

        <div className="space-y-4">
          <div>
            <label className="text-sm pos-text-muted mb-1 block">Importe a cargar</label>
            <SunmiInput
              type="number"
              inputMode="numeric"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              placeholder={`Entre $${IMPORTE_SERVICIO_MIN} y $${IMPORTE_SERVICIO_MAX}`}
              className="text-2xl"
              autoFocus
            />
          </div>

          {/* Desglose */}
          <div className="pos-bg-panel p-4 rounded-lg space-y-1">
            <div className="flex justify-between text-sm">
              <span className="pos-text-muted">Importe solicitado</span>
              <span className="font-semibold">${fmt(calc ? calc.importeBase : val.valido ? importe : 0)}</span>
            </div>
            {recargoPct > 0 && (
              <div className="flex justify-between text-sm">
                <span className="pos-text-muted">Recargo {recargoPct}%</span>
                <span className="font-semibold">${fmt(calc ? calc.recargoImporte : 0)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg pt-1 border-t border-black/10 dark:border-white/10">
              <span className="font-bold">Total a cobrar</span>
              <span className="font-black pos-text-accent">${fmt(calc ? calc.precioFinal : 0)}</span>
            </div>
          </div>

          {!val.valido && importe.trim() !== "" && (
            <div className="text-sm pos-text-danger">{val.error}</div>
          )}

          <div className="flex gap-2 pt-2">
            <SunmiButton color="slate" onClick={onCancelar} className="flex-1 py-3">
              Cancelar
            </SunmiButton>
            <SunmiButton
              color="amber"
              onClick={confirmar}
              disabled={!val.valido}
              className="flex-1 font-bold py-3"
            >
              Agregar
            </SunmiButton>
          </div>
        </div>
      </SunmiCard>
    </div>
  );
}
