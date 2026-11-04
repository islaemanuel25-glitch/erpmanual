// UN PEDIDO QUE NACE DE UNA FACTURA.
//
// ── EL CASO ───────────────────────────────────────────────────────────────
//
// Llega mercadería de un proveedor al que nadie le pidió nada. Hasta hoy no
// había forma de recibirla: todo el circuito de recepción —las tarjetas, el
// precio, la ganancia, el cierre que mueve el stock— cuelga de un pedido, y no
// había ninguno.
//
// La entrada es la que ya estaba dibujada en Recibir mercadería: se elige el
// proveedor, se le saca una foto al papel, y el pedido SE ARMA CON LO QUE EL
// PAPEL DICE. De ahí en adelante es una recepción igual a todas.
//
// ── POR QUÉ ESTO NO ES "CREAR UN PEDIDO CON ITEMS" ────────────────────────
//
// Porque los renglones no los elige una persona: los dicta el papel, y a qué
// producto corresponde cada uno lo decide LA MISMA CASCADA DE VÍNCULO que usa
// la recepción —código del proveedor, alias, universo del proveedor, catálogo—.
// Acá no se busca nada ni se interpreta nada: se recibe la línea ya analizada y
// se decide qué línea de pedido hace falta para poder recibirla.
//
// ── LAS TRES DECISIONES QUE ESTE MÓDULO TOMA, Y SUS PORQUÉS ───────────────
//
// 1. SOLO SE SIEMBRA LO QUE TIENE PRODUCTO. Una línea que la cascada no supo
//    vincular NO crea ninguna línea de pedido: crearla contra un producto
//    adivinado escribiría un costo en el producto equivocado, que es
//    exactamente el daño que la cascada existe para evitar. Esas líneas quedan
//    en la pantalla pidiendo "Corregir", y al vincularlas a mano su línea de
//    pedido se crea ahí.
//
// 2. UN PRODUCTO, UNA LÍNEA DE PEDIDO. Si el papel trae el mismo producto en
//    dos renglones, las dos apuntan a la misma línea del pedido y las
//    cantidades se SUMAN. Crear dos líneas del mismo producto duplicaría el
//    producto en el pedido, que es algo que en 2.675 pedidos medidos nunca pasó.
//
// 3. LA CANTIDAD SALE DE LA ESCALA QUE LA LECTURA RESOLVIÓ. Si el análisis supo
//    que la factura cobra por unidad y el bulto trae 10, la línea del pedido
//    queda en BULTOS con el número convertido, que es la escala en la que se
//    recibe. Si el análisis NO lo supo, se guarda el número crudo del papel en
//    UNIDAD: es el único número que existe y no se inventa ninguna conversión.
//
// El precio de la línea es EL PRECIO INTERNO DEL ERP del producto, no el de la
// factura. Es lo que hace que la comparación de precio y la cuenta de la
// ganancia funcionen igual que en un pedido normal: de un lado lo que el
// proveedor factura, del otro lo que el depósito tiene puesto. Si se guardara
// el precio del papel, los dos lados serían el mismo número y la ganancia daría
// cero siempre — el mismo agujero que el total que se rellenaba con la suma de
// las líneas.
//
// Módulo puro: sin React y sin Prisma.

import { cantidadEnEscalaDelPedido } from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import { CAMBIO_PLAUSIBLE_PCT } from "@/lib/compras-proveedor/comprobante/unidadPorPrecio";

// `Number(null)` es 0, y ese cero ya se coló una vez en este módulo haciendo
// pasar un precio que faltaba por un precio de cero. Acá haría que una línea sin
// cantidad creara una línea de pedido de CERO unidades, que se recibe sola y no
// la mira nadie.
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * En qué escala y con qué número entra una línea del papel al pedido.
 *
 * Devuelve `null` cuando no hay ningún número utilizable: sin cantidad no hay
 * línea de pedido que crear.
 */
