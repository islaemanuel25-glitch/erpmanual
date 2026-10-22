// lib/pedidos/cantidadEnPedido.js
//
// FIJAR LA CANTIDAD DE UN PRODUCTO EN UN PEDIDO AL DEPÓSITO.
//
// Sacado tal cual de `app/api/pedidos/set-cantidad/route.js` el 2026-10-22,
// cuando apareció la segunda ruta que escribe cantidades del local:
// `app/api/pedidos/sumar-al-enviado/route.js`, que aplica varios cambios
// juntos al pedido enviado. Las dos validan y escriben con estas funciones, para
// que la regla —una línea por producto, 0 saca el producto, la unidad que llega—
// sea UNA (CLAUDE.md, regla 1).
//
// Lo que NO está acá y cada ruta hace por su cuenta: los permisos, el
// depósito del grupo, la transacción y los bloqueos
// (`lib/pedidos/bloqueoDelPedido.js`) y qué pedido se escribe.

import { esComboBase } from "@/lib/combos/guards";
import { sinCancelados } from "@/lib/pedidos/estados";

/**
 * Valida un cambio de cantidad del local contra el depósito. No escribe.
 *
 * @param {object} cliente `prisma` o `tx`.
 * @param {number} depositoId
 * @param {{ productoLocalId: any, cantidad: any, unidad: any }} entrada lo que mandó la pantalla.
 * @returns {Promise<{ ok: true, cambio: { productoLocalId: number, cantidad: number, unidad: "BULTO"|"UNIDAD" } } | { ok: false, status: number, error: string }>}
 */
export async function validarCambio(cliente, depositoId, entrada) {
  const productoLocalId = Number(entrada?.productoLocalId || 0);
  const cantidad = Number(entrada?.cantidad || 0);

  if (!productoLocalId) {
    return { ok: false, status: 400, error: "productoLocalId requerido" };
  }

  if (cantidad < 0) {
    return { ok: false, status: 400, error: "La cantidad no puede ser negativa" };
  }

  // Verificar que el productoLocal pertenece al depósito
  const productoOrigen = await cliente.productoLocal.findUnique({
    where: { id: productoLocalId },
    include: { base: true },
  });

  if (!productoOrigen || productoOrigen.localId !== depositoId) {
    return { ok: false, status: 404, error: "Producto no encontrado en el depósito" };
  }

  // Los combos no se transfieren: se transfieren sus componentes.
  if (esComboBase(productoOrigen.base)) {
    return { ok: false, status: 400, error: "Los combos no se transfieren; se transfieren sus componentes." };
  }

  // Validar modo_envio: si llega cantidad en UNIDAD y el producto sale por bulto,
  // la cantidad debe ser múltiplo de factorPack. Si llega en BULTO, no aplica.
  const base = productoOrigen.base;
  const factorPack = Number(base?.factor_pack || 1);
  const unidadIn = entrada?.unidad === "BULTO" ? "BULTO" : "UNIDAD";

  if (
    unidadIn === "UNIDAD" &&
    cantidad > 0 &&
    base?.modo_envio === "SOLO_BULTO" &&
    factorPack > 1
  ) {
    if (cantidad % factorPack !== 0) {
      return { ok: false, status: 400, error: `Este producto se pide por bulto completo (x${factorPack}).` };
    }
  }

  // Se respeta la unidad recibida ("BULTO" o "UNIDAD"). Fallback a "UNIDAD".
  return { ok: true, cambio: { productoLocalId, cantidad, unidad: unidadIn } };
}

/**
 * Fija la cantidad de un producto en el pedido `posId`. Va adentro de la
 * transacción de la ruta, con los bloqueos ya tomados.
 *
 * Todas las líneas del producto: con el bloqueo puesto hay una o ninguna,
 * pero los pedidos de antes pueden tener dos. En 0 se borran todas; si no, la
 * primera queda con la cantidad nueva y las demás se borran. Sin migración a
 * propósito: un índice único fallaría al aplicarse sobre los pedidos que ya
 * tienen líneas repetidas, y así se arreglan solos cuando se toca el producto.
 *
 * @returns {Promise<object|null>} la línea escrita, o null si el producto salió.
 */
export async function fijarCantidadEnPedido(tx, posId, { productoLocalId, cantidad, unidad }) {
  const lineas = await tx.posTransferenciaDetalle.findMany({
    where: {
      posTransferenciaId: posId,
      productoId: productoLocalId,
      pos: sinCancelados(),
    },
    orderBy: { id: "asc" },
  });
  const [existente, ...sobrantes] = lineas;

  if (cantidad === 0) {
    // Quitar el producto: todas sus líneas, también las repetidas.
    if (lineas.length) {
      await tx.posTransferenciaDetalle.deleteMany({ where: { id: { in: lineas.map((l) => l.id) } } });
    }
    return null;
  }

  // Upsert: sugerido = cantidad, preparado = 0
  if (existente) {
    const item = await tx.posTransferenciaDetalle.update({
      where: { id: existente.id },
      data: {
        sugerido: cantidad,
        preparado: 0,
        unidadSugerida: unidad,
        tipo: "manual",
      },
    });
    // Un pedido viejo —borrador o enviado sin empezar— con el producto
    // dos veces queda con UNA línea, la de la cantidad nueva.
    if (sobrantes.length) {
      await tx.posTransferenciaDetalle.deleteMany({ where: { id: { in: sobrantes.map((l) => l.id) } } });
    }
    return item;
  }

  return tx.posTransferenciaDetalle.create({
    data: {
      posTransferenciaId: posId,
      productoId: productoLocalId,
      sugerido: cantidad,
      preparado: 0,
      tipo: "manual",
      unidadSugerida: unidad,
      unidadPreparada: unidad,
    },
  });
}
