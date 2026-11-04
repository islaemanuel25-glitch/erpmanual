// LA REGLA ÚNICA DE UNIDADES.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// Regla de Emanuel (2026-11-04): el sistema lee las unidades pero no las
// entendía. Cada módulo hacía su propia cuenta de unidad contra pack, con su
// propio umbral, y cada uno se equivocaba por su lado. El relevamiento de ese
// día midió siete decisores con umbrales distintos —35, 40, 50, 2 %…— y casos
// donde el mismo número daba resultados opuestos: una línea a $21.000 contra un
// pack de 12 a $38.400 la recepción la leía como pack de 2, y el cierre la tomaba
// por el bulto y la escribía como costo maestro.
//
// Una sola regla: la ficha del producto dice cómo viene, y todo lo que lee un
// número —un papel, una línea de pedido— pregunta acá antes de comparar precios
// o de escribir un costo. Lo que se arregla una vez queda arreglado en todos
// los lugares que preguntan.
//
// ── LAS PARTES ─────────────────────────────────────────────────────────────
//
//   · LA FICHA (`comoViene`): cómo viene el producto. Junta las dos lectoras
//     que había —`naturalezaLinea`, de compras, y `unidadesDeStockPorEscalon`,
//     de stock— que no miraban lo mismo: para compras un producto con compra por
//     UNIDAD era fiambre y no tenía pack; para stock valía su `factor_pack`.
//   · EL DECISOR (`escalaDelCosto`): si un costo es de la unidad o del bulto.
//     Es `deducirUnidad` —el de la recepción, el más completo— y su umbral
//     `CAMBIO_PLAUSIBLE_PCT` (35 %), definido una sola vez en su archivo. Cuando
//     hay duda se pregunta: nunca se escribe un costo solo.
//
// El conversor de cantidades entra cuando lo use el primero de sus módulos
// (stock, transferencias, siembra): acá no se escribe nada sin consumidor.
//
// Tanda 1 (2026-11-04): lo usa el cierre de recepción, que es el que escribe
// el costo maestro. Los demás módulos siguen con su cuenta propia hasta su tanda.
//
// Módulo puro: sin React y sin Prisma.

import { naturalezaLinea } from "../compras-proveedor/calculoPedido.js";
import { unidadesDeStockPorEscalon } from "../conversiones/stock.js";
import { UNIDAD, deducirUnidad } from "../compras-proveedor/comprobante/unidadPorPrecio.js";

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * CÓMO VIENE EL PRODUCTO, SEGÚN SU FICHA.
 *
 * @param base  la ficha: `{ factor_pack, unidad_medida, modoCompraProveedor,
 *              sueltos_por_unidad }`
 * @returns `{ naturaleza, factor }`
 *   · `naturaleza`: PACK, UNIDAD, FIAMBRE o KG (`naturalezaLinea`).
 *   · `factor`: cuántas unidades trae el bulto, a efectos del COSTO. Solo un
 *     PACK tiene bulto: el fiambre y el kilo guardan su costo por kilo, y una
 *     unidad suelta por unidad, así que para ellos es 1 aunque la ficha traiga
 *     un `factor_pack` cargado. Sale de `unidadesDeStockPorEscalon`, el mismo
 *     embudo que usa stock.
 */
export function comoViene(base) {
  const naturaleza = naturalezaLinea(base);
  if (naturaleza !== "PACK") return { naturaleza, factor: 1 };
  const escalones = unidadesDeStockPorEscalon(base);
  return { naturaleza, factor: escalones.bulto / escalones.unidad };
}

/**
 * ¿ESTE COSTO ES DE LA UNIDAD O DEL BULTO?
 *
 * La pregunta solo existe para un costo anotado "por unidad" de un producto
 * que viene en pack: ese número puede ser el de la unidad —lo normal— o el del
 * bulto escrito donde iba el de la unidad, como la Hamburguesa Paty del #242
 * ($61.703, el bulto de 30, en una línea por unidad). Una línea por bulto, o un
 * producto sin pack, no tiene nada que decidir.
 *
 * Contesta `deducirUnidad` contra el costo que el producto tiene hoy, sin
 * ningún umbral propio. Solo valen las dos lecturas de una línea —unidad o
 * bulto entero—: un pack intermedio, las dos a la vez, o ninguna, es duda, y la
 * duda se pregunta. $21.000 contra el pack de 12 a $38.400 no es ni la unidad
 * (+556 %) ni el bulto (−45 %).
 *
 * Sin costo de hoy no hay con qué comparar —el primer ingreso de un producto
 * nuevo—: el número es lo que dice ser, el de la unidad.
 *
 * @param costo        el costo anotado
 * @param unidad       en qué dice estar: "UNIDAD" o "BULTO"
 * @param base         la ficha del producto (`comoViene`)
 * @param costoActual  el costo maestro de hoy, por bulto
 * @returns `{ unidad, requiereDecision, porque }` — `unidad` es en la que el
 *          costo ESTÁ de verdad ("UNIDAD" o "BULTO"), o null si hay que
 *          preguntar.
 */
export function escalaDelCosto({ costo, unidad, base, costoActual = null } = {}) {
  const { naturaleza, factor } = comoViene(base);
  const c = num(costo);
  if (unidad !== "UNIDAD" || naturaleza !== "PACK" || c === null || !(c > 0)) {
    return { unidad, requiereDecision: false, porque: null };
  }
  const actual = num(costoActual);
  if (actual === null || !(actual > 0)) {
    return { unidad: "UNIDAD", requiereDecision: false, porque: "No hay costo de hoy con qué comparar." };
  }
  const d = deducirUnidad({ costoAnteriorFinal: actual, precioFacturaFinal: c, factorPack: factor });
  if (d.unidad === UNIDAD.POR_UNIDAD) return { unidad: "UNIDAD", requiereDecision: false, porque: d.porque };
  if (d.unidad === UNIDAD.POR_BULTO) return { unidad: "BULTO", requiereDecision: false, porque: d.porque };
  return { unidad: null, requiereDecision: true, porque: d.porque ?? null };
}
