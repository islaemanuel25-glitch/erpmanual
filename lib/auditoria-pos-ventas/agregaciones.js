import { MEDIOS_CONOCIDOS, UMBRAL_MARGEN_BAJO_PCT } from "./constantes";

/**
 * Bucket de medio para agregación: fiado prioriza esFiado.
 */
export function bucketMedioPago(venta) {
  if (venta.esFiado === true) return "fiado";
  const fp = String(venta.formaPago || "").toLowerCase().trim();
  if (MEDIOS_CONOCIDOS.includes(fp)) return fp;
  return "otros";
}

export function margenPctFromSums(sumGananciaNeta, sumNetoRecibido) {
  const gn = Number(sumGananciaNeta) || 0;
  const nr = Number(sumNetoRecibido) || 0;
  if (nr === 0) return null;
  return (gn / nr) * 100;
}

export function estadoTicket(gananciaNeta, netoRecibido) {
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
