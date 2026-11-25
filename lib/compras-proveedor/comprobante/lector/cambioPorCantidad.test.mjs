// UNA CANTIDAD MENOR A 0,01 SIN IMPORTE ES UN CAMBIO, VENGA COMO VENGA.
//
// ── EL CASO (Emanuel, 2026-11-25) ─────────────────────────────────────────
//
// Factura P 0100-00189744 (alias BEBIDA.VIENTO.FABULA), con el arreglo de los
// cambios ya desplegado. Al tocar "Volver a leer el papel" el lector devolvió
// UNA sola línea de CUNNINGTON: cantidad 0,001, importe 0, sin «*CAMBIO*» y
// sin la de −0,001. Ninguna forma la reconoció, y la recepción la mostró como
// "Papel: bonificado — Vino bonificado. Entran 0.001 u al stock y tu costo
// queda en $1.837,50 / u", vinculada a «Cunnington cola», en "Coinciden 5".
//
// ── DE DÓNDE SALE LA FORMA DE LOS DATOS ───────────────────────────────────
//
// La línea del lector es la que se describió, con costo 0: es la única forma
// que llega a "bonificado", que sale de `costoFinalRenglon === 0`
// (`analizarPrecioDeLinea`); sin costo habría dicho "sin costo del papel". Lo
// guardado se arma con el mismo mapeo que `leer/[id]/route.js` y como vuelve
// de Prisma (Decimal → string). La pantalla se arma con las funciones de la
// pantalla —`analizarLineas` y `filasDeConciliacion`— y el cierre con las del
// cierre —`recibidosDelCierre` en el navegador, `detallesQueSoloTraenCambios`
// y `sinMovimientoDeLosCambios` en el servidor—.
//
// Los productos del catálogo NO salen de producción: sus costos y packs son
// supuestos, y por eso acá no se afirma ningún precio de ellos; solo qué se
// cuenta, qué entra y qué no.

import test from "node:test";
import assert from "node:assert/strict";

import { normalizarLectura } from "./contrato.js";
import { pasarPorLaPuerta, ESTADO } from "./puerta.js";
import { motivoDeEscalada } from "./escalada.js";
import { esRenglonDeCambio, tipoDelRenglon, TIPO_RENGLON, CANTIDAD_MAXIMA_DE_CAMBIO } from "./lecturaInterpretada.js";
import { analizarLineas } from "../analisisDeComprobante.js";
import { filasDeConciliacion } from "../filasDeConciliacion.js";
import { analizarPrecioDeLinea } from "../precioDeLinea.js";
import { comoLoEntendio } from "../pruebaDeExplicacion.js";
import { lecturaDesdeLoGuardado } from "../lecturaGuardada.js";
import { ESTADO_LINEA, estadoDeLinea, esFilaDeEnvase, pideRevision } from "../../estadoDeLineaFacturada.js";
import { gananciaDelDeposito, textoDeLaGanancia } from "../../gananciaDelDeposito.js";
import { detallesQueSoloTraenCambios, recibidosDelCierre, sinMovimientoDeLosCambios } from "../../cierreDeRecepcion.js";

const RECETA = { interpretada: true, explicacion: "Factura de bebidas: el importe de cada renglón es su costo." };

const PRODUCTOS = [
  ["004241", 4, 12196.41, 48785.65, "BAGGIO MANZANA 8X1 L"],
  ["004242", 12, 12196.41, 146356.97, "BAGGIO MULTIFRUTA 8X1LT"],
  ["004209", 4, 12196.41, 48785.65, "BAGGIO DURAZNO 8X1LT"],
  ["002000", 20, 12602.84, 252056.94, "VIÑAS DE BALBO TINTO 6X1125"],
].map(([codigoProveedor, cantidad, precioImpreso, importeImpreso, descripcion]) => ({
  codigoProveedor, descripcion, cantidad, precioImpreso, importeImpreso, costoFinal: importeImpreso, tipo: "MERCADERIA",
}));

/** Exactamente lo que devolvió el lector: una sola línea, 0,001, importe 0, sin marca. */
const CUNNINGTON_SOLA = {
  codigoProveedor: "006073", descripcion: "CUNNINGTON COLA CLASSIC 4X3LT",
  cantidad: 0.001, importeImpreso: 0, costoFinal: 0, tipo: "MERCADERIA",
};

