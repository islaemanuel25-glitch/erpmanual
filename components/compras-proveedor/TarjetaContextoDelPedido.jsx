"use client";

// DÓNDE ESTOY, RECIBIENDO UN PEDIDO.
//
// ── QUÉ REEMPLAZA ─────────────────────────────────────────────────────────
//
// Media pantalla de ficha: Proveedor, Depósito, Creado, Notas y cuatro fechas
// de flujo —confirmado, enviado, recibido, anulado— de las cuales dos están
// siempre vacías, porque un pedido que se está recibiendo todavía no tiene
// fecha de recibido ni de anulado. Eso es un formulario de consulta arriba de
// una pantalla de trabajo.
//
// Lo que hace falta para saber dónde se está parado es a quién se le compró, qué
// número es, cuántos ítems tiene y cuánta plata representa. Nada más.
//
// ── EL MONTO DICE "ESTIMADO AL PEDIR" Y NO ES UN ADORNO ───────────────────
//
// Sale de la suma de cantidad × costo de las líneas, que es lo que se calculó al
// armar el pedido. No es lo que el proveedor va a facturar: entre que se mandó y
// llegó la mercadería puede haber un aumento. Sin esa palabra, alguien compara
// este número contra la factura y la diferencia se lee como un error del
// sistema en vez de como un precio que cambió. Es el mismo criterio que la
// tarjeta del listado de recepción.

import { formatearMoneda } from "@/lib/moneda";

export default function TarjetaContextoDelPedido({
  proveedorNombre = "—",
  pedidoId,
  cantItems = 0,
  totalEstimado = 0,
  estado = "",
}) {
  return (
    <div className="min-h-contextoPedido rounded-xl border sunmi-divider sunmi-bg-card px-4 py-filtro flex flex-col gap-dato">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg2 font-bold sunmi-text-strong truncate">
          {proveedorNombre} <span className="sunmi-text-muted">#{pedidoId}</span>
        </span>
        {/* El chip de estado, con el radio completo que pide el diseño. No usa
            `SunmiPill` porque aquélla trae su propio tamaño de letra y su propio
            radio, y acá el diseño pide 13 y redondo entero. */}
        {estado && (
          <span className="shrink-0 rounded-full border sunmi-divider px-renglon py-chip text-sm3 sunmi-text-muted whitespace-nowrap">
            {estado}
          </span>
        )}
      </div>

      <span className="text-sm3 sunmi-text-muted">
        {cantItems} {cantItems === 1 ? "ítem" : "ítems"} ·{" "}
        {formatearMoneda(totalEstimado)} estimado al pedir
      </span>
    </div>
  );
}
