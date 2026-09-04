// lib/ofertas/revision.js
//
// CAMBIÓ EL COSTO DE UN PRODUCTO EN OFERTA: QUÉ SE HACE Y QUÉ NO.
//
// LO QUE NO SE HACE: tocar el precio de oferta. Nunca, ni un centavo, ni
// automáticamente ni "proporcionalmente". El precio que está publicado en la
// góndola es un compromiso con el cliente que entró al local por él; moverlo
// solo porque subió una factura es cambiar el precio a espaldas de quien lo
// decidió. La oferta sigue aplicándose EXACTAMENTE como está configurada.
//
// LO QUE SÍ SE HACE: marcar la línea para que una persona lo mire, y mostrarle
// los números para que decida en diez segundos: cuánto era el costo, cuánto es
// ahora, cuánto se movió, y en cuánto le quedó el margen. La decisión —bancarlo,
// subir el precio de oferta, o sacar el producto de la oferta— es humana.
//
// La marca se pone en `OfertaLinea.revisionPendienteDesde` y de ahí sale el
// estado REVISAR de toda la oferta (ver `estados.js`). Se levanta cuando alguien
// confirma la revisión, y al confirmarla se vuelve a fotografiar el costo: a
// partir de ahí el costo de referencia es el nuevo.

import { round2 } from "@/lib/pos-ventas/pagos.js";
import { round2Pct, margenOferta } from "./precio.js";

/**
 * ¿Cambió el costo respecto del de referencia?
 *
 * Se marca por CUALQUIER cambio, para arriba o para abajo, y no hay umbral
 * configurable. Un costo que baja también es información que cambia la decisión
 * —se puede trasladar la baja al cliente— y un umbral inventado acá sería una
 * regla de negocio que nadie pidió, escondida en una constante.
 *
 * La comparación es en centavos enteros para no marcar una línea por el ruido
 * de coma flotante de dos valores que son el mismo número.
 */
export function costoCambio(costoReferencia, costoActual) {
  // `null` y `""` NO se convierten con Number(): darían 0, y un costo ausente se
  // leería como "costo cero", que es un número perfectamente comparable. Una
  // línea sin costo de referencia quedaría marcada para siempre contra un cero
  // que nadie cargó. Ausente es ausente: no se compara nada.
  const ref = ausente(costoReferencia) ? NaN : Number(costoReferencia);
  const act = ausente(costoActual) ? NaN : Number(costoActual);
  if (!Number.isFinite(ref) || !Number.isFinite(act)) return false;
  return Math.round(ref * 100) !== Math.round(act * 100);
}

function ausente(v) {
  return v == null || v === "";
}

/**
 * Los números que se le muestran a la persona cuando una línea pide revisión.
 * Todo derivado: nada de esto se guarda, se calcula contra el costo de
 * referencia congelado y el costo de hoy.
 *
 * @param {{costoReferencia:number, costoActual:number, precioOferta:number, precioNormalReferencia?:number}} datos
 */
export function resumenCambioDeCosto({
  costoReferencia,
  costoActual,
  precioOferta,
  precioNormalReferencia,
}) {
  const anterior = round2(Number(costoReferencia) || 0);
  const actual = round2(Number(costoActual) || 0);
  const variacion = round2(actual - anterior);
  const variacionPct = anterior > 0 ? round2Pct((variacion / anterior) * 100) : null;

  const margenAnterior = margenOferta(precioOferta, anterior);
  const margenActual = margenOferta(precioOferta, actual);

  return {
    costoAnterior: anterior,
    costoActual: actual,
    variacion,
    variacionPct,
    precioOferta: round2(Number(precioOferta) || 0),
    precioNormalReferencia:
      precioNormalReferencia != null ? round2(Number(precioNormalReferencia)) : null,
    margenAnterior: margenAnterior.importe,
    margenAnteriorPct: margenAnterior.pct,
    margenActual: margenActual.importe,
    margenActualPct: margenActual.pct,
    // Que el margen haya quedado en rojo es un hecho aparte de que el costo
    // haya cambiado: una oferta puede nacer bajo costo a propósito.
    margenNegativo: margenActual.importe < 0,
    subio: variacion > 0,
  };
}

/**
 * Texto corto del aviso, el mismo que se usa en la notificación y en la tarjeta.
 * Se arma acá para que los dos lugares no se desincronicen.
 *
 * Ejemplo: "Cambió el costo de Nueve de Oro: $650 → $820 (+26,15 %). Precio
 * oferta: $900. Margen actual: $80."
 */
export function textoCambioDeCosto(nombreProducto, resumen) {
  const signo = resumen.variacionPct != null && resumen.variacionPct > 0 ? "+" : "";
  const pct =
    resumen.variacionPct != null
      ? ` (${signo}${String(resumen.variacionPct).replace(".", ",")} %)`
      : "";
  return (
    `Cambió el costo de ${nombreProducto}: $${resumen.costoAnterior} → $${resumen.costoActual}${pct}. ` +
    `Precio oferta: $${resumen.precioOferta}. Margen actual: $${resumen.margenActual}.`
  );
}

/**
 * Decide qué líneas hay que marcar y cuáles hay que desmarcar, comparando el
 * costo de referencia congelado contra el costo de hoy.
 *
 * Devuelve también las que hay que DESMARCAR: si el costo volvió al valor de
 * referencia —una carga equivocada que se corrigió— la línea deja de pedir
 * revisión sola. Sin esto, un error de tipeo dejaría una oferta en REVISAR para
 * siempre y la gente aprendería a ignorar el aviso.
 *
 * @param {Array<{id:number, costoReferencia:any, revisionPendienteDesde:any}>} lineas
 * @param {Record<number, number>} costoActualPorLinea  { [ofertaLineaId]: costo }
 * @returns {{marcar:number[], desmarcar:number[]}}
 */
export function planDeRevision(lineas = [], costoActualPorLinea = {}) {
  const marcar = [];
  const desmarcar = [];

  for (const linea of lineas) {
    const actual = costoActualPorLinea?.[linea?.id];
    if (actual == null) continue; // sin costo actual conocido no se decide nada
    const cambio = costoCambio(linea?.costoReferencia, actual);
    const yaMarcada = linea?.revisionPendienteDesde != null;

    if (cambio && !yaMarcada) marcar.push(linea.id);
    if (!cambio && yaMarcada) desmarcar.push(linea.id);
  }
  return { marcar, desmarcar };
}
