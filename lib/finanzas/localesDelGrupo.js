// lib/finanzas/localesDelGrupo.js
//
// LA CONSULTA QUE TRAE LOS LOCALES DE FINANZAS.
//
// Vive aparte de `alcanceFinanciero.js` —que decide QUIÉNES entran— por el mismo
// motivo por el que `destinosDeTransferencia` está separado de
// `relacionesDelDeposito`: así el criterio se puede ejercer con candados sin
// levantar una base, y la consulta no se repite en cada ruta.
//
// ── LAS DOS TABLAS, Y NO UNA ─────────────────────────────────────────────
//
// El depósito sale de `GrupoDeposito` y los locales de `GrupoLocal`, y hay que
// leer las dos: en producción el depósito del grupo NO está en `GrupoLocal`.
// Está medido y anotado en `lib/transferencias/relacionesDelDeposito.js`, que
// hace la misma unión por la misma razón. Quedarse con una sola tabla dejaría al
// depósito afuera, que es justamente lo que Finanzas no puede permitirse.

import prisma from "@/lib/prisma";

import { localesFinancieros } from "./alcanceFinanciero";

/**
 * Las columnas, y las cuatro son obligatorias.
 *
 * `activo` no es opcional: sin ella llega `undefined` y `localesFinancieros`
 * —que exige `=== true`— marca a TODOS como inactivos. Falla ruidoso a propósito,
 * y la forma de no pagarlo es pedir la columna.
 */
const SELECT_LOCAL = { id: true, nombre: true, activo: true, es_deposito: true };

/**
 * @param {number} grupoId
 * @param {object} [db] el cliente con el que leer. Por defecto el global; un
 *        pago lo pasa desde adentro de su transacción, para que la ubicación de
 *        origen se compruebe con la misma conexión que después escribe.
 * @returns {Promise<{deposito: object|null, locales: Array}>} `locales` ya viene
 *          ordenado y con `esDeposito` / `inactivo` resueltos.
 */
export async function localesDeFinanzas(grupoId, db = prisma) {
  if (!grupoId) return { deposito: null, locales: [] };

  const [gd, vinculos] = await Promise.all([
    db.grupoDeposito.findFirst({
      where: { grupoId },
      select: { local: { select: SELECT_LOCAL } },
    }),
    db.grupoLocal.findMany({
      where: { grupoId },
      select: { local: { select: SELECT_LOCAL } },
    }),
  ]);

  const deposito = gd?.local || null;
  const locales = localesFinancieros({
    deposito,
    locales: (vinculos || []).map((v) => v.local).filter(Boolean),
  });

  return { deposito, locales };
}