const leer = (cunnington) =>
  normalizarLectura(
    {
      identidad: { tipo: "P", puntoVenta: "0100", numero: "00189744", fecha: "2026-11-23" },
      lineas: [cunnington, ...PRODUCTOS],
      pie: { total: 495985.22 },
      lineasEnElPapel: 5,
      hayTotalImpreso: true,
      explicacion: RECETA.explicacion,
    },
    { interpretada: true, modelo: "lector-de-prueba" }
  );

function afirmarQueEsCambioYCierra(lectura) {
  const [c, ...productos] = lectura.lineas;
  assert.equal(c.tipo, TIPO_RENGLON.CAMBIO, "la CUNNINGTON es un cambio");
  assert.ok(esRenglonDeCambio(c));
  assert.equal(c.costoFinal, 0);
  assert.equal(productos.filter((l) => !esRenglonDeCambio(l)).length, 4);
  const puerta = pasarPorLaPuerta({ lectura, receta: RECETA });
  assert.equal(puerta.cierra, true, puerta.porque ?? "");
  assert.equal(puerta.estado, ESTADO.CARGADO);
  assert.equal(puerta.proponeCostos, true);
  assert.equal(motivoDeEscalada({ resultado: { ok: true, lectura }, puerta }), null, "sin relectura");
  const r = comoLoEntendio({ lectura });
  assert.equal(r.productos.filter((p) => p.cambio).length, 1);
  assert.equal(r.productos.filter((p) => p.bonificado).length, 0, "nunca bonificado");
  assert.equal(r.productos.filter((p) => !p.cambio && p.importeFinal > 0).length, 4);
}

test("LO QUE DEVOLVIÓ EL LECTOR: una sola CUNNINGTON 0,001 con importe 0 y sin marca es un CAMBIO, y el papel cierra", () => {
  afirmarQueEsCambioYCierra(leer(CUNNINGTON_SOLA));
});

test("la −0,001 sola, también", () => {
  afirmarQueEsCambioYCierra(leer({ ...CUNNINGTON_SOLA, cantidad: -0.001 }));
});

test("BONIFICADO QUEDA PARA LA CANTIDAD REAL: cantidad 2 con importe 0 sigue siendo bonificado", () => {
  const lectura = leer({ ...CUNNINGTON_SOLA, cantidad: 2 });
  const c = lectura.lineas[0];
  assert.equal(esRenglonDeCambio(c), false);
  assert.equal(tipoDelRenglon(c), TIPO_RENGLON.MERCADERIA);
  const precio = analizarPrecioDeLinea({
    linea: { ...c, costoFinalRenglon: c.costoFinal },
    producto: { precio_costo: 1837.5, factor_pack: 1, unidad_medida: "unidad", modoCompraProveedor: "UNIDAD" },
    proveedor: { nombre: "Bebidas" },
  });
  assert.equal(precio.bonificado, true);
  assert.equal(comoLoEntendio({ lectura }).productos[0].bonificado, true);
  // El borde: 0,01 ya es cantidad real.
  assert.equal(esRenglonDeCambio({ ...c, cantidad: CANTIDAD_MAXIMA_DE_CAMBIO }), false);
  // Y un 0,001 que SÍ cobra algo no es un cambio.
  assert.equal(esRenglonDeCambio({ ...CUNNINGTON_SOLA, importeImpreso: 1837.5, costoFinal: 1837.5 }), false);
});

// ══════════════════════════════════════════════════════════════════════════
// LA FACTURA YA GUARDADA COMO BONIFICADO, ABIERTA SIN VOLVER A LEER
// ══════════════════════════════════════════════════════════════════════════

// Ids de la línea del pedido y del producto: supuestos. La CUNNINGTON es la 5.
const DETALLE = { 1: "004241", 2: "004242", 3: "004209", 4: "002000", 5: "006073" };
const BASE = { 1: 101, 2: 102, 3: 103, 4: 104, 5: 105 };
const COSTO_PEDIDO = { 1: 12196.41, 2: 12196.41, 3: 12196.41, 4: 12602.84, 5: 1837.5 };

