// ¿ESTE PEDIDO TIENE PAPEL? UNA SOLA PREGUNTA, UN SOLO LUGAR.
//
// ── EL DEFECTO QUE TRAJO ESTE MÓDULO ──────────────────────────────────────
//
// La pantalla de un pedido RECIBIDO afirmó "Este pedido se cerró sin ningún
// papel del proveedor" sobre el pedido 232, que tiene el comprobante 5 leído el
// 2026-09-20, con 15 renglones, 13 de ellos atados a una línea del pedido. Y
// abajo dijo "Estos 24 no venían en el papel", que son TODAS las líneas del
// pedido. Las dos frases son falsas y hablan de mercadería.
//
// No fue un error de redacción: fueron DOS CRITERIOS distintos para la misma
// pregunta, que es el defecto que este módulo ya vio tres veces.
//
//   · La conciliación —el servidor— resuelve el papel buscando los
//     comprobantes del pedido en la base. Los encuentra.
//   · La pantalla preguntaba si `PanelComprobantes` le había avisado cuántos
//     hay, por su callback `onCantidad`. En RECIBIDO ese panel NO SE MONTA
//     —la pantalla cerrada devuelve otro árbol—, así que nadie avisaba nunca,
//     el contador se quedaba en 0, el efecto que pide la conciliación cortaba
//     antes de pedirla, y la pantalla concluía "no hay papel" de un dato que
//     jamás pidió.
//
// O sea: la pantalla no se enteró de que había papel porque preguntó por él de
// una forma que en esa pantalla nadie contesta. Y el silencio se leyó como un
// "no".
//
// ── LA REGLA QUE SALE DE ACÁ ──────────────────────────────────────────────
//
// **No saber todavía no es "no hay".** Un estado que no se pidió, o que se pidió
// y falló, NO puede caer en la misma rama que un pedido sin comprobantes: son
// tres cosas distintas y la pantalla dice tres cosas distintas. Por eso esto es
// una máquina de cuatro estados y no un booleano — un booleano obliga a elegir
// una de las dos afirmaciones cuando la verdad es que no se sabe.

/** Los cuatro estados en los que puede estar el papel de un pedido. */
export const PAPEL = {
  /** Todavía no llegó la respuesta del servidor. No se afirma nada. */
  CARGANDO: "CARGANDO",
  /** Se preguntó y no se pudo saber. Tampoco se afirma nada. */
  NO_SE_PUDO: "NO_SE_PUDO",
  /** Se preguntó: este pedido no tiene ningún comprobante. */
  SIN_PAPEL: "SIN_PAPEL",
  /** Hay comprobante, pero ninguno tiene renglones leídos todavía. */
  SIN_LEER: "SIN_LEER",
  /** Hay comprobante con renglones: la pantalla completa. */
  CON_PAPEL: "CON_PAPEL",
};

/**
 * ¿Hay que pedirle la conciliación al servidor?
 *
 * EN RECIBIDO SIEMPRE, y ésa es la corrección. El pedido está cerrado: los
 * comprobantes que tenga son los que va a tener, y no hay ningún panel montado
 * que pueda avisar cuántos son. Preguntar de más cuesta un viaje; no preguntar
 * costó una pantalla que afirmaba una mentira sobre la mercadería.
 *
 * En ENVIADO se conserva la condición de antes —solo con comprobantes—, porque
 * ahí el panel SÍ está montado y sí avisa, y mientras no hay ninguno no hay nada
 * que conciliar.
 */
export function hayQuePedirLaConciliacion({ estado, hayComprobantes = 0 } = {}) {
  if (estado === "RECIBIDO") return true;
  if (estado !== "ENVIADO") return false;
  const n = Number(hayComprobantes);
  return Number.isFinite(n) && n > 0;
}

/**
 * Cuántos comprobantes tiene el pedido, según la MISMA respuesta que trae las
 * filas. `grupos` viene de `filasDeConciliacion`, que arma uno por comprobante
 * —tenga renglones o no—, así que su largo es el conteo y no hace falta ninguna
 * otra fuente. Devuelve null cuando todavía no se sabe, que no es cero.
 */
export function cuantosComprobantes(conciliacion) {
  const grupos = conciliacion?.grupos;
  return Array.isArray(grupos) ? grupos.length : null;
}

/**
 * En qué estado está el papel de este pedido.
 *
 * @param conciliacion  la respuesta de `/api/compras-proveedor/conciliacion`,
 *                      o null mientras no llegó.
 * @param fallo         true si la pedimos y no se pudo.
 */
export function papelDelPedido({ conciliacion = null, fallo = false } = {}) {
  if (fallo) return PAPEL.NO_SE_PUDO;
  const cuantos = cuantosComprobantes(conciliacion);
  if (cuantos == null) return PAPEL.CARGANDO;
  if (cuantos === 0) return PAPEL.SIN_PAPEL;
  const hayRenglones = conciliacion.grupos.some((g) => (g?.filas || []).length > 0);
  return hayRenglones ? PAPEL.CON_PAPEL : PAPEL.SIN_LEER;
}

/**
 * ¿Se puede decir en pantalla que este pedido no tiene papel?
 *
 * Existe como función y no como comparación suelta para que la afirmación tenga
 * UN dueño: el candado la ejerce con la forma real del endpoint, y una pantalla
 * que quiera decirlo tiene que pasar por acá.
 */
export function sePuedeAfirmarQueNoHayPapel(estadoDelPapel) {
  return estadoDelPapel === PAPEL.SIN_PAPEL;
}
