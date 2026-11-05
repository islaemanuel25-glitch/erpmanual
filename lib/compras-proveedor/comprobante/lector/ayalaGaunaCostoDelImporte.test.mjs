// EL COSTO DE CADA RENGLÓN SALE DE SU TOTAL IMPRESO, NO DE LA CUENTA DEL MODELO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lector/ayalaGaunaCostoDelImporte.test.mjs
//
// ── EL CASO, DE PRODUCCIÓN (Emanuel, 2026-11-05, ya desplegado 887135cf) ──
//
// Ayala Gauna / Kangoo. La relectura trajo los 14 renglones, pero la pantalla
// siguió diciendo "No cierra por $443,97: los costos de los productos suman
// $512.764,50 y el papel dice $513.208,47". El papel cierra solo: neto gravado
// 413.877,79 + IVA 21 % 86.914,34 + RG 5329 (3 %) 12.416,33. O sea que el costo
// de cada fila es su TOTAL impreso × 1,24, y los 14 TOTAL suman 413.877,80.
// El modelo dio costos que no respetan eso, con diferencias chicas en varias
// filas: la causa es que el costo lo arma el modelo y el código lo tomaba tal
// cual (`costosDesdeLosImportesImpresos`).
//
// ── LOS DATOS ─────────────────────────────────────────────────────────────
//
// Las tres filas que dio Emanuel, con su TOTAL impreso y el costo que mostró
// la pantalla. Las otras once no están en el caso: van como UN renglón con la
// suma de sus TOTAL —413.877,80 menos los tres— y la suma de sus costos —los
// 512.764,50 de la pantalla menos los tres—, que es lo único que se sabe de
// ellas. Las cantidades del TITA y el MK son las del papel (`ayalaGaunaRenglones`);
// la del OREO y la del resto no están en el caso y van en 1, sin precio: el
// costo no las usa y la cuenta de la fila no las puede revisar.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { normalizarLectura } from "./contrato.js";
import { pasarPorLaPuerta, ESTADO } from "./puerta.js";
import { costosDesdeLosImportesImpresos, verificarLecturaInterpretada } from "./lecturaInterpretada.js";
import { costosQueFaltanDelPapel } from "../fusionarHojas.js";

const alCentavo = (n) => Math.round(n * 100) / 100;

const OREO = { descripcion: "OREO REG SINGLE X 118G L16", cantidad: 1, importeImpreso: 51510.85, costoFinal: 63818.2, tipo: "MERCADERIA" };
const TITA = { codigoProveedor: "548514", descripcion: "ALF TITA SIMPLE X 36G", cantidad: 20, precioImpreso: 609.21, bonificacion: 10, importeImpreso: 10965.74, costoFinal: 13585.6, tipo: "MERCADERIA" };
const MK = { codigoProveedor: "786527", descripcion: "ALF MK MOUSSE BCO TRIPLE", cantidad: 18, precioImpreso: 1278.9, bonificacion: 10, importeImpreso: 20718.18, costoFinal: 25668.5, tipo: "MERCADERIA" };
const LOS_TRES = [OREO, TITA, MK];
const RESTO = {
  descripcion: "LAS OTRAS ONCE FILAS DEL PAPEL, SUMADAS",
  cantidad: 1,
  importeImpreso: alCentavo(413877.8 - LOS_TRES.reduce((s, l) => s + l.importeImpreso, 0)),
  costoFinal: alCentavo(512764.5 - LOS_TRES.reduce((s, l) => s + l.costoFinal, 0)),
  tipo: "MERCADERIA",
};
const PIE = { neto: 413877.79, iva: 86914.34, conceptos: [{ nombre: "RG 5329 3%", importe: 12416.33 }], total: 513208.47 };

const leer = (lineas, pie = PIE) =>
  normalizarLectura(
    {
      identidad: { tipo: "A", puntoVenta: "0003", numero: "00012345", fecha: "2026-11-05" },
      lineas,
      pie,
      hayTotalImpreso: true,
      discriminaImpuestos: true,
      lineasEnElPapel: 14,
      explicacion: "Ayala Gauna: CANTIDAD, P.UNIT., BONIF % y TOTAL por renglón; IVA 21 % y RG 5329 al pie.",
    },
    { interpretada: true }
  );