/** Los renglones como quedaron en `ComprobanteLinea` ANTES de este arreglo: la CUNNINGTON como MERCADERIA. */
const GUARDADOS = [
  { orden: 1, textoCrudo: "CUNNINGTON COLA CLASSIC 4X3LT", codigoProveedor: "006073", cantidad: "0.001", netoUnitario: "0", subtotalImpreso: "0", costoFinalRenglon: "0", tipoRenglon: "MERCADERIA", d: 5 },
  ...PRODUCTOS.map((p, i) => ({
    orden: i + 2, textoCrudo: p.descripcion, codigoProveedor: p.codigoProveedor, cantidad: String(p.cantidad),
    netoUnitario: String(p.precioImpreso), subtotalImpreso: String(p.importeImpreso), costoFinalRenglon: String(p.costoFinal),
    tipoRenglon: "MERCADERIA", d: i + 1,
  })),
].map(({ d, ...l }) => ({
  ...l,
  id: 900 + l.orden,
  subtotalCorregido: null, internoUnitario: null, pesoKg: null, bonificacionPct: null, ivaPct: null,
  enQueViene: null, descuentoAplicaA: null, unidadElegida: null, noVino: false,
  productoLocalId: BASE[d], pedidoDetalleId: d,
}));

const PRODUCTO = (id) => ({ id: BASE[id], nombre: DETALLE[id], factor_pack: 1, precio_costo: COSTO_PEDIDO[id], unidad_medida: "unidad", modoCompraProveedor: "UNIDAD" });
const DETALLES = [1, 2, 3, 4, 5].map((id) => ({
  id, nombre: DETALLE[id], cantidad: id === 5 ? 0.001 : PRODUCTOS[id - 1].cantidad, unidad: "UNIDAD",
  precioCosto: COSTO_PEDIDO[id], precioCostoDelPedido: COSTO_PEDIDO[id], costoMaestroHoy: COSTO_PEDIDO[id],
  productoBaseId: BASE[id], factorPack: 1,
}));

function laPantallaDeHoy(estado = "CARGADO") {
  const comprobante = { id: 77, estado, totalLeido: "495985.22", proveedor: { nombre: "Bebidas" }, lineas: GUARDADOS };
  const contexto = {
    datosPorBase: new Map([1, 2, 3, 4, 5].map((id) => [BASE[id], PRODUCTO(id)])),
    decisionPorBase: new Map(),
    nombrePorBase: new Map([1, 2, 3, 4, 5].map((id) => [BASE[id], DETALLE[id]])),
    listaGuardada: null,
  };
  const porProductoLocal = new Map([1, 2, 3, 4, 5].map((id) => [BASE[id], { baseId: BASE[id] }]));
  const analizadas = analizarLineas({ comprobante, contexto, detallesPlanos: DETALLES, porProductoLocal });
  const { grupos, sinComprobante } = filasDeConciliacion({
    comprobantes: [{ ...comprobante, lineas: analizadas }],
    detalles: DETALLES,
    nacidoDeFactura: true,
  });
  return { filas: grupos[0].filas, sinComprobante };
}

test("LA FACTURA YA GUARDADA COMO BONIFICADO, AL ABRIRLA, SE VE COMO CAMBIO: no se cuenta, no se revisa, no entra", () => {
  const { filas } = laPantallaDeHoy();
  const cunnington = filas.find((f) => f.codigoProveedor === "006073");
  assert.equal(cunnington.cambio, true, "se ve como cambio");
  assert.equal(cunnington.bonificado, false, "ya no es bonificado");
  assert.equal(esFilaDeEnvase(cunnington), true, "va con los renglones que no son producto");
  assert.equal(estadoDeLinea(cunnington), ESTADO_LINEA.ENVASE, "no está en Coinciden");
  assert.equal(pideRevision(cunnington), false, "no es revisable");
  assert.equal(cunnington.pedidoDetalleId, null, "no trae nada a la línea del pedido");
  // Los productos: cuatro, sin el cambio.
  const productos = filas.filter((f) => !esFilaDeEnvase(f));
  assert.equal(productos.length, 4);
  assert.equal(gananciaDelDeposito(filas).total, 4, "el cambio no cuenta en el «de N»");
  // Y la cuenta del papel, sobre lo guardado, cierra sin nombrar al cambio.
  const puerta = pasarPorLaPuerta({
    lectura: lecturaDesdeLoGuardado({ estado: "CARGADO", explicacionLeida: RECETA.explicacion, lineasEnElPapel: 5, totalLeido: "495985.22", lineas: GUARDADOS }),
    receta: RECETA,
  });
  assert.equal(puerta.cierra, true, puerta.porque ?? "");
});

