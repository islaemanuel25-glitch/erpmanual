// lib/pos-ventas/modalidadesPantalla.js
//
// LO QUE LA PANTALLA DE COBROS MUESTRA Y MANDA DE UNA MODALIDAD.
//
// Mismo criterio que `mediosCobroPantalla.js`, y por el mismo motivo: son
// decisiones, no dibujo. Adentro del JSX quedarían sin candados y son
// exactamente las que se escriben distinto en la segunda pantalla.
//
// ── LA DIFERENCIA QUE ESTE ARCHIVO EXISTE PARA SOSTENER ────────────────────
//
// En un MEDIO, `comisionPct` vacío significa "heredá la del grupo". En una
// MODALIDAD significa SIN CONFIGURAR, que no es lo mismo y no se puede leer
// igual en la pantalla.
//
// El motivo está en `modalidadesDeMedio.js`, en `resolverComisionDeModalidad`:
// `ConfiguracionGrupo` tiene tres columnas POR TIPO CONTABLE, así que una
// modalidad "Crédito" de Mercado Pago heredaría `comisionCredito` —lo que cobra
// el posnet bancario— y no lo que cobra Mercado Pago. Cualquier herencia
// disponible hoy devuelve un número ajeno.
//
// Consecuencia visible, y hay que decirla: una modalidad sin comisión deja la
// venta con `comisionPendiente`. Por eso la pantalla no dice "Heredada": dice
// que falta cargarla y qué pasa mientras tanto.
//
// Y un 0 escrito es una DECISIÓN —esta modalidad no cobra comisión— que se
// muestra como "Sin comisión". `null !== 0` de punta a punta.

import { formatearPct } from "./mediosCobroPantalla.js";
import { modalidadesActivas } from "./modalidadesDeMedio.js";

/** Lo que se lee cuando una modalidad no tiene comisión cargada. */
export const TEXTO_COMISION_SIN_CONFIGURAR = "Sin configurar";

/**
 * EL RENGLÓN DE LA FILA: qué se le suma al cliente y qué le cobra el procesador.
 *
 * Mismo formato que `resumenComercial` de un medio para que la lista de
 * modalidades y la de medios se lean igual. Lo único que cambia es que acá
 * "sin configurar" no puede confundirse con "heredada", porque una modalidad no
 * hereda.
 */
export function resumenDeModalidad(modalidad) {
  const recargo = Number(modalidad?.recargoPct) || 0;
  const sinConfigurar = modalidad?.comisionPct == null;
  const comision = Number(modalidad?.comisionPct) || 0;

  return [
    recargo > 0 ? `Recargo ${formatearPct(recargo)}` : "Sin recargo",
    sinConfigurar
      ? `Comisión ${TEXTO_COMISION_SIN_CONFIGURAR.toLowerCase()}`
      : comision > 0
        ? `Comisión ${formatearPct(comision)}`
        : "Sin comisión",
  ].join(" · ");
}

/**
 * "Activa" u "Oculta".
 *
 * Igual que en los medios: lo que cambia `activo` es si la opción APARECE en el
 * selector del cajero, no si existe. Una modalidad apagada conserva su
 * configuración y su historial, y se puede volver a prender.
 */
export function etiquetaVisibilidadModalidad(modalidad) {
  return modalidad?.activo ? "Activa" : "Oculta";
}

/**
 * QUÉ DECIRLE A ALGUIEN SOBRE LA COMISIÓN DE ESTA MODALIDAD.
 *
 * Nunca "Heredada del grupo". Ver el encabezado.
 */
export function textoComisionDeModalidad(modalidad) {
  if (modalidad?.comisionPct == null) {
    return "Sin configurar · la venta queda con la comisión pendiente";
  }
  return Number(modalidad.comisionPct) > 0
    ? "Definida en esta modalidad"
    : "Sin comisión: decidido en cero";
}

/**
 * CON QUÉ ARRANCA EL FORMULARIO DE UNA MODALIDAD.
 *
 * El campo de comisión arranca vacío cuando no hay nada cargado, y con el número
 * cuando sí. No hay un tercer estado: acá el vacío no significa "heredá", así
 * que no hace falta la gimnasia de `estadoInicialDeMedio`.
 *
 * El tipo contable de una modalidad nueva arranca en el del PADRE, que es lo que
 * más veces va a ser cierto —una modalidad de un medio de crédito suele ser
 * crédito— y sigue siendo editable. No se fuerza: es una sugerencia inicial.
 */
export function estadoInicialDeModalidad(modalidad, { ordenSugerido = 1, tipoDelPadre = "" } = {}) {
  return {
    nombre: modalidad?.nombre ?? "",
    activo: modalidad ? modalidad.activo !== false : true,
    orden: String(modalidad?.orden ?? ordenSugerido),
    tipoContable: modalidad?.tipoContable ?? tipoDelPadre ?? "",
    recargoPct: String(modalidad?.recargoPct ?? 0),
    comisionPct: modalidad?.comisionPct == null ? "" : String(modalidad.comisionPct),
  };
}

/**
 * QUÉ SE MANDA AL GUARDAR.
 *
 * El campo vacío viaja como `null` = sin configurar. Un 0 escrito viaja como 0 =
 * decidido en cero. Convertir uno en el otro cambiaría lo que se le cobra al
 * comercio sin que nadie lo haya decidido, y además apagaría la señal de
 * `comisionPendiente`, que es lo que hace visible que falta un dato.
 *
 * El procesador NO se manda: una modalidad no lo tiene. Lo aporta el padre, y
 * duplicarlo acá crearía dos fuentes para el mismo hecho.
 */
export function cuerpoParaGuardarModalidad(form) {
  return {
    nombre: form.nombre,
    activo: form.activo,
    orden: Number(form.orden),
    tipoContable: form.tipoContable,
    recargoPct: Number(form.recargoPct),
    comisionPct: form.comisionPct === "" ? null : Number(form.comisionPct),
  };
}

/**
 * ¿HAY QUE AVISAR QUE LA CONDICIÓN DEL PADRE YA NO MANDA?
 *
 * Con modalidades activas, el recargo y la comisión que el POS aplica salen de
 * la MODALIDAD. Los campos del padre siguen existiendo —y siguen sirviendo el
 * día que se apaguen todas las modalidades— pero mostrarlos sin decir esto sería
 * presentar como condición vigente un número que no se cobra.
 *
 * Devuelve `null` cuando no hay nada que avisar, para que la pantalla no tenga
 * que preguntar dos veces.
 */
export function avisoCondicionDelPadre(medio) {
  const activas = modalidadesActivas(medio);
  if (activas.length === 0) return null;
  return (
    `Este medio cobra por modalidad: el recargo y la comisión de cada venta salen de la ` +
    `modalidad que elija el cajero, no de los campos de acá abajo. ` +
    `${activas.length === 1 ? "Hay 1 modalidad activa" : `Hay ${activas.length} modalidades activas`}.`
  );
}
