// lib/compras-proveedor/comprobante/cobertura.js
//
// CUÁNTO DEL PEDIDO YA LLEGÓ EN ALGÚN COMPROBANTE.
//
// ── POR QUÉ ES CONTRA TODOS Y NO CONTRA UNO ────────────────────────────────
//
// Un pedido se cubre con VARIAS facturas. El de Mauro tiene 34 líneas y el
// comprobante que llegó trajo 21: eso NO es una falta, el resto puede venir en
// otra factura.
//
// La primera versión de este conteo comparaba el pedido contra CADA comprobante
// por separado, y con esa cuenta toda factura parcial se veía incompleta. Es
// exactamente la clase de número que enseña a ignorar los avisos: si siempre
// dice que falta algo, deja de significar que falta algo.
//
// ── NO ES UN ERROR MIENTRAS FALTEN COMPROBANTES ────────────────────────────
//
// Que queden líneas sin cubrir es lo NORMAL hasta que se termine de subir todo.
// Recién con el pedido cerrado —o con quien recibe diciendo que no viene nada
// más— una línea sin cubrir pasa a ser una pregunta.
//
// Por eso esto devuelve números y no un veredicto: quien mira decide si falta
// una factura o falta mercadería, y esas dos cosas el sistema no las distingue.
//
// ── ESTO NO REEMPLAZA AL OTRO CONTEO ───────────────────────────────────────
//
// El de cada comprobante contra su propio papel —cuántos renglones dice ver el
// lector contra cuántos transcribió— sigue siendo por comprobante, y es el que
// delata un renglón no leído. Son dos preguntas distintas:
//
//   · ¿este comprobante se leyó entero?        → por comprobante, ES un error
//   · ¿ya llegó todo lo que se pidió?          → contra todos, NO es un error

/**
 * Qué líneas del pedido ya vinieron en algún comprobante.
 *
 * Se cruza por PRODUCTO y no por línea de pedido: el vínculo de una línea de
 * comprobante apunta al producto, y exigir que además apunte a la línea exacta
 * dejaría sin cubrir todo lo que se vinculó sin elegir el renglón.
 *
 * @param detalles            [{ id, productoBaseId, nombre, cantidad }] del pedido
 * @param lineasDeComprobantes [{ productoBaseId, comprobanteId }] de TODOS los
 *                            comprobantes del pedido, ya vinculadas
 */
export function coberturaDelPedido({ detalles = [], lineasDeComprobantes = [] } = {}) {
  const delPedido = Array.isArray(detalles) ? detalles.filter(Boolean) : [];
  const cubiertos = new Set(
    (Array.isArray(lineasDeComprobantes) ? lineasDeComprobantes : [])
      .map((l) => Number(l?.productoBaseId))
      .filter(Number.isFinite)
  );

  const lineas = delPedido.map((d) => ({
    ...d,
    cubierta: cubiertos.has(Number(d.productoBaseId)),
  }));
  const cubiertas = lineas.filter((l) => l.cubierta).length;

  // Lo que vino y NO estaba pedido es la otra mitad de la pregunta, y se cuenta
  // aparte: no es una línea del pedido sin cubrir, es un agregado del proveedor.
  const idsPedidos = new Set(delPedido.map((d) => Number(d.productoBaseId)));
  const deMas = [...cubiertos].filter((id) => !idsPedidos.has(id)).length;

  return {
    totalPedido: delPedido.length,
    cubiertas,
    sinCubrir: delPedido.length - cubiertas,
    deMas,
    lineas,
  };
}

/**
 * Cómo se dice, sin que suene a error.
 *
 * El texto cambia según haya o no comprobantes sin leer: mientras los haya, que
 * falten líneas es lo esperable y decirlo de otra forma sería un aviso que se
 * aprende a ignorar.
 */
export function textoDeCobertura(cobertura, { comprobantesSinLeer = 0, pedidoCerrado = false } = {}) {
  const c = cobertura || {};
  if (!c.totalPedido) return null;

  const base = `${c.cubiertas} de ${c.totalPedido} líneas del pedido ya vinieron en algún comprobante`;

  if (c.sinCubrir === 0) {
    return {
      texto: `${base}. Está todo cubierto.`,
      tono: "ok",
      esAviso: false,
    };
  }
  if (comprobantesSinLeer > 0) {
    return {
      texto:
        `${base}. Faltan ${c.sinCubrir}, y todavía hay ${comprobantesSinLeer} ` +
        `${comprobantesSinLeer === 1 ? "comprobante sin leer" : "comprobantes sin leer"}: ` +
        `puede estar ahí.`,
      tono: "neutro",
      esAviso: false,
    };
  }
  if (!pedidoCerrado) {
    return {
      texto:
        `${base}. Faltan ${c.sinCubrir}. Puede que estén en una factura que todavía no se subió.`,
      tono: "neutro",
      esAviso: false,
    };
  }
  // Recién con el pedido cerrado una línea sin cubrir es una pregunta.
  return {
    texto: `${base}. Quedaron ${c.sinCubrir} sin ningún comprobante que las respalde.`,
    tono: "aviso",
    esAviso: true,
  };
}
