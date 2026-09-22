// UN ERROR QUE YA ESTÁ ESCRITO PARA QUIEN LO VA A LEER.
//
// ── POR QUÉ HACE FALTA UN TIPO Y NO ALCANZA CON `Error` ───────────────────
//
// Una ruta tiene dos clases de error y no se parecen en nada:
//
//   · LA REGLA QUE FRENA. "Queso Rallado: entrarían 120 unidades al stock y el
//     papel factura 6." La aplicación funcionó perfecto y decidió no escribir.
//     Quien está recibiendo tiene que leer ESO, porque dice qué hacer.
//   · LA FALLA DEL SISTEMA. Una consulta mal armada, la base que no contesta.
//     Ahí no hay nada que la persona pueda hacer, y el detalle es para el log.
//
// Con las dos como `Error` pelado, el `catch` no las distingue y termina
// mandando el mismo cartel genérico para todo. El 2026-09-22, cerrando el
// pedido 242, la regla que frenaba llegó al teléfono como **"Error interno al
// recibir pedido"**: el motivo —que además nombraba el producto y decía qué
// tocar— se quedó en el log del servidor.
//
// Es el caso que CLAUDE.md nombra en la regla 2: un candado puede estar mirando
// el lugar equivocado. Los que exigen mensajes en castellano miraban el
// catálogo del servidor y los textos de pantalla; el "Error interno" salía de
// un TERCER lugar, el `catch` de la ruta.
//
// ── CÓMO SE USA ───────────────────────────────────────────────────────────
//
// `throw new ErrorParaLaPersona("...")` en la regla, y en el `catch` de la ruta
// un `instanceof` que lo devuelve con 409 y el mensaje tal cual. Todo lo demás
// sigue saliendo por `errorInesperado`, que dice qué se estaba haciendo y qué
// pasó con los datos.
//
// 409 y no 500 a propósito: 500 significa "la aplicación no responde", y acá
// respondió bien. Además el proxy reemplaza los 500 por su propia página y con
// eso se pierde el cuerpo, que es justamente donde va el motivo.

export class ErrorParaLaPersona extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ErrorParaLaPersona";
    /** Marca por si el `instanceof` se pierde cruzando un límite de módulo. */
    this.paraLaPersona = true;
  }
}

/** Si este error ya está escrito para quien lo va a leer. */
export function esParaLaPersona(err) {
  return err instanceof ErrorParaLaPersona || err?.paraLaPersona === true;
}
