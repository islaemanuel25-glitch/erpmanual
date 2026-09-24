// components/transferencias/corteDeSemana.js
//
// LOS DOS DATOS QUE LA PANTALLA DE CORTE COMPARTE CON QUIEN LA NOMBRA.
//
// La ruta la escriben tres lugares —el menú, el atajo del aviso y la propia
// pantalla— y el permiso, dos: el ítem del menú y el botón "Cambiar". Escritos
// a mano en cada uno, el día que alguno cambie los otros quedan viejos y el
// síntoma es de los peores: un enlace a una pantalla que ya no está, o un botón
// visible que el servidor rechaza con 403.
//
// ── POR QUÉ EL PERMISO ES `config_local.semana_operativa` ─────────────────
//
// Hasta la tanda de la semana operativa canónica era `transferencias.crear`,
// porque el corte se guardaba como un acuerdo del depósito con cada local. Ya no:
// la semana es de la UBICACIÓN y la usa todo el ERP, así que cambiarla pide su
// propio permiso. `transferencias.crear` solo ya no alcanza, y el servidor lo
// rechaza; si la pantalla siguiera preguntando por él, ofrecería un botón que
// termina en 403.
//
// El servidor NO confía en esto: `PUT /api/transferencias/acuerdos` vuelve a
// pedir el mismo permiso. Acá se decide qué se DIBUJA, que es otra pregunta.

import { PERMISO_SEMANA_OPERATIVA } from "@/lib/semanaOperativa/semanaOperativa";

export const RUTA_CORTE_DE_SEMANA = "/modulos/transferencias/corte-de-semana";

/** A dónde vuelve el "Volver" de la pantalla de corte. */
export const RUTA_TRANSFERENCIAS = "/modulos/transferencias";

export const PERMISO_PARA_CONFIGURAR_EL_CORTE = PERMISO_SEMANA_OPERATIVA;

/**
 * ¿Esta persona puede cambiar un corte?
 *
 * El comodín `*` es el administrador, igual que en el resto de las pantallas.
 * Se lee de `perfil.permisos` y no de una raíz `permisos` que no existe: eso
 * devolvería `undefined` y se comportaría como "sin permisos" sin decir por qué.
 */
export function puedeConfigurarElCorte(permisos = []) {
  const lista = Array.isArray(permisos) ? permisos : [];
  return lista.includes("*") || lista.includes(PERMISO_PARA_CONFIGURAR_EL_CORTE);
}

/**
 * QUIÉN PUEDE ABRIR LA PANTALLA: el que mira Transferencias, o el que configura
 * la semana. Cualquiera de los dos alcanza.
 *
 * La semana es de la ubicación, así que configurarla no puede exigir permisos de
 * Transferencias. Y lo que la pantalla lee —locales del grupo, su día, su rango y
 * el cambio programado— no trae importes ni transferencias, así que abrirla con
 * el permiso de la semana no deja ver nada comercial. `GET
 * /api/transferencias/acuerdos` pide la misma lista, y un candado compara las dos.
 */
export const PERMISOS_PARA_VER_EL_CORTE = Object.freeze(["transferencias.ver", PERMISO_SEMANA_OPERATIVA]);

export function puedeVerElCorte(permisos = []) {
  const lista = Array.isArray(permisos) ? permisos : [];
  return lista.includes("*") || PERMISOS_PARA_VER_EL_CORTE.some((p) => lista.includes(p));
}
