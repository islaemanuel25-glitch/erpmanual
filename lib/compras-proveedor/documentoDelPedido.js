// LOS DOS DOCUMENTOS DE UN PEDIDO, Y CUÁL LLEVA PRECIOS.
//
// ── POR QUÉ ESTO EXISTE COMO ARCHIVO ──────────────────────────────────────
//
// El PDF lo arma el SERVIDOR y lo pide el CLIENTE, así que "cuál de los dos
// documentos es" viaja en la URL: son dos lados que tienen que estar de acuerdo
// sobre el mismo nombre. Escrito en cada lado, el día que uno cambie el otro
// sigue pidiendo el anterior y el servidor le contesta con el default — que
// sería el del proveedor, o sea que la prefactura saldría sin precios sin que
// nada falle. Ese es exactamente el tipo de defecto que vive entre dos piezas.
//
// Acá viven el enum, el default y el nombre del archivo. Nadie los escribe a
// mano en ningún otro lado.

/**
 * Los dos documentos que salen de un mismo pedido.
 *
 * · PROVEEDOR  — se le manda al proveedor. Producto, cantidad y unidad. SIN
 *   costo unitario, SIN subtotal y SIN total: decirle con qué número esperás que
 *   te facture es negociar en contra.
 * · PREFACTURA — es para adentro. Lleva los costos y el total, y es lo que
 *   permite controlar la factura cuando llega.
 */
export const DOCUMENTO = Object.freeze({
  PROVEEDOR: "proveedor",
  PREFACTURA: "prefactura",
});

/**
 * El default es EL DEL PROVEEDOR, y es la decisión de seguridad de este archivo.
 *
 * Un parámetro que no llega, un valor mal escrito o un enlace viejo tienen que
 * caer en el documento SIN precios. Al revés —cayendo en la prefactura— un error
 * de tipeo le manda los costos al proveedor y nadie se entera: el PDF se abre,
 * se ve bien y dice de más.
 */
export const DOCUMENTO_POR_DEFECTO = DOCUMENTO.PROVEEDOR;

/**
 * Normaliza lo que venga de la URL a uno de los dos documentos.
 *
 * Cualquier cosa que no sea exactamente `"prefactura"` cae en el del proveedor,
 * por el motivo de arriba.
 */
export function documentoPedido(bruto) {
  return String(bruto ?? "") === DOCUMENTO.PREFACTURA
    ? DOCUMENTO.PREFACTURA
    : DOCUMENTO.PROVEEDOR;
}

/** ¿Este documento lleva costo unitario, subtotal y total? */
export function llevaPrecios(documento) {
  return documentoPedido(documento) === DOCUMENTO.PREFACTURA;
}

/**
 * El nombre con el que el archivo cae en la carpeta de descargas.
 *
 * ── LOS DOS NOMBRES TIENEN QUE SER DISTINGUIBLES DE UN VISTAZO ────────────
 *
 * En el teléfono los dos PDF terminan en la misma carpeta, y el error que hay
 * que hacer imposible es mandarle la prefactura al proveedor por agarrar el
 * archivo equivocado. `pedido-proveedor-12.pdf` —el nombre que había— no dice
 * cuál de los dos es: se lee como "pedido a proveedor" y sirve para los dos.
 *
 * Así que el nombre dice PARA QUIÉN es, con palabras y no con un sufijo:
 * `pedido-12-para-el-proveedor.pdf` y `pedido-12-prefactura-interna.pdf`.
 */
export function nombreDeArchivo(documento, pedidoId) {
  const n = Number(pedidoId);
  const id = Number.isFinite(n) && n > 0 ? n : "sin-numero";
  return llevaPrecios(documento)
    ? `pedido-${id}-prefactura-interna.pdf`
    : `pedido-${id}-para-el-proveedor.pdf`;
}

/** El título que va arriba del PDF. También dice para quién es. */
export function tituloDelDocumento(documento, pedidoId) {
  return llevaPrecios(documento)
    ? `Prefactura interna - Pedido #${pedidoId}`
    : `Pedido a proveedor #${pedidoId}`;
}
