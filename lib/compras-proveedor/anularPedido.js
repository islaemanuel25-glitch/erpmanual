// ANULAR UN PEDIDO QUE NO VA A LLEGAR, DICHO CON NÚMEROS.
//
// ── EL CASO (Emanuel, 2026-10-22) ─────────────────────────────────────────
//
// En "Recibir mercadería" quedaban pedidos esperando con cero productos y sin
// factura —Golosimax #261 y Secco #256, nacidos de "Llegó algo sin pedido"— y
// desde el celular no había cómo sacarlos: el botón de anular solo existía en
// los estados de antes de enviar.
//
// Anular no borra nada: el pedido queda ANULADO y sale de la lista, que solo
// muestra los ENVIADO. Las facturas que tenga subidas se anulan con él (lo hace
// la ruta): si no, su archivo y su CAE seguirían chocando como repetidos contra
// la misma factura subida en otro pedido, y el aviso mandaría a buscarla a un
// pedido que ya no existe para nadie.
//
// Módulo puro: sin React, sin Prisma y sin red.

/** Los estados desde los que se anula. Es la regla que ya tenía la ruta. */
export function sePuedeAnular(estado) {
  return estado !== "RECIBIDO" && estado !== "ANULADO";
}

const plural = (n, uno, muchos) => `${n} ${n === 1 ? uno : muchos}`;

/**
 * Qué se dice antes de anular.
 *
 * @param pedidoId   el número del pedido
 * @param proveedor  el nombre, o null
 * @param productos  cuántas líneas tiene el pedido
 * @param facturas   cuántas facturas tiene subidas (sin contar las anuladas)
 * @returns `{ texto, aviso }`: el aviso va aparte, en ámbar, y solo si hay
 *          facturas, que es lo único que se pierde de verdad
 */
export function textoDeAnular({ pedidoId, proveedor = null, productos = 0, facturas = 0 } = {}) {
  const partes = [];
  partes.push(`Vas a anular el pedido #${pedidoId}${proveedor ? ` de ${proveedor}` : ""}.`);
  partes.push(productos > 0 ? `Tiene ${plural(productos, "producto", "productos")}.` : "No tiene ningún producto.");
  partes.push("No se borra nada: queda anulado y sale de Recibir mercadería.");
  const aviso =
    facturas > 0
      ? `Tiene ${plural(facturas, "factura subida", "facturas subidas")}: se ` +
        `${facturas === 1 ? "anula" : "anulan"} con el pedido. Si la mercadería llega igual, ` +
        `hay que subir${facturas === 1 ? "la" : "las"} de nuevo en otro pedido.`
      : null;
  return { texto: partes.join(" "), aviso };
}
