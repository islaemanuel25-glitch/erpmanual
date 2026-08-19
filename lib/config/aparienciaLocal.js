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

// ── `tarjetaPrecioUnitario` SIGUE ACÁ Y YA NO LA LEE NADIE ────────────────
//
// Se sacó de la pantalla de apariencia y del contexto el 2026-08-19, porque
// quedó SIN EFECTO: desde que la tarjeta muestra la escala en la que se VENDE
// —la que decide el POS— el número no se elige, y un interruptor que no hace
// nada es peor que no tenerlo.
//
// LA COLUMNA NO SE BORRA, y el motivo es del tipo que conviene dejar escrito:
// borrarla es una migración DESTRUCTIVA —un `DROP COLUMN` sobre una tabla de
// producción— a cambio de recuperar dos bytes por local. El riesgo y el
// beneficio no se parecen. Además la ventana entre migrar y recrear tendría que
// tolerar que el código viejo la siga pidiendo.
//
// Se conserva en `CAMPOS_TARJETA` a propósito: el PUT la sigue aceptando y el
// GET la sigue devolviendo, así que un local que la tenga prendida no pierde el
// dato y el día que se retome la idea está todo el camino hecho. Lo único que
// no existe más es alguien que la lea para decidir algo.
//
// Si algún día se decide borrarla de verdad, va por el flujo por fases: primero
// dejar de escribirla, desplegar, y recién en un despliegue posterior el DROP.

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
