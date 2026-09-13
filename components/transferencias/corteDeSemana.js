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
// ── POR QUÉ EL PERMISO ES `transferencias.crear` ──────────────────────────
//
// Es el del depósito, y el corte es un acuerdo entre el depósito y cada local:
// el que despacha es el que lo acuerda. No se inventó un permiso nuevo —sería
// una fila más que sembrar y asignar en cada rol— y queda anotado como decisión
// revisable: si mañana la configuración la hace alguien que no despacha, va a
// necesitar el suyo.
//
// El servidor NO confía en esto: `PUT /api/transferencias/acuerdos` vuelve a
// pedir el mismo permiso. Acá se decide qué se DIBUJA, que es otra pregunta.

export const RUTA_CORTE_DE_SEMANA = "/modulos/transferencias/corte-de-semana";

/** A dónde vuelve el "Volver" de la pantalla de corte. */
export const RUTA_TRANSFERENCIAS = "/modulos/transferencias";

export const PERMISO_PARA_CONFIGURAR_EL_CORTE = "transferencias.crear";

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
