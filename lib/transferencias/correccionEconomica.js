// lib/transferencias/correccionEconomica.js
//
// LA PLATA DE UNA RECEPCIÓN QUE NO COINCIDIÓ CON EL REMITO. Funciones PURAS: no
// consultan Prisma, no dependen de Next, no escriben nada. El camino que las usa
// es `app/api/transferencias/confirmar-recepcion/route.js`, adentro de su
// transacción.
//
// ── EL DEFECTO QUE ESTE MÓDULO CIERRA ──────────────────────────────────────
//
// Hasta el 2026-09-11 confirmar una recepción movía el stock y dejaba la plata
// donde estaba. Lo decía el propio `confirmar-recepcion`: *"el ajuste es de
// INVENTARIO, no comercial: si la transferencia nació de una venta interna, esa
// venta sigue facturando lo enviado. Resolver el desfase es una etapa aparte."*
//
// Esta es esa etapa. La transferencia #198 recibió 6 packs más 12 sueltas —156
// unidades contra 144 despachadas— y su venta seguía diciendo 31.500 cuando lo
// que entró vale 34.125. Stock corregido y dinero original es exactamente lo que
// no puede quedar.
//
// ── POR QUÉ UN TIPO PROPIO Y NO EL FLUJO `COMPLETA` ────────────────────────
//
// `COMPLETA` corrige una venta del POS y trae reglas que acá son falsas: exige el
// turno original abierto, mueve stock, toca caja, está detrás de un feature flag
// y encima `bloqueoCorreccion` le prohíbe tocar una venta con remito. En una
// recepción el stock ya lo movió la recepción, la caja no se mueve, la venta está
// vinculada al remito POR DEFINICIÓN, y la recepción ocurre días después.
//
// Ese último punto está medido, no supuesto: de las 196 ventas internas con
// remito que hay en producción, **147 tienen el turno original cerrado**. Exigir
// turno abierto bloquearía tres de cada cuatro recepciones.
//
// Lo que sí se reutiliza es todo lo demás: `VentaCorreccion` con sus snapshots,
// el versionado optimista, la idempotencia por clave, y los diffs. `tipo` es un
// String en el schema, así que el tipo nuevo NO necesita migración.
//
// ── LO QUE ESTE MÓDULO NO HACE, Y ES DELIBERADO ────────────────────────────
//
// No mueve stock —ya lo movió la recepción y repetirlo acreditaría dos veces las
// mismas unidades—, no crea `CajaMovimiento` —una venta interna con remito está
// excluida del arqueo, lo dice `impactoEnArqueo`— y no crea `MovimientoCuenta`:
// inventar deuda entre el depósito y el local sería un hecho nuevo que nadie
// decidió.

import { round2 } from "@/lib/pos-ventas/pagos";

/** El tipo nuevo de `VentaCorreccion`. Es String en el schema: sin migración. */
export const TIPO_CORRECCION_RECEPCION = "RECEPCION_TRANSFERENCIA";

/** El error de la línea que no se puede convertir. Código estable. */
export const LINEA_SIN_CONSUMO_FISICO = "LINEA_SIN_CONSUMO_FISICO";

/**
 * La clave de idempotencia de esta corrección.
 *
 * Sale de la TRANSFERENCIA y no de la venta ni del momento: confirmar dos veces
 * la misma recepción tiene que chocar contra el `@@unique([ventaId,
 * idempotencyKey])` que ya existe. `reclamarOFallar` ya protege el camino, y esto
 * lo protege otra vez a nivel base — el día que alguien agregue un segundo
 * camino, la base sigue diciendo que no.
 */
export function claveIdempotencia(transferenciaId) {
  return `recepcion-transferencia:${Number(transferenciaId)}`;
}

/** Pesos → centavos enteros. Toda la aritmética del dinero pasa por acá. */
const aCent = (n) => Math.round((Number(n) || 0) * 100);
const dePesos = (cent) => cent / 100;

