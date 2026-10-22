// lib/pedidos/itemDelPedido.js
//
// UN RENGLÓN DE UN PEDIDO AL DEPÓSITO, COMO LO MANDAN LAS RUTAS DEL LOCAL.
//
// Salió de `app/api/pedidos/carrito/route.js` el 2026-10-22, donde estaba
// escrito dos veces —el borrador y el pedido enviado—, cuando el detalle de un
// pedido del historial (`app/api/pedidos/historial/[id]/route.js`) necesitó el
// mismo renglón para dibujar la misma tarjeta. Una sola copia: la tarjeta
// (`components/pedidos/TarjetaPedido.jsx`) lee estos nombres.
//
// Espera la línea con `producto: { ...ProductoLocal, base: ProductoBase }`.

import { defaultModoEnvio } from "@/lib/conversiones/stock";

export function itemDelPedido(d) {
  const pl = d.producto;
  const base = pl?.base;
  return {
    detalleId: d.id,
    productoLocalId: d.productoId,
    baseId: pl?.baseId,
    nombre: pl?.nombre || base?.nombre || "",
    codigoBarra: base?.codigo_barra || null,
    sugerido: Number(d.sugerido || 0),
    preparado: Number(d.preparado || 0),
    unidadSugerida: d.unidadSugerida,
    factorPack: Number(base?.factor_pack || 1),
    modoEnvio: base?.modo_envio || defaultModoEnvio(base?.unidad_medida),
    unidadMedida: base?.unidad_medida || "unidad",
    imagenUrl: base?.imagen_url || null,
  };
}
