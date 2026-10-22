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
 * CUÁNTOS PRODUCTOS TRAE CADA PAPEL, Y CUÁNTOS YA TIENEN PRODUCTO DEL CATÁLOGO.
 *
 * ── EL CASO (Coca-Cola #259, 2026-10-22) ──────────────────────────────────
 *
 * La tarjeta decía "17 productos" y la cabecera "4 productos del pedido · 4 de
 * 4 llegaron". Las dos cuentas eran otras cosas:
 *
 *   · "17 productos" contaba TODOS los renglones del papel, envases y cargos
 *     incluidos —una botella de cambio o el flete no son productos—.
 *   · El pedido nació de esa factura, y sus líneas se crean SOLO con los
 *     renglones que se pudieron atar a un producto, una por producto
 *     (`pedidoDesdeFactura`). Contra ese pedido, "4 de 4 llegaron" es verdad
 *     por construcción: no puede decir otra cosa, y escondía los renglones
 *     del papel que todavía no tienen producto.
 *
 * Así que la tarjeta cuenta solo mercadería, y en un pedido nacido de factura
 * la pregunta que vale es cuántos de esos productos ya tienen producto.
 *
 * @param lineas  `[{ comprobanteId, tipoRenglon, productoLocalId }]`
 * @returns Map comprobanteId → `{ productos, conProducto }`
 */
export function productosDelPapel(lineas = []) {
  const porComprobante = new Map();
  for (const l of Array.isArray(lineas) ? lineas : []) {
    // Envases y cargos no son productos (`TIPO_RENGLON`). Un renglón sin tipo
    // —lecturas de antes— es mercadería, como lo trata el resto del módulo.
    if (l?.tipoRenglon === "ENVASE" || l?.tipoRenglon === "CARGO") continue;
    const c = porComprobante.get(l.comprobanteId) ?? { productos: 0, conProducto: 0 };
    c.productos += 1;
    if (l.productoLocalId != null) c.conProducto += 1;
    porComprobante.set(l.comprobanteId, c);
  }
  return porComprobante;
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
