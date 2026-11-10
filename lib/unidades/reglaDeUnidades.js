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
//   · EL DECISOR (`escalaDelPrecio`, y `escalaDelCosto` sobre él): si un precio
//     es de la unidad o del bulto. Es `deducirUnidad` —el de la recepción— con
//     su regla única desde el 2026-11-07: gana la lectura que deja menos
//     diferencia contra el costo (`elegirLectura`). Cuando ninguna gana clara se
//     pregunta: nunca se escribe un costo solo.
//   · EL CONVERSOR DE COSTO (`costoEnLaUnidad`): el costo de la unidad o del
//     bulto, según la ficha. Es `convertirUnidadPedido`, el de Compras.
//   · EL CONVERSOR DE CANTIDAD (`cantidadEnUnidades`, `bultosDe`): unidades
//     sueltas y bultos enteros según la ficha, sin redondear ni un resto.
//   · EL BULTO Y SUS PACKS (`bultoDeLaFicha`, `packsDelBulto`, `costoDelBulto`):
//     cuántas trae la caja de la ficha, qué packs la dividen y el costo del
//     bulto desde el precio de un pack. Los mismos divisores y la misma cuenta
//     que la recepción.
//   · EL PARECIDO (`sePareceA`): si un precio cae dentro del umbral único de
//     otro. Es la misma medida con la que el decisor prueba cada lectura.
//
// Tanda 1 (2026-11-04): el cierre de recepción, que escribe el costo maestro.
// Tanda 2 (2026-11-04): la siembra de pedidos desde factura y `costoParaUnidad`.
// Tanda 3 (2026-11-05): la importación de pedidos desde archivo —la escala del
// papel y sus cuentas de unidad contra bulto—.
// Tanda 4 (2026-11-05): las listas de precios —la caja de la ficha, el pack de
// la lista y el costo de cada lectura—. El rango del proveedor sigue eligiendo
// la lectura: dice cuánto suele aumentar, que es otra pregunta.
// Tanda 5 (2026-11-05): el resto de listas —la reaplicación de multiplicadores
// confirmados al aplicar, confirmar la presentación y Arcor—. Aplicar una lista
// confirmada escribe los mismos costos que antes.
// Stock, transferencias y POS siguen con su cuenta propia hasta su tanda.
//
// Módulo puro: sin React y sin Prisma.

import { naturalezaLinea, convertirUnidadPedido } from "../compras-proveedor/calculoPedido.js";
import { fromUnidades, toUnidades, unidadesDeStockPorEscalon } from "../conversiones/stock.js";

// ── EL CONVERSOR DE CANTIDADES DEL STOCK (tanda 6) ─────────────────────────
//
// Entra a la pieza tal cual vive en `conversiones/stock.js`, que sigue siendo
// su única definición: cuántas unidades de stock son una cantidad dicha en
// bultos o unidades (`toUnidades`), y cómo se parten unas unidades de stock en
// bultos, unidades y sueltos (`fromUnidades`). Quien convierta cantidades de
// stock desde ahora lo pide acá.
export { toUnidades, fromUnidades };
import {
  CAMBIO_PLAUSIBLE_PCT,
  UNIDAD,
  deducirUnidad,
  divisoresDelBulto,
} from "../compras-proveedor/comprobante/unidadPorPrecio.js";

/**
 * LA MARCA DE LA VERSIÓN DE LA REGLA, para comprobar un despliegue.
 *
 * Es un literal de texto, no un identificador: sobrevive al build. La ruta de
 * aplicar una lista la devuelve en su resumen (`reglaDeUnidades`), así que en la
 * imagen se encuentra con un grep sobre `.next/server` y en vivo con un GET.
 * Se cambia en cada tanda de la regla.
 */
