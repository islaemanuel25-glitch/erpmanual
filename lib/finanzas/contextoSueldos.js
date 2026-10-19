// lib/finanzas/contextoSueldos.js
//
// EL CONTEXTO DE FINANZAS → SUELDOS, EN LA URL. Puro.
//
// Viaja por lo mismo que en el resto de Finanzas: que el "atrás" del teléfono
// vuelva a donde se estaba. Dos cosas:
//
//   · EL PERÍODO, con las unidades de Tesorería —Día, Semana, Mes y «Otro» con
//     desde/hasta— y una sola diferencia: Sueldos abre en MES, porque un sueldo
//     se paga por mes y el día no contesta nada. El período lo lee y lo valida
//     `parseContextoTesoreria` (la misma validación), y acá solo se cambia el
//     default: con `unidad` ausente es Mes, y Mes no se escribe.
//   · LA VISTA: el resumen, el historial de un empleado, los sueldos sin
//     empleado o el formulario de pago. Entrar a una es navegar.

import { CLAVE_OTRO_FINANZAS, DESPLAZAMIENTO_POR_DEFECTO, UNIDADES_FINANCIERAS } from "./periodoFinanciero";
import { parseContextoTesoreria } from "@/lib/tesoreria/contextoTesoreria";

export { RUTA_SUELDOS } from "./contextoFinanzas";

/** Sueldos abre en el mes en curso. */
export const UNIDAD_SUELDOS_POR_DEFECTO = UNIDADES_FINANCIERAS.MES;

export const VISTA_SUELDOS = Object.freeze({
  RESUMEN: "resumen",
  EMPLEADO: "empleado",
  SIN_EMPLEADO: "sin-empleado",
  PAGAR: "pagar",
});
const VISTAS = Object.values(VISTA_SUELDOS);

function leer(input) {
  if (input && typeof input.get === "function") return (k) => input.get(k);
  if (input && typeof input === "object") return (k) => input[k];
  return () => null;
}

/**
 * Lee y valida el contexto. Devuelve siempre un objeto completo.
 *
 * @returns {{ unidad:string, desp:number, desde:string|null, hasta:string|null, vista:string, empleado:number|null }}
 */
export function parseContextoSueldos(input) {
  const get = leer(input);
  const sinUnidad = get("unidad") === null || get("unidad") === undefined || get("unidad") === "";
  const { unidad, desp, desde, hasta } = parseContextoTesoreria(
    sinUnidad ? { unidad: UNIDAD_SUELDOS_POR_DEFECTO, desp: get("desp") } : input
  );
  const n = Number(get("empleado"));
  const empleado = Number.isInteger(n) && n > 0 ? n : null;
  const v = String(get("vista") ?? "");
  // El historial sin empleado no es una vista: vuelve al resumen.
  const vista = !VISTAS.includes(v) || (v === VISTA_SUELDOS.EMPLEADO && !empleado) ? VISTA_SUELDOS.RESUMEN : v;
  // El empleado viaja en su historial y en "Pagar sueldo", que lo trae elegido
  // cuando se entra desde el historial.
  const conEmpleado = vista === VISTA_SUELDOS.EMPLEADO || vista === VISTA_SUELDOS.PAGAR;
  return { unidad, desp, desde, hasta, vista, empleado: conEmpleado ? empleado : null };
}

/** Los parámetros como cadena; los defaults no se escriben. */
export function serializarContextoSueldos(ctx = {}) {
  const c = parseContextoSueldos(ctx);
  const qs = new URLSearchParams();
  if (c.unidad !== UNIDAD_SUELDOS_POR_DEFECTO) qs.set("unidad", c.unidad);
  if (c.unidad === CLAVE_OTRO_FINANZAS) {
    if (c.desde) qs.set("desde", c.desde);
    if (c.hasta) qs.set("hasta", c.hasta);
  } else if (c.desp !== DESPLAZAMIENTO_POR_DEFECTO) {
    qs.set("desp", String(c.desp));
  }
  if (c.vista !== VISTA_SUELDOS.RESUMEN) qs.set("vista", c.vista);
  if (c.empleado) qs.set("empleado", String(c.empleado));
  return qs.toString();
}

/**
 * Lo que se le pide a `GET /api/finanzas/sueldos`, o `null` si todavía no hay
 * período: «Otro» sin las dos fechas. La unidad va siempre explícita.
 */
export function consultaDeSueldos(ctx = {}) {
  const c = parseContextoSueldos(ctx);
  const qs = new URLSearchParams();
  qs.set("unidad", c.unidad);
  if (c.unidad === CLAVE_OTRO_FINANZAS) {
    if (!c.desde || !c.hasta) return null;
    qs.set("desde", c.desde);
    qs.set("hasta", c.hasta);
  } else {
    qs.set("desplazamiento", String(c.desp));
  }
  return qs.toString();
}
