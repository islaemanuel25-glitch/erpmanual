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
/**
 * LO QUE FACTURARON TODAS LAS FACTURAS DEL PEDIDO, JUNTAS.
 *
 * ── POR QUÉ ES UNA FUNCIÓN Y NO UNA SUMA ESCRITA EN LA PANTALLA ───────────
 *
 * Porque tiene dos decisiones adentro y las dos se pueden equivocar en
 * silencio. Escrita como un `reduce` en un JSX, ninguna se puede ejercer.
 *
 * 1. SE SUMAN SOLO LAS QUE TRAEN TOTAL IMPRESO. Un remito no trae, y sumarle un
 *    cero lo haría desaparecer de la cuenta como si hubiera facturado nada.
 *    Que la suma quede corta es correcto: es lo que hay impreso. Mezclar un
 *    total leído con una suma calculada en el mismo número sería inventar.
 *
 * 2. SI NINGUNA TRAE TOTAL, ES NULL Y NO CERO. Null significa "el papel no lo
 *    dice", y las dos pantallas lo leen así para caer a la suma de lo
 *    comparable. Cero sería una afirmación falsa sobre plata — es exactamente
 *    el defecto que mostró "Te facturó Mauro $0,00" en el pedido 232.
 *
 * @param grupos los que devuelve `filasDeConciliacion`
 */
