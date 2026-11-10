// UN RENGLÓN CON IMPORTE NEGATIVO ES UN DESCUENTO, NO UN PRODUCTO.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/descuentoSL22_5181.test.mjs
//
// ── EL CASO (Emanuel, 2026-11-10 8:45, depósito) ──────────────────────────
//
// Remito SL22-5181 del 06/11, comprobante 78 del pedido 577. El papel cierra:
// nueve renglones que suman $342.980,92, más percepciones $5.927,62, dan
// $348.908,54 contra $348.908,53 impresos (un centavo de redondeo). Uno de los
// nueve es «417 Desc x 24u Pegamentos 2 × −5.000,00»: un descuento. La pantalla
// decía "Al producto «Desc x 24u Pegamentos» le falta el costo final" y "No
// cierra por $0,00": la verificación tomaba su costo negativo por uno faltante.
//
// Regla de Emanuel: un importe negativo es un descuento; no se vincula, no
// entra al stock y no pide costo. Baja el costo de los productos que nombra
// —«Pegamentos» son La Gotita y La Gotita Gel—, en proporción a su importe; si
// no nombra ninguno, el de todos.
//
// Los renglones son los de la base, como los guardó el lector (tipo MERCADERIA
// y sin `descuentoAplicaA`, que no existía). Las fichas y las líneas del pedido
// de La Gotita, también de la base.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCorregirLinea from "./HojaCorregirLinea.jsx";
import { aplanarDetalles, analizarLineas } from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { descuentosDelPapel } from "@/lib/compras-proveedor/comprobante/cargos";
import { productosDelPapel } from "@/lib/compras-proveedor/comprobante/cobertura";
import { lecturaDesdeLoGuardado } from "@/lib/compras-proveedor/comprobante/lecturaGuardada";
import { comoLoEntendio, textoDelResultado } from "@/lib/compras-proveedor/comprobante/pruebaDeExplicacion";
import {
  TIPO_RENGLON,
  porqueNoCierraInterpretada,
  tipoDelRenglon,
  verificarLecturaInterpretada,
} from "@/lib/compras-proveedor/comprobante/lector/lecturaInterpretada";
import { textoDelDescuentoAplicado } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import { formatearMoneda } from "@/lib/moneda";

// ── LO QUE ESTÁ EN LA BASE ──────────────────────────────────────────────────

const R = (orden, cod, texto, cantidad, neto, subtotal, costo, productoLocalId = null, pedidoDetalleId = null) => ({
  id: 7800 + orden, comprobanteId: 78, orden, codigoProveedor: cod, textoCrudo: texto, cantidad, netoUnitario: neto,
  subtotalImpreso: subtotal, costoFinalRenglon: costo, tipoRenglon: "MERCADERIA", enQueViene: null,
  productoLocalId, pedidoDetalleId, unidadElegida: null, noVino: false,
});
const RENGLONES = [
  R(1, "428", "Car SUGUS x700gr", 4, 7951.56, 31806.22, 32355.94),
  R(2, "581", "LIPO Superacidos x454gr", 2, 3518.87, 7037.74, 7159.38),
  R(3, "451", "Gummi BURGER x24", 3, 5797.06, 17391.17, 17691.73),
  R(4, "452", "Gummi DOGGIE x24", 3, 5797.06, 17391.17, 17691.73),
  R(5, "5512", "PIPAS 12x50g Gigantes", 12, 8228.35, 98740.16, 100446.38),
  R(6, "5513", "PIPAS 1x160g Snacks", 36, 2130.95, 76714.16, 78040.05),
  R(7, "417", "Desc x 24u Pegamentos", 2, -5000, -10000, -10172.83),
  R(8, "652", "La Gotita", 24, 1919.7, 46072.92, 46869.12, 718, 3700),
  R(9, "698", "La Gotita Gel", 24, 2409.47, 57827.38, 58827.03, 717, 3701),
];
const COMPROBANTE_GUARDADO = {
  id: 78, estado: "MAL_LEIDO", totalLeido: 348908.53, netoLeido: null, ivaLeido: null, internoLeido: null,
  conceptosDelPieLeidos: [{ resta: false, nombre: "Percepciones", importe: 5927.62 }],
  lineasEnElPapel: 9, explicacionLeida: "Remito con percepciones al pie.", lineas: RENGLONES,
};