const costoDe = (lectura, descripcion) => lectura.lineas.find((l) => l.descripcion === descripcion).costoFinal;

test("LA CAUSA: con los costos del modelo el papel no cierra por $443,97", () => {
  const v = verificarLecturaInterpretada({ ...leer([OREO, TITA, MK, RESTO], { total: PIE.total }) });
  assert.equal(v.sumaCentavos, 51276450, "suman $512.764,50, como mostró la pantalla");
  assert.equal(v.diferenciaCentavos, -44397);
  assert.equal(v.cierra, false);
});

test("CADA COSTO ES SU TOTAL IMPRESO × 1,24, Y EL PAPEL CIERRA AL CENTAVO", () => {
  const l = leer([OREO, TITA, MK, RESTO]);
  assert.equal(costoDe(l, OREO.descripcion), 63873.45, "51.510,85 × 1,24; mostraba 63.818,20");
  assert.equal(costoDe(l, TITA.descripcion), 13597.52, "10.965,74 × 1,24; mostraba 13.585,60");
  assert.equal(costoDe(l, MK.descripcion), 25690.54, "20.718,18 × 1,24; mostraba 25.668,50");
  const v = verificarLecturaInterpretada(l);
  assert.equal(v.sumaCentavos, 51320847, "la suma es el total impreso, al centavo");
  assert.equal(v.diferenciaCentavos, 0);
  const p = pasarPorLaPuerta({ lectura: l, receta: { interpretada: true } });
  assert.equal(p.estado, ESTADO.CARGADO);
});

test("EL IMPORTE NO SE RECALCULA: queda el impreso, aunque la cuenta de la fila dé otra cosa", () => {
  const l = leer([OREO, TITA, MK, RESTO]);
  assert.deepEqual(
    l.lineas.map((x) => x.subtotalImpreso),
    [51510.85, 10965.74, 20718.18, RESTO.importeImpreso]
  );
  // 20 × 609,21 × 0,9 = 10.965,78: el costo sale de los 10.965,74 impresos.
  assert.equal(costoDe(l, TITA.descripcion), alCentavo(10965.74 * 1.24));
});

test("SIN EL NETO LEÍDO ALCANZA CON EL PIE: los importes más el IVA y la RG dan el total", () => {
  const l = leer([OREO, TITA, MK, RESTO], { ...PIE, neto: null });
  assert.equal(costoDe(l, OREO.descripcion), 63873.45);
  assert.equal(verificarLecturaInterpretada(l).diferenciaCentavos, 0);
});

test("LO GUARDADO SE CORRIGE AL ABRIR EL PEDIDO, SIN VOLVER A LEER", () => {
  const filas = [OREO, TITA, MK, RESTO].map((l, i) => ({
    orden: i + 1,
    textoCrudo: l.descripcion,
    cantidad: String(l.cantidad),
    netoUnitario: String(alCentavo(l.importeImpreso / l.cantidad)),
    subtotalImpreso: String(l.importeImpreso),
    bonificacionPct: l.bonificacion == null ? null : String(l.bonificacion),
    costoFinalRenglon: String(l.costoFinal),
    tipoRenglon: "MERCADERIA",
    corregidoAManoEn: null,
  }));
  const papel = {
    id: 1,
    estado: "MAL_LEIDO",
    tipo: null,
    totalLeido: "513208.47",
    netoLeido: "413877.79",
    ivaLeido: "86914.34",
    conceptosDelPieLeidos: PIE.conceptos,
    lineasEnElPapel: 14,
    explicacionLeida: "Ayala Gauna",
    recetaUsada: { interpretada: true, tipoComprobante: "A" },
    lineas: filas,
  };
  const r = costosQueFaltanDelPapel(papel);
  assert.equal(r.puerta.estado, ESTADO.CARGADO);
  const porOrden = new Map(r.repartidos.map((x) => [x.orden, x]));
  assert.equal(porOrden.get(1).costoFinal, 63873.45);
  assert.equal(porOrden.get(1).antes, 63818.2, "escribe solo si sigue el costo leído");
  assert.equal(porOrden.get(2).costoFinal, 13597.52);
  assert.equal(porOrden.get(3).costoFinal, 25690.54);
  assert.equal(r.repartidoDelPie, null, "no es un reparto del pie: no propone receta");

  // Un renglón corregido a mano manda: no se toca nada.
  const tocado = { ...papel, lineas: filas.map((f) => (f.orden === 2 ? { ...f, corregidoAManoEn: new Date() } : f)) };
  assert.equal(costosQueFaltanDelPapel(tocado), null);
});

