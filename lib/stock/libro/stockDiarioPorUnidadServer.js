// lib/stock/libro/stockDiarioPorUnidadServer.js
//
// EL STOCK DE UN LOCAL EN LA SEMANA, EL MES O EL AÑO QUE CONTIENE UN DÍA.
//
// Separado de `stockDiarioServer.js` por una sola razón: la semana necesita las
// vigencias de Semana Operativa, y su servidor importa el cliente de la app
// (`@/lib/prisma`), que trae el interceptor de auditoría y con él `next/server`.
// El motor de días y períodos no lo necesita, y la sonda de la terminal no puede
// cargarlo dentro de la imagen. La lógica no cambia: esto es la misma función,
// en su propio módulo.

import { exigirDia, exigirId, rangoDeStock, UNIDAD_DE_PERIODO } from "./stockDiario.js";
import { hoyDelLibro, stockDelPeriodo } from "./stockDiarioServer.js";
import { vigenciasDeUbicaciones } from "@/lib/semanaOperativa/semanaOperativaServer";

/**
 * EL RANGO `{desde, hasta}` DE UN PEDIDO: una unidad y un día que la contiene, o
 * un rango explícito. Sin día, el de hoy según PostgreSQL —el mismo reloj que
 * estampa el libro—, nunca el de Node.
 *
 * La semana es la de la Semana Operativa de la ubicación, con la vigencia que
 * regía ese día (`semanaQueContiene`). El mes y el año son calendario. Solo
 * agrupan días: el libro no cambia.
 *
 * @returns {{ unidad: string, fecha: string|null, desde: string, hasta: string, semana: object|null }}
 */
export async function rangoDelPedido(db, { localId, unidad, fecha = null, desde = null, hasta = null } = {}) {
  const l = exigirId(localId, "localId");
  if (desde !== null || hasta !== null) {
    exigirDia(desde, "desde");
    exigirDia(hasta, "hasta");
    return { unidad: UNIDAD_DE_PERIODO.RANGO, fecha: null, desde, hasta, semana: null };
  }
  const dia = fecha ?? (await hoyDelLibro(db));
  exigirDia(dia, "fecha");
  const vigencias = unidad === UNIDAD_DE_PERIODO.SEMANA ? (await vigenciasDeUbicaciones(db, [l])).get(l) ?? [] : [];
  const rango = rangoDeStock({ unidad, fecha: dia, vigencias });
  return { unidad, fecha: dia, desde: rango.desde, hasta: rango.hasta, semana: rango.semana };
}

/** El stock de la unidad que contiene la fecha: el rango de arriba, y `stockDelPeriodo`. */
export async function stockDeUnidad(db, { localId, unidad, fecha, hoy } = {}) {
  exigirDia(fecha, "fecha");
  const rango = await rangoDelPedido(db, { localId, unidad, fecha });
  const r = await stockDelPeriodo(db, { localId, desde: rango.desde, hasta: rango.hasta, hoy });
  return { ...r, unidad, semana: rango.semana };
}