export function cantidadParaElPedido(fila) {
  const cruda = num(fila?.cantidad);
  // `cantidadEnEscalaDelPedido` devuelve BULTOS cuando la lectura resolvió la
  // unidad, y el número crudo cuando no. La única forma de distinguir los dos
  // casos es preguntar por la decisión, no por el número: pueden ser iguales.
  //
  // Y NO SE LE PREGUNTA CUANDO NO RESOLVIÓ, a propósito: con `cantidad` en null
  // esa función devuelve 0 —`Number(null)` es 0, el mismo cero de siempre— y
  // acá un cero significaría crear una línea de pedido de cero unidades, que se
  // recibe sola y no la mira nadie.
  const resolvio = Boolean(fila?.unidad) && fila.unidad.requiereDecision !== true;
  const enEscala = resolvio ? num(cantidadEnEscalaDelPedido(fila)) : null;
  if (resolvio && enEscala !== null) return { cantidad: enEscala, unidad: "BULTO" };
  if (cruda === null) return null;
  return { cantidad: cruda, unidad: "UNIDAD" };
}

/**
 * QUÉ LÍNEAS DE PEDIDO HACEN FALTA PARA PODER RECIBIR ESTE PAPEL.
 *
 * @param filas     las líneas ya analizadas, con su `productoBaseId` resuelto
 *                  por la cascada —o null si no se pudo—.
 * @param detalles  las líneas que el pedido YA tiene, aplanadas:
 *                  `[{ id, productoBaseId }]`.
 *
 * @returns {{ aCrear, aEnlazar, sinProducto }}
 *   · `aCrear`      una por producto que todavía no está en el pedido, con la
 *                   cantidad ya sumada entre todos sus renglones.
 *   · `aEnlazar`    renglones cuyo producto YA tiene línea de pedido: solo hay
 *                   que atarlos.
 *   · `sinProducto` cuántos renglones quedaron sin vincular, que es el número
 *                   que la pantalla tiene que poder decir.
 */
export function loQueHayQueSembrar({ filas = [], detalles = [] } = {}) {
  const lista = Array.isArray(filas) ? filas : [];
  const existentes = new Map();
  for (const d of Array.isArray(detalles) ? detalles : []) {
    const base = d?.productoBaseId ?? null;
    if (base != null && !existentes.has(base)) existentes.set(base, d.id);
  }

  const aCrear = new Map();
  const aEnlazar = [];
  // Lo que el papel dicta HOY para las líneas que ya existen, sumado igual que
  // `aCrear`. No se escribe acá: decide `lineaSembradaQueRehacer`.
  const dictado = new Map();
  let sinProducto = 0;

  /** Suma un renglón al acumulado de su producto, con la regla de la escala. */
  const acumular = (mapa, base, cuanto, f, extra = {}) => {
    const acumulado = mapa.get(base);
    if (acumulado) {
      // El mismo producto en dos renglones: una sola línea de pedido con la
      // suma. La escala de la primera manda; mezclarlas sería sumar bultos con
      // unidades, que es el error que esta función existe para no cometer.
      acumulado.cantidad += cuanto.unidad === acumulado.unidad ? cuanto.cantidad : 0;
      acumulado.lineas.push(f.id);
      if (cuanto.unidad !== acumulado.unidad) acumulado.escalasMezcladas = true;
      return;
    }
    mapa.set(base, {
      ...extra,
      productoBaseId: base,
      cantidad: cuanto.cantidad,
      unidad: cuanto.unidad,
      lineas: [f.id],
      escalasMezcladas: false,
    });
  };

  for (const f of lista) {
    // Un envase no es un producto que faltó elegir: no va al pedido ni cuenta
    // como "sin producto". Ver `comprobante/envase.js`.
    if (f?.envase === true) continue;
    const base = f?.productoBaseId ?? null;
    if (base == null) {
      sinProducto += 1;
      continue;
    }
    const cuanto = cantidadParaElPedido(f);
    if (cuanto === null) {
      sinProducto += 1;
      continue;
    }

    const yaEsta = existentes.get(base);
    if (yaEsta != null) {
      aEnlazar.push({ lineaId: f.id, productoBaseId: base, detalleId: yaEsta });
      acumular(dictado, base, cuanto, f, { detalleId: yaEsta });
      continue;
    }

    acumular(aCrear, base, cuanto, f);
  }

  return { aCrear: [...aCrear.values()], aEnlazar, sinProducto, dictadoDeLasExistentes: [...dictado.values()] };
}

