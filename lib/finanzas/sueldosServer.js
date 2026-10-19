// lib/finanzas/sueldosServer.js
//
// SUELDOS: la lectura de la pantalla Finanzas → Sueldos. Solo lee.
//
// Pagar un sueldo NO vive acá: es `crearGasto` con su pago inicial, la misma
// puerta que usa "Pagar" del POS, y la regla —empleado activo del local y
// modalidad— la impone ella. Asignar el empleado a un sueldo viejo tampoco: es
// `asignarEmpleadoASueldo`, también en gastosServer.js, porque los gastos los
// escribe solo esa capa.

import { CATEGORIA_SUELDOS } from "@/lib/caja/tipoEgreso";
import { empleadosDelLocal } from "@/lib/empleados/empleadosServer";
import { aFechaDeBase, desdeFechaDeBase } from "./pagosProveedores";
import { resumenDeSueldos } from "./sueldos";

const SELECT_SUELDO = {
  id: true,
  fecha: true,
  total: true,
  concepto: true,
  beneficiario: true,
  empleadoId: true,
  modalidadSueldo: true,
  empleado: { select: { id: true, nombre: true, activo: true } },
  pagos: {
    select: { id: true, monto: true, medio: true, turnoId: true, nota: true },
    orderBy: { id: "asc" },
  },
};

/**
 * LOS SUELDOS DE UN LOCAL EN UN PERÍODO, contados para la pantalla.
 *
 * El período es el de `Gasto.fecha`, el día al que corresponde el sueldo: el
 * mismo criterio con que el Resumen financiero cuenta los gastos. Un sueldo se
 * paga entero en el alta —desde el POS siempre, desde Sueldos también—, así
 * que su día es el de su pago.
 *
 * Dos consultas, sin importar cuántos sueldos haya: los empleados activos y
 * los sueldos con sus pagos.
 *
 * @param {object} db
 * @param {{ localId:number, rango:{desde:string, hasta:string} }} args  días "AAAA-MM-DD"
 */
export async function leerSueldos(db, { localId, rango }) {
  const [empleados, filas] = await Promise.all([
    empleadosDelLocal(db, localId),
    db.gasto.findMany({
      where: {
        localId: Number(localId),
        categoria: { nombre: CATEGORIA_SUELDOS },
        fecha: { gte: aFechaDeBase(rango.desde), lte: aFechaDeBase(rango.hasta) },
      },
      select: SELECT_SUELDO,
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
    }),
  ]);
  const sueldos = filas.map((g) => ({
    ...g,
    fecha: desdeFechaDeBase(g.fecha),
    total: Number(g.total),
    pagos: g.pagos.map((p) => ({ ...p, monto: Number(p.monto) })),
  }));
  return resumenDeSueldos({ empleados, sueldos });
}
