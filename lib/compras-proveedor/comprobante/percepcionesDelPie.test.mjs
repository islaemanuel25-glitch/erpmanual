// LA PERCEPCIÓN DEL PIE, ESCRITA COMO VENGA, VA AL COSTO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/percepcionesDelPie.test.mjs
//
// ── EL CASO (OLIMAR, 2026-11-02) ──────────────────────────────────────────
//
// Remito «Pre-Venta(P)», nueve renglones. El pie trae «(Percepciones =
// 34839.57)» entre paréntesis y después «TOTAL Remito: 683391.62». El lector
// dio el costo de los productos sin la percepción: 648.552,06, y la recepción
// dijo "no cierra por $34.839,56". Con la percepción sumada cierra a un
// centavo, que es el redondeo del proveedor.
//
// El papel: `remitoOlimar.fixture.json`, con lo que dice de dónde sale cada
// número y qué parte no es del papel.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { normalizarLectura } from "./lector/contrato.js";
import { pasarPorLaPuerta, ESTADO } from "./lector/puerta.js";
import {
  esPercepcionOImpuesto,
  repartirLoDelPieQueFalta,
  instruccionesInterpretadas,
} from "./lector/lecturaInterpretada.js";
import { lecturaDesdeLoGuardado } from "./lecturaGuardada.js";
import { aCentavos } from "./impuestos.js";
import { costosQueFaltanDelPapel } from "./fusionarHojas.js";
import { explicacionConLoDelPie, proponerRecetaConLoDelPie } from "./percepcionEnLaReceta.js";

const { papel } = JSON.parse(fs.readFileSync(new URL("./remitoOlimar.fixture.json", import.meta.url), "utf8"));
const RECETA = { interpretada: true, explicacion: papel.explicacion, tipoComprobante: "SIN_FACTURA" };
const copia = (o) => JSON.parse(JSON.stringify(o));
const sumaCentavos = (lineas) => lineas.reduce((a, l) => a + aCentavos(l.costoFinal), 0);

test("el fixture es el caso: productos 648.552,06, percepción 34.839,57, total 683.391,62", () => {
  assert.equal(papel.lineas.length, 9);
  assert.equal(sumaCentavos(papel.lineas), 64855206);
  assert.equal(aCentavos(papel.pie.total), 68339162);
  assert.equal(aCentavos(papel.pie.conceptos[0].importe), 3483957);
});

test("leída la percepción y no repartida: se reparte y el remito CIERRA, a un centavo", () => {
  const lectura = normalizarLectura(copia(papel), { interpretada: true });
  assert.equal(lectura.lineas.length, 9);
  assert.equal(sumaCentavos(lectura.lineas), 64855206 + 3483957);
  assert.deepEqual(lectura.repartidoDelPie, { centavos: 3483957, conceptos: ["Percepciones"] });

  const r = pasarPorLaPuerta({ lectura, receta: RECETA });
  assert.equal(r.estado, ESTADO.CARGADO);
  assert.equal(r.cierra, true);
  assert.equal(r.proponeCostos, true);
  assert.equal(r.diferenciaCentavos, 1);
});

test("cada renglón lleva su parte de la percepción en proporción a su costo", () => {
  const lectura = normalizarLectura(copia(papel), { interpretada: true });
  const factor = 3483957 / 64855206;
  lectura.lineas.forEach((l, i) => {
    const antes = aCentavos(papel.lineas[i].costoFinal);
    const parte = aCentavos(l.costoFinal) - antes;
    assert.ok(Math.abs(parte - antes * factor) <= 1, `renglón ${i + 1}: ${parte} contra ${antes * factor}`);
  });
});

test("si el lector YA la repartió, no se suma dos veces", () => {
  const repartida = repartirLoDelPieQueFalta({ ...copia(papel), lineas: copia(papel.lineas) });
  const yaRepartido = { ...copia(papel), lineas: repartida.lineas };
  const lectura = normalizarLectura(yaRepartido, { interpretada: true });
  assert.equal(lectura.repartidoDelPie, undefined);
  assert.equal(sumaCentavos(lectura.lineas), 64855206 + 3483957);
  assert.equal(pasarPorLaPuerta({ lectura, receta: RECETA }).estado, ESTADO.CARGADO);
});

