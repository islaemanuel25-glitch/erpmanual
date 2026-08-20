"use client";

// LA CINTA DE UNA VENTA ANULADA.
//
// ── QUÉ QUEDÓ DE ESTE ARCHIVO, Y QUÉ SE FUE ─────────────────────────────────
//
// Nació el 2026-08-20 como `PanelAnularVenta.jsx`, con el botón y el formulario
// para anular una venta desde su detalle. Ese flujo se retiró el mismo día por
// decisión de producto: una venta interna se corrige desde el REMITO, en el
// módulo Transferencias, que es el documento que el local destino recibe y
// revisa.
//
// Lo que se conserva es esto: la MARCA. ERP Azul no borra la historia de una
// operación, así que una venta anulada sigue existiendo, conserva su número de
// ticket y tiene que decir en su propia pantalla que está anulada, quién la
// anuló, cuándo y por qué. Sin esta cinta, una venta revertida se leería igual
// que una vigente.
//
// No tiene ninguna acción: es informativa. Anular se hace en Transferencias.

import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";

export default function CintaVentaAnulada({ venta }) {
  const a = venta?.anulacion;
  if (!a?.anulada) return null;
  return (
    <div className="mb-3 sunmi-state-danger rounded-lg px-3 py-2 text-[12px]">
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
        <span className="px-2 py-0.5 rounded-full sunmi-text-danger font-semibold whitespace-nowrap">
          ⛔ VENTA ANULADA
        </span>
        {a.fecha && (
          <span className="sunmi-text-muted whitespace-nowrap">
            El: <span className="sunmi-text-strong">{fechaHoraAR(a.fecha)}</span>
          </span>
        )}
        {a.usuario && (
          <span className="sunmi-text-muted whitespace-nowrap">
            Por: <span className="sunmi-text-strong">{a.usuario}</span>
          </span>
        )}
        {a.motivo && (
          <span className="sunmi-text-muted min-w-0">
            Motivo: <span className="sunmi-text-strong">{a.motivo}</span>
          </span>
        )}
        {a.transferenciaId && (
          <span className="sunmi-text-muted whitespace-nowrap">
            Remito: <span className="sunmi-text-strong">#{a.transferenciaId}</span>
          </span>
        )}
      </div>
      <div className="mt-1 sunmi-text-muted">
        No cuenta para el arqueo, los reportes ni las estadísticas. El ticket conserva su número.
      </div>
    </div>
  );
}
