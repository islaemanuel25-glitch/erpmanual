import { MEDIOS_CONOCIDOS, UMBRAL_MARGEN_BAJO_PCT } from "./constantes";
import { comisionEsExacta } from "@/lib/pos-ventas/comisionPendiente";

/**
 * Bucket de medio para agregación: fiado prioriza esFiado.
 */
export function bucketMedioPago(venta) {
  if (venta.esFiado === true) return "fiado";
  const fp = String(venta.formaPago || "").toLowerCase().trim();
  if (MEDIOS_CONOCIDOS.includes(fp)) return fp;
  return "otros";
}

/**
 * El margen de un conjunto de ventas, o `null` si no se puede afirmar.
 *
 * `parcial` viene de `resumirExactitud`: cuando alguna venta del conjunto se
 * cobró sin la comisión configurada, su ganancia neta es un placeholder y el
 * margen del total sale MÁS ALTO que el real. Un número así no es una
 * aproximación, es una afirmación falsa, y por eso no se devuelve ninguno.
 */
export function margenPctFromSums(sumGananciaNeta, sumNetoRecibido, { parcial = false } = {}) {
  if (parcial) return null;
  const gn = Number(sumGananciaNeta) || 0;
  const nr = Number(sumNetoRecibido) || 0;
  if (nr === 0) return null;
  return (gn / nr) * 100;
}

/**
 * El estado de un ticket, o "pendiente" si su plata no está cerrada.
 *
 * Es el caso más caro de todos: con la comisión desconocida guardada como cero,
 * el margen sale inflado y un ticket que habría que mirar se presenta como
 * "normal". El control que existe para encontrar problemas se apagaría solo
 * justo en los tickets a los que les falta un dato.
 */
export function estadoTicket(gananciaNeta, netoRecibido, venta = null) {
  if (venta && !comisionEsExacta(venta)) return "pendiente";
  const gn = Number(gananciaNeta) || 0;
  const nr = Number(netoRecibido) || 0;
  if (gn < 0) return "pérdida";
  if (nr > 0) {
    const pct = (gn / nr) * 100;
    if (pct < UMBRAL_MARGEN_BAJO_PCT) return "margen bajo";
    return "normal";
  }
  return "normal";
}

export function estadoProducto(resultadoReal, ventaSubtotal) {
  const rr = Number(resultadoReal) || 0;
  const v = Number(ventaSubtotal) || 0;
  if (rr < 0) return "pérdida";
  if (v > 0) {
    const pct = (rr / v) * 100;
    if (pct >= 0 && pct < UMBRAL_MARGEN_BAJO_PCT) return "margen bajo";
  }
  return "normal";
}
