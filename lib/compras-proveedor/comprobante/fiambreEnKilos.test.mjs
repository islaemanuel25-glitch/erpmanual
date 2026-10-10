// EL FIAMBRE DE PESO VARIABLE QUE EL PROVEEDOR FACTURA POR KILO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/fiambreEnKilos.test.mjs
//
// ── EL CASO (Emanuel, Das #255, 2026-10-10) ──────────────────────────────
//
// "0223 SALAME MILAN FELA · 10,94 × 9.375,87 = 102.572,05". Los 10,94 son
// KILOS: el salame se pide por pieza y Das lo vende por peso. La pantalla decía
// "Factura 10.94 u", sin precios, y "✓ Coincide": `netoQueFacturaElProveedor`
// contestaba "faltan los kilos" sobre un papel sin columna de peso, así que no
// había precio que comparar, y la cantidad cruda se rotulaba como unidades.
//
// ── DE DÓNDE SALE CADA DATO ──────────────────────────────────────────────
//
// Las filas NO se escriben a mano: pasan por la cadena real —`analizarLineas`
// → `filasDeConciliacion`— con las columnas que la ruta de conciliación le
// pide a Postgres (`ComprobanteLinea`, `PedidoProveedorDetalle`, `ProductoBase`
// tal como los trae su `select`). Lo que la orden dio del papel va tal cual:
// el renglón del salame, los 54,36 kg con DTOS 5 de la barra La Verona, las 6
// piezas de la mortadela y la percepción del 3 % del pie
// (56.300,89 sobre 1.876.696,49). La ficha del salame es la que dio Emanuel.
//
// Lo que la orden NO dio se dice: el precio unitario de la barra, de la
// mortadela y del producto por unidad, y el costo del ERP. Van marcados
// "ilustrativo", y lo que se afirma sobre ellos es la cuenta, no el número.
//
// El pie: la boleta tiene más renglones que los cuatro de acá, así que el pie
// se arma con la MISMA proporción que el impreso —percepción 3 % del neto—. El
// reparto es proporcional al neto, así que a cada renglón le toca lo mismo que
// en el papel entero.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  aplanarDetalles,
  analizarLineas,
} from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import {
  ESTADO_LINEA,
  diferenciaDeCantidad,
  difiereDeLoPedido,
  estadoDeLinea,
  piezasEstimadasDeLaFactura,
  sePuedeCompararElPrecio,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import { textoDeLaCantidad, unidadDeComparacion } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import { fiambreAlCerrar, kilosDelCierre, recibidosDelCierre } from "@/lib/compras-proveedor/cierreDeRecepcion";
import { kilosQueFacturaElRenglon } from "@/lib/compras-proveedor/comprobante/precioDeLinea";

// ── EL CATÁLOGO, CON LOS CAMPOS DEL `select` DE `cargarContexto` ──────────

/** La ficha que dio Emanuel: compra por pieza, peso de referencia 1,8 kg, peso
 *  fijo INACTIVO, venta en depósito "Por peso". Costo del ERP: ilustrativo. */
const SALAME = {
  id: 9101,
  nombre: "Salame Milan Fela",
  factor_pack: 1,
  precio_costo: 11000,
  unidad_medida: "kg",
  modoVentaDeposito: "PESO",
  modoCompraProveedor: "UNIDAD",
  pesoReferenciaKg: 1.8,
  pesoEsFijo: false,
  pesoPromedioKg: 1.75,
};

/** Barra de queso de peso variable. Peso de referencia y costo: ilustrativos. */
const LA_VERONA = {
  id: 9102,
  nombre: "Barra La Verona",
  factor_pack: 1,
  precio_costo: 9000,
  unidad_medida: "kg",
  modoVentaDeposito: "PESO",
  modoCompraProveedor: "UNIDAD",
  pesoReferenciaKg: 4,
  pesoEsFijo: false,
  pesoPromedioKg: null,
};

/** "MORTADELA X 4.5 KG 6,00": 6 PIEZAS de peso fijo. Costo: ilustrativo. */
const MORTADELA = {
  id: 9103,
  nombre: "Mortadela x 4.5 kg",
  factor_pack: 1,
  precio_costo: 40000,
  unidad_medida: "kg",
  modoVentaDeposito: "PIEZA",
  modoCompraProveedor: "UNIDAD",
  pesoReferenciaKg: 4.5,
  pesoEsFijo: true,
  pesoPromedioKg: null,
};

/** Un producto por unidad cualquiera. Ilustrativo entero. */
const GASEOSA = {
  id: 9104,
  nombre: "Gaseosa 1,5 L",
  factor_pack: 1,
  precio_costo: 1500,
  unidad_medida: "unidad",
  modoVentaDeposito: null,
  modoCompraProveedor: "BULTO",
  pesoReferenciaKg: null,
  pesoEsFijo: false,
  pesoPromedioKg: null,
};

const CATALOGO = [SALAME, LA_VERONA, MORTADELA, GASEOSA];

const contexto = () => ({
  datos: [],
  catalogo: CATALOGO,
  catalogoNormalizado: CATALOGO.map((p) => ({ productoBaseId: p.id, nombre: p.nombre })),
  nombrePorBase: new Map(CATALOGO.map((p) => [p.id, p.nombre])),
  datosPorBase: new Map(CATALOGO.map((p) => [p.id, p])),
  decisionPorBase: new Map(),
});

// ── EL PEDIDO, CON LOS CAMPOS DEL `select` DE LA RUTA DE CONCILIACIÓN ─────

const detalle = (id, base, cantidad, precioCosto, extra = {}) => ({
  id,
  cantidad,
  precioCosto,
  cantidadRecibida: null,
  unidad: "UNIDAD",
  kgRecibidos: null,
  unidadesSueltas: null,
  motivoPrincipal: null,
  motivoDetalle: null,
  producto: { id: id + 1000, baseId: base.id, base },
  ...extra,
});

// ── LOS RENGLONES, CON LAS COLUMNAS DE `ComprobanteLinea` ────────────────

const renglon = (orden, pedidoDetalleId, campos) => ({
  id: 500 + orden,
  orden,
  textoCrudo: null,
  codigoProveedor: null,
  netoUnitario: null,
  subtotalImpreso: null,
  internoUnitario: null,
  subtotalCorregido: null,
  pesoKg: null,
  bonificacionPct: null,
  ivaPct: null,
  productoLocalId: pedidoDetalleId + 1000,
  pedidoDetalleId,
  precioPedidoPrevio: null,
  revisadoEnRecepcion: false,
  revisadoEnRecepcionAt: null,
  unidadElegida: null,
  ...campos,
});

/** Precio unitario ilustrativo de la barra: la orden no lo trae. */
const PRECIO_LISTA_VERONA = 8500;
const NETO_VERONA = Math.round(54.36 * PRECIO_LISTA_VERONA * 0.95 * 100) / 100;

const RENGLONES = [
  // Tal cual la boleta.
  renglon(1, 1, {
    textoCrudo: "0223 SALAME MILAN FELA",
    codigoProveedor: "0223",
    cantidad: 10.94,
    netoUnitario: 9375.87,
    subtotalImpreso: 102572.05,
  }),
  // 54,36 kg con DTOS 5: el subtotal impreso ya trae el descuento (#153).
  renglon(2, 2, {
    textoCrudo: "BARRA LA VERONA",
    cantidad: 54.36,
    netoUnitario: PRECIO_LISTA_VERONA,
    bonificacionPct: 5,
    subtotalImpreso: NETO_VERONA,
  }),
  renglon(3, 3, {
    textoCrudo: "MORTADELA X 4.5 KG",
    cantidad: 6,
    netoUnitario: 32000,
    subtotalImpreso: 192000,
  }),
  renglon(4, 4, {
    textoCrudo: "GASEOSA 1,5 L",
    cantidad: 12,
    netoUnitario: 1200,
    subtotalImpreso: 14400,
  }),
];

/** El pie de Das: IVA 21 % y PERCEP. IVA 3 %, en la proporción impresa. */
const PERCEPCION_DEL_PAPEL = 56300.89 / 1876696.49;
function comprobante(lineas = RENGLONES) {
  const neto = Math.round(lineas.reduce((s, l) => s + Number(l.subtotalImpreso), 0) * 100) / 100;
  const iva = Math.round(neto * 0.21 * 100) / 100;
  const percepcion = Math.round(neto * PERCEPCION_DEL_PAPEL * 100) / 100;
  return {
    id: 255,
    estado: "LEIDO",
    netoLeido: neto,
    ivaLeido: iva,
    internoLeido: null,
    totalLeido: Math.round((neto + iva + percepcion) * 100) / 100,
    conceptosDelPieLeidos: [{ nombre: "PERCEP. IVA", importe: percepcion, resta: false }],
    recetaUsada: {
      facturaPor: "UNIDAD",
      ivaPorLinea: false,
      percepciones: [],
      alicuotaIvaPct: 21,
      percepcionesEnCosto: true,
      tieneImpuestoInterno: false,
      ivaIncluyeInternoEnLaBase: false,
    },
    proveedor: { id: 77, nombre: "Das", umbralRevisarPct: null, umbralSospechaBajaPct: null },
    lineas,
  };
}

/** Las filas de la recepción, como las arma la ruta de conciliación. */
function filas({ pedidas = {}, recibidas = {}, nacidoDeFactura = false } = {}) {
  const detalles = aplanarDetalles([
    detalle(1, SALAME, pedidas[1] ?? 6, 11000, { cantidadRecibida: recibidas[1] ?? null }),
    detalle(2, LA_VERONA, pedidas[2] ?? 14, 9000),
    detalle(3, MORTADELA, pedidas[3] ?? 6, 40000, { cantidadRecibida: recibidas[3] ?? null }),
    detalle(4, GASEOSA, pedidas[4] ?? 12, 1500),
  ]);
  const c = comprobante();
  const porProductoLocal = new Map(
    [SALAME, LA_VERONA, MORTADELA, GASEOSA].map((b, i) => [i + 1 + 1000, { baseId: b.id }])
  );
  const analizados = [
    { ...c, lineas: analizarLineas({ comprobante: c, contexto: contexto(), detallesPlanos: detalles, porProductoLocal }) },
  ];
  const { grupos } = filasDeConciliacion({ comprobantes: analizados, detalles, nacidoDeFactura });
  // La ruta agrega la variación del proveedor a cada fila: sin receta, el 10 %.
  return grupos.flatMap((g) => g.filas).map((f) => ({ ...f, variacionNormalPct: 10 }));
}

const fila = (lista, detalleId) => lista.find((f) => f.pedidoDetalleId === detalleId);

// ── EL SALAME ────────────────────────────────────────────────────────────

test("SALAME 10,94 kg: la tarjeta dice '10,94 kg', nunca 'u'", () => {
  const f = fila(filas(), 1);
  assert.equal(f.cantidadEnKilos, true);
  assert.equal(textoDeLaCantidad(f), "10,94 kg");
  assert.doesNotMatch(textoDeLaCantidad(f), / u$/);
  // Los precios en la misma unidad que la cantidad.
  assert.equal(unidadDeComparacion(f), "kg");
});

test("SALAME: costo 9.375,87 × (1 + 21 % + 3 %) = 11.626,08 el kilo, comparado con el del ERP", () => {
  const f = fila(filas(), 1);
  assert.equal(f.costoFactura, 11626.08);
  assert.equal(f.faltanKilos, false);
  // Nunca "✓ Coincide" sin haber comparado precio: los dos números están.
  assert.equal(sePuedeCompararElPrecio(f), true);
  assert.equal(f.costoCatalogo, 11000);
  // +5,7 % adentro de la variación normal: la regla de siempre marca el más alto.
  assert.ok(f.precio?.decision, "no hay decisión de precio: no se comparó");
  assert.equal(estadoDeLinea(f), ESTADO_LINEA.PRECIO_DISTINTO);
  // Y sin comparar no hay "✓ Coincide": la misma fila con el costo del ERP
  // igual al del papel sí coincide, que es lo que distingue comparar de no.
  assert.equal(estadoDeLinea({ ...f, costoCatalogo: 11626.08 }), ESTADO_LINEA.COINCIDE);
});

test("SALAME: CONTRAPRUEBA — sin el pie el costo es el de neto + IVA, no 11.626,08", () => {
  // Si el 3 % no entrara, el número sería el renglón con IVA dividido por los
  // kilos: (102.572,05 + 21.540,13) ÷ 10,94 = 11.344,81. Que el de arriba dé
  // 11.626,08 prueba que la percepción sí entró.
  const sinPie = { ...comprobante(), conceptosDelPieLeidos: [] };
  const [l] = analizarLineas({
    comprobante: { ...sinPie, lineas: [RENGLONES[0]] },
    contexto: contexto(),
    detallesPlanos: aplanarDetalles([detalle(1, SALAME, 6, 11000)]),
    porProductoLocal: new Map([[1001, { baseId: SALAME.id }]]),
  });
  assert.equal(l.precio.precioFinal, 11344.81);
});

test("SALAME: ≈6 piezas contra las 6 pedidas, sin motivo de diferencia", () => {
  const f = fila(filas(), 1);
  assert.equal(piezasEstimadasDeLaFactura(f), 6.08);
  assert.equal(diferenciaDeCantidad(f), 0);
  assert.equal(difiereDeLoPedido(f).difiere, false);
  assert.notEqual(estadoDeLinea(f), ESTADO_LINEA.FALTA);
  assert.notEqual(estadoDeLinea(f), ESTADO_LINEA.SOBRA);
});

test("SALAME: CONTRAPRUEBA — contra 8 pedidas la estimación SÍ difiere", () => {
  // 6,08 contra 8 es un 24 % menos: fuera de la variación del proveedor.
  const f = fila(filas({ pedidas: { 1: 8 } }), 1);
  assert.equal(difiereDeLoPedido(f).difiere, true);
  assert.equal(estadoDeLinea(f), ESTADO_LINEA.FALTA);
});

test("SALAME: piezas CONTADAS mandan sobre la estimación, y se comparan exacto", () => {
  const f = fila(filas(), 1);
  assert.equal(difiereDeLoPedido(f, { piezasContadas: 6 }).difiere, false);
  assert.equal(difiereDeLoPedido(f, { piezasContadas: 5 }).difiere, true);
});

test("SALAME AL CERRAR: el tilde entra +10,94 kg, sin piezas y sin recalcular el promedio", () => {
  const lista = filas();
  const f = fila(lista, 1);
  // Lo que la hoja de cierre manda. Las piezas: ninguna, porque nadie las
  // contó —antes iba 10,94 y el cierre lo rechazaba: "cantidad debe ser un
  // entero", medido contra la app el 2026-10-10—. Y un 10,94 que la pantalla
  // traiga de antes tampoco pasa como conteo.
  const recibidos = recibidosDelCierre({ filas: lista, contados: { 1: 10.94 } });
  assert.equal(recibidos[1], undefined, "los kilos viajaron como piezas");
  assert.ok(Object.values(recibidos).every(Number.isInteger), "el cierre rechaza piezas no enteras");
  // La mortadela y el producto por unidad siguen yendo con lo del papel.
  assert.equal(recibidos[3], 6);
  assert.equal(recibidos[4], 12);
  // Los kilos del papel, en el mapa de kilos; los pesados a mano mandan.
  const kilos = kilosDelCierre({ filas: lista, kgRecibidos: {} });
  assert.deepEqual(kilos, { 1: 10.94, 2: 54.36 });
  assert.equal(kilosDelCierre({ filas: lista, kgRecibidos: { 1: 11.2 } })[1], 11.2);
  const r = fiambreAlCerrar({
    kilosDelPapel: kilosQueFacturaElRenglon({ linea: RENGLONES[0], producto: SALAME }),
    cantRecibida: 0,
    seDeclaro: false,
    kilosDeLaHoja: kilos[1],
  });
  assert.equal(r.vieneEnKilos, true);
  assert.equal(r.kilosQueEntran, 10.94, "no entraron los kilos que pesó");
  // Sin piezas contadas el promedio no se toca: la ruta lo recalcula solo con
  // `piezasContadas > 0`.
  assert.equal(r.piezasContadas, 0);
  assert.equal(r.cantidadRecibidaAGuardar, null);
});

test("SALAME AL CERRAR: con 6 piezas contadas y los kilos de la hoja, sí hay conteo", () => {
  const r = fiambreAlCerrar({
    kilosDelPapel: kilosQueFacturaElRenglon({ linea: RENGLONES[0], producto: SALAME }),
    cantRecibida: 6,
    seDeclaro: true,
    kilosDeLaHoja: 10.94,
  });
  assert.equal(r.kilosQueEntran, 10.94);
  assert.equal(r.piezasContadas, 6);
  assert.equal(r.cantidadRecibidaAGuardar, 6);
});

test("EL CIERRE USA ESA FUNCIÓN, Y EL PROMEDIO EXIGE PIEZAS CONTADAS", () => {
  // Lee la ruta SIN comentarios: un nombre en prosa no es código.
  const ruta = fs
    .readFileSync(new URL("../../../app/api/compras-proveedor/recibir/[id]/route.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(ruta, /fiambreAlCerrar\(\{/);
  assert.match(ruta, /kgReales = kilosQueEntran;/);
  assert.match(ruta, /actualizaPromedioPorRecepcion && piezasContadas > 0 && kgReales > 0/);
  assert.match(ruta, /kgReales \/ piezasContadas/);
  assert.doesNotMatch(ruta, /kgReales \/ cantRecibida/);
  assert.match(ruta, /cantidadRecibida: cantidadRecibidaAGuardar/);

  // Y la pantalla le manda los kilos del papel: sin esto `kilosDelCierre` sería
  // una función que nadie llama y el cierre no recibiría el peso.
  const pagina = fs
    .readFileSync(new URL("../../../app/modulos/compras-proveedor/[id]/page.jsx", import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(pagina, /kgRecibidos: kilosDelCierre\(\{ filas: filasDelCierre, kgRecibidos \}\)/);
  assert.match(pagina, /kgRecibidos: extra\?\.kgRecibidos \?\? kgRecibidos/);
});

// ── LA BARRA LA VERONA, CON DESCUENTO ────────────────────────────────────

test("LA VERONA 54,36 kg con DTOS 5: el costo por kilo lleva el descuento", () => {
  const f = fila(filas(), 2);
  assert.equal(f.cantidadEnKilos, true);
  assert.equal(textoDeLaCantidad(f), "54,36 kg");
  // (lista × 0,95) × (1 + 21 % + 3 %), por kilo.
  const esperado = PRECIO_LISTA_VERONA * 0.95 * 1.24;
  assert.ok(Math.abs(f.costoFactura - esperado) < 0.02, `dio ${f.costoFactura}, se esperaba ≈ ${esperado}`);
  // CONTRAPRUEBA: sin el descuento serían 10.540 el kilo.
  assert.ok(Math.abs(f.costoFactura - PRECIO_LISTA_VERONA * 1.24) > 100);
});

// ── LA MORTADELA, PESO FIJO: SIN CAMBIOS ─────────────────────────────────

test("MORTADELA 6 piezas de peso fijo: sigue por pieza, '6 u'", () => {
  const f = fila(filas(), 3);
  assert.equal(f.cantidadEnKilos, false);
  assert.equal(textoDeLaCantidad(f), "6 u");
  assert.equal(unidadDeComparacion(f), "u");
  assert.equal(diferenciaDeCantidad(f), 0);
  // Y al cerrar, sus 6 son piezas.
  const r = fiambreAlCerrar({
    kilosDelPapel: kilosQueFacturaElRenglon({ linea: RENGLONES[2], producto: MORTADELA }),
    cantRecibida: 6,
    seDeclaro: true,
  });
  assert.equal(r.vieneEnKilos, false);
  assert.equal(r.piezasContadas, 6);
  assert.equal(r.cantidadRecibidaAGuardar, 6);
  assert.equal(r.kilosQueEntran, null);
});

// ── UN PRODUCTO POR UNIDAD: SIN CAMBIOS ──────────────────────────────────

test("UN PRODUCTO POR UNIDAD: '12 u', costo por unidad, como siempre", () => {
  const f = fila(filas(), 4);
  assert.equal(f.cantidadEnKilos, false);
  assert.equal(textoDeLaCantidad(f), "12 u");
  assert.equal(f.costoFactura, 1488);
  assert.equal(diferenciaDeCantidad(f), 0);
});

// ── LA #255 COMO QUEDÓ EN LA BASE ────────────────────────────────────────

test("LA #255 TAL COMO ESTÁ: un recibido de 10,94 —los kilos leídos como piezas— no dice 'sobra'", () => {
  // Antes del arreglo el tilde guardaba la cantidad del papel como recibida.
  for (const recibida of [null, 10.94]) {
    const f = fila(filas({ recibidas: { 1: recibida } }), 1);
    assert.equal(textoDeLaCantidad(f), "10,94 kg");
    assert.equal(diferenciaDeCantidad(f), 0, `con recibida ${recibida}`);
  }
  // Y si nació de la factura, lo esperado sale del papel: tampoco difiere.
  const nacido = fila(filas({ nacidoDeFactura: true, pedidas: { 1: 10.94 } }), 1);
  assert.equal(diferenciaDeCantidad(nacido), 0);
});
