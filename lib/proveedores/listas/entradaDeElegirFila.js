// POR QUÉ PUERTA SE ENTRÓ A «ELEGIR UN RENGLÓN DE LA LISTA».
//
// ── LA PANTALLA ES UNA Y LAS PREGUNTAS SON DOS ─────────────────────────────
//
// Elegir cuál renglón del papel corresponde a un producto del catálogo es una
// sola pantalla, con la misma lista, el mismo orden por parecido y la misma marca
// de "ya está tomada por otro". Lo que cambia es de dónde se vino:
//
//   PUERTA.FILA      desde «No es este producto», en revisar de a uno. Hay una
//                    fila atada al producto equivocado, y hay que moverla.
//   PUERTA.PRODUCTO  desde «No vinieron», en «No cambian». El producto no tiene
//                    NINGUNA fila, y casi siempre es porque el código guardado
//                    está mal: el renglón está, con otro nombre y otro código.
//
// Escribir una segunda pantalla para la segunda puerta sería la copia que el
// CLAUDE.md prohíbe, y lo que se separaría el día que una cambie es cómo se
// ordenan las candidatas — o sea qué renglón elige una persona apurada.
//
// ── POR QUÉ ESTO ES UN MÓDULO Y NO UN `if` EN LA PANTALLA ──────────────────
//
// Porque son CUATRO cosas que cambian juntas —el endpoint, a dónde se vuelve, qué
// dice el botón de volver y si «No está en la lista» escribe algo— y desparramar
// esas cuatro en cuatro ternarios deja que se desincronicen: un endpoint de una
// puerta con la vuelta de la otra. Acá salen todas de la misma rama, y se pueden
// afirmar sin montar la pantalla.
//
// Módulo puro y liviano a propósito: lo consume una pantalla del navegador, así
// que NO importa el motor de conciliación ni nada que lo arrastre.

import { GRUPO_NO_CAMBIA, ORDEN_NO_CAMBIAN } from "./losQueNoCambian.js";

/** Las dos puertas. Conjunto CERRADO: no hay una tercera pantalla que entre. */
export const PUERTA = Object.freeze({
  FILA: "FILA",
  PRODUCTO: "PRODUCTO",
});

const FILTROS_VALIDOS = new Set(ORDEN_NO_CAMBIAN);

const enteroPositivo = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Todo lo que la pantalla necesita saber de por dónde se entró.
 *
 * ── LA FILA GANA SI VINIERAN LAS DOS ───────────────────────────────────────
 *
 * No debería pasar, pero si pasara hay que elegir una y no mezclar: con `fila`
 * hay un renglón viejo que queda libre, y ése es el camino que escribe más. Que
 * el de más efecto sea el que gana es deliberado: la alternativa es decidirlo
 * por el orden en que están escritos los parámetros, que no es una regla.
 *
 * @param {number} importacionId  la lista que se está mirando.
 * @param {number} [fila]         id de la fila, si se vino de «No es este producto».
 * @param {number} [producto]     id del ProductoBase, si se vino de «No vinieron».
 * @param {string} [filtro]       el chip de «No cambian» donde estaba, para volver
 *                                al mismo. Solo tiene sentido con `producto`.
 * @returns {object|null} null cuando no hay una puerta válida — la pantalla dice
 *   que no se sabe qué buscar, en vez de pedirle nada al servidor.
 */
export function entradaDeElegirFila({ importacionId, fila, producto, filtro } = {}) {
  const imp = enteroPositivo(importacionId);
  if (imp === null) return null;

  const filaId = enteroPositivo(fila);
  const productoBaseId = enteroPositivo(producto);
  if (filaId === null && productoBaseId === null) return null;

  const base = `/modulos/proveedores/listas/${imp}`;

  if (filaId !== null) {
    return {
      puerta: PUERTA.FILA,
      importacionId: imp,
      filaId,
      productoBaseId: null,
      endpoint: `/api/proveedores/listas/${imp}/filas/${filaId}/otra-fila`,
      volverA: `${base}/revisar`,
      textoVolver: "Revisar",
      // Desde acá SÍ se puede sacar de la lista: la fila existe y hay algo que
      // desvincular. El endpoint lo contesta con `{ noEstaEnLaLista: true }`.
      sacarDeLaListaEscribe: true,
    };
  }

  // ── EL FILTRO VIAJA PARA QUE LA VUELTA CAIGA EN EL MISMO CHIP ────────────
  //
  // Se entró desde «No vinieron». Volver a «Todos» obligaría a filtrar de nuevo
  // para seguir con el siguiente, que es justamente el trabajo que esa pantalla
  // ahorra. Un filtro que no sea de los chips se descarta en vez de viajar: la
  // vuelta cae en «Todos», que es un destino real.
  const chip = FILTROS_VALIDOS.has(filtro) ? filtro : GRUPO_NO_CAMBIA.NO_VINO;

  return {
    puerta: PUERTA.PRODUCTO,
    importacionId: imp,
    filaId: null,
    productoBaseId,
    endpoint: `/api/proveedores/listas/${imp}/productos/${productoBaseId}/en-la-lista`,
    volverA: `${base}/no-cambian?filtro=${chip}`,
    textoVolver: "No cambian",
    // ── DESDE ACÁ «NO ESTÁ EN LA LISTA» NO ESCRIBE NADA ───────────────────
    //
    // El producto YA está fuera de la lista: por eso apareció en «No vinieron».
    // Decir «no está» es confirmar lo que ya es, así que el botón vuelve y no
    // manda nada. Escribir algo acá sería inventarle una decisión al que solo
    // miró y se fue.
    sacarDeLaListaEscribe: false,
  };
}

/**
 * A dónde se va después de atar el producto a un renglón.
 *
 * ── POR QUÉ NO ES SIEMPRE «REVISAR» A SECAS ────────────────────────────────
 *
 * Desde «No vinieron» el renglón recién atado tiene sus lecturas recalculadas y
 * SIN contestar, y es el único que le importa a quien vino hasta acá. Caer en la
 * cola desde el principio lo obligaría a pasar productos hasta encontrarlo, que
 * es el trabajo que «No cambian» existe para evitar. Es el mismo link con el que
 * esa pantalla abre un «Para revisar».
 *
 * Desde «No es este producto» ya se estaba recorriendo la cola, así que se vuelve
 * a la cola.
 *
 * @param {object} entrada  lo que devolvió `entradaDeElegirFila`.
 * @param {number} [filaId] la fila que quedó atada, que la contesta el servidor.
 */
export function destinoTrasVincular(entrada, filaId) {
  const base = `/modulos/proveedores/listas/${entrada.importacionId}/revisar`;
  if (entrada.puerta === PUERTA.FILA) return base;
  const fila = enteroPositivo(filaId);
  if (fila === null) return base;
  return `${base}?filaId=${fila}&desde=no-cambian`;
}