/**
 * LAS LÍNEAS COMERCIALES QUE REPRESENTAN LO RECIBIDO DE UN PRODUCTO.
 *
 * ── POR QUÉ DOS LÍNEAS Y NO UN PACK FRACCIONARIO ──────────────────────────
 *
 * `VentaDetalle.cantidad` es `Decimal(12,3)`. Escribir "6 packs más 5 sueltas"
 * como 6,208 packs no es un redondeo: 6,208 × 24 = 148,992, o sea que la venta
 * pasaría a decir que se movieron 148,992 unidades de las 149 que se contaron. Y
 * con el precio por pack encima, esa pérdida se convierte en plata.
 *
 * Por eso los bultos completos y las sueltas son DOS líneas del mismo producto,
 * cada una con su cantidad entera y su cantidadStock exacta. Que `VentaDetalle`
 * admite varias líneas del mismo producto no es una suposición: no hay
 * `@@unique([ventaId, productoBaseId])` en el schema y ya ocurre en producción
 * —el conteo dio ventas reales con `productoBaseId` repetido—.
 *
 * ── DE DÓNDE SALE EL DINERO: DEL PRECIO, NO DEL COSTO ─────────────────────
 *
 * El precio unitario físico se deriva de la línea ORIGINAL —`subtotal` sobre
 * `cantidadStock`— y no del catálogo de hoy ni de `precioCosto`. Es el mismo
 * precio comercial que generó la venta, congelado. Hoy las 6.681 líneas internas
 * tienen `precio` igual a `precioCosto`, pero que coincidan no es motivo para
 * leer el que no corresponde: lo que se cobra es `precio`.
 *
 * ── EL CENTAVO ────────────────────────────────────────────────────────────
 *
 * El precio unitario NO se redondea para calcular: se redondea una sola vez, al
 * final, sobre el total del producto. Después los bultos se calculan y las
 * sueltas se llevan el residuo, así que las dos líneas suman el total exacto
 * aunque el factor no divida —1.000 el pack de 3 son 333,3333 la unidad—. El
 * `precio` que se guarda sí va redondeado, para mostrarlo; el que manda es el
 * `subtotal`, igual que en una línea por importe.
 *
 * @param {object} args
 * @param {object} args.detalleVenta     el VentaDetalle original
 * @param {number} args.factor           el factor de la presentación canónica
 * @param {number} args.recibidasFisicas unidades físicas efectivamente recibidas
 */
export function lineasCorregidasDeProducto({ detalleVenta, factor, recibidasFisicas } = {}) {
  const vd = detalleVenta || {};
  const stockOriginal = Number(vd.cantidadStock);

  // Sin consumo físico congelado no hay cómo pasar de plata a unidades: un combo
  // gasta por sus componentes y un servicio no gasta nada. La auditoría dio cero
  // de los dos en ventas internas, así que no hay caso con el que probar una
  // conversión — y una conversión sin caso que la ejerza es exactamente como se
  // escribe una que nadie sabe si funciona.
  if (!Number.isFinite(stockOriginal) || stockOriginal <= 0) {
    const e = new Error(
      `${LINEA_SIN_CONSUMO_FISICO}: la línea ${vd.id ?? "?"} no tiene cantidadStock, ` +
        "así que no se puede derivar su precio por unidad física"
    );
    e.code = LINEA_SIN_CONSUMO_FISICO;
    throw e;
  }

  const f = Math.max(1, Number(factor) || 1);
  const fisicas = Number(recibidasFisicas) || 0;

  // Sin redondear. Redondear acá es de dónde salen los centavos perdidos.
  const precioUnitarioFisico = Number(vd.subtotal) / stockOriginal;
  const costoUnitarioFisico = (Number(vd.precioCosto) || 0) / f;

  const totalCent = Math.round(fisicas * precioUnitarioFisico * 100);
  const subtotalProducto = dePesos(totalCent);

  // Los bultos completos, y lo que sobra. Con factor 1 —UNIDAD, KG, PIEZA— no hay
  // nada que separar: la cantidad ES la escala, y una cantidad fraccionaria de
  // kilos tampoco se parte.
  const agrupa = f > 1 && Number.isInteger(fisicas);
  const bultos = agrupa ? Math.floor(fisicas / f) : fisicas;
  const sueltas = agrupa ? fisicas - bultos * f : 0;

  const stockBultos = agrupa ? bultos * f : fisicas;
  const centBultos = Math.round(stockBultos * precioUnitarioFisico * 100);

  const lineaBultos = {
    origenDetalleId: vd.id ?? null,
    productoBaseId: vd.productoBaseId ?? null,
    nombre: vd.nombre ?? null,
    cantidad: bultos,
    cantidadStock: stockBultos,
    // El precio de la presentación entera se conserva tal cual estaba: es el que
    // el operador vio y el que el ticket imprimió.
    precio: round2(vd.precio),
    precioCosto: round2(vd.precioCosto),
    subtotal: dePesos(centBultos),
    ganancia: dePesos(centBultos - Math.round(stockBultos * costoUnitarioFisico * 100)),
    esSueltas: false,
  };

  const lineas = [lineaBultos];

  if (sueltas > 0) {
    // El residuo del redondeo cae ACÁ, en una sola línea. Repartirlo entre las
    // dos dejaría las dos mal por medio centavo cada una.
    const centSueltas = totalCent - centBultos;
    lineas.push({
      origenDetalleId: vd.id ?? null,
      productoBaseId: vd.productoBaseId ?? null,
      nombre: vd.nombre ?? null,
      cantidad: sueltas,
      cantidadStock: sueltas,
      precio: round2(precioUnitarioFisico),
      precioCosto: round2(costoUnitarioFisico),
      subtotal: dePesos(centSueltas),
      ganancia: dePesos(centSueltas - Math.round(sueltas * costoUnitarioFisico * 100)),
      esSueltas: true,
    });
  }

  return {
    lineas,
    subtotalProducto,
    recibidasFisicas: fisicas,
    enviadasFisicas: stockOriginal,
    sinCambio: totalCent === aCent(vd.subtotal) && fisicas === stockOriginal,
  };
}