test("si el lector no copió la percepción, no se adivina: sigue sin cerrar por $34.839,56", () => {
  const sinPie = { ...copia(papel), pie: { total: papel.pie.total } };
  const lectura = normalizarLectura(sinPie, { interpretada: true });
  const r = pasarPorLaPuerta({ lectura, receta: RECETA });
  assert.equal(r.estado, ESTADO.MAL_LEIDO);
  assert.equal(r.diferenciaCentavos, -3483956);
});

test("un concepto del pie que no explica lo que falta no se reparte", () => {
  const otro = { ...copia(papel), pie: { total: papel.pie.total, conceptos: [{ nombre: "Percepciones", importe: 1000 }] } };
  const lectura = normalizarLectura(otro, { interpretada: true });
  assert.equal(lectura.repartidoDelPie, undefined);
  assert.equal(pasarPorLaPuerta({ lectura, receta: RECETA }).estado, ESTADO.MAL_LEIDO);
});

test("con un descuento al lado, se reparte solo la percepción si es lo que falta", () => {
  // El descuento ya está en los costos —el lector lo descontó— y la percepción no.
  const conDescuento = {
    ...copia(papel),
    pie: {
      total: papel.pie.total,
      conceptos: [
        { nombre: "Perc. IIBB", importe: 34839.57 },
        { nombre: "Bonif. general", importe: 5000, resta: true },
      ],
    },
  };
  const lectura = normalizarLectura(conDescuento, { interpretada: true });
  assert.deepEqual(lectura.repartidoDelPie, { centavos: 3483957, conceptos: ["Perc. IIBB"] });
});

test("la percepción se reconoce escrita de cualquier forma, y un descuento no es percepción", () => {
  for (const n of [
    "Percepciones", "(Percepciones = 34839.57)", "Percep.", "Perc. IIBB", "PERC IVA", "Percepción Ing. Brutos",
    "P. IIBB", "IIBB", "Ing. Brutos", "Imp. Interno", "Impuestos internos",
  ]) {
    assert.equal(esPercepcionOImpuesto(n), true, n);
  }
  for (const n of ["Descuento", "Bonificación", "Redondeo", "Subtotal", "", null]) {
    assert.equal(esPercepcionOImpuesto(n), false, String(n));
  }
});

test("el prompt le dice al lector que la percepción viene en cualquier forma, también entre paréntesis", () => {
  const texto = instruccionesInterpretadas({});
  assert.match(texto, /Percepciones = /);
  assert.match(texto, /Perc\. IIBB/);
  assert.match(texto, /ENTRE PARÉNTESIS/);
});

// ── EL QUE YA ESTÁ SUBIDO ─────────────────────────────────────────────────
//
// La forma de la fila de `ComprobanteProveedor` tal como la deja la lectura que
// no cerró: `camposComunes` guarda el pie —con «Percepciones» en
// `conceptosDelPieLeidos`— y la ruta escribe cada renglón con su
// `costoFinalRenglon`, que en Prisma vuelve como Decimal (acá, el texto).
const GUARDADO = {
  id: 1,
  grupoId: 1,
  proveedorId: 7,
  estado: "MAL_LEIDO",
  explicacionLeida: papel.explicacion,
  totalLeido: String(papel.pie.total),
  conceptosDelPieLeidos: papel.pie.conceptos,
  lineasEnElPapel: 9,
  recetaUsada: RECETA,
  lineas: papel.lineas.map((l, i) => ({
    orden: i + 1,
    textoCrudo: l.descripcion,
    cantidad: String(l.cantidad),
    netoUnitario: String(l.precioImpreso),
    subtotalImpreso: String(l.importeImpreso),
    costoFinalRenglon: String(l.costoFinal),
    tipoRenglon: l.tipo,
    corregidoAManoEn: null,
  })),
};

