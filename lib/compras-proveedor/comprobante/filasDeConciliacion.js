// lib/compras-proveedor/comprobante/filasDeConciliacion.js
//
// UNA SOLA LISTA, agrupada por comprobante.
//
// ── POR QUÉ SE REHIZO ──────────────────────────────────────────────────────
//
// La pantalla tenía DOS listas separadas: arriba las líneas de la factura
// buscando su producto, abajo el detalle del pedido con sus 34 líneas. Para
// saber si lo que vino era lo que se había pedido, había que ir de una a la otra
// y cruzarlas de memoria.
//
// Ahora cada fila es la línea de la factura CON lo que le corresponde del pedido
// al lado: lo pedido contra lo recibido, el costo del catálogo contra el de la
// factura, el subtotal y el aviso. Y las líneas del pedido que ningún
// comprobante trajo van aparte, al final.
//
// ── LA CANTIDAD PEDIDA SE REPITE, Y ES A PROPÓSITO ─────────────────────────
//
// Un pedido se cubre con VARIAS facturas, así que la misma línea del pedido
// puede venir partida en dos comprobantes. En cada fila se muestra la cantidad
// pedida completa —las dos dicen "pediste 10"— y aparte el acumulado entre
// todos los comprobantes: "entre los dos vinieron 8".
//
// Mostrarla solo en la primera obligaría a recordar, mirando la segunda, cuánto
// se había pedido. Y el acumulado existe para no tener que sumar de memoria, que
// es exactamente lo que esta pantalla vino a sacar.
//
// ── LO QUE FALTA NO ES UN ERROR MIENTRAS FALTEN COMPROBANTES ───────────────
//
// El grupo final se muestra SOLO si tiene algo, con el conteo en el título. Y no
// se pinta como problema mientras haya comprobantes sin subir o sin leer: la
// línea puede estar en una factura que todavía no llegó. Eso ya estaba decidido
// y el texto sale de `textoDeCobertura`, que es donde vive esa regla.

/** Suma segura: lo que no es número no suma, y no rompe el total. */
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Arma los grupos que dibuja la pantalla.
 *
 * @param comprobantes  [{ id, estado, tipo, puntoVenta, numero, fecha, lineas: [...] }]
 *                      cada línea ya viene con su `pedidoDetalle`, su análisis de
 *                      precio y su vínculo — este módulo NO decide nada de eso,
 *                      solo ordena y aparea.
 * @param detalles      las líneas del pedido: [{ id, productoBaseId, nombre,
 *                      cantidad, precioCosto, cantidadRecibida, unidad }]
 */
export function filasDeConciliacion({ comprobantes = [], detalles = [] } = {}) {
  const porDetalle = new Map(); // id del detalle → cuánto trajeron TODOS los comprobantes

  const listaComprobantes = Array.isArray(comprobantes) ? comprobantes : [];
  const listaDetalles = Array.isArray(detalles) ? detalles : [];

  // Primera pasada: el acumulado por línea del pedido. Va ANTES de armar las
  // filas porque cada fila necesita el total de todas, no solo el de la suya.
  for (const c of listaComprobantes) {
    for (const l of c?.lineas ?? []) {
      const id = l?.pedidoDetalleId ?? l?.pedidoDetalle?.id ?? null;
      if (id == null) continue;
      porDetalle.set(id, num(porDetalle.get(id)) + num(l.cantidad));
    }
  }

  const grupos = listaComprobantes.map((c) => ({
    tipo: "COMPROBANTE",
    comprobante: {
      id: c.id,
      estado: c.estado,
      identidad: identidadDe(c),
      fecha: c.fecha ?? null,
      lineasVinculadas: (c.lineas ?? []).filter((l) => l.productoLocalId != null).length,
    },
    filas: (c.lineas ?? []).map((l) => armarFila(l, porDetalle)),
  }));

  // Las del pedido que NADIE trajo. Se comparan por id del detalle, no por
  // producto: dos líneas del mismo producto en el pedido son dos líneas.
  const traidos = new Set(porDetalle.keys());
  const sinComprobante = listaDetalles
    .filter((d) => !traidos.has(d.id))
    .map((d) => ({
      pedidoDetalleId: d.id,
      producto: d.nombre ?? null,
      cantidadPedida: num(d.cantidad),
      unidad: d.unidad ?? null,
      costoCatalogo: d.precioCosto ?? null,
      subtotalPedido: num(d.cantidad) * num(d.precioCosto),
      // La recepción se carga acá también: es lo que llegó sin papel, o lo que
      // no llegó y hay que dejar en cero.
      cantidadRecibida: d.cantidadRecibida ?? null,
      kgRecibidos: d.kgRecibidos ?? null,
      // De esto depende que aparezca la columna de kilos. El fiambre entra por
      // pieza en el depósito y se mide en kilos en el local.
      esFiambre: d.esFiambre === true,
    }));

  return {
    grupos,
    sinComprobante,
    // El grupo final se dibuja SOLO si tiene algo.
    hayFaltantes: sinComprobante.length > 0,
    totales: {
      lineasDeComprobantes: grupos.reduce((a, g) => a + g.filas.length, 0),
      lineasDelPedido: listaDetalles.length,
      sinComprobante: sinComprobante.length,
    },
  };
}

