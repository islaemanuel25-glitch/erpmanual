// lib/finanzas/contextoFinanzas.js
//
// DÓNDE ESTABA PARADO EL QUE MIRA, SERIALIZADO EN LA URL.
//
// ── POR QUÉ LA URL Y NO `useState` ──────────────────────────────────────
//
// Porque desde acá se entra a un turno y se vuelve. Con el período en el estado
// de React, volver cae SIEMPRE en el período de hoy: al desmontar la pantalla el
// estado se pierde por construcción. Transferencias pagó exactamente eso —33
// transferencias de una semana pasada, renavegando después de cada una— y está
// anotado en `lib/transferencias/contextoDelTablero.js`.
//
// Con el contexto en la barra, el back del navegador funciona solo, el botón
// "Volver" es un link como cualquier otro y un enlace a un período concreto se
// puede compartir.
//
// ── POR QUÉ NO SE REUSÓ `contextoDelTablero` ────────────────────────────
//
// Se reusa lo que de verdad es común —validar la unidad y el desplazamiento, que
// vive en `periodoFinanciero.js` y de ahí baja a `periodoDePago`— y no se reusa
// la serialización, por UNA diferencia que no se puede parametrizar sin
// deformar aquél: **el período por defecto es otro**.
//
// Transferencias abre en `-1`, el período que ya cerró, porque su pregunta es
// cuánto hay que cobrar. Finanzas abre en `0`, el que está corriendo, porque su
// pregunta es cómo viene el negocio. Y ese número no es solo un default: decide
// qué se escribe en la URL —lo que coincide con el default no se escribe— así
// que las dos funciones darían cadenas distintas para el mismo estado.
//
// Hacer que aquélla tome el default por argumento habría sido la otra salida.
// Se descartó porque `esContextoPorDefecto`, `serializarContextoDelTablero`,
// `urlDelTablero` y `urlDeVuelta` lo leen de la constante del módulo: pasarlo
// por argumento obliga a enhebrarlo por las cuatro y alcanza con que una lo
// olvide para que el tablero de Transferencias abra en el período equivocado, en
// silencio. El archivo está en `docs/architecture/volver-al-mismo-lugar.md` como
// el cuarto de su familia; éste es el quinto y queda anotado ahí mismo.

import {
  DESPLAZAMIENTO_POR_DEFECTO,
  UNIDADES_FINANCIERAS,
  desplazamientoFinanciero,
  esUnidadFinanciera,
} from "./periodoFinanciero";
import { FILTRO_CUENTAS } from "./pagosProveedores";

/** La puerta del módulo. */
export const RUTA_FINANZAS = "/modulos/finanzas";
/** La cuenta de un local. */
export const RUTA_LOCAL = "/modulos/finanzas/local";
/** Pagos a proveedores: la lista de cuentas por pagar. */
export const RUTA_PAGOS_PROVEEDORES = "/modulos/finanzas/pagos-proveedores";

/**
 * Una cuenta por pagar, llevándose la solapa de la que se vino para que
 * "Volver" caiga en la misma. Pendientes es el default y no se escribe, por lo
 * mismo que el período: la URL pelada ya lo dice.
 */
export function urlDeCuentaPorPagar(cuentaId, filtro = null) {
  const id = Number(cuentaId);
  if (!Number.isInteger(id) || id <= 0) return RUTA_PAGOS_PROVEEDORES;
  const base = `${RUTA_PAGOS_PROVEEDORES}/${id}`;
  return filtro && filtro !== FILTRO_CUENTAS.PENDIENTES
    ? `${base}?estado=${encodeURIComponent(filtro)}`
    : base;
}

/** La lista de cuentas en una solapa. */
export function urlDePagosProveedores(filtro = null) {
  return filtro && filtro !== FILTRO_CUENTAS.PENDIENTES
    ? `${RUTA_PAGOS_PROVEEDORES}?estado=${encodeURIComponent(filtro)}`
    : RUTA_PAGOS_PROVEEDORES;
}

function leer(input) {
  if (input && typeof input.get === "function") return (k) => input.get(k);
  if (input && typeof input === "object") return (k) => input[k];
  return () => null;
}

/**
 * AUSENTE DE VERDAD.
 *
 * `URLSearchParams.get` devuelve **null** cuando la clave no está, y
 * `Number(null)` es **0**. Acá 0 ES el default, así que el descuido no se vería
 * — y por eso mismo hay que escribirlo: el día que el default cambie, sin este
 * filtro la pantalla abriría en el período equivocado sin que nada falle. Ya
 * pasó del otro lado, con el default en -1.
 */
function ausente(v) {
  return v === null || v === undefined || v === "";
}

/**
 * Parsea y VALIDA el contexto. Todo lo que no reconoce, lo descarta.
 *
 * Devuelve siempre un objeto completo —con los defaults puestos— para que quien
 * lo use no tenga que volver a decidir qué hacer con lo que faltó.
 */
export function parseContextoFinanzas(input) {
  const get = leer(input);

  const u = String(get("unidad") ?? "");
  const unidad = esUnidadFinanciera(u) ? u : UNIDADES_FINANCIERAS.SEMANA;

  const dRaw = get("desp");
  const desp = ausente(dRaw) ? DESPLAZAMIENTO_POR_DEFECTO : desplazamientoFinanciero(dRaw);

  return { unidad, desp };
}

/**
 * Los parámetros, como cadena. Vacía cuando no hay nada que decir.
 *
 * LOS DEFAULTS NO SE ESCRIBEN: una URL con `?unidad=SEMANA&desp=0` dice lo mismo
 * que la URL pelada y se ve como si alguien hubiera navegado. Al abrir la
 * pantalla desde el menú, la barra queda limpia.
 */
export function serializarContextoFinanzas(ctx = {}) {
  const { unidad, desp } = parseContextoFinanzas(ctx);
  const qs = new URLSearchParams();
  if (unidad !== UNIDADES_FINANCIERAS.SEMANA) qs.set("unidad", unidad);
  if (desp !== DESPLAZAMIENTO_POR_DEFECTO) qs.set("desp", String(desp));
  return qs.toString();
}

/** La URL de la cuenta de un local, con el contexto adentro. */
export function urlDelLocal(localId, ctx = {}) {
  const id = Number(localId);
  if (!Number.isInteger(id) || id <= 0) return RUTA_FINANZAS;
  const qs = serializarContextoFinanzas(ctx);
  return qs ? `${RUTA_LOCAL}/${id}?${qs}` : `${RUTA_LOCAL}/${id}`;
}

/**
 * La URL de un turno, LLEVÁNDOSE el contexto para poder volver.
 *
 * Cuelga del local a propósito: así "Volver" es el local, con su período, sin
 * que la URL tenga que decir a dónde vuelve. Una ruta de retorno que viene de
 * afuera es una ruta que alguien puede elegir.
 */
export function urlDelTurno(localId, turnoId, ctx = {}) {
  const base = urlDelLocal(localId, ctx);
  const id = Number(turnoId);
  if (!Number.isInteger(id) || id <= 0) return base;
  const [ruta, qs] = base.split("?");
  return qs ? `${ruta}/turno/${id}?${qs}` : `${ruta}/turno/${id}`;
}