const GOTITA = { id: 718, nombre: "LA GOTITA 2ML", unidad_medida: "pack", factor_pack: 6, modoCompraProveedor: "BULTO", modoVentaDeposito: "PESO", pesoEsFijo: false, pesoReferenciaKg: null, precio_costo: 11921.34 };
const GEL = { id: 717, nombre: "LA GOTITA GEL 3ML", unidad_medida: "pack", factor_pack: 6, modoCompraProveedor: "BULTO", modoVentaDeposito: "PESO", pesoEsFijo: false, pesoReferenciaKg: null, precio_costo: 14962.81 };
const DETALLES = [
  { id: 3700, cantidad: 4, unidad: "BULTO", precioCosto: 11921.34, cantidadRecibida: null, producto: { id: 718, baseId: 718, base: GOTITA } },
  { id: 3701, cantidad: 4, unidad: "BULTO", precioCosto: 14962.81, cantidadRecibida: null, producto: { id: 717, baseId: 717, base: GEL } },
];

/** El descuento con lo que dice el lector nuevo: a quién aplica. */
const CON_A_QUIEN = RENGLONES.map((l) => (l.orden === 7 ? { ...l, tipoRenglon: "DESCUENTO", descuentoAplicaA: ["652", "698"] } : l));

// La parte de cada pegamento, en proporción a su importe: 46.072,92 y 57.827,38
// sobre 103.900,30, de los −10.172,83 del descuento.
const PARTE_GOTITA = Math.round((-1017283 * 4607292) / 10390030);
const PARTE_GEL = -1017283 - PARTE_GOTITA;

function porLaConciliacion(renglones) {
  const productos = [GOTITA, GEL];
  const contexto = {
    // Los renglones sin producto buscan: sin vínculos guardados y con los dos
    // pegamentos como universo del proveedor.
    datos: { codigosProveedor: [], productos: productos.map((p) => ({ productoBaseId: p.id, nombre: p.nombre })) },
    catalogo: productos,
    catalogoNormalizado: productos.map((p) => ({ productoBaseId: p.id, nombre: p.nombre })),
    nombrePorBase: new Map(productos.map((p) => [p.id, p.nombre])),
    datosPorBase: new Map(productos.map((p) => [p.id, p])),
    decisionPorBase: new Map(),
    variacionNormalPct: 10,
  };
  const c = { id: 78, estado: "CARGADO", proveedor: { id: 41, nombre: "Proveedor", umbralRevisarPct: null, umbralSospechaBajaPct: null }, lineas: renglones };
  const detalles = aplanarDetalles(DETALLES);
  const lineas = analizarLineas({
    comprobante: c,
    contexto,
    detallesPlanos: detalles,
    porProductoLocal: new Map([[718, { baseId: 718 }], [717, { baseId: 717 }]]),
  });
  const { grupos } = filasDeConciliacion({ comprobantes: [{ ...c, lineas }], detalles });
  return { lineas, filas: grupos.flatMap((g) => g.filas) };
}

const plano = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

// ── LA CUENTA DEL PAPEL ─────────────────────────────────────────────────────

test("SL22-5181 COMO ESTÁ GUARDADO: EL 417 ES UN DESCUENTO Y EL PAPEL CIERRA", () => {
  assert.equal(tipoDelRenglon(RENGLONES[6]), TIPO_RENGLON.DESCUENTO, "importe negativo: descuento, aunque diga MERCADERIA");
  assert.equal(tipoDelRenglon(RENGLONES[7]), TIPO_RENGLON.MERCADERIA);
  const lectura = lecturaDesdeLoGuardado(COMPROBANTE_GUARDADO);
  const v = verificarLecturaInterpretada(lectura);
  assert.deepEqual(v.invalidos, [], "decía: le falta el costo final");
  assert.equal(v.sumaCentavos, 34890853);
  assert.equal(v.cierra, true);
  const r = comoLoEntendio({ lectura });
  assert.equal(r.productos[6].descuento, true);
  const t = textoDelResultado(r, { moneda: formatearMoneda });
  assert.equal(t.tono, "ok");
  assert.equal(t.titulo, "✓ El papel cierra en $348.908,53");
});

