// lib/tesoreria/contextoTesoreria.js
//
// EL CONTEXTO DE LA PANTALLA DE TESORERÍA, EN LA URL.
//
// Dos cosas viajan, y las dos por el mismo motivo que en el resto de Finanzas:
// que el "atrás" del teléfono y un enlace compartido caigan donde se estaba.
//
//   · EL PERÍODO. Día, Semana y Mes son los de Finanzas —se leen con
//     `parseContextoFinanzas`, no con una copia—. «Otro» se suma acá porque
//     Tesorería es el primer endpoint de Finanzas que lo acepta: `desde` y
//     `hasta`, los nombres de Transferencias y de Valor del Stock. Una fecha mal
//     escrita en la URL se descarta (queda pidiendo el rango); la validación que
//     manda es la del servidor (`leerRangoElegido`), que contesta 400.
//   · LA VISTA. El resumen, un turno, una caja o una verificación. Entrar a una
//     es navegar —`push`—, así que el "atrás" del teléfono sale de ella y vuelve
//     al resumen sin salir de Tesorería.
//
// Puro: no lee la ventana ni el router. Lo usan el hook y los candados.

import { DESPLAZAMIENTO_POR_DEFECTO, CLAVE_OTRO_FINANZAS, UNIDAD_FINANCIERA_POR_DEFECTO } from "@/lib/finanzas/periodoFinanciero";
import { leerFechaOpcional } from "@/lib/finanzas/pagosProveedores";
import { RUTA_TESORERIA, RUTA_TESORERIA_LOCAL, parseContextoFinanzas } from "@/lib/finanzas/contextoFinanzas";

/** Las vistas de la pantalla. La de entrada es el resumen del período. */
export const VISTA_TESORERIA = Object.freeze({
  RESUMEN: "resumen",
  TURNO: "turno",
  CAJA: "caja",
  VERIFICACION: "verificacion",
});
const VISTAS = Object.values(VISTA_TESORERIA);

function leer(input) {
  if (input && typeof input.get === "function") return (k) => input.get(k);
  if (input && typeof input === "object") return (k) => input[k];
  return () => null;
}

/** Un día `AAAA-MM-DD` válido, o null. La misma validación estricta de Finanzas. */
function dia(v) {
  if (v === null || v === undefined || v === "") return null;
  const r = leerFechaOpcional(String(v));
  return r.error ? null : r.valor;
}

function idPositivo(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Lee y VALIDA el contexto. Devuelve siempre un objeto completo.
 *
 * @returns {{ unidad:string, desp:number, desde:string|null, hasta:string|null,
 *   vista:string, grupo:string|null, caja:number|null, verificacion:number|null }}
 */
export function parseContextoTesoreria(input) {
  const get = leer(input);
  const crudo = String(get("unidad") ?? "").toUpperCase();
  const periodo =
    crudo === CLAVE_OTRO_FINANZAS
      ? { unidad: CLAVE_OTRO_FINANZAS, desp: DESPLAZAMIENTO_POR_DEFECTO, desde: dia(get("desde")), hasta: dia(get("hasta")) }
      : { ...parseContextoFinanzas(input), desde: null, hasta: null };

  const v = String(get("vista") ?? "");
  const vista = VISTAS.includes(v) ? v : VISTA_TESORERIA.RESUMEN;
  const grupo = get("grupo") ? String(get("grupo")) : null;
  return {
    ...periodo,
    vista,
    grupo,
    caja: idPositivo(get("caja")),
    verificacion: idPositivo(get("verificacion")),
  };
}

/**
 * Los parámetros como cadena. Los defaults no se escriben: abierta desde el
 * menú, la barra queda limpia.
 */
export function serializarContextoTesoreria(ctx = {}) {
  const c = parseContextoTesoreria(ctx);
  const qs = new URLSearchParams();
  if (c.unidad !== UNIDAD_FINANCIERA_POR_DEFECTO) qs.set("unidad", c.unidad);
  if (c.unidad === CLAVE_OTRO_FINANZAS) {
    if (c.desde) qs.set("desde", c.desde);
    if (c.hasta) qs.set("hasta", c.hasta);
  } else if (c.desp !== DESPLAZAMIENTO_POR_DEFECTO) {
    qs.set("desp", String(c.desp));
  }
  if (c.vista !== VISTA_TESORERIA.RESUMEN) {
    qs.set("vista", c.vista);
    if (c.grupo) qs.set("grupo", c.grupo);
    if (c.caja) qs.set("caja", String(c.caja));
    if (c.verificacion) qs.set("verificacion", String(c.verificacion));
  }
  return qs.toString();
}

/** Solo el período: lo que se conserva al cambiar de local o de vista. */
export function periodoDelContexto(ctx = {}) {
  const c = parseContextoTesoreria(ctx);
  return { unidad: c.unidad, desp: c.desp, desde: c.desde, hasta: c.hasta };
}

/**
 * Los parámetros que se le piden a `GET /api/finanzas/tesoreria`, o `null` si
 * todavía no hay período que pedir: «Otro» sin las dos fechas. Con «Otro» NO va
 * `desplazamiento` —el servidor contesta 400—, y sin él no van fechas.
 *
 * `destino` y no `localId`: `localId` está reservado para el alcance. Sin
 * destino se pide `entrada=1` y el servidor decide: la lista para el depósito,
 * la cuenta propia para un local.
 */
export function consultaDeTesoreria(ctx = {}, { destino = null } = {}) {
  const c = parseContextoTesoreria(ctx);
  const qs = new URLSearchParams();
  if (destino) qs.set("destino", String(destino));
  else qs.set("entrada", "1");
  if (c.unidad === CLAVE_OTRO_FINANZAS) {
    if (!c.desde || !c.hasta) return null;
    qs.set("unidad", c.unidad);
    qs.set("desde", c.desde);
    qs.set("hasta", c.hasta);
  } else {
    qs.set("unidad", c.unidad);
    qs.set("desplazamiento", String(c.desp));
  }
  return qs.toString();
}

/** La Tesorería de un local elegido desde la lista, con el período adentro. */
export function urlDeLocalTesoreria(localId, ctx = {}) {
  const id = idPositivo(localId);
  if (!id) return RUTA_TESORERIA;
  const qs = serializarContextoTesoreria(periodoDelContexto(ctx));
  return qs ? `${RUTA_TESORERIA_LOCAL}/${id}?${qs}` : `${RUTA_TESORERIA_LOCAL}/${id}`;
}

/** La puerta, con el período: adonde vuelve el depósito para cambiar de local. */
export function urlDeTesoreria(ctx = {}) {
  const qs = serializarContextoTesoreria(periodoDelContexto(ctx));
  return qs ? `${RUTA_TESORERIA}?${qs}` : RUTA_TESORERIA;
}