export function totalImpresoDeLasFacturas(grupos) {
  const totales = (Array.isArray(grupos) ? grupos : [])
    .map((g) => g?.comprobante?.totalDelPapel)
    .filter((v) => v != null && Number.isFinite(Number(v)))
    .map(Number);
  if (!totales.length) return null;
  return totales.reduce((a, b) => a + b, 0);
}

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
      // ── EL TOTAL IMPRESO DEL PAPEL ───────────────────────────────────
      //
      // La tarjeta de la recepción decía "Factura $294.249,80" sobre un papel
      // que dice $348.711,61, y ese número no estaba en ninguna parte del
      // papel: era la suma de los renglones COMPARABLES —7 de 9— valuados al
      // precio final. Un rótulo que dice "Factura" tiene que mostrar lo que
      // factura el papel.
      //
      // NULL Y CERO NO SON LO MISMO, y `num()` los confunde: devuelve 0 para
      // los dos. El pedido 232 —el remito de Mauro, estado SIN_TOTAL— mostró
      // "Te facturó Mauro $0,00" por eso, y ese cero es una afirmación falsa
      // sobre plata. Son 2 de los 5 comprobantes de producción los que no
      // traen total impreso: el caso es frecuente, no una excepción.
      //
      // Null significa "el papel no lo dice", y las dos pantallas lo leen así
      // para caer a la suma de lo comparable. Por eso la conversión se saltea
      // cuando la columna viene vacía, igual que hace `pruebaDeExplicacion`
      // con su `hayTotal`.
      totalDelPapel: c.totalLeido == null ? null : num(c.totalLeido),
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
      // ── LO QUE LA HOJA DE CORREGIR NECESITA PARA CONTAR SIN PAPEL ─────
      //
      // `aplanarDetalles` ya los trae y este `.map` los tiraba. Sin ellos, un
      // pedido que llegó sin factura no puede contarse en bultos y sueltas ni
      // conservar el motivo que alguien ya anotó: `filaSinPapel` los lee de acá.
      productoBaseId: d.productoBaseId ?? null,
      factorPack: d.factorPack ?? null,
      unidadesSueltas: d.unidadesSueltas ?? null,
      motivoPrincipal: d.motivoPrincipal ?? null,
      motivoDetalle: d.motivoDetalle ?? null,
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
    // LOS KILOS DEL PAPEL, cuando los trae. Con kilos, "8" no son ocho unidades
    // sino ocho piezas de un peso que el papel dice, y el precio es por kilo.
    peso: l.pesoKg ?? l.peso ?? null,
    bonificacion: l.bonificacionPct ?? l.bonificacion ?? null,
    costoFactura: l.precio?.precioAEscribir ?? l.precio?.precioFinal ?? null,
    // ── BONIFICADO: SIN COSTO DEL PAPEL, A PROPÓSITO ─────────────────────
    //
    // Descuento del 100 %. `costoFactura` queda en null —no en cero— y con eso
    // no hay comparación, ni decisión, ni costo que escribir: el producto
    // conserva el suyo. La tarjeta lo dice con esta marca.
    bonificado: l.precio?.bonificado === true,
    // ── LO CORREGIDO MANDA SOBRE LO LEÍDO ────────────────────────────────
    //
    // Si alguien —o la cuenta del papel— corrigió un dígito mal leído, ese es
    // el importe del renglón: de él sale el costo del papel y con él suma la
    // tarjeta. Sin esto, el comprobante cerraba y la conciliación seguía
    // mostrando el número viejo, que es peor que no corregir: dos pantallas
    // diciendo cosas distintas del mismo renglón.
    subtotal: l.subtotalCorregido ?? l.subtotalImpreso ?? null,
    /** Lo que el lector creyó leer, cuando se corrigió. Para poder decirlo. */
    subtotalLeido: l.subtotalCorregido != null ? (l.subtotalImpreso ?? null) : null,
    // ── SI ESTE PRODUCTO SE MIDE EN KILOS, Y SI LOS KILOS ESTÁN ──────────
    //
    // Los dos salen del PRODUCTO del catálogo, no del papel: la unidad la
    // decide el producto. Viajan con la fila porque de ellos depende cómo se
    // valoriza el renglón —por kilo o por unidad— y si entra en la cuenta.
    //
    // `faltanKilos` es el ÚNICO motivo por el que un renglón queda afuera por
    // peso: producto que va por kilo y papel que no los trae. Los kilos se
    // pesan al recibir. Antes quedaban afuera TODOS los de fiambre, incluidos
    // los tres del papel de Paty que SÍ traen los kilos impresos.
    porKilo: l.precio?.porKilo ?? null,
    faltanKilos: l.precio?.faltanKilos === true,

    // El vínculo, tal como lo resolvió la cascada.
    productoLocalId: l.productoLocalId ?? null,
    productoBaseId: l.productoBaseId ?? det?.productoBaseId ?? null,
    // Lo que ya se decidió sobre el precio de este producto con este proveedor.
    // Si sigue valiendo lo dice `decisionVigente`, comparándola contra
    // `costoFactura` y `costoCatalogo`, que están las dos en esta misma fila.
    decisionPrecio: l.decisionPrecio ?? null,
    // Y el costo maestro crudo de hoy de ese producto, contra el que se compara
    // el que se observó al decidir.
    costoMaestroCatalogo: l.costoMaestroCatalogo ?? null,
    // ── SI ALGUIEN YA CONTROLÓ ESTE RENGLÓN ───────────────────────────────
    //
    // Viaja con la fila porque es un hecho de la LÍNEA DEL PAPEL, no de la
    // línea del pedido: dos renglones pueden apuntar a la misma del pedido y
    // marcar uno no marca el otro.
    revisada: l.revisadoEnRecepcion === true,
    revisadaEn: l.revisadoEnRecepcionAt ?? null,
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
    // El costo maestro de HOY, en la misma unidad que `costoCatalogo`. Es con
    // lo que compara el cierre; la hoja lo necesita cuando el catálogo se movió
    // después del pedido. Ver `elCatalogoSeMovio`.
    costoMaestroHoy: det?.costoMaestroHoy ?? null,
    esFiambre: det?.esFiambre === true,
    cantidadRecibida: det?.cantidadRecibida ?? null,
    kgRecibidos: det?.kgRecibidos ?? null,
    // Para la hoja de corregir: el tamaño del bulto y lo que ya se anotó.
    factorPack: det?.factorPack ?? null,
    unidadesSueltas: det?.unidadesSueltas ?? null,
    motivoPrincipal: det?.motivoPrincipal ?? null,
    motivoDetalle: det?.motivoDetalle ?? null,
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

/**
 * LA CLAVE DE UNA FILA EN LA PANTALLA.
 *
 * Un renglón del papel se identifica por su `lineaId`. Una fila sin papel no
 * tiene renglón, así que se identifica por la línea del pedido. Son espacios
 * distintos a propósito —`pedido-12` no puede chocar con el renglón 12— y la
 * marca de revisado, la clave de React y el eco de la pantalla usan ésta.
 */
