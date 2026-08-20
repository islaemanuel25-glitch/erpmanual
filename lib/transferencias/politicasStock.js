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

// ── LA INVERSA, Y POR QUÉ VIVE ACÁ ──────────────────────────────────────────
//
// `app/api/transferencias/cancelar` revertía SIEMPRE como si la política hubiera
// sido DESCONTAR_Y_TRANSITO: `cantidad += enviado, enTransito -= enviado`. Para
// una transferencia nacida de una venta eso devuelve mercadería que la venta ya
// cobró —stock inventado y plata cobrada por lo mismo—, y por eso cancelar está
// prohibido para ellas.
//
// La prohibición tapaba el síntoma. La causa era que la reversión no era la
// inversa del movimiento: hay dos formas de entrar y una sola de salir.
//
// Esta función es la inversa exacta, y vive pegada a `movimientoStockOrigen` a
// propósito. Si estuvieran en archivos distintos, el día que se agregue una
// tercera política se agregaría en uno y no en el otro — y el `throw` del final
// es lo único que haría ruido, en producción y no en los candados.
export function reversionStockOrigen(politica, unidades) {
  const u = Number(unidades) || 0;

  if (politica === SOLO_TRANSITO) {
    // El `cantidad` NO se devuelve: nunca lo descontó esta transferencia, lo
    // descontó la venta. La mercadería salió del origen de verdad. Lo único que
    // deja de ser cierto al cancelar es que esté viajando.
    return { update: { enTransito: { decrement: u } } };
  }

  if (politica === DESCONTAR_Y_TRANSITO) {
    // Comportamiento verbatim del cancelar que ya está desplegado.
    return { update: { cantidad: { increment: u }, enTransito: { decrement: u } } };
  }

  const e = new Error(`Política de stock de origen desconocida: ${politica}`);
  e.code = "POLITICA_STOCK_INVALIDA";
  throw e;
}

/**
 * Con qué política nació una transferencia.
 *
 * ── POR QUÉ SE DERIVA Y NO SE GUARDA ────────────────────────────────────────
 *
 * No hay columna, y agregarla obligaría a un backfill que decidiría lo mismo que
 * decide esta función. Hay exactamente DOS llamadores de `crearTransferencia` y
 * cada uno usa una política fija: `pos-transferencias/enviar` manda
 * DESCONTAR_Y_TRANSITO y no pasa `ventaId`; `pos-ventas/crear` manda
 * SOLO_TRANSITO y sí lo pasa.
 *
 * MEDIDO sobre las 101 transferencias de producción el 2026-08-20, que es lo que
 * hace confiable la derivación y no una suposición: 99 con venta y sin pedido,
 * 2 con pedido y sin venta, CERO con las dos y CERO sin ninguna. La partición es
 * limpia.
 *
 * Si algún día un tercer llamador rompe esa correspondencia, la columna deja de
 * ser opcional. El candado de abajo compara esta función contra los llamadores
 * reales para que ese día se entere alguien.
 */
export function politicaDeLaTransferencia(transferencia) {
  return transferencia?.ventaId != null ? SOLO_TRANSITO : DESCONTAR_Y_TRANSITO;
}