export const MARCA_REGLA_DE_UNIDADES = "regla-unica-de-unidades:tanda-17";

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
 * EL MISMO COSTO, EN OTRA UNIDAD: "UNIDAD" o "BULTO".
 *
 * Solo un pack tiene bulto: para el fiambre, el kilo o la unidad suelta el
 * costo es el mismo en las dos (`comoViene`). Con un pack de 12, $38.400 el
 * bulto son $3.200 la unidad y al revés, exactos, sin redondear: la cuenta es la
 * de `convertirUnidadPedido`, la misma que usa la pantalla del pedido.
 *
 * @returns el costo convertido, o el mismo si no hay nada que convertir; null
 *          si el costo no es un número.
 */
export function costoEnLaUnidad({ costo, de, a, base } = {}) {
  const c = num(costo);
  if (c === null) return null;
  const { naturaleza, factor } = comoViene(base);
  if (de === a || naturaleza !== "PACK") return c;
  if (de === "BULTO" && a === "UNIDAD") return unidadDelBulto({ precio: c, factor });
  if (de === "UNIDAD" && a === "BULTO") return convertirUnidadPedido({ unidad: "UNIDAD", cantidad: factor, costo: c, factor }).costo;
  return c;
}

/**
 * EL PRECIO DE UNA UNIDAD DEL BULTO, CON EL FACTOR QUE YA SE CONOCE (tanda 8).
 *
 * Es la división de `costoEnLaUnidad`, sin la lectora: para quien tiene en la
 * mano el factor de una línea y no la ficha entera. El caso es el carrito del
 * POS, cuya línea trae `factorPack` y `unidadMedida` del buscador, pero no
 * `modoCompraProveedor`. Leerla con `comoViene` cambiaría el resultado de una
 * ficha por kilo con pack (ver el candado `lib/unidades/posVentaConLaPieza.test.mjs`),
 * y la tanda 8 no cambia ningún resultado de venta.
 *
 * Exacta, sin redondear; el que muestra redondea a su escala. Con factor 1 o
 * menos devuelve el precio tal cual. La cuenta es la de `convertirUnidadPedido`.
 */
export function unidadDelBulto({ precio, factor } = {}) {
  return convertirUnidadPedido({ unidad: "BULTO", cantidad: 1, costo: precio, factor }).costo;
}

/**
 * ¿ESTE PRECIO SE PARECE A ESTE OTRO, CON EL UMBRAL ÚNICO?
 *
 * Adentro de `CAMBIO_PLAUSIBLE_PCT` (35 %) sobre la referencia: es lo que un
 * precio puede moverse de una compra a otra. Es la medida con la que
 * `deducirUnidad` prueba cada lectura: un costo que no se parece al de
 * referencia en ninguna escala no es un precio, es una foto vieja o una escala
 * equivocada.
 */
