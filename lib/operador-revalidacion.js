// lib/operador-revalidacion.js
//
// QUÉ HACE LA PANTALLA CON LA RESPUESTA DE /api/operador/me.
//
// La pantalla revalida el operador cada 2 minutos y al volver el foco. Antes,
// cualquier falla —sin red, el servidor caído, un 502 del proxy— dejaba el
// operador en null, igual que si el servidor hubiera dicho "no hay operador".
// En el POS eso cambiaba la identidad del carrito en pantalla a la de la cuenta
// en medio de una venta sin conexión: el carrito de A desaparecía y uno viejo
// sin dueño podía aparecer.
//
// Son tres cosas distintas y se tratan distinto:
//
//   · el servidor CONTESTÓ con un operador  → ése es el operador.
//   · el servidor CONTESTÓ que no hay       → no hay operador (null).
//   · no se pudo preguntar                  → se conserva el último operador
//     validado y se marca `sinConexion`. No es una autenticación offline: el
//     servidor sigue mirando la cookie en cada operación y rechaza lo que no
//     corresponda. Solo evita reinterpretar un corte de red como "se fue el
//     operador". Al volver la red, la próxima revalidación decide.
//
// Es pura para poder probarla sin React: la usa hooks/useOperadorActivo.js.

/** Resultado de preguntar: el servidor contestó (con su cuerpo) o no se pudo. */
export const SIN_RESPUESTA = Symbol("sin-respuesta");

/**
 * @param {{ operador: object|null, voucher: string|null, sinConexion: boolean }} previo
 * @param {{ ok?: boolean, operador?: object|null, voucher?: string|null } | typeof SIN_RESPUESTA} respuesta
 * @returns {{ operador: object|null, voucher: string|null, sinConexion: boolean }}
 */
export function estadoTrasRevalidar(previo, respuesta) {
  if (respuesta === SIN_RESPUESTA || respuesta == null || typeof respuesta !== "object") {
    return {
      operador: previo?.operador ?? null,
      voucher: previo?.voucher ?? null,
      sinConexion: true,
    };
  }
  if (respuesta.ok && respuesta.operador) {
    return { operador: respuesta.operador, voucher: respuesta.voucher ?? null, sinConexion: false };
  }
  return { operador: null, voucher: null, sinConexion: false };
}

/**
 * ¿Esta respuesta HTTP es una contestación del servidor o un "no se pudo"?
 * Un 2xx con JSON es contestación, y un 4xx también: el servidor dijo que no.
 * Un 5xx —el servidor caído, un 502/504 del proxy— o un cuerpo que no es JSON
 * es "no se pudo": no dice nada sobre el operador.
 */
export async function leerRespuestaOperador(res) {
  if (!res || res.status >= 500) return SIN_RESPUESTA;
  if (!res.ok) return { ok: false };
  try {
    return await res.json();
  } catch {
    return SIN_RESPUESTA;
  }
}
