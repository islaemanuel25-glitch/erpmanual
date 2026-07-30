// lib/transferencias/crearTransferencia.js
//
// Núcleo REUTILIZABLE de creación de una transferencia. Extraído verbatim del
// bloque transaccional de app/api/pos-transferencias/enviar/route.js (el único
// punto donde se creaban transferencias), sin cambio de comportamiento.
//
// Qué hace:
//   · asegura el ProductoLocal del destino (upsert);
//   · calcula las unidades físicas con toUnidades() de lib/conversiones/stock;
//   · mueve el StockLocal del origen según `politicaStockOrigen`;
//   · crea Transferencia (estado "Enviada" + fechaEnvio) y sus TransferenciaDetalle;
//   · devuelve la transferencia creada y un resumen de los movimientos.
//
// Qué NO hace (queda en el llamador): HTTP, sesión, permisos, scope, resolución de
// contexto, carga y bloqueo de PosTransferencia, validación de estados, rechazo de
// combos, validarEnvio(), validación de stock insuficiente / stock negativo, y la
// actualización final de la POS. Tampoco abre transacción: recibe `tx`.
//
// Nota deliberada: al enviar NO se toca el StockLocal del DESTINO. La fila del
// destino se crea al confirmar la recepción (confirmar-recepcion), igual que hoy.
// Tampoco se convierte piezas→kg acá: esa conversión (esFiambreFijo/piezasToKg)
// vive en la recepción. El envío guarda `cantidad` + `unidadEnviada` para que la
// recepción pueda hacerla.

// Imports relativos (convención del resto de lib/: lineaModoDeposito importa
// ./consumoStock.js). Así el módulo resuelve igual en el bundle y en Node puro.
import { toUnidades, factorBulto } from "../conversiones/stock.js";
import {
  DESCONTAR_Y_TRANSITO,
  esPoliticaValida,
  movimientoStockOrigen,
} from "./politicasStock.js";

export { DESCONTAR_Y_TRANSITO, SOLO_TRANSITO } from "./politicasStock.js";

function error(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/**
 * Crea una transferencia y aplica la política de stock del origen.
 *
 * @param {object}   opts
 * @param {object}   opts.tx                  cliente transaccional de Prisma (obligatorio).
 * @param {number}   opts.origenId            Local que envía.
 * @param {number}   opts.destinoId           Local que recibe.
 * @param {number}   [opts.creadoPorId]       Usuario al que se atribuye el envío (Transferencia.creadaPor).
 * @param {number}   [opts.posTransferenciaId] POS que originó el envío (flujo manual).
 * @param {string}   [opts.politicaStockOrigen=DESCONTAR_Y_TRANSITO]
 * @param {Array<object>} opts.items          ítems YA validados por el llamador:
 *   @param {number} items[].baseId                  ProductoBase.id
 *   @param {number} items[].productoLocalOrigenId   ProductoLocal.id del ORIGEN (fila de stock a mover)
 *   @param {number} items[].cantidad                cantidad en la unidad de `unidadEnviada`
 *   @param {string} items[].unidadEnviada           "BULTO" | "UNIDAD"
 *   @param {number} [items[].factorPack]            si falta se deriva con factorBulto(base)
 *   @param {object} [items[].productoLocalOrigen]   fila del origen (con `.base`) para los snapshots del destino
 *
 * @returns {Promise<{ transferencia: object, movimientos: Array<object> }>}
 *   movimientos: [{ baseId, productoLocalOrigenId, productoLocalDestinoId,
 *                   cantidad, unidadEnviada, factorPack, unidadesStock,
 *                   politicaStockOrigen }]
 */
export async function crearTransferencia({
  tx,
  origenId,
  destinoId,
  creadoPorId = null,
  posTransferenciaId = null,
  politicaStockOrigen = DESCONTAR_Y_TRANSITO,
  items,
}) {
  if (!tx) throw error("TX_REQUERIDA", "crearTransferencia requiere un cliente transaccional (tx)");
  if (!origenId || !destinoId) {
    throw error("ORIGEN_DESTINO_REQUERIDOS", "origenId y destinoId son obligatorios");
  }
  if (!esPoliticaValida(politicaStockOrigen)) {
    throw error("POLITICA_STOCK_INVALIDA", `Política de stock de origen desconocida: ${politicaStockOrigen}`);
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw error("SIN_ITEMS", "No se generaron detalles válidos para la transferencia");
  }

  const detallesTransferencia = [];
  const movimientos = [];

  for (const item of items) {
    if (!item.baseId) {
      // Mismo mensaje que el handler original (cae en su catch genérico → 500).
      throw error("SIN_BASE_ID", "Producto sin baseId asignado");
    }
    if (!item.productoLocalOrigenId) {
      throw error("SIN_PRODUCTO_ORIGEN", "Producto sin ProductoLocal de origen");
    }

    const origen = item.productoLocalOrigen || null;
    const base = origen?.base || null;

    // Producto en el destino. Cadenas de fallback verbatim del handler original.
    const productoLocalDestino = await tx.productoLocal.upsert({
      where: {
        localId_baseId: { localId: destinoId, baseId: item.baseId },
      },
      update: {},
      create: {
        localId: destinoId,
        baseId: item.baseId,
        nombre: origen?.nombre || base?.nombre || "",
        descripcion: origen?.descripcion || base?.descripcion || "",
        precio_costo: origen?.precio_costo || base?.precio_costo,
        precio_venta: origen?.precio_venta || base?.precio_venta,
      },
    });

    // Unidades físicas. Fórmula única: toUnidades() de lib/conversiones/stock.
    // El factor lo provee el llamador (ya lo calculó para validar stock); si no
    // viene se deriva con factorBulto(base), el helper de la misma librería.
    const factorPack =
      item.factorPack != null ? Number(item.factorPack) : factorBulto(base);
    const unidadesStock = toUnidades({
      cantidad: item.cantidad,
      unidad: item.unidadEnviada,
      factorPack,
    });

    // Stock del ORIGEN según la política.
    const mov = movimientoStockOrigen(politicaStockOrigen, unidadesStock);
    await tx.stockLocal.upsert({
      where: {
        localId_productoId: { localId: origenId, productoId: item.productoLocalOrigenId },
      },
      update: mov.update,
      create: {
        localId: origenId,
        productoId: item.productoLocalOrigenId,
        ...mov.create,
      },
    });

    // Datos congelados del detalle (idénticos a los de hoy).
    detallesTransferencia.push({
      productoId: productoLocalDestino.id, // ProductoLocal del DESTINO
      cantidad: item.cantidad, // en la unidad de unidadEnviada
      unidadEnviada: item.unidadEnviada,
      precioCosto: origen?.precio_costo || base?.precio_costo || 0,
    });

    movimientos.push({
      baseId: item.baseId,
      productoLocalOrigenId: item.productoLocalOrigenId,
      productoLocalDestinoId: productoLocalDestino.id,
      cantidad: item.cantidad,
      unidadEnviada: item.unidadEnviada,
      factorPack,
      unidadesStock,
      politicaStockOrigen,
    });
  }

  if (!detallesTransferencia.length) {
    throw error("SIN_ITEMS", "No se generaron detalles válidos para la transferencia");
  }

  const transferencia = await tx.transferencia.create({
    data: {
      origenId,
      destinoId,
      creadaPor: creadoPorId,
      posTransferenciaId,

      estado: "Enviada",
      fechaEnvio: new Date(),

      detalle: { create: detallesTransferencia },
    },
    include: { detalle: true },
  });

  return { transferencia, movimientos };
}

export default crearTransferencia;