test("SI UN COSTO DEL MODELO SE ALEJA MÁS DEL 2 %, NO ES REDONDEO: no se toca", () => {
  const lejos = { ...TITA, costoFinal: 12000 };
  const l = leer([OREO, lejos, MK, RESTO]);
  assert.equal(costoDe(l, TITA.descripcion), 12000);
  assert.equal(verificarLecturaInterpretada(l).cierra, false);
});

test("SIN PIE QUE LO EXPLIQUE, NO SE ADIVINA: solo el total no alcanza", () => {
  const l = leer([OREO, TITA, MK, RESTO], { total: PIE.total });
  assert.equal(costoDe(l, OREO.descripcion), 63818.2);
});

// ── CONTRAPRUEBA: DYSSA, QUE HOY CIERRA ──────────────────────────────────
//
// La boleta de #153 leída por el modelo (`lecturaInterpretada.fixture.json`),
// con el pie y las alícuotas e internos del papel (`boletaDyssa.fixture.json`):
// dos alícuotas e impuesto interno, así que un mismo factor para todos estaría
// mal. Cierra hoy y tiene que quedar igual; y aunque no cerrara, la regla no la
// toca.

const { dyssa: DYSSA } = JSON.parse(
  fs.readFileSync(new URL("../lecturaInterpretada.fixture.json", import.meta.url), "utf8")
);
const PAPEL_DYSSA = JSON.parse(fs.readFileSync(new URL("../boletaDyssa.fixture.json", import.meta.url), "utf8"));
const delPapel = new Map(PAPEL_DYSSA.lineas.map((l) => [l.codigoProveedor, l]));
const dyssa = (lineas) =>
  normalizarLectura(
    {
      ...DYSSA,
      pie: PAPEL_DYSSA.pie,
      lineas: lineas.map((l) => ({
        ...l,
        alicuotaIva: delPapel.get(l.codigoProveedor).alicuotaIva,
        internoImpreso: delPapel.get(l.codigoProveedor).internoImpreso,
      })),
      explicacion: DYSSA.explicacionPro,
    },
    { interpretada: true }
  );

test("CONTRAPRUEBA DYSSA: cierra en 633.686,40 y sus nueve costos quedan como los dio el modelo", () => {
  const l = dyssa(DYSSA.lineas);
  assert.deepEqual(
    l.lineas.map((x) => x.costoFinal),
    DYSSA.lineas.map((x) => x.costoFinal)
  );
  assert.equal(verificarLecturaInterpretada(l).cierra, true);
  assert.equal(costosDesdeLosImportesImpresos(l).corregidos, 0);
});

test("CONTRAPRUEBA DYSSA: aunque un costo se corra, con dos alícuotas e interno no se reparte nada", () => {
  const corrida = DYSSA.lineas.map((x, i) => (i === 1 ? { ...x, costoFinal: alCentavo(x.costoFinal - 300) } : x));
  const l = dyssa(corrida);
  assert.equal(verificarLecturaInterpretada(l).cierra, false);
  assert.deepEqual(
    l.lineas.map((x) => x.costoFinal),
    corrida.map((x) => x.costoFinal)
  );
});
