// lib/transferencias/politicasStock.js
//
// Política de stock del ORIGEN al crear una transferencia. Aísla la única decisión
// que difiere entre quien origina el envío, para que la creación de la
// transferencia no se duplique.
//
//   DESCONTAR_Y_TRANSITO  (única usada hoy, por el flujo manual de POS
//                          transferencias): la transferencia es la que saca la
//                          mercadería del origen.
//                            cantidad   -= unidades
//                            enTransito += unidades
//
//   SOLO_TRANSITO         (preparada, todavía sin llamador): el descuento de
//                          `cantidad` ya lo hizo otro proceso —el caso previsto es
//                          una venta, que descuenta al crearse— y la transferencia
//                          solo marca la mercadería en viaje.
//                            cantidad    sin cambios
//                            enTransito += unidades
//
// En los dos modos `enTransito` sube por las unidades enviadas, porque la recepción
// (app/api/transferencias/confirmar-recepcion) lo descuenta por lo ENVIADO. Una
// política que no lo incrementara dejaría el tránsito del origen en negativo.
//
// LA RECEPCIÓN NO DISTINGUE POLÍTICA, y no es un olvido. Cuando el destino recibe
// menos de lo enviado, la diferencia vuelve al `cantidad` del origen en los dos
// modos, porque en los dos el origen YA perdió la cantidad enviada antes de que se
// confirme la recepción: en DESCONTAR_Y_TRANSITO la descontó esta transferencia al
// enviarse, en SOLO_TRANSITO la descontó la Venta al crearse. El neto correcto es
// el mismo —el origen pierde solo lo que el destino recibió— y por eso el faltante
// se devuelve una sola vez, en la recepción, sin preguntar de dónde vino el envío.

export const DESCONTAR_Y_TRANSITO = "DESCONTAR_Y_TRANSITO";
export const SOLO_TRANSITO = "SOLO_TRANSITO";

export const POLITICAS_STOCK_ORIGEN = [DESCONTAR_Y_TRANSITO, SOLO_TRANSITO];

export function esPoliticaValida(politica) {
  return POLITICAS_STOCK_ORIGEN.includes(politica);
}

/**
 * Fragmentos `update` / `create` del upsert de StockLocal del origen.
 *
 * Se devuelven fragmentos en vez de ejecutar la escritura para que el movimiento
 * quede en un único lugar del servicio y la política sea testeable en aislamiento.
 *
 * @param {string} politica  DESCONTAR_Y_TRANSITO | SOLO_TRANSITO
 * @param {number} unidades  unidades físicas enviadas (escala de StockLocal)
 * @returns {{ update: object, create: { cantidad: number, enTransito: number } }}
 */
export function movimientoStockOrigen(politica, unidades) {
  const u = Number(unidades) || 0;

  if (politica === SOLO_TRANSITO) {
    return {
      update: { enTransito: { increment: u } },
      // La fila no existía: no hay `cantidad` que descontar, solo se marca el viaje.
      create: { cantidad: 0, enTransito: u },
    };
  }

  if (politica === DESCONTAR_Y_TRANSITO) {
    return {
      update: { cantidad: { decrement: u }, enTransito: { increment: u } },
      // Verbatim del comportamiento actual: sin fila previa queda en negativo.
      create: { cantidad: -u, enTransito: u },
    };
  }

  const e = new Error(`Política de stock de origen desconocida: ${politica}`);
  e.code = "POLITICA_STOCK_INVALIDA";
  throw e;
}
