// lib/precios/propagarCostoALocales.js
//
// Cuando cambia el COSTO MAESTRO de un producto, cada ubicación donde ese producto
// se usa tiene que recalcular SU precio de venta con SU margen configurado. Si no,
// el costo sube y el precio se queda quieto: el local termina vendiendo por debajo
// del costo sin que nadie se entere.
//
// Reglas que implementa, y que son las del ERP:
//
//   · El margen configurado de la ubicación (`ProductoLocal.margen`) tiene
//     PRIORIDAD sobre el margen general (`ProductoBase.margen`). El de la base es
//     el fallback para las ubicaciones que no definieron el suyo.
//   · El recálculo parte SIEMPRE del margen configurado. Nunca se reconstruye un
//     margen dividiendo precio_venta por precio_costo: un margen reconstruido y
//     guardado con dos decimales arrastra un error que el redondeo hacia arriba
//     amplifica a $100 (130 × 3,8462 = 500,006 → 600).
//   · Cada ubicación se calcula por separado. El precio de una nunca se copia a
//     otra, y el precio del depósito no se copia a los locales.
//   · Se conserva el redondeo comercial a 100 hacia arriba de la ficha.
//   · Sin margen configurado NO hay regla automática y el precio no se toca: es el
//     único indicador que tiene el ERP de "precio puesto a mano". Esos casos se
//     devuelven aparte para que el llamador pueda avisar, porque son justamente los
//     que pueden quedar vendiendo bajo costo.

import { precioDesdeMargen, hayReglaAutomatica } from "./precioDesdeMargen.js";
import {
  REGLA_RECARGO,
  precioDesdeRecargoUnidad,
  hayRecargoConfigurado,
} from "./recargoFijoUnidad.js";

/**
 * Propaga un costo maestro nuevo a TODAS las ubicaciones del producto.
 *
 * @param db     cliente Prisma o transacción.
 * @param baseId id del ProductoBase.
 * @param costo  costo maestro nuevo, ya normalizado a la unidad almacenada.
 * @param margenBase   margen de la ficha (fallback de las ubicaciones sin margen).
 * @param redondeo100  si la ficha usa redondeo comercial a 100.
 * @param soloLocalId  opcional: limitar a una ubicación (para casos acotados).
 *
 * @returns { actualizadas, sinMargen } — `sinMargen` trae las ubicaciones cuyo
 *   precio no se pudo recalcular, con el dato de si quedaron por debajo del costo.
 */
export async function propagarCostoALocales(
  db,
  {
    baseId,
    costo,
    margenBase,
    redondeo100 = false,
    soloLocalId = null,
    // Necesarios para la regla de recargo fijo, que trabaja sobre el costo UNITARIO.
    unidadMedida = null,
    factorPack = null,
  } = {}
) {
  const costoNum = Number(costo);
  if (!Number.isFinite(costoNum) || costoNum <= 0) {
    return { actualizadas: [], sinMargen: [] };
  }

  const where = { baseId: Number(baseId) };
  if (soloLocalId != null) where.localId = Number(soloLocalId);

  const locales = await db.productoLocal.findMany({
    where,
    select: {
      id: true, localId: true, margen: true, precio_venta: true,
      reglaPrecio: true, recargoFijoUnidad: true,
    },
  });

  const actualizadas = [];
  const sinMargen = [];

  for (const local of locales) {
    const data = { precio_costo: costoNum };
    const porRecargo = local.reglaPrecio === REGLA_RECARGO;

    // Precedencia: margen de la ubicación; si no tiene, el de la ficha. En modo
    // recargo NO se mira ningún margen, ni el del local ni el de la ficha.
    const margenConfigurado = porRecargo ? null : (local.margen != null ? local.margen : margenBase);

    if (porRecargo) {
      // El recargo guardado entra como dato y sale igual: el redondeo puede hacer
      // que el recargo EFECTIVO sea mayor, pero eso no se persiste. Si se
      // persistiera, cada cambio de costo lo inflaría un escalón.
      const r = precioDesdeRecargoUnidad({
        costo: costoNum,
        recargoFijoUnidad: local.recargoFijoUnidad,
        unidadMedida,
        factorPack,
        redondeo100,
      });
      if (r.aplica) data.precio_venta = r.precioVenta;
    } else if (hayReglaAutomatica(margenConfigurado)) {
      const { aplica, precioFinal } = precioDesdeMargen({
        costo: costoNum,
        margenConfigurado,
        redondeo100,
      });
      if (aplica) data.precio_venta = precioFinal;
    }

    await db.productoLocal.update({ where: { id: local.id }, data });

    if (data.precio_venta !== undefined) {
      actualizadas.push({
        localId: local.localId,
        regla: porRecargo ? REGLA_RECARGO : "MARGEN_PORCENTUAL",
        margenConfigurado: porRecargo ? null : Number(margenConfigurado),
        recargoConfigurado: porRecargo ? Number(local.recargoFijoUnidad) : null,
        precioAnterior: local.precio_venta == null ? null : Number(local.precio_venta),
        precioNuevo: data.precio_venta,
      });
    } else {
      const ventaVigente = local.precio_venta == null ? null : Number(local.precio_venta);
      sinMargen.push({
        localId: local.localId,
        precioVenta: ventaVigente,
        // La situación peligrosa: sin margen no se recalcula y el precio quedó por
        // debajo del costo nuevo. No se pisa un precio manual en silencio, pero el
        // llamador tiene que poder verlo.
        bajoCosto: ventaVigente != null && ventaVigente < costoNum,
      });
    }
  }

  return { actualizadas, sinMargen };
}