export function sePareceA(precio, referencia) {
  const p = num(precio);
  const r = num(referencia);
  if (p === null || r === null || !(r > 0)) return false;
  return (Math.abs(p - r) / r) * 100 <= CAMBIO_PLAUSIBLE_PCT;
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
 * Contesta `deducirUnidad` contra el costo que el producto tiene hoy, con la
 * regla única de la recepción (gana la de menor diferencia). Solo valen las dos
 * lecturas de una línea —unidad o bulto entero—: sin ganadora clara, se
 * pregunta. $21.000 contra el pack de 12 a $38.400 es el bulto (−45 %, contra
 * +556 % por unidad), y el freno de variación del cierre no lo escribe sin que
 * alguien lo acepte.
 *
 * El cierre la usa solo para una línea SIN papel: con papel, el costo es el de
 * la lectura del renglón (`lecturaDelCierre.js`).
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
export function escalaDelCosto({ costo, unidad, base, costoActual = null, variacionPct = null } = {}) {
  const { naturaleza } = comoViene(base);
  const c = num(costo);
  if (unidad !== "UNIDAD" || naturaleza !== "PACK" || c === null || !(c > 0)) {
    return { unidad, requiereDecision: false, porque: null };
  }
  const actual = num(costoActual);
  if (actual === null || !(actual > 0)) {
    return { unidad: "UNIDAD", requiereDecision: false, porque: "No hay costo de hoy con qué comparar." };
  }
  const e = escalaDelPrecio({ precio: c, base, costoActual: actual, variacionPct });
  return { unidad: e.unidad, requiereDecision: e.unidad === null, porque: e.porque };
}

/**
 * ¿ESTE PRECIO ES DE LA UNIDAD O DEL BULTO? Sin suponer nada de antemano.
 *
 * Es la pregunta de quien lee un papel que no dice en qué escala viene —la
 * importación de pedidos desde archivo, por ejemplo— y la base de
 * `escalaDelCosto`. Contesta `deducirUnidad`, el decisor de la recepción, con su
 * umbral único: unidad o bulto cuando una sola de las dos explica el precio, y
 * null en todo lo demás —un pack intermedio, las dos a la vez, ninguna, un
 * producto sin bulto o sin costo con qué comparar—. Null es "preguntar".
 *
 * $4.416 la unidad contra el pack de 12 a $38.400 (+38 % sobre los $3.200 de la
 * unidad) no es por unidad: la recepción lo lee como un pack intermedio, y la
 * importación decía "es por unidad" con un 40 % propio (relevamiento del
 * 2026-11-04). Las dos preguntan acá desde la tanda 3.
 *
 * No devuelve el cociente del precio contra el costo: es un número de esta
 * compra, y guardarlo sería aplicarle este aumento a las siguientes.
 *
 * @param precio       el precio leído
 * @param base         la ficha del producto (`comoViene`)
 * @param costoActual  el costo maestro de hoy, por bulto
 * @returns `{ unidad, porque, veredicto, unidadesPorFacturada }` — `unidad` es
 *          "UNIDAD", "BULTO" o null; `veredicto` es el de `deducirUnidad`, o
 *          null si no se llegó a preguntarle.
 */
export function escalaDelPrecio({ precio, base, costoActual = null, descripcion = null, variacionPct = null } = {}) {
  const { naturaleza, factor } = comoViene(base);
  const p = num(precio);
  const actual = num(costoActual);
  const sinRespuesta = (porque) => ({ unidad: null, porque, veredicto: null, unidadesPorFacturada: null });
  if (p === null || !(p > 0) || actual === null || !(actual > 0)) return sinRespuesta("Falta el precio o el costo de hoy.");
  if (naturaleza !== "PACK") return sinRespuesta("El producto no tiene bulto: unidad y bulto son lo mismo.");
  // La misma lectura que la recepción (Emanuel, 2026-11-07): gana la que deja
  // menos diferencia contra el costo. Un pack del papel que no es la unidad ni
  // el bulto no tiene nombre acá: queda en null, que es preguntar.
  const d = deducirUnidad({ costoAnteriorFinal: actual, precioFacturaFinal: p, factorPack: factor, descripcion, variacionPct });
  const unidad = d.unidad === UNIDAD.POR_UNIDAD ? "UNIDAD" : d.unidad === UNIDAD.POR_BULTO ? "BULTO" : null;
  return { unidad, porque: d.porque ?? null, veredicto: d.unidad, unidadesPorFacturada: d.unidadesPorFacturada ?? null };
}

/**
 * CUÁNTAS TRAE EL BULTO DE LA FICHA, o null si el producto no tiene bulto.
 *
 * Solo un pack: un fiambre o un kilo guardan su costo por kilo y una unidad
 * suelta no agrupa, aunque la ficha traiga un `factor_pack` cargado. Es la
 * pregunta que listas se hacía en tres lugares con su propia cuenta
 * (`requiereConversionABulto` y `factorValido`, 2026-11-05), y la caja de la
 * ficha manda: nada la pisa.
 */
export function bultoDeLaFicha(base) {
  const { naturaleza, factor } = comoViene(base);
  return naturaleza === "PACK" ? factor : null;
}

/**
 * LOS PACKS INTERMEDIOS DE UN BULTO: los números que lo dividen, de 2 al
 * bulto sin incluirlo. Una caja de 24 da 2, 3, 4, 6, 8 y 12; una de 7, ninguno.
 *
 * Son los mismos que prueba la recepción cuando un papel cobra un pack del
 * bulto (`divisoresDelBulto`, sin la unidad suelta y sin el bulto entero, que
 * son las otras dos lecturas).
 */
export function packsDelBulto(bulto) {
  const b = Number(bulto);
  return divisoresDelBulto(b).filter((d) => d > 1 && d < b);
}

/**
 * EL COSTO DEL BULTO, DESDE UN PRECIO QUE ES DE `unidades` UNIDADES.
 *
 * De 1 —la unidad suelta— es el precio por el bulto; de un pack de n que lo
 * divide, el precio por los packs que entran; del bulto entero, el precio tal
 * cual. A precisión completa: el redondeo es de quien muestra o guarda. Es la
 * cuenta de la recepción (`lecturasPosibles`: precio × bulto ÷ unidades), en el
 * mismo orden, así un mismo precio contra un mismo bulto da el mismo costo en
 * listas y en recepción. Null si las unidades no dividen el bulto.
 *
 * @param bulto  cuántas trae el bulto (`bultoDeLaFicha`)
 */
export function costoDelBulto({ precio, unidades = 1, bulto } = {}) {
  const p = num(precio);
  const u = num(unidades);
  const b = num(bulto);
  if (p === null || u === null || b === null || !Number.isInteger(u) || !Number.isInteger(b) || u < 1 || b < 1) return null;
  if (b % u !== 0) return null;
  return p * (b / u);
}

/**
 * EL PRECIO DE UNA UNIDAD DE STOCK: el precio del bulto dividido lo que trae.
 *
 * ── CON LA LECTORA DE COMPRAS, DESDE LA TANDA 7 ──────────────────────────
 *
 * El factor sale de `comoViene`, la misma que ya trataba bien a compras. Hasta
 * la tanda 6 salía del `factor_pack` crudo, y eso partía al MANI CON CASCARA
 * X2KG (id 1881): su ficha dice factor 2 porque en el depósito se maneja por
 * bolsa de 2 kg, y en los locales se vende por kilo. Compras guardaba el costo
 * por kilo y stock lo dividía por 2, así que el unitario salía a la mitad.
 *
 * Para un pack común no cambia ningún número: `comoViene` le da el mismo
 * `bulto / unidad` de `unidadesDeStockPorEscalon` que se usaba antes. Solo
 * cambia el fiambre o el kilo con un `factor_pack` cargado, que pasan a factor 1.
 *
 * Es la cuenta que las pantallas de stock hacían a mano (`stock/mapItem`,
 * `stock_locales/obtener` y `stock_locales/buscar-producto`). Cada una conserva
 * su condición de cuándo mostrar el unitario; la división es ésta.
 */
export function precioDeLaUnidadDeStock({ precio, base } = {}) {
  const { factor } = comoViene(base);
  return factor > 1 ? precio / factor : precio;
}

/**
 * CUÁNTAS UNIDADES SUELTAS SON: la cantidad, dicha en "UNIDAD" o "BULTO".
 *
 * El bulto es el de la ficha (`comoViene`): solo un pack multiplica. Exacta,
 * sin redondear: una cantidad con decimales sigue con sus decimales.
 */
export function cantidadEnUnidades({ cantidad, unidad, base } = {}) {
  const c = num(cantidad);
  if (c === null) return null;
  return unidad === "BULTO" ? c * comoViene(base).factor : c;
}

/**
 * CUÁNTOS BULTOS SON ESTAS UNIDADES, CON FRACCIÓN (tanda 13).
 *
 * La inversa exacta de `cantidadEnUnidades`: 30 unidades de un pack de 12 son
 * 2,5 bultos. No parte en enteros y sueltas —eso es `fromUnidades`, y
 * `bultosDe` solo contesta si da entero—: es la cantidad de bultos que se
 * VALORIZA, con su costo por bulto. Sale tal cual de la recepción de compras,
 * que la escribía a mano en cuatro lugares (`contadas / factorPack`). Solo un
 * pack divide; el resto devuelve las mismas unidades. Conserva el signo.
 */
export function bultosEnFraccion({ unidades, base } = {}) {
  const u = num(unidades);
  if (u === null) return null;
  return u / comoViene(base).factor;
}

/**
 * UNAS UNIDADES, PARTIDAS EN BULTOS COMPLETOS Y SUELTAS (tanda 17).
 *
 * 54 unidades del Cheddar Feta Tonadita, bulto de 18: 3 completos y 0 sueltas
 * (pedido 564: el casillero "Bultos" mostraba 54). Con un factor de 1 o sin
 * factor, todo es completo.
 *
 * Parte con PISO, como lo hacían a mano la recepción —"Cuánto entró" y lo
 * contado en la escala—, el cierre, el catálogo del pedido de compras y la
 * preparación de un pedido entre ubicaciones: cinco copias de la misma cuenta
 * hasta el 2026-11-10. `fromUnidades` es otra pregunta —el stock, con su tercer
 * nivel de sueltos— y TRUNCA: −30 en bultos de 12 da −2 y −6, y esto da −3 y 6.
 * Con cero o más dan lo mismo. Las dos quedan acá, cada una con su nombre.
 *
 * @param unidades  las unidades, en la unidad que cuenta el depósito
 * @param factor    cuántas trae el bulto (el de la fila o el de la ficha)
 * @returns `{ completos, sueltas }` —sueltas a milésimas—, o null sin unidades
 */
export function bultosYSueltas({ unidades, factor } = {}) {
  const u = num(unidades);
  if (u === null) return null;
  const f = num(factor);
  if (f === null || f <= 1) return { completos: u, sueltas: 0 };
  const completos = Math.floor(u / f);
  return { completos, sueltas: Math.round((u - completos * f) * 1000) / 1000 };
}

/**
 * EL PRECIO DE UNA PIEZA, DESDE EL DEL KILO (tanda 17).
 *
 * El fiambre de peso fijo se maneja en el depósito por pieza y se vende en los
 * locales por kilo: la pieza vale el kilo por su peso de referencia, a
 * centavos. Lo hacían a mano el buscador del POS y los precios de stock, con
 * la misma expresión. Null sin peso.
 */
export function precioDeLaPieza({ precioPorKilo, pesoKg } = {}) {
  const p = num(precioPorKilo);
  const peso = num(pesoKg);
  if (p === null || peso === null || peso <= 0) return null;
  return Number((p * peso).toFixed(2));
}

/**
 * LO QUE NO SE SABE DE ANTEMANO: EN QUÉ FACTURA O COTIZA CADA PROVEEDOR.
 *
 * Se prueban las lecturas con nombre —por unidad, el bulto de la ficha, el
 * pack que dice el papel— contra el costo de hoy y gana la de menor %, si es
 * la única dentro de la variación o si la siguiente deja el triple. Si no, se
 * pregunta. La regla vive en `unidadPorPrecio.js` (`elegirLectura`), la usa
 * `deducirUnidad` y se pide desde acá.
 */
export { elegirLectura as lecturaDeMenorDiferencia } from "../compras-proveedor/comprobante/unidadPorPrecio.js";

/**
 * LAS UNIDADES SUELTAS, EN BULTOS ENTEROS DE LA FICHA.
 *
 * Un resto no se redondea solo —pedir un bulto de más es pedirle otra cosa al
 * proveedor—: se devuelve `entero: false` con los bultos que harían falta
 * hacia arriba, para preguntarlo.
 *
 * @returns `{ bultos, entero, bultosHaciaArriba, factor }`
 */
export function bultosDe({ unidades, base } = {}) {
  const u = num(unidades);
  const { factor } = comoViene(base);
  if (u === null) return { bultos: null, entero: false, bultosHaciaArriba: null, factor };
  if (u % factor !== 0) return { bultos: null, entero: false, bultosHaciaArriba: Math.ceil(u / factor), factor };
  return { bultos: u / factor, entero: true, bultosHaciaArriba: u / factor, factor };
}
