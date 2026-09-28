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
import { stockDelPeriodo } from "./stockDiarioServer.js";
import { vigenciasDeUbicaciones } from "@/lib/semanaOperativa/semanaOperativaServer";

/**
 * La semana es la de la Semana Operativa de la ubicación, con la vigencia que
 * regía ese día (`semanaQueContiene`). El mes y el año son calendario. Solo
 * agrupan días: el libro no cambia.
 */
export async function stockDeUnidad(db, { localId, unidad, fecha, hoy } = {}) {
  const l = exigirId(localId, "localId");
  exigirDia(fecha, "fecha");
  const vigencias = unidad === UNIDAD_DE_PERIODO.SEMANA ? (await vigenciasDeUbicaciones(db, [l])).get(l) ?? [] : [];
  const rango = rangoDeStock({ unidad, fecha, vigencias });
  const r = await stockDelPeriodo(db, { localId: l, desde: rango.desde, hasta: rango.hasta, hoy });
  return { ...r, unidad, semana: rango.semana };
}