export function claveDeFila(f) {
  if (f?.lineaId != null) return f.lineaId;
  return f?.pedidoDetalleId != null ? `pedido-${f.pedidoDetalleId}` : null;
}

/**
 * UNA LÍNEA DEL PEDIDO QUE LLEGÓ SIN PAPEL, CON LA FORMA DE UNA FILA.
 *
 * Cuando el pedido llega sin factura, la recepción es LA MISMA lista, la misma
 * tarjeta y las mismas hojas que con papel. Para eso cada línea del pedido tiene
 * que tener la forma exacta de la fila que arma `armarFila`: mismas claves, y
 * lo que viene del papel en null.
 *
 * Sale de un elemento de `sinComprobante` —lo que devuelve el endpoint de
 * conciliación, no una forma escrita de memoria— más lo que se contó en la
 * pantalla:
 *
 *   · `cantidad` es LO CONTADO, que arranca en lo pedido. Es el número que la
 *     tarjeta muestra y el que compara contra `cantidadPedida` para decir si
 *     falta o sobra. No hay "lo que dice el papel" porque no hay papel.
 *   · `costoFactura` va en null: sin papel no hay precio con qué comparar, así
 *     que ninguna pieza ofrece aceptar un aumento. El costo es el del pedido.
 *   · `porKilo` sigue al fiambre, que es el criterio con el que la recepción
 *     vieja mostraba el campo de kilos.
 *
 * @param d  un elemento de `sinComprobante`.
 * @param opciones.contada  lo contado en la pantalla; si falta, lo pedido.
 * @param opciones.kilos    los kilos cargados en la pantalla, si hay.
 */
export function filaSinPapel(d, { contada = null, kilos = null } = {}) {
  const pedida = num(d?.cantidadPedida);
  const cuenta = contada === null || contada === undefined || contada === "" ? pedida : num(contada);
  const esFiambre = d?.esFiambre === true;
  return {
    lineaId: null,
    sinPapel: true,
    textoCrudo: null,
    codigoProveedor: null,
    cantidad: cuenta,
    peso: null,
    bonificacion: null,
    costoFactura: null,
    // Sin papel no hay renglón regalado: el costo es el del pedido.
    bonificado: false,
    subtotal: null,
    subtotalLeido: null,
    porKilo: esFiambre,
    faltanKilos: false,
    productoLocalId: null,
    productoBaseId: d?.productoBaseId ?? null,
    decisionPrecio: null,
    costoMaestroCatalogo: null,
    revisada: false,
    revisadaEn: null,
    producto: d?.producto ?? null,
    vinculadaSola: false,
    requiereDecision: false,
    origen: null,
    textoOrigen: null,
    candidatos: [],
    pedidoDetalleId: d?.pedidoDetalleId ?? null,
    cantidadPedida: pedida,
    unidadPedido: d?.unidad ?? null,
    costoCatalogo: d?.costoCatalogo ?? null,
    // Sin papel no hay precio que comparar contra el catálogo de hoy: la línea
    // no toca el costo (`costosQueNoSeTocan`) y nunca pregunta.
    costoMaestroHoy: null,
    esFiambre,
    // Lo contado es lo que se recibe: la hoja de corregir abre con esto.
    cantidadRecibida: cuenta,
    kgRecibidos: kilos === null || kilos === undefined || kilos === "" ? d?.kgRecibidos ?? null : num(kilos),
    factorPack: d?.factorPack ?? null,
    unidadesSueltas: d?.unidadesSueltas ?? null,
    motivoPrincipal: d?.motivoPrincipal ?? null,
    motivoDetalle: d?.motivoDetalle ?? null,
    recibidoEntreTodos: null,
    textoAcumulado: null,
    unidad: null,
    precio: null,
    problema: null,
    textoMotivoPedido: null,
  };
}

/** Un número como lo escribiría una persona: sin decimales si no hacen falta. */
function limpio(n) {
  const v = num(n);
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
}