/**
 * ¿ESTA LÍNEA SEMBRADA QUEDÓ VIEJA? Si sí, con qué se rehace; si no, null.
 *
 * ── EL DEFECTO QUE LA TRAJO ───────────────────────────────────────────────
 *
 * Nutrisur, pedido 491 (2026-11-04), DURAZNO LATA ALCO. El pedido se sembró
 * con el producto todavía mal cargado: sin pack y a $1.500. Sin pack no hay
 * escala que deducir, así que la línea quedó en 12 BULTO a $1.500 —la cantidad
 * cruda del papel y el costo de ese momento—. Después el producto se corrigió a
 * pack de 12 y $38.400, y la línea siguió con la foto vieja: la tarjeta
 * comparaba $39.271 el pack del papel contra $1.500, frenaba con "No se puede
 * saber en qué viene" y el aumento del 2,3 % nunca se ofrecía. Ni releer ni
 * volver a vincular lo arreglaba: la siembra solo creaba lo que faltaba.
 *
 * ── LO QUE SE REHACE, Y LO QUE NO SE TOCA NUNCA ───────────────────────────
 *
 * En un pedido nacido de factura la línea no la eligió nadie: la cantidad la
 * dicta el papel y el precio es el interno del ERP. Si el precio de la línea
 * ya no se parece al que la siembra escribiría hoy —más lejos que
 * `CAMBIO_PLAUSIBLE_PCT`, el salto que ningún precio da de una compra a otra—
 * es una foto de un producto que cambió, y se rehace entera: cantidad, unidad
 * y precio, como si se sembrara ahora.
 *
 * No se toca si alguien ya hizo algo sobre ella, porque ahí el número es una
 * decisión y no una foto: si ya se contó lo recibido, o si ya se aceptó un
 * precio del papel sobre ella. Un precio puesto a mano que se parece al del
 * ERP tampoco: está dentro de lo plausible y la regla no lo alcanza.
 *
 * @param detalle            la línea del pedido: `{ cantidad, unidad, precioCosto,
 *                           cantidadRecibida, unidadesFisicas, kgRecibidos }`
 * @param dictado            lo que el papel dicta hoy: `{ cantidad, unidad, escalasMezcladas }`
 * @param precioEnSuUnidad   el precio que la siembra escribiría hoy en la unidad
 *                           que la línea TIENE (para comparar)
 * @param precioDictado      el que escribiría en la unidad dictada (para escribir)
 * @param conPrecioAceptado  si algún renglón del papel ya aceptó precio sobre ella
 * @returns `{ cantidad, unidad, precioCosto }` o null
 */
export function lineaSembradaQueRehacer({
  detalle,
  dictado,
  precioEnSuUnidad,
  precioDictado,
  conPrecioAceptado = false,
} = {}) {
  if (!detalle || !dictado || dictado.escalasMezcladas === true) return null;
  if (conPrecioAceptado) return null;
  if (num(detalle.cantidadRecibida) !== null || num(detalle.unidadesFisicas) !== null || num(detalle.kgRecibidos) !== null) {
    return null;
  }
  const hoy = num(precioEnSuUnidad);
  const nuevo = num(precioDictado);
  if (hoy === null || !(hoy > 0) || nuevo === null) return null;
  const tiene = num(detalle.precioCosto);
  const vieja = tiene === null || (Math.abs(tiene - hoy) / hoy) * 100 > CAMBIO_PLAUSIBLE_PCT;
  if (!vieja) return null;
  return { cantidad: dictado.cantidad, unidad: dictado.unidad, precioCosto: nuevo };
}

/**
 * El resumen que la pantalla y el informe necesitan, en una sola forma.
 *
 * `vincularonSolas` son los renglones que la cascada ató sin preguntar; los
 * otros son los que alguien va a tener que mirar. Los dos números juntos son la
 * respuesta a "¿cuánto trabajo quedó?".
 */
export function resumenDeLaSiembra({ aCrear = [], aEnlazar = [], sinProducto = 0 } = {}) {
  const vincularonSolas = aCrear.reduce((a, c) => a + c.lineas.length, 0) + aEnlazar.length;
  return {
    productos: aCrear.length,
    vincularonSolas,
    sinVincular: sinProducto,
    renglones: vincularonSolas + sinProducto,
  };
}
