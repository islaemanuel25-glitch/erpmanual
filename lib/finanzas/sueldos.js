// lib/finanzas/sueldos.js
//
// SUELDOS: lo que no toca la base. Las modalidades, el concepto que lleva un
// sueldo y la cuenta de la pantalla Finanzas → Sueldos.
//
// ── LA REGLA (Emanuel, 2026-10-19) ───────────────────────────────────────
//
// Un sueldo NO es un gasto común. Sigue siendo un `Gasto` de la categoría
// Sueldos —así resta en la ganancia y suma en el Resumen financiero igual que
// antes—, pero:
//
//   · se paga eligiendo un EMPLEADO del local (`Empleado.localId`), la misma
//     lista que usa el POS; nunca un nombre escrito a mano;
//   · dice qué fue: sueldo, adelanto, aguinaldo o vacaciones
//     (`Gasto.modalidadSueldo`);
//   · los pagos del POS ("Pagar" → Sueldo) y los de Finanzas son la misma cosa
//     y se ven juntos, un solo historial por empleado.
//
// Las dos exigencias las impone `crearGasto` (gastosServer.js) para TODO gasto
// de la categoría Sueldos, venga de donde venga. Acá no se valida nada contra
// la base: solo se cuenta lo que ya se leyó.

import { origenDelPago } from "./gastos";

export const MODALIDAD_SUELDO = Object.freeze({
  SUELDO: "SUELDO",
  ADELANTO: "ADELANTO",
  AGUINALDO: "AGUINALDO",
  VACACIONES: "VACACIONES",
});

/** En el orden en que se ofrecen, en el POS y en Finanzas. */
export const MODALIDADES_SUELDO = Object.freeze([
  MODALIDAD_SUELDO.SUELDO,
  MODALIDAD_SUELDO.ADELANTO,
  MODALIDAD_SUELDO.AGUINALDO,
  MODALIDAD_SUELDO.VACACIONES,
]);

export const ETIQUETA_MODALIDAD_SUELDO = Object.freeze({
  [MODALIDAD_SUELDO.SUELDO]: "Sueldo",
  [MODALIDAD_SUELDO.ADELANTO]: "Adelanto",
  [MODALIDAD_SUELDO.AGUINALDO]: "Aguinaldo",
  [MODALIDAD_SUELDO.VACACIONES]: "Vacaciones",
});

/** Las opciones de un selector: `{ valor, texto }`. */
export const OPCIONES_MODALIDAD_SUELDO = Object.freeze(
  MODALIDADES_SUELDO.map((m) => Object.freeze({ valor: m, texto: ETIQUETA_MODALIDAD_SUELDO[m] }))
);

export const esModalidadSueldo = (m) => MODALIDADES_SUELDO.includes(m);

export const ERROR_EMPLEADO_SUELDO = "Elegí el empleado.";
export const ERROR_MODALIDAD_SUELDO = "Elegí qué es: sueldo, adelanto, aguinaldo o vacaciones.";
export const ERROR_NO_ES_SUELDO = "Ese gasto no es un sueldo.";
export const ERROR_SUELDO_YA_ASIGNADO = "Ese sueldo ya tiene empleado.";

/**
 * EL CONCEPTO DE UN SUELDO: "Sueldo · Ana", "Adelanto · Ana". Lo arma el
 * servidor y no la persona. Es el mismo formato que escribía "Pagar" del POS
 * antes de la columna, y del que la migración rellenó `modalidadSueldo`.
 */
export function conceptoDeSueldo({ modalidad, nombre }) {
  return `${ETIQUETA_MODALIDAD_SUELDO[modalidad] || "Sueldo"} · ${String(nombre || "").trim()}`;
}

// ── LA CUENTA DE LA PANTALLA ─────────────────────────────────────────────

const aCentavos = (v) => Math.round(Number(v || 0) * 100);
const desdeCentavos = (c) => c / 100;

