"use client";

// components/pos-ventas/AvisoVentaInterna.jsx
//
// Aviso compacto del POS: el cliente seleccionado representa a un local interno, así
// que la venta —además de cobrarse normalmente— va a generar una transferencia.
//
// Toda la regla vive en lib/ventas-internas/avisoVentaInterna.js; acá solo se pinta.
// Se alimenta del MISMO `state.clienteSeleccionado` que ya usa el POS: no hay estado
// paralelo, así que desaparece solo al cambiar o limpiar el cliente.
//
// Es informativo: no bloquea el cobro. La fuente de verdad es el backend, que
// recarga el cliente desde la base dentro de la transacción de la venta.

import { Store } from "lucide-react";
import {
  obtenerAvisoVentaInterna,
  VARIANTES,
} from "@/lib/ventas-internas/avisoVentaInterna";

export default function AvisoVentaInterna({ cliente }) {
  const aviso = obtenerAvisoVentaInterna(cliente);
  if (!aviso.visible) return null;

  const esInactivo = aviso.variante === VARIANTES.DESTINO_INACTIVO;
  // Clases del sistema Sunmi del POS: sin hex hardcodeado y sin tema propio, así
  // funciona igual en claro y oscuro. El título en negrita + el ícono lo distinguen
  // del panel de crédito fiado, que comparte panel y color de acento.
  const tono = esInactivo ? "sunmi-pos-text-danger" : "sunmi-pos-text-accent";

  return (
    <div
      className={`rounded-md sunmi-pos-panel px-3 py-2 text-xs flex items-start gap-2 ${tono}`}
      role={esInactivo ? "alert" : "status"}
    >
      <Store size={14} className="shrink-0 mt-[1px]" aria-hidden="true" />
      <div className="min-w-0">
        <div className="font-semibold leading-tight">{aviso.titulo}</div>
        {/* break-words: en 360px el nombre del local no debe desbordar. */}
        <div className="leading-tight break-words">{aviso.mensaje}</div>
      </div>
    </div>
  );
}