/**
 * LOS PAGOS, SINCRONIZADOS CONTRA EL NUEVO TOTAL.
 *
 * Un pago solo cambia de monto y conserva todo lo demás: medio, modalidad,
 * procesador, nombres congelados. NO se inventa un medio nuevo — y no se podría
 * aunque se quisiera, porque `VentaPago` tiene únicos parciales por medio y por
 * modalidad.
 *
 * Con varios pagos se conserva la PROPORCIÓN original y el último absorbe el
 * residuo, así que la suma da el total exacto siempre. Hoy esto no ocurre nunca
 * —las 196 ventas internas tienen exactamente un pago, todas en EFECTIVO— y se
 * escribe igual: el día que aparezca el segundo medio, la regla ya está decidida
 * en vez de improvisarse con una venta real adelante.
 *
 * No toca caja: una venta interna con remito no cuenta para el arqueo.
 */
export function sincronizarPagos(pagos = [], totalNuevo = 0) {
  const lista = Array.isArray(pagos) ? pagos : [];
  if (lista.length === 0) return [];

  const objetivoCent = aCent(totalNuevo);
  const anteriorCent = lista.reduce((a, p) => a + aCent(p.monto), 0);

  let repartido = 0;
  return lista.map((p, i) => {
    const esUltimo = i === lista.length - 1;
    // El último cierra por resta, que es lo que hace exacta la suma. Si el total
    // anterior era 0 no hay proporción que conservar y todo cae en el último.
    const cent = esUltimo
      ? objetivoCent - repartido
      : anteriorCent === 0
        ? 0
        : Math.round((aCent(p.monto) * objetivoCent) / anteriorCent);
    if (!esUltimo) repartido += cent;
    return { ...p, montoAnterior: round2(p.monto), monto: dePesos(cent) };
  });
}

/**
 * EL PLAN COMPLETO DE LA CORRECCIÓN. Puro: decide, no escribe.
 *
 * @param {object} args
 * @param {object} args.venta            { id, numero, total, version, turnoId, turnoCerrado, detalles, pagos }
 * @param {number} args.transferenciaId
 * @param {Array}  args.recibido         [{ productoBaseId, recibidasFisicas, factor }]
 * @param {string} [args.estadoTransferencia]
 */