function identidadDe(c) {
  if (!c?.numero) return "Sin número todavía";
  return `${c.tipo ?? ""} ${c.puntoVenta ?? ""}-${c.numero}`.trim();
}

/**
 * Una fila: la línea de la factura con lo del pedido al lado.
 *
 * Lo que NO hace: decidir el vínculo, deducir la unidad o clasificar el precio.
 * Todo eso ya viene resuelto en la línea. Acá solo se aparea y se calcula el
 * acumulado, que es lo único que ninguna de las dos partes puede saber sola.
 */
function armarFila(l, porDetalle) {
  const det = l?.pedidoDetalle ?? null;
  const idDet = l?.pedidoDetalleId ?? det?.id ?? null;
  const recibidoEntreTodos = idDet != null ? num(porDetalle.get(idDet)) : null;
  const pedida = det ? num(det.cantidad) : null;

  return {
    lineaId: l.id,
    // Lo que dice el papel.
    textoCrudo: l.textoCrudo ?? null,
    codigoProveedor: l.codigoProveedor ?? null,
    cantidad: num(l.cantidad),
    costoFactura: l.precio?.precioAEscribir ?? l.precio?.precioFinal ?? null,
    subtotal: l.subtotalImpreso ?? null,

    // El vínculo, tal como lo resolvió la cascada.
    productoLocalId: l.productoLocalId ?? null,
    producto: l.sugerido?.nombre ?? det?.nombre ?? null,
    vinculadaSola: l.vinculadaSola === true,
    requiereDecision: l.requiereDecision === true,
    origen: l.origen ?? null,
    textoOrigen: l.textoOrigen ?? null,
    candidatos: l.candidatos ?? [],

    // Lo que le corresponde del pedido.
    pedidoDetalleId: idDet,
    cantidadPedida: pedida,
    // OJO CON EL NOMBRE: `unidadPedido` es la unidad de compra de la línea del
    // pedido —bulto, unidad, kilo—. Más abajo está `unidad`, que es OTRA cosa:
    // el veredicto de si la FACTURA cobra por unidad o por bulto. Se llamaban
    // igual y la segunda pisaba a la primera, así que la unidad del pedido
    // desaparecía sin que nada lo dijera.
    unidadPedido: det?.unidad ?? null,
    costoCatalogo: det?.precioCosto ?? null,
    esFiambre: det?.esFiambre === true,
    cantidadRecibida: det?.cantidadRecibida ?? null,
    kgRecibidos: det?.kgRecibidos ?? null,
    // El acumulado ENTRE TODOS los comprobantes, para no sumar de memoria.
    recibidoEntreTodos,
    // Se dice en criollo solo cuando hay algo que aclarar: si esta fila trae
    // todo lo pedido, repetirlo es ruido.
    textoAcumulado:
      pedida != null && recibidoEntreTodos != null && recibidoEntreTodos !== num(l.cantidad)
        ? `Pediste ${limpio(pedida)}, entre los comprobantes vinieron ${limpio(recibidoEntreTodos)}.`
        : null,

    // Lo que la fila tiene que preguntar o avisar, ya resuelto río arriba.
    unidad: l.unidad ?? null,
    precio: l.precio ?? null,
    problema: l.problema ?? null,
    textoMotivoPedido: l.textoMotivoPedido ?? null,
  };
}

/** Un número como lo escribiría una persona: sin decimales si no hacen falta. */
function limpio(n) {
  const v = num(n);
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
}
