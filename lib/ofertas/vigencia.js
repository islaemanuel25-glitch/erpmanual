// lib/ofertas/vigencia.js
//
// CUÁNDO RIGE UNA OFERTA Y CUÁNDO DOS SE PISAN.
//
// Dos preguntas distintas que conviene no mezclar:
//
//   ofertaVigente()   — ¿esta oferta se aplica en este instante? Es lo que
//                       pregunta el POS antes de cobrar.
//   conflictoDeCarga()— ¿esta oferta nueva deja ambiguo el precio de algún
//                       producto? Es lo que pregunta la pantalla al guardar.
//
// La ventana es SEMIABIERTA: [inicioEn, finEn). Una oferta que termina el 11/09
// a las 23:59:59 deja de aplicarse en el instante `finEn`, no un segundo después
// ni un segundo antes. Con el extremo cerrado, dos ofertas consecutivas que se
// tocan en el mismo instante estarían las dos vigentes durante ese instante.
//
// Una oferta marcada para revisar SIGUE VIGENTE. Eso es a propósito y es lo que
// pidió el negocio: cambió el costo, hay que mirarlo, pero mientras tanto lo
// que está publicado en la góndola se respeta. El aviso no cambia el precio.

/** Condición de pago que exige la oferta para aplicarse. */
export const CONDICION_PAGO_OFERTA = {
  SOLO_EFECTIVO: "SOLO_EFECTIVO",
  CUALQUIER_MEDIO: "CUALQUIER_MEDIO",
};

export const CONDICION_PAGO_LABEL = {
  SOLO_EFECTIVO: "Solo efectivo",
  CUALQUIER_MEDIO: "Cualquier medio",
};

function aFecha(valor) {
  if (valor == null) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * ¿La oferta rige en este instante?
 *
 * Pide las tres cosas por separado y ninguna es redundante: publicada (alguien
 * la puso en la calle), no finalizada (nadie la bajó) y dentro de la ventana.
 *
 * @param {{publicadaEn?, finalizadaEn?, inicioEn, finEn}} oferta
 * @param {Date|string|number} [ahora]
 */
export function ofertaVigente(oferta, ahora = new Date()) {
  if (!oferta) return false;
  if (aFecha(oferta.publicadaEn) == null) return false;
  if (aFecha(oferta.finalizadaEn) != null) return false;

  const inicio = aFecha(oferta.inicioEn);
  const fin = aFecha(oferta.finEn);
  if (!inicio || !fin) return false;

  const t = (aFecha(ahora) ?? new Date()).getTime();
  return t >= inicio.getTime() && t < fin.getTime();
}

/**
 * ¿La venta cumple la condición de pago que la oferta exige?
 *
 * `mediosUsados` son los medios de la venta, sin importar cuánto se pagó con
 * cada uno: una oferta SOLO_EFECTIVO exige que el ÚNICO medio sea efectivo, así
 * que basta con mirar la lista. Un pago mixto de $9.999 en efectivo y $1 en
 * débito NO la cumple, y esa es exactamente la regla acordada.
 *
 * @param {string} condicionPago
 * @param {string[]} mediosUsados medios normalizados (enum MedioPago)
 */
export function cumpleCondicionPago(condicionPago, mediosUsados) {
  const medios = Array.isArray(mediosUsados) ? [...new Set(mediosUsados.filter(Boolean))] : [];
  if (medios.length === 0) return false;
  if (condicionPago === CONDICION_PAGO_OFERTA.SOLO_EFECTIVO) {
    return medios.length === 1 && medios[0] === "EFECTIVO";
  }
  // CUALQUIER_MEDIO y cualquier valor desconocido: se exige que haya medios,
  // nada más. Un valor desconocido NO habilita nada extra.
  return condicionPago === CONDICION_PAGO_OFERTA.CUALQUIER_MEDIO;
}

/**
 * ¿Se pisan dos ventanas [inicio, fin)?
 * Devuelve false si a alguna le falta un extremo: sin ventana no hay conflicto
 * que declarar, y la validación de fechas es otra y va antes.
 */
export function ventanasSeSolapan(a, b) {
  const ai = aFecha(a?.inicioEn);
  const af = aFecha(a?.finEn);
  const bi = aFecha(b?.inicioEn);
  const bf = aFecha(b?.finEn);
  if (!ai || !af || !bi || !bf) return false;
  return ai.getTime() < bf.getTime() && bi.getTime() < af.getTime();
}

/**
 * Valida la ventana de una oferta.
 * @returns {{valido:true, inicioEn:Date, finEn:Date} | {valido:false, error:string}}
 */
export function validarVentana({ inicioEn, finEn }) {
  const inicio = aFecha(inicioEn);
  const fin = aFecha(finEn);
  if (!inicio) return { valido: false, error: "La fecha de inicio no es válida." };
  if (!fin) return { valido: false, error: "La fecha de finalización no es válida." };
  if (fin.getTime() <= inicio.getTime()) {
    return { valido: false, error: "La finalización tiene que ser posterior al inicio." };
  }
  return { valido: true, inicioEn: inicio, finEn: fin };
}

/**
 * CONFLICTO DE CARGA: ¿esta oferta deja algún producto con dos precios posibles?
 *
 * La regla de la v1 es la más simple que no deja ambigüedad: para el MISMO
 * producto del MISMO local, DOS ofertas cuyas ventanas se solapan están en
 * conflicto, sin importar su condición de pago.
 *
 * Se podría haber permitido convivir una SOLO_EFECTIVO con una CUALQUIER_MEDIO,
 * y es tentador porque parecen complementarias. No lo son: en una venta 100 %
 * efectivo las DOS cumplen su condición, y ahí hay que decidir cuál gana. Esa
 * decisión es un motor de prioridades, y el pedido fue expreso: evitar la
 * ambigüedad desde la carga en vez de construir el motor. Si algún día se
 * necesita, se agrega una regla explícita y este comentario dice qué se
 * cambió y por qué.
 *
 * Las FINALIZADAS y las que nunca se publicaron no compiten: no rigen.
 *
 * @param {{id?:number, inicioEn, finEn, productoLocalIds:number[]}} nueva
 * @param {Array<{id:number, nombre:string, inicioEn, finEn, publicadaEn?, finalizadaEn?, productoLocalIds:number[]}>} existentes
 * @returns {Array<{ofertaId:number, ofertaNombre:string, productoLocalIds:number[]}>}
 */
export function conflictoDeCarga(nueva, existentes = []) {
  const idsNueva = new Set((nueva?.productoLocalIds || []).map(Number));
  if (idsNueva.size === 0) return [];

  const choques = [];
  for (const otra of existentes) {
    if (nueva?.id != null && Number(otra?.id) === Number(nueva.id)) continue; // ella misma
    if (aFecha(otra?.finalizadaEn) != null) continue;
    if (aFecha(otra?.publicadaEn) == null) continue;
    if (!ventanasSeSolapan(nueva, otra)) continue;

    const compartidos = (otra?.productoLocalIds || [])
      .map(Number)
      .filter((id) => idsNueva.has(id));
    if (compartidos.length > 0) {
      choques.push({
        ofertaId: Number(otra.id),
        ofertaNombre: otra.nombre || `Oferta #${otra.id}`,
        productoLocalIds: compartidos,
      });
    }
  }
  return choques;
}
