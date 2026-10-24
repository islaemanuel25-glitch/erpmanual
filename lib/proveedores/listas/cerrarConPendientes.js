// CERRAR UNA LISTA CON PRECIOS SIN APLICAR (Emanuel, 2026-10-24).
//
// EL CASO (Dab, producción 77c4646f): la lista revisada entera, 56 precios en
// «Para aplicar», «Terminar lista»… y quedó Terminada con "0 costos
// actualizados" y "65 quedaron sin aplicar". Terminar no avisó nada, y una lista
// terminada ya no se puede aplicar: los 56 se perdieron.
//
// Lo decidido: si al terminar o cancelar queda algo para aplicar —lo que suma
// la barra «Para aplicar», o listos sin tildar— no se cierra directo. Se abre
// una hoja que dice cuántos y ofrece aplicar primero. Sin nada pendiente,
// terminar y cancelar siguen como estaban.
//
// Las cuentas son las de la pantalla, no otras: `conteo.listos` es el número de
// la barra y el que consulta aplicar, y `conteo.listosSinTildar` el del aviso
// "están listos pero sin tildar".

import { MODO_LISTA } from "./modoDeLaLista.js";

export const CIERRE = Object.freeze({
  TERMINAR: "TERMINAR",
  CANCELAR: "CANCELAR",
});

/** Qué abre el botón: la hoja de pendientes, o lo de siempre. */
export const AL_CERRAR = Object.freeze({
  HOJA_PENDIENTES: "HOJA_PENDIENTES",
  COMO_SIEMPRE: "COMO_SIEMPRE",
});

/**
 * Lo que dice el aviso después de cancelar. Desde el 2026-10-24 cancelar una
 * lista aplicada DESHACE lo aplicado (`cancelar/route.js`), así que se dice
 * cuántos precios volvieron y cuántos quedaron como estaban.
 *
 * @param respuesta  la de `cancelar`: `{ revertido: { productos } | null, omitidos: [] }`
 */
export function textoDeLaCancelada(respuesta) {
  const n = Number(respuesta?.revertido?.productos ?? 0);
  const omitidos = Array.isArray(respuesta?.omitidos) ? respuesta.omitidos.length : 0;
  let texto = "Lista cancelada. No se cambió ningún costo.";
  if (n === 1) texto = "Lista cancelada. Se deshizo 1 precio: volvió a su costo anterior.";
  if (n > 1) texto = `Lista cancelada. Se deshicieron ${n} precios: volvieron a su costo anterior.`;
  if (omitidos === 1) texto += " 1 quedó como estaba: se tocó después de aplicar.";
  if (omitidos > 1) texto += ` ${omitidos} quedaron como estaban: se tocaron después de aplicar.`;
  return texto;
}

export const TITULO_PENDIENTES = "Te quedan precios sin aplicar";
export const TEXTO_APLICAR_Y_TERMINAR = "✓ Aplicar y terminar";
export const TEXTO_TERMINAR_SIN_APLICAR = "Terminar sin aplicar";
export const TEXTO_CANCELAR_SIN_APLICAR = "Cancelar sin aplicar";

/**
 * Lo que quedaría sin aplicar si se cerrara ahora. En un control, o desde una
 * ubicación que no administra los costos, no hay barra ni nada que aplicar: ahí
 * no hay pendientes, aunque el conteo traiga números.
 */
export function pendientesAlCerrar(conteo, { controlando = false, puedeCambiarCostos = true } = {}) {
  if (controlando || !puedeCambiarCostos) return { listos: 0, sinTildar: 0, hay: false };
  const listos = Math.max(0, Number(conteo?.listos) || 0);
  const sinTildar = Math.max(0, Number(conteo?.listosSinTildar) || 0);
  return { listos, sinTildar, hay: listos > 0 || sinTildar > 0 };
}

/**
 * Los pendientes de una lista, sacados de lo que manda el resultado: un
 * control no aplica, y una ubicación sin los costos tampoco. Lo usan el botón
 * de terminar y la llegada desde «Terminar lista» del listado, así no hay dos
 * cuentas de lo mismo.
 */
export function pendientesDeLaLista({ conteo, cabecera } = {}) {
  return pendientesAlCerrar(conteo, {
    controlando: cabecera?.modo === MODO_LISTA.CONTROLAR,
    puedeCambiarCostos: cabecera?.costos?.puedeCambiar !== false,
  });
}

export function queAbreAlCerrar(pendientes) {
  return pendientes?.hay ? AL_CERRAR.HOJA_PENDIENTES : AL_CERRAR.COMO_SIEMPRE;
}

/**
 * "56 precios están listos para aplicar y 9 listos sin tildar. Si terminás
 * ahora, siguen con el costo anterior." Un número en cero no se nombra.
 */
export function textoDePendientes({ listos = 0, sinTildar = 0 } = {}, accion = CIERRE.TERMINAR) {
  const partes = [];
  if (listos > 0) partes.push(listos === 1 ? "1 precio está listo para aplicar" : `${listos} precios están listos para aplicar`);
  if (sinTildar > 0) partes.push(sinTildar === 1 ? "1 listo sin tildar" : `${sinTildar} listos sin tildar`);
  const cuantos = listos + sinTildar;
  const siguen = cuantos === 1 ? "sigue con el costo anterior" : "siguen con el costo anterior";
  const cierre =
    accion === CIERRE.CANCELAR ? `Si cancelás ahora, se pierden: ${siguen}.` : `Si terminás ahora, ${siguen}.`;
  return `${partes.join(" y ")}. ${cierre}`;
}

/**
 * «✓ Aplicar y terminar»: lo que hace el botón Aplicar y, si salió, terminar.
 *
 * `aplicar` devuelve `{ ok, escritos }` y `terminar`, `true` si cerró. Si falla, no se termina: la lista
 * queda abierta con el error a la vista. Y si había precios para aplicar y no
 * se escribió ninguno, tampoco: terminar ahí es exactamente la pérdida que
 * esto existe para evitar, y el aviso de aplicar ya dice por qué.
 */
export async function aplicarYTerminar({ listos = 0, aplicar, terminar }) {
  const r = await aplicar();
  if (!r?.ok) return { terminada: false };
  if (listos > 0 && !(Number(r.escritos) > 0)) return { terminada: false, sinEscribir: true };
  return { terminada: (await terminar({ conservarAviso: true })) === true };
}