test("AL RECIBIR, EL CAMBIO NO MUEVE STOCK NI COSTO: ni desde el papel ni desde lo contado", () => {
  const { filas, sinComprobante } = laPantallaDeHoy();
  // Lo que arma el navegador. Lo contado arranca con lo pedido: la 5 lleva
  // 0,001, que es justo lo que no tiene que entrar.
  const contados = Object.fromEntries(DETALLES.map((d) => [d.id, d.cantidad]));
  // La línea 5 ya no la trae ningún renglón. En un pedido nacido de la
  // factura la pantalla no dibuja «No están en ninguna boleta» (`huerfanas`
  // en la página) y le pasa al cierre una lista vacía; en un pedido hecho a
  // mano, preguntar si llegó es lo correcto: el cambio no la trajo.
  assert.deepEqual(sinComprobante.map((d) => d.pedidoDetalleId), [5]);
  const recibidos = recibidosDelCierre({ filas, sinComprobante: [], contados });
  for (const id of [1, 2, 3, 4]) assert.ok(Number(recibidos[id]) > 0, `la ${id} entra`);

  // Lo que hace el servidor con eso, leyendo los renglones de la base.
  const costosExcluidos = new Set();
  const costosAceptados = new Set([5]);
  const sueltas = { 5: 1 };
  const fisicas = { 5: 1 };
  const kg = { 5: 1 };
  const tocadas = sinMovimientoDeLosCambios({
    detalles: detallesQueSoloTraenCambios(GUARDADOS),
    recibidos, kgRecibidos: kg, sueltas, fisicas, costosExcluidos, costosAceptados,
  });
  assert.deepEqual(tocadas, [5]);
  assert.equal(recibidos[5], 0, "cero stock");
  assert.ok(!(5 in sueltas) && !(5 in fisicas) && !(5 in kg), "ni sueltas, ni físicas, ni kilos");
  assert.ok(costosExcluidos.has(5) && !costosAceptados.has(5), "cero costo");
  // Los cuatro productos no se tocan.
  for (const id of [1, 2, 3, 4]) {
    assert.ok(Number(recibidos[id]) > 0);
    assert.ok(!costosExcluidos.has(id));
  }
});

test("«NINGUNO TIENE TU PRECIO CARGADO» SOLO CUANDO ES ESO: si todos quedan afuera por otra cosa, se dice cuál", () => {
  // Con las líneas del pedido con su costo, el papel guardado como "no cierra"
  // deja a los cuatro afuera de la ganancia por ESO, no por falta de precio.
  const noCierra = gananciaDelDeposito(laPantallaDeHoy("MAL_LEIDO").filas);
  assert.equal(noCierra.total, 4);
  assert.equal(noCierra.enLaCuenta, 0);
  assert.equal(textoDeLaGanancia(noCierra), "Ninguno de los 4 productos entra en la ganancia. El papel no cierra, así que no propone ningún costo.");
  // CONTRAPRUEBA: con el papel que cierra, los cuatro entran.
  assert.equal(gananciaDelDeposito(laPantallaDeHoy().filas).enLaCuenta, 4);
});

test("una línea del pedido con un cambio Y un renglón de verdad no se pone en cero", () => {
  const conOtro = [...GUARDADOS, { ...GUARDADOS[1], orden: 9, id: 999, pedidoDetalleId: 5 }];
  assert.deepEqual([...detallesQueSoloTraenCambios(conOtro)], []);
  // Y la que alguien marcó "llegó sin papel" tampoco.
  const recibidos = { 5: 3 };
  sinMovimientoDeLosCambios({ detalles: new Set([5]), recibidos, llegaronSinPapel: new Set([5]) });
  assert.equal(recibidos[5], 3);
});