test("NUNCA «NO CIERRA POR $0,00»: CON LA SUMA EXACTA Y UN DATO QUE FALTA, SE NOMBRA EL RENGLÓN", () => {
  const conFaltante = { ...COMPROBANTE_GUARDADO, lineas: RENGLONES.map((l) => (l.orden === 1 ? { ...l, costoFinalRenglon: null } : l)) };
  const r = comoLoEntendio({ lectura: lecturaDesdeLoGuardado(conFaltante) });
  const t = textoDelResultado(r, { moneda: formatearMoneda });
  assert.equal(t.titulo, "A «Car SUGUS x700gr» le falta el costo final");
  assert.doesNotMatch(t.titulo, /No cierra por \$0,00/);
  // Y si de verdad no cierra, dice por cuánto y qué renglón.
  const corrido = { ...COMPROBANTE_GUARDADO, lineas: RENGLONES.map((l) => (l.orden === 2 ? { ...l, subtotalImpreso: 7537.74, costoFinalRenglon: 7659.38 } : l)) };
  const lectura = lecturaDesdeLoGuardado(corrido);
  const r2 = comoLoEntendio({ lectura });
  const t2 = textoDelResultado(r2, { moneda: formatearMoneda });
  assert.equal(t2.titulo, "No cierra por $500,00");
  assert.match(t2.detalle, /«LIPO Superacidos x454gr»/);
  assert.match(porqueNoCierraInterpretada(verificarLecturaInterpretada(lectura), { moneda: formatearMoneda }), /^No cierra por \$500,00: /);
});

// ── EL REPARTO ──────────────────────────────────────────────────────────────

test("EL DESCUENTO VA A LOS PEGAMENTOS QUE NOMBRA, EN PROPORCIÓN A SU IMPORTE", () => {
  const d = descuentosDelPapel(CON_A_QUIEN);
  assert.deepEqual([...d.keys()].sort(), [8, 9], "solo La Gotita y La Gotita Gel");
  assert.equal(d.get(8).centavos, PARTE_GOTITA);
  assert.equal(d.get(9).centavos, PARTE_GEL);
  assert.equal(d.get(8).centavos + d.get(9).centavos, -1017283, "el descuento entero, ni un centavo más ni menos");
  assert.deepEqual(d.get(8).nombres, ["Desc x 24u Pegamentos"]);
});

test("SIN DECIR A QUIÉN, VA A TODOS LOS RENGLONES DEL PAPEL", () => {
  const d = descuentosDelPapel(RENGLONES);
  assert.deepEqual([...d.keys()].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 8, 9]);
  assert.equal([...d.values()].reduce((a, x) => a + x.centavos, 0), -1017283);
  // Y un nombre que no es de este papel no pierde el descuento: va a todos.
  const malCopiado = RENGLONES.map((l) => (l.orden === 7 ? { ...l, descuentoAplicaA: ["9999"] } : l));
  assert.equal(descuentosDelPapel(malCopiado).size, 8);
});

// ── LA RECEPCIÓN ────────────────────────────────────────────────────────────

test("EL DESCUENTO NO ES UN PRODUCTO: NO SE VINCULA, NO ENTRA AL STOCK NI SE CUENTA", () => {
  const { lineas } = porLaConciliacion(CON_A_QUIEN);
  const desc = lineas.find((l) => l.orden === 7);
  assert.equal(desc.descuento, true);
  assert.equal(desc.envase, true, "va por la vía de lo que no es producto");
  assert.equal(desc.productoBaseId, null);
  assert.equal(desc.pedidoDetalle, null);
  assert.equal(desc.precio, null, "no pide costo");
  const conteo = productosDelPapel(RENGLONES).get(78);
  assert.equal(conteo.productos, 8, "nueve renglones, ocho productos");
});

test("LA GOTITA Y LA GOTITA GEL: EL COSTO QUE QUEDA YA LLEVA EL DESCUENTO, Y LA HOJA LO DICE CON EL NÚMERO", () => {
  const { lineas, filas } = porLaConciliacion(CON_A_QUIEN);
  for (const [orden, costo, parte] of [[8, 4686912, PARTE_GOTITA], [9, 5882703, PARTE_GEL]]) {
    const l = lineas.find((x) => x.orden === orden);
    assert.equal(Math.round(l.descuentoDelRenglon * 100), parte);
    // El precio final del renglón: su costo con su parte del descuento, por unidad.
    assert.equal(l.precio.precioFinal, Math.round((costo + parte) / 24) / 100);
    const fila = { ...filas.find((f) => f.pedidoDetalleId === (orden === 8 ? 3700 : 3701)), variacionNormalPct: 10 };
    assert.equal(textoDelDescuentoAplicado(fila), `Con el descuento «Desc x 24u Pegamentos» (−${formatearMoneda(-parte / 100)}) ya aplicado`);
    const h = plano(renderToStaticMarkup(React.createElement(HojaCorregirLinea, { fila, abierta: true, onCerrar() {}, onGuardar() {} })));
    assert.ok(h.includes(textoDelDescuentoAplicado(fila)), h);
  }
});