export function planCorreccionEconomica({
  venta,
  transferenciaId,
  recibido = [],
  estadoTransferencia = null,
} = {}) {
  const v = venta || {};
  const detalles = Array.isArray(v.detalles) ? v.detalles : [];
  const pagos = Array.isArray(v.pagos) ? v.pagos : [];
  const totalAnterior = round2(v.total);

  const base = {
    tipo: TIPO_CORRECCION_RECEPCION,
    idempotencyKey: claveIdempotencia(transferenciaId),
    motivo: `Corrección automática por recepción de Transferencia #${Number(transferenciaId)}`,
    ventaId: v.id ?? null,
    turnoIdOriginal: v.turnoId ?? null,
    turnoCerrado: v.turnoCerrado === true,
    // La diferencia NO cae en ningún turno: no hay caja que mover.
    turnoIdCorreccion: null,
    versionAntes: Number(v.version) || 0,
    versionDespues: (Number(v.version) || 0) + 1,
    totalAnterior,
    // El inventario lo movió la recepción. Dejarlo en cero no es "no pasó nada":
    // es que ESTA corrección no movió nada, que es distinto y está dicho en el
    // snapshot.
    impactoStock: [],
    impactoCaja: { signo: 0, monto: 0, medios: [], movimientoIds: [], cajaMovimientoIds: [] },
    movimientosCuenta: [],
  };

  // ── EMPAREJAR POR PRODUCTO ────────────────────────────────────────────────
  const porProducto = new Map();
  for (const r of recibido) porProducto.set(Number(r.productoBaseId), r);

  const lineasNuevas = [];
  const diffProductos = [];
  let totalCent = 0;
  let huboMatch = false;
  let todasSinCambio = true;

  for (const d of detalles) {
    const r = porProducto.get(Number(d.productoBaseId));

    // Una línea de la venta que el remito no menciona se conserva tal cual: no
    // se toca lo que esta recepción no contó.
    if (!r) {
      totalCent += aCent(d.subtotal);
      lineasNuevas.push({
        origenDetalleId: d.id ?? null,
        productoBaseId: d.productoBaseId ?? null,
        nombre: d.nombre ?? null,
        cantidad: Number(d.cantidad),
        cantidadStock: Number(d.cantidadStock),
        precio: round2(d.precio),
        precioCosto: round2(d.precioCosto),
        subtotal: round2(d.subtotal),
        ganancia: round2(d.ganancia ?? 0),
        esSueltas: false,
      });
      continue;
    }

    huboMatch = true;
    const res = lineasCorregidasDeProducto({
      detalleVenta: d,
      factor: r.factor,
      recibidasFisicas: r.recibidasFisicas,
    });
    if (!res.sinCambio) todasSinCambio = false;
    totalCent += aCent(res.subtotalProducto);
    lineasNuevas.push(...res.lineas);

    const antes = Number(d.cantidadStock);
    const despues = res.recibidasFisicas;
    diffProductos.push({
      productoBaseId: d.productoBaseId ?? null,
      nombre: d.nombre ?? null,
      cantidadAntes: antes,
      cantidadDespues: despues,
      estado: despues === antes ? "IGUAL" : despues > antes ? "MAS" : "MENOS",
    });
  }

  if (!huboMatch) {
    return {
      ...base,
      aplica: false,
      sinCambio: true,
      motivoNoAplica:
        "ninguna línea de la venta corresponde a un producto de esta recepción: " +
        "no se corrige a ciegas una venta que no se sabe si es la del remito",
      totalNuevo: totalAnterior,
      diferencia: 0,
      lineas: [],
      pagos: [],
      diffProductos: [],
      diffPagos: [],
      snapshotAntes: null,
      snapshotDespues: null,
    };
  }

  const totalNuevo = dePesos(totalCent);
  const diferencia = dePesos(totalCent - aCent(totalAnterior));
  const sinCambio = todasSinCambio && totalCent === aCent(totalAnterior);
  const pagosNuevos = sincronizarPagos(pagos, totalNuevo);

  const snapshotDetalle = (d) => ({
    id: d.id ?? null,
    productoBaseId: d.productoBaseId ?? null,
    nombre: d.nombre ?? null,
    cantidad: Number(d.cantidad),
    cantidadStock: d.cantidadStock == null ? null : Number(d.cantidadStock),
    precio: round2(d.precio),
    subtotal: round2(d.subtotal),
  });

  return {
    ...base,
    // Sin diferencia NO se escribe una corrección. Decisión explícita: la
    // confirmación ya queda registrada en la transferencia —autor, fecha,
    // estado— y en AuditoriaStock. Una VentaCorreccion de diferencia cero por
    // cada recepción sería ruido que después hay que explicar en cada auditoría,
    // y volvería imposible contestar "qué recepciones movieron plata".
    aplica: !sinCambio,
    sinCambio,
    totalNuevo,
    diferencia,
    lineas: lineasNuevas,
    pagos: pagosNuevos,
    diffProductos,
    diffPagos: pagosNuevos.map((p) => ({
      medio: p.medio,
      montoAntes: p.montoAnterior,
      montoDespues: p.monto,
    })),
    snapshotAntes: {
      transferenciaId: Number(transferenciaId),
      estadoTransferencia,
      ventaId: v.id ?? null,
      numero: v.numero ?? null,
      total: totalAnterior,
      detalles: detalles.map(snapshotDetalle),
      pagos: pagos.map((p) => ({ id: p.id ?? null, medio: p.medio, monto: round2(p.monto) })),
    },
    snapshotDespues: {
      transferenciaId: Number(transferenciaId),
      estadoTransferencia: "Recibida",
      ventaId: v.id ?? null,
      total: totalNuevo,
      detalles: lineasNuevas.map((l) => ({
        productoBaseId: l.productoBaseId,
        nombre: l.nombre,
        cantidad: l.cantidad,
        cantidadStock: l.cantidadStock,
        precio: l.precio,
        subtotal: l.subtotal,
        esSueltas: l.esSueltas,
      })),
      pagos: pagosNuevos.map((p) => ({ id: p.id ?? null, medio: p.medio, monto: p.monto })),
      recibido: recibido.map((r) => ({
        productoBaseId: Number(r.productoBaseId),
        recibidasFisicas: Number(r.recibidasFisicas),
        factor: Number(r.factor),
      })),
      // QUIÉN MOVIÓ EL INVENTARIO. Va escrito para que nadie lea `impactoStock:
      // []` como "el stock no se movió" y lo mueva otra vez.
      stockAplicadoPor: "confirmar-recepcion",
    },
  };
}
