// QUÉ SE ACTUALIZA CUANDO SE GUARDA LA APARIENCIA DEL LOCAL.
//
// ── POR QUÉ ESTO ES UNA FUNCIÓN Y NO ESTÁ ADENTRO DE LA RUTA ──────────────
//
// Porque es la regla que impide que guardar una preferencia borre las otras, y
// una regla que vive adentro de un `try` de una ruta de API no se puede probar
// sin levantar la aplicación. Acá es pura: entra el cuerpo del pedido, sale qué
// campos hay que tocar.
//
// ── EL DEFECTO QUE EVITA, QUE NO ES HIPOTÉTICO ───────────────────────────
//
// El PUT de apariencia hacía `update: { aparienciaJson: apariencia }` con lo que
// viniera. La pantalla manda `{ tema }` y nada más, así que cualquier otra clave
// que se hubiera guardado en ese JSON se perdía al cambiar el tema. Por eso las
// dos preferencias de la tarjeta van como COLUMNAS —ver la migración— y por eso
// el update es PARCIAL: solo se escribe lo que el pedido trajo.
//
// La diferencia entre "no lo mandó" y "lo mandó en null" es la que sostiene
// todo: `undefined` significa "no lo toques", `null` significa "borralo". Un
// update que no distinga las dos cosas pisa lo que no le pidieron.

/** Las preferencias de la tarjeta, con el nombre de columna que les toca. */
export const CAMPOS_TARJETA = ["tarjetaPrecioUnitario", "tarjetaOcultarEquivalencia"];

/**
 * Qué campos hay que escribir, a partir del cuerpo del pedido.
 *
 * @param {object} body  el cuerpo del PUT.
 * @returns {{ datos: object } | { error: string }} los campos a actualizar, o el
 *   motivo del rechazo. Un objeto vacío es válido y significa "no hay nada que
 *   hacer": no es un error.
 */
export function datosAActualizar(body = {}) {
  const datos = {};

  // La apariencia sigue siendo un JSON libre, como era. Solo se valida que sea
  // un objeto —o null para borrarla— y se guarda tal cual.
  if (body?.apariencia !== undefined) {
    const ap = body.apariencia;
    if (ap !== null && (typeof ap !== "object" || Array.isArray(ap))) {
      return { error: "Apariencia inválida" };
    }
    datos.aparienciaJson = ap;
  }

  for (const campo of CAMPOS_TARJETA) {
    if (body?.[campo] === undefined) continue;
    const v = body[campo];
    // `null` se acepta y significa volver al default, que es apagado. Se guarda
    // como null y no como false a propósito: null es "nunca lo tocaron" y false
    // es "lo apagaron", y aunque hoy se vean igual, la diferencia es la que deja
    // saber después cuántos locales decidieron de verdad.
    if (v !== null && typeof v !== "boolean") {
      return { error: `${campo} tiene que ser booleano o null` };
    }
    datos[campo] = v;
  }

  return { datos };
}
