// lib/pedidos/revisionDeLinea.js
//
// QUÉ LÍNEA DE UN PEDIDO YA DECIDIÓ EL DEPÓSITO, Y CUÁNTO VIAJA.
//
// Escrito el 2026-10-22 con la pantalla de preparar del celular. Hasta ahí una
// línea tenía `sugerido` (lo que pidió el local) y `preparado` (lo que el
// depósito armó), y nada más: "va 0, decidido" y "todavía no la miré" eran la
// misma fila —preparado 0—. Peor: `enviar` mandaba lo PEDIDO cuando lo
// preparado era 0, así que "este no va" viajaba igual.
//
// Desde la migración `deposito_revision_de_linea` la línea guarda `revisadoEn`,
// y estas tres preguntas se contestan acá, una vez:
//
//   · ¿está revisada?  la decidió el depósito (`revisadoEn`), o tiene algo
//     preparado —las líneas de antes de la columna, y las que prepara la
//     pantalla de la computadora, que no cambió—;
//   · ¿cuánto viaja?   lo preparado; si no hay nada preparado y nadie la
//     decidió, lo pedido (como siempre); si la decidió en 0, nada;
//   · ¿qué es "va completo"?  exactamente lo pedido, en la unidad en que se
//     pidió: `sugerido` en `unidadSugerida`, tal cual.
//
// ── POR QUÉ SE LEE LA UNIDAD PEDIDA Y NO EL MODO DE ENVÍO ──────────────────
// Para un pack sin modo de envío cargado, la ruta del detalle del depósito
// (`/api/pos-transferencias/detalle`) dice "MIXTO" y la del carrito del local
// dice "SOLO_BULTO" (`defaultModoEnvio`): las dos rutas no deducen igual.
// Medido en la sección 14 de `scripts/pruebas-db/pedidosEnviarCancelar.mjs`.
// Lo que el local pidió no depende de esa deducción: está guardado en
// `unidadSugerida`, y es lo que se lee acá.
//
// Puro: lo leen las rutas, la pantalla y los candados.

/**
 * El `where` de Prisma de una línea revisada: el MISMO criterio que
 * `estaRevisada`, para contar en la base sin traer las líneas.
 */
export const WHERE_LINEA_REVISADA = Object.freeze({
  OR: [{ preparado: { gt: 0 } }, { revisadoEn: { not: null } }],
});

/** ¿El depósito ya decidió esta línea? */
export function estaRevisada(linea) {
  return linea?.revisadoEn != null || Number(linea?.preparado || 0) > 0;
}

/** Lo que viaja de esta línea, en `unidadPreparada` (o la sugerida). */
export function cantidadQueViaja(linea) {
  const preparado = Number(linea?.preparado || 0);
  if (preparado > 0) return preparado;
  if (linea?.revisadoEn != null) return 0;
  return Number(linea?.sugerido || 0);
}

/**
 * Lo que pidió el local, como se lo dice: en BULTO solo si pidió bultos de un
 * producto que viene de a más de uno; si no, en UNIDAD.
 *
 * @returns {{ cantidad: number, unidad: "BULTO"|"UNIDAD", factorPack: number }}
 */
export function loPedido(linea) {
  const factorPack = Number(linea?.factorPack || 1);
  const unidad = linea?.unidadSugerida === "BULTO" && factorPack > 1 ? "BULTO" : "UNIDAD";
  return { cantidad: Number(linea?.sugerido || 0), unidad, factorPack };
}

/**
 * "Va completo": lo que se escribe como preparado para mandar exactamente lo
 * pedido. Recibe la línea como la manda `/api/pos-transferencias/detalle`.
 *
 * @returns {{ preparado: number, unidadPreparada: "BULTO"|"UNIDAD" }}
 */
export function vaCompleto(linea) {
  return {
    preparado: Number(linea?.sugerido || 0),
    unidadPreparada: linea?.unidadSugerida === "BULTO" ? "BULTO" : "UNIDAD",
  };
}