/** "AAAA-MM-DD" → "DD/MM". */
export function diaYMes(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}` : "";
}

// De dónde salió un pago: vive en gastos.js porque lo usa también la lista de
// Gastos. Se reexporta para quien ya lo pedía acá.
export { origenDelPago };

/** Un renglón de la tarjeta de pagos: "DD/MM · Tipo", de dónde salió y el monto. */
function renglonDePago(sueldo, pago) {
  const origen = origenDelPago(pago);
  return {
    pagoId: pago.id,
    gastoId: sueldo.id,
    fecha: sueldo.fecha,
    modalidad: sueldo.modalidadSueldo || null,
    titulo: `${diaYMes(sueldo.fecha)} · ${ETIQUETA_MODALIDAD_SUELDO[sueldo.modalidadSueldo] || "Sueldo"}`,
    origen: origen.rotulo,
    desdeLaCaja: origen.desdeLaCaja,
    nota: pago.nota || null,
    monto: Number(pago.monto),
  };
}

/** Los pagos de una lista de sueldos, del más nuevo al más viejo, con su total. */
export function pagosDeSueldos(sueldos = []) {
  const pagos = [];
  for (const s of sueldos) for (const p of s.pagos || []) pagos.push(renglonDePago(s, p));
  pagos.sort((a, b) => (a.fecha === b.fecha ? b.pagoId - a.pagoId : a.fecha < b.fecha ? 1 : -1));
  const total = desdeCentavos(pagos.reduce((acc, p) => acc + aCentavos(p.monto), 0));
  return { pagos, total };
}

/**
 * LA PANTALLA SUELDOS DE UN PERÍODO.
 *
 * Un renglón por cada empleado ACTIVO del local, aunque no haya cobrado: la
 * pregunta de la pantalla es "¿a quién le pagué?", y el que falta tiene que
 * verse. Un empleado dado de baja aparece solo si cobró en el período: si no,
 * el total de arriba no cerraría con la suma de los renglones.
 *
 * Los sueldos sin empleado —los viejos, cargados en Gastos con un nombre a
 * mano— van aparte, en "Sin empleado asignado", y también suman al total.
 *
 * @param {object} args
 * @param {Array<{id:number, nombre:string}>} args.empleados  los activos del local
 * @param {Array<{id, fecha, empleadoId, empleado?, modalidadSueldo, concepto, beneficiario, total, pagos}>} args.sueldos
 *        los gastos de la categoría Sueldos del local y del período
 */
export function resumenDeSueldos({ empleados = [], sueldos = [] } = {}) {
  let totalC = 0;
  let cajaC = 0;
  for (const s of sueldos) {
    for (const p of s.pagos || []) {
      const c = aCentavos(p.monto);
      totalC += c;
      if (origenDelPago(p).desdeLaCaja) cajaC += c;
    }
  }

  const porEmpleado = new Map();
  const sinEmpleado = [];
  for (const s of sueldos) {
    if (!s.empleadoId) {
      sinEmpleado.push(s);
      continue;
    }
    if (!porEmpleado.has(s.empleadoId)) porEmpleado.set(s.empleadoId, []);
    porEmpleado.get(s.empleadoId).push(s);
  }

  const renglon = (id, nombre, activo) => {
    const { pagos, total } = pagosDeSueldos(porEmpleado.get(id) || []);
    return { id, nombre, activo, cantidadPagos: pagos.length, ultimo: pagos[0]?.fecha || null, total, pagos };
  };
  const filas = empleados.map((e) => renglon(e.id, e.nombre, true));
  const vistos = new Set(empleados.map((e) => e.id));
  // Los dados de baja que cobraron en el período, con el nombre que trae su sueldo.
  for (const [id, lista] of porEmpleado) {
    if (vistos.has(id)) continue;
    const nombre = lista[0]?.empleado?.nombre || lista[0]?.beneficiario || `Empleado #${id}`;
    filas.push(renglon(id, nombre, false));
  }

  const sin = pagosDeSueldos(sinEmpleado);
  return {
    total: desdeCentavos(totalC),
    desdeLaCaja: desdeCentavos(cajaC),
    desdeFinanzas: desdeCentavos(totalC - cajaC),
    empleados: filas,
    sinEmpleado: sinEmpleado.length
      ? {
          total: sin.total,
          sueldos: sinEmpleado
            .map((s) => {
              // `total` es el importe del sueldo; `pagado`, lo que salió.
              const { pagos, total: pagado } = pagosDeSueldos([s]);
              return {
                id: s.id,
                fecha: s.fecha,
                concepto: s.concepto,
                beneficiario: s.beneficiario || null,
                total: Number(s.total),
                pagado,
                pagos,
              };
            })
            .sort((a, b) => (a.fecha === b.fecha ? b.id - a.id : a.fecha < b.fecha ? 1 : -1)),
        }
      : null,
  };
}

/** "3 pagos · último 12/10", o "Sin pagos este período". */
export function textoDePagosDelEmpleado({ cantidadPagos = 0, ultimo = null } = {}) {
  if (!cantidadPagos) return "Sin pagos este período";
  return `${cantidadPagos} ${cantidadPagos === 1 ? "pago" : "pagos"} · último ${diaYMes(ultimo)}`;
}
