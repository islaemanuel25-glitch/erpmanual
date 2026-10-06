// lib/reportes-ventas/resumenVentas.js
//
// EL RESUMEN DE VENTAS DE UN PERÍODO: QUÉ VENTAS ENTRAN Y CÓMO SE SUMAN.
//
// ── POR QUÉ EXISTE COMO PIEZA APARTE ───────────────────────────────────────
//
// Lo escribía entero `app/api/reportes-ventas/general/route.js`: el `where`
// comercial del período, el `select` de importes y pagos, los totales y el
// desglose por medio. La integración con Azul Chat necesita EXACTAMENTE esos
// números, y la salida fácil era copiarlos al lado. Dos copias de un total de
// ventas no se rompen el día que se escriben: se rompen el día que una agrega
// un filtro —una anulada, una interna— y la otra no.
//
// Por eso se sacó del endpoint TAL CUAL estaba, sin cambiar una fórmula, y el
// endpoint pasó a consumirla. Lo que sigue siendo solo del endpoint —el alcance
// por cookie, el filtro por medio que viene en la URL, el ranking de productos—
// se quedó allá.
//
// ── LO QUE DECIDE Y DE DÓNDE LO TOMA ───────────────────────────────────────
//
//   · Qué es una venta: `whereVentaComercial` — sin anuladas y sin internas
//     (las que tienen remito de transferencia).
//   · Qué es un día: `getRangoArgentina` — de 00:00 a 23:59:59.999 en Argentina,
//     aunque el contenedor corra en UTC.
//   · Cómo se reparte entre medios: `tendersParaAgregar` — cada `VentaPago`
//     aporta su monto a su medio; una venta histórica sin filas cae en su
//     `formaPago`, y si es fiada, en FIADO.
//   · Si la comisión está cerrada: `resumirExactitud`.
//
// Las correcciones de venta son IN-PLACE (`Venta.version`, `VentaPago`
// reescritos; ver `VentaCorreccion`), así que leer las filas vigentes ya trae el
// importe corregido. No hay que reconstruir nada, y no se usan precios actuales.
//
// Sin Prisma adentro: arma el `where` y el `select` y suma lo que le pasen. La
// consulta la hace quien la llama.

import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
import { getRangoArgentina } from "@/lib/fechas/rangoArgentina";
import { tendersParaAgregar, normalizarMedio } from "@/lib/pos-ventas/pagos";
import { resumirExactitud } from "@/lib/pos-ventas/comisionPendiente";

/**
 * El `where` de Venta de un período, ya comercial.
 *
 * @param {object} args
 * @param {string} args.fechaDesde YYYY-MM-DD, día argentino.
 * @param {string} args.fechaHasta YYYY-MM-DD, día argentino.
 * @param {number|object} args.localId un id, o una condición Prisma (`{ in: [...] }`).
 * @param {string|null} [args.formaPago] filtro por medio, como lo manda la URL del reporte.
 */
export function whereVentasDelPeriodo({ fechaDesde, fechaHasta, localId, formaPago = null }) {
  // Rango en hora Argentina (UTC-3) para que las ventas de la noche
  // no se corran un día cuando el contenedor corre en UTC.
  const { fechaInicio, fechaFin } = getRangoArgentina(fechaDesde, fechaHasta);

  const where = {
    fecha: {
      gte: fechaInicio,
      lte: fechaFin,
    },
    localId,
  };

  if (formaPago) {
    // Filtro por medio: una venta coincide si TIENE al menos un tender de ese medio.
    const medioNorm = normalizarMedio(formaPago);
    if (medioNorm) where.pagos = { some: { medio: medioNorm } };
    else where.formaPago = formaPago; // compat con valores legacy no mapeables
  }

  return whereVentaComercial(where);
}

/**
 * Lo que hace falta de cada venta para resumir y desglosar. Sin `detalles`: el
 * ranking de productos es del reporte y lo agrega él.
 */
export const SELECT_RESUMEN_VENTA = Object.freeze({
  id: true,
  total: true,
  subtotal: true,
  descuento: true,
  comisionBancaria: true,
  netoRecibido: true,
  // Obligatorio: `comisionEsExacta` falla cerrado, así que sin este campo
  // el reporte contaría todas sus ventas como pendientes.
  comisionPendiente: true,
  costoTotal: true,
  gananciaBruta: true,
  gananciaNeta: true,
  formaPago: true,
  esFiado: true,
  pagos: { select: { medio: true, monto: true, comision: true, neto: true } },
});

/**
 * Los totales de un conjunto de ventas, en números. Quien los muestra decide
 * cómo escribirlos.
 */
export function resumirVentas(ventas = []) {
  let totalBruto = 0;
  let totalDescuentos = 0;
  let totalComisiones = 0;
  let totalNeto = 0;
  let totalCostos = 0;
  let gananciaNeta = 0;

  ventas.forEach((v) => {
    totalBruto += Number(v.total);
    totalDescuentos += Number(v.descuento);
    totalComisiones += Number(v.comisionBancaria);
    totalNeto += Number(v.netoRecibido);
    totalCostos += Number(v.costoTotal);
    gananciaNeta += Number(v.gananciaNeta);
  });

  return {
    cantidadVentas: ventas.length,
    totalBruto,
    totalDescuentos,
    totalComisiones,
    totalNeto,
    totalCostos,
    gananciaNeta,
    // `totalComisiones` son las CONOCIDAS —el total real es mayor— y el neto
    // y la ganancia están sobreestimados. El desglose por medio arrastra lo
    // mismo, porque sus tenders traen el cero estructural.
    estadoFinanciero: resumirExactitud(ventas),
  };
}

/**
 * Desglose por medio de pago — POR TENDER: cada pago aporta SU monto al bucket
 * de su medio (una venta mixta suma parcialmente en varios). La suma de buckets
 * coincide con el total de ventas. `cantidad` cuenta tenders de ese medio.
 *
 * @returns {Array<{formaPago:string, cantidad:number, total:number, comision:number, neto:number}>}
 */
export function desglosarPorMedio(ventas = []) {
  const desglosePagoMap = {};
  ventas.forEach((v) => {
    for (const t of tendersParaAgregar(v)) {
      const key = t.medio.toLowerCase();
      if (!desglosePagoMap[key]) {
        desglosePagoMap[key] = { formaPago: key, cantidad: 0, total: 0, comision: 0, neto: 0 };
      }
      desglosePagoMap[key].cantidad++;
      desglosePagoMap[key].total += t.monto;
      desglosePagoMap[key].comision += t.comision;
      desglosePagoMap[key].neto += t.neto;
    }
  });
  return Object.values(desglosePagoMap);
}
