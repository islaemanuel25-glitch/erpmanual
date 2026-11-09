// EL UxB IMPRESO PASA LOS BULTOS A UNIDADES ANTES DE COMPARAR PRECIOS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/uxbDelPapel.test.mjs
//
// ── EL CASO, DE PRODUCCIÓN (Emanuel, 2026-11-05) ─────────────────────────
//
// Factura de Super Mario, columnas BULT, x, UxB, UNID., PRECIO, DTO, SUBTOTAL.
// Renglón "HELLMANN'S MAY SACHET 20X118G": BULT 5, UxB 40, DTO 6 %, subtotal
// 105.290,47, total con todo 134.245,36. El producto es HELLMANS MAYONESA 125G,
// que el ERP tiene POR UNIDAD a $668,86.
//
// El lector dio cantidad 5 y no dio el UxB. La tarjeta decía "No se puede saber
// en qué viene: revisá la cantidad", "Factura 5 u", "Papel $26.849,07 / u", y la
// hoja "Entra al stock 5 unidades". Lo correcto: 5 bultos × 40 = 200 unidades,
// $134.245,36 ÷ 200 = $671,23 la unidad, +0,35 % contra $668,86.
//
// ── LAS DOS CAUSAS ────────────────────────────────────────────────────────
//
// 1. El esquema del lector no tenía dónde poner el UxB: solo `enQueViene` en
//    palabras. Ahora pide `unidadesPorBulto` y el contrato lo guarda en
//    `enQueViene` como "bulto de 40".
// 2. `deducirUnidad`, con un producto sin bulto, devolvía "el precio entra tal
//    cual" sin mirar el renglón. Ahora, si tal cual no explica el precio, usa lo
//    que el renglón dice que trae lo facturado.
//
// El renglón pasa por el camino de la lectura —contrato— y de la conciliación
// —`analizarLineas`, `filasDeConciliacion`—, no armado a mano. El id del
// producto, el del pedido y lo pedido son ilustrativos: el caso no los da.

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizarLectura } from "@/lib/compras-proveedor/comprobante/lector/contrato";
import { esquemaInterpretado } from "@/lib/compras-proveedor/comprobante/lector/lecturaInterpretada";
import { aplanarDetalles, analizarLineas } from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
// El cartel que frenaba, borrado el 2026-11-07. Se sigue afirmando que no aparece.
const AVISO_ESCALA = "No se puede saber en qué viene: revisá la cantidad.";
import {
  cantidadEnEscalaDelPedido,
  enUnidadesDeLaFila,
  escalaSinDeducir,
  loQueNoCuadra,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import { renglonesDeLaTarjeta } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import { laCantidadCuadraConElPrecio } from "@/lib/compras-proveedor/laCantidadCuadraConElPrecio";
import { unidadesQueDiceElRenglon, unidadesQueDiceLaDescripcion } from "@/lib/compras-proveedor/contenidoDelBulto";
import { UNIDAD } from "@/lib/compras-proveedor/comprobante/unidadPorPrecio";

const HELLMANS = {
  id: 9301,
  nombre: "HELLMANS MAYONESA 125G",
  factor_pack: 1,
  precio_costo: 668.86,
  unidad_medida: "unidad",
  modoVentaDeposito: null,
  modoCompraProveedor: "BULTO",
  pesoReferenciaKg: null,
  pesoEsFijo: false,
  pesoPromedioKg: null,
};

const contexto = () => ({
  datos: [],
  catalogo: [HELLMANS],
  catalogoNormalizado: [{ productoBaseId: HELLMANS.id, nombre: HELLMANS.nombre }],
  nombrePorBase: new Map([[HELLMANS.id, HELLMANS.nombre]]),
  datosPorBase: new Map([[HELLMANS.id, HELLMANS]]),
  decisionPorBase: new Map(),
});

const DETALLE = {
  id: 1,
  cantidad: 200,
  precioCosto: 668.86,
  cantidadRecibida: null,
  unidad: "UNIDAD",
  kgRecibidos: null,
  unidadesSueltas: null,
  motivoPrincipal: null,
  motivoDetalle: null,
  producto: { id: 1001, baseId: HELLMANS.id, base: HELLMANS },
};

/** El renglón como lo devuelve el lector: lo impreso más el costo final. */
const RENGLON_DEL_LECTOR = {
  descripcion: "HELLMANN'S MAY SACHET 20X118G",
  cantidad: 5,
  unidadesPorBulto: 40,
  importeImpreso: 105290.47,
  costoFinal: 134245.36,
  tipo: "MERCADERIA",
};

/** La fila de la recepción, por el camino de la ruta: contrato, análisis y conciliación. */
function filaDe(renglonDelLector) {
  const lectura = normalizarLectura({ lineas: [renglonDelLector] }, { interpretada: true });
  const [l] = lectura.lineas;
  const guardada = {
    id: 701,
    orden: 1,
    textoCrudo: l.descripcion,
    codigoProveedor: l.codigoProveedor,
    cantidad: l.cantidad,
    netoUnitario: l.netoUnitario,
    subtotalImpreso: l.subtotalImpreso,
    internoUnitario: null,
    subtotalCorregido: null,
    pesoKg: null,
    bonificacionPct: 6,
    ivaPct: null,
    costoFinalRenglon: l.costoFinal,
    enQueViene: l.enQueViene,
    tipoRenglon: l.tipo,
    productoLocalId: 1001,
    pedidoDetalleId: 1,
    precioPedidoPrevio: null,
    revisadoEnRecepcion: false,
    revisadoEnRecepcionAt: null,
    unidadElegida: null,
  };
  const c = {
    id: 900,
    estado: "LEIDO",
    totalLeido: 134245.36,
    proveedor: { id: 88, nombre: "Super Mario", umbralRevisarPct: null, umbralSospechaBajaPct: null },
    lineas: [guardada],
  };
  const detalles = aplanarDetalles([DETALLE]);
  const analizados = [
    {
      ...c,
      lineas: analizarLineas({
        comprobante: c,
        contexto: contexto(),
        detallesPlanos: detalles,
        porProductoLocal: new Map([[1001, { baseId: HELLMANS.id }]]),
      }),
    },
  ];
  const { grupos } = filasDeConciliacion({ comprobantes: analizados, detalles });
  return { ...grupos[0].filas[0], variacionNormalPct: 10 };
}

/** Lo que la hoja le pregunta al control de escala, campo por campo. */
const comoLlamaLaHoja = (f) =>
  laCantidadCuadraConElPrecio({
    subtotal: f.subtotal,
    cantidad: f.cantidad,
    fisicas: enUnidadesDeLaFila(cantidadEnEscalaDelPedido(f), 1),
    porKilo: f.porKilo === true,
    factorPack: 1,
    unidadesPorFacturada: f.unidad?.requiereDecision ? null : f.unidad?.unidadesPorFacturada ?? null,
  });
const redondo = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

test("EL LECTOR PIDE EL UxB Y EL CONTRATO LO GUARDA COMO EN QUÉ VIENE", () => {
  assert.deepEqual(esquemaInterpretado().properties.lineas.items.properties.unidadesPorBulto, { type: "number", nullable: true });
  assert.ok(!esquemaInterpretado().properties.lineas.items.required.includes("unidadesPorBulto"), "obligatorio sería una orden de inventar");
  const [l] = normalizarLectura({ lineas: [RENGLON_DEL_LECTOR] }, { interpretada: true }).lineas;
  assert.equal(l.cantidad, 5, "la cantidad queda como está impresa");
  assert.equal(l.enQueViene, "bulto de 40");
  assert.equal(unidadesQueDiceElRenglon(l.enQueViene), 40);
});

test("SUPER MARIO, HELLMANN'S 5 × 40: entran 200 unidades a $671,23, +0,35 % contra $668,86", () => {
  const f = filaDe(RENGLON_DEL_LECTOR);
  assert.equal(f.unidad.unidad, UNIDAD.POR_PRESENTACION);
  assert.equal(f.unidad.unidadesPorFacturada, 40);
  assert.equal(f.unidad.requiereDecision, false);
  assert.equal(cantidadEnEscalaDelPedido(f), 200);
  assert.equal(f.costoFactura, 671.23, "$134.245,36 ÷ 200");
  assert.equal(redondo((f.costoFactura / 668.86 - 1) * 100), 0.35);
  assert.equal(escalaSinDeducir(f), false);
  assert.equal(loQueNoCuadra(f), null, "ya no dice 'No se puede saber en qué viene'");
  const t = renglonesDeLaTarjeta(f);
  // 2026-11-09 (Cheddar): con el bulto del papel la tarjeta dice la cuenta
  // entera, no solo el total. Antes: "200 u"; antes todavía: "Factura 5 u".
  assert.equal(t.cantidad, "5 bultos de 40 = 200 unidades");
  assert.equal(t.papel.importe, 671.23, "antes: Papel $26.849,07 / u");
  assert.equal(t.erp.importe, 668.86);
  // Cuánto varió el precio (2026-11-06): subió 0,35 %.
  assert.equal(redondo(t.erp.pct), 0.35, "el papel 0,35 % más caro que el ERP");
  assert.equal(f.unidad.explicacion.frase, "Super Mario lo trae por bulto de 40: 5 bultos de 40 = 200 unidades");
  assert.equal(f.unidad.explicacion.detalle, "La unidad queda en $671,23.");
});

test("Y LA HOJA: entran 200 unidades, y el control de escala no las acusa", () => {
  const f = filaDe(RENGLON_DEL_LECTOR);
  assert.equal(enUnidadesDeLaFila(cantidadEnEscalaDelPedido(f), 1), 200, "antes: Entra al stock 5 unidades");
  const r = comoLlamaLaHoja(f);
  assert.equal(r.aplica, true);
  assert.equal(r.cuadra, true);
  // Y el cierre, que no tiene el veredicto, con lo que imprime el renglón.
  const delCierre = laCantidadCuadraConElPrecio({
    subtotal: f.subtotal, cantidad: f.cantidad, fisicas: 200, factorPack: 1,
    unidadesPorFacturada: [unidadesQueDiceElRenglon("bulto de 40"), ...unidadesQueDiceLaDescripcion(f.textoCrudo)],
  });
  assert.equal(delCierre.cuadra, true);
  assert.equal(laCantidadCuadraConElPrecio({ subtotal: f.subtotal, cantidad: 5, fisicas: 120, factorPack: 1, unidadesPorFacturada: [40, 20] }).cuadra, false, "120 no es ninguna proporción del papel");
});

test("SIN EL UxB DEL LECTOR, el precio decide con lo que dice la descripción, si lo explica", () => {
  // "20X118G" dice 20, y $26.849,07 ÷ 20 = $1.342 es el doble del ERP: no lo
  // explica, y no se inventa: la cantidad queda en 5.
  const sinUxB = filaDe({ ...RENGLON_DEL_LECTOR, unidadesPorBulto: undefined });
  assert.equal(unidadesQueDiceLaDescripcion(sinUxB.textoCrudo).join(), "20");
  assert.equal(cantidadEnEscalaDelPedido(sinUxB), 5);
  // Y desde el maní de Prod Nat (Emanuel, 2026-11-05) un producto sin pack no
  // muestra "no se puede saber en qué viene": muestra el salto de precio, con
  // las dos opciones. Viene marcado el más alto —acá el del papel—, así que el
  // UxB del lector es lo que evita ofrecer $26.849,07 como costo de un sachet.
  assert.equal(loQueNoCuadra(sinUxB)?.que, "PRECIO");
  assert.notEqual(loQueNoCuadra(sinUxB)?.texto, AVISO_ESCALA);
  // Con un 40 en la descripción —ilustrativa—, el precio lo confirma y se toma.
  const conCuarenta = filaDe({ ...RENGLON_DEL_LECTOR, unidadesPorBulto: undefined, descripcion: "HELLMANN'S MAY SACHET 118G X40" });
  assert.equal(cantidadEnEscalaDelPedido(conCuarenta), 200);
  assert.equal(conCuarenta.costoFactura, 671.23);
});

test("CONTRAPRUEBA: BULT 0 Y UNID CARGADAS se lee como hoy, 200 unidades tal cual", () => {
  // Sin bultos, la cantidad del papel ya son unidades y el lector no da UxB.
  const f = filaDe({ ...RENGLON_DEL_LECTOR, cantidad: 200, unidadesPorBulto: undefined, enQueViene: "unidades" });
  assert.equal(f.unidad.unidad, UNIDAD.POR_BULTO, "el producto no tiene bulto: el precio entra tal cual");
  assert.equal(f.unidad.unidadesPorFacturada, undefined);
  assert.equal(cantidadEnEscalaDelPedido(f), 200);
  assert.equal(f.costoFactura, 671.23);
  assert.equal(renglonesDeLaTarjeta(f).cantidad, "200 u");
  assert.equal(comoLlamaLaHoja(f).cuadra, true);
});

test("CONTRAPRUEBA: si el lector ya dio las unidades y además el UxB, no se multiplica dos veces", () => {
  const f = filaDe({ ...RENGLON_DEL_LECTOR, cantidad: 200 });
  assert.equal(cantidadEnEscalaDelPedido(f), 200, "nunca 8.000");
  assert.equal(f.costoFactura, 671.23);
});
