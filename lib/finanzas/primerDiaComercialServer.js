// lib/finanzas/primerDiaComercialServer.js
//
// EL TOPE HACIA ATRÁS DE UN PERÍODO SALE DEL DATO, NO DE UN NÚMERO.
//
// "Hasta N períodos atrás" es inventado: con N chico se tapa historia que
// existe y con N grande igual se llega a meses vacíos. Lo único que no es
// arbitrario es la PRIMERA venta comercial del local: antes de esa fecha está
// probado que no hubo actividad. Lo usan el tablero de Finanzas y Tesorería, que
// navegan los mismos períodos.
//
// Es un `findFirst` ordenado y acotado: una fila por el índice de `localId` +
// `fecha`.

import { whereVentaComercial } from "../ventas/filtroVentaComercial.js";
import { fechaArgentinaISO } from "../fechas/rangoArgentina.js";

/**
 * @returns {Promise<string|null>} día argentino `YYYY-MM-DD` de la primera venta
 *   comercial del local, o null si nunca vendió.
 */
export async function primerDiaComercialDelLocal(db, localId) {
  const primera = await db.venta.findFirst({
    where: whereVentaComercial({ localId }),
    orderBy: { fecha: "asc" },
    select: { fecha: true },
  });
  // ISO ARGENTINO, no `toISOString()`. Aquél es UTC, y una primera venta de las
  // 22:00 se leería como del día siguiente: la flecha de atrás se apagaría un
  // día antes de tiempo y esa venta quedaría inalcanzable.
  return primera ? fechaArgentinaISO(primera.fecha) : null;
}