test("lo GUARDADO que no cerraba por la percepción se reprocesa al abrir el pedido, sin volver a leer", () => {
  assert.equal(pasarPorLaPuerta({ lectura: lecturaDesdeLoGuardado(GUARDADO), receta: RECETA }).estado, ESTADO.MAL_LEIDO);
  const r = costosQueFaltanDelPapel(GUARDADO);
  assert.equal(r.faltan.length, 0);
  assert.equal(r.repartidos.length, 9);
  assert.equal(r.puerta.estado, ESTADO.CARGADO);
  assert.equal(r.puerta.diferenciaCentavos, 1);
  assert.deepEqual(r.repartidoDelPie, { centavos: 3483957, conceptos: ["Percepciones"] });
  // Lo que se escribe: el costo de antes —el guardia del update— y el nuevo.
  assert.equal(r.repartidos.reduce((a, x) => a + aCentavos(x.costoFinal) - aCentavos(x.antes), 0), 3483957);
  // Idempotente: escrito el reparto, no queda nada que hacer.
  const porOrden = new Map(r.repartidos.map((x) => [x.orden, x.costoFinal]));
  const escrito = {
    ...GUARDADO,
    estado: r.puerta.estado,
    lineas: GUARDADO.lineas.map((l) => ({ ...l, costoFinalRenglon: String(porOrden.get(l.orden)) })),
  };
  assert.equal(costosQueFaltanDelPapel(escrito), null);
});

test("si un producto se corrigió a mano, el reproceso no reparte: lo de la persona manda", () => {
  const tocado = { ...GUARDADO, lineas: GUARDADO.lineas.map((l) => (l.orden === 3 ? { ...l, corregidoAManoEn: new Date() } : l)) };
  assert.equal(costosQueFaltanDelPapel(tocado), null);
});

test("la receta confirmada sin percepción queda PROPUESTA con la frase; la que ya la nombra, no", () => {
  const propuesta = explicacionConLoDelPie("Remito de preventa: el importe de cada renglón es el costo.", ["Percepciones"]);
  assert.match(propuesta, /^Remito de preventa: el importe de cada renglón es el costo\. Al pie/);
  assert.match(propuesta, /«Percepciones»/);
  assert.match(propuesta, /cuando viene impreso se suma/);
  assert.equal(explicacionConLoDelPie("Al pie suma Perc. IIBB, repartida en los renglones.", ["Percepciones"]), null);
  // Sin confirmada no hay qué ajustar: la primera boleta la explica el modelo grande.
  assert.equal(explicacionConLoDelPie(null, ["Percepciones"]), null);
  assert.equal(explicacionConLoDelPie("Remito.", []), null);
});

test("la propuesta se deja en RecetaPropuestaProveedor, y nunca pisa la confirmada ni otra pendiente", async () => {
  const escritas = [];
  const db = (pendiente) => ({
    explicacionPorTipo: {
      findMany: async () => [{ tipoComprobante: "SIN_FACTURA", explicacion: "Remito: el importe es el costo.", version: 2 }],
    },
    recetaPropuestaProveedor: {
      findUnique: async () => pendiente,
      create: async ({ data }) => escritas.push(data),
    },
  });
  const args = { papel: GUARDADO, tipo: "SIN_FACTURA", conceptos: ["Percepciones"], lectura: {} };
  assert.ok(await proponerRecetaConLoDelPie(db(null), args));
  assert.equal(escritas.length, 1);
  assert.equal(escritas[0].tipoComprobante, "SIN_FACTURA");
  assert.equal(escritas[0].proveedorId, 7);
  assert.match(escritas[0].respuestas.explicacion, /«Percepciones»/);
  assert.equal(await proponerRecetaConLoDelPie(db({ id: 9 }), args), null);
  assert.equal(escritas.length, 1);
  // Sin tipo de papel no hay receta que ajustar.
  assert.equal(await proponerRecetaConLoDelPie(db(null), { ...args, tipo: null }), null);
});
