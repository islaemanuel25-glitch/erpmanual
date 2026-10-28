// LA FACTURA DE ARCOR DEL PEDIDO #362 TRAE IMPUESTOS, Y LA RECEPCIÓN TIENE QUE SABERLO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/arcor362.test.mjs
//
// ── EL CASO (2026-10-28) ──────────────────────────────────────────────────
//
// Comprobante 38, Arcor, 10 renglones de golosinas. El pie imprime subtotal
// $546.000,38, IVA $114.660,08, PERC. IVA $16.380,02 y total $677.040,48. El
// lector grande repartió bien el IVA y la percepción en el costo de cada
// renglón —la cuenta cerró contra el total— pero el esquema interpretado solo
// pedía `pie.total`: el IVA y la percepción no quedaron guardados, la letra no
// se vio, y la recepción dijo "Este papel no trae impuestos y este proveedor
// suele traerlos".
//
// Las filas son las guardadas en producción ese día (`ComprobanteLinea` del
// comprobante 38), no escritas a mano.

import { test } from "node:test";
import assert from "node:assert/strict";

import { papelGuardadoSinImpuestos } from "./lecturaGuardada.js";
import { avisoDeImpuestos } from "./pantalla.js";
import { esquemaInterpretado, instruccionesInterpretadas } from "./lector/lecturaInterpretada.js";
import { normalizarLectura } from "./lector/contrato.js";
import { pasarPorLaPuerta } from "./lector/puerta.js";

// orden, texto, cantidad, neto unitario, importe impreso (neto), costo final del lector
const FILAS = [
  [1, "MOGUL x 500Grs JELLY BEANS", 3, 5471.164, 16413.49, 20353.53],
  [2, "MOGUL x 500Grs OSOS EXTREME", 3, 5471.164, 16413.49, 20353.53],
  [3, "MOGUL x 500Grs SANDIA EXTREME", 6, 5471.164, 32826.98, 40707.06],
  [4, "MOGUL x 500Grs FRUTILLAS EXTREME", 6, 5471.164, 32826.98, 40707.06],
  [5, "MOGUL x 500Grs MORAS (83u)", 6, 5471.164, 32826.98, 40707.06],
  [6, "MOGUL x 500Grs DIENTES (86u)", 20, 5471.164, 109423.28, 135690.2],
  [7, "MOGUL x1 Kg JELLY BUTTONS (210u)", 6, 8675.143, 52050.86, 64545.24],
  [8, "MOGUL x1 Kg ANILLOS (157u)", 6, 8675.143, 52050.86, 64545.24],
  [9, "MOGUL x1 Kg CONITOS (450u)", 18, 8675.143, 156152.58, 193635.73],
  [10, "OBLEA B-O-B LECHE X30G", 60, 750.24, 45014.4, 55795.39],
];

/** El comprobante 38 como quedó guardado: sin pie, sin letra, interpretado. */
const GUARDADO = {
  tipo: null,
  netoLeido: null,
  ivaLeido: null,
  internoLeido: null,
  totalLeido: "677040.48",
  conceptosDelPieLeidos: [],
  explicacionLeida:
    "El papel muestra los artículos con su código, cantidad, unidad de medida, descripción, precio unitario e importe neto. En el pie se detallan el subtotal, el IVA y las percepciones (en este caso, PERC. IVA 5329).",
  recetaUsada: { interpretada: true, tipoComprobante: null },
  lineas: FILAS.map(([orden, textoCrudo, cantidad, netoUnitario, subtotalImpreso, costoFinalRenglon]) => ({
    orden, textoCrudo, cantidad: String(cantidad), netoUnitario: String(netoUnitario),
    subtotalImpreso: String(subtotalImpreso), costoFinalRenglon: String(costoFinalRenglon),
    internoUnitario: "0", ivaPct: null, tipoRenglon: "MERCADERIA", noVino: false,
  })),
};

/** Lo que el proveedor suele mandar: facturas con impuestos. */
const ANTERIORES = [{ tipo: "A", ivaLeido: null, internoLeido: null, conceptosDelPieLeidos: [], recetaUsada: null, lineas: [] }];

test("ARCOR #362 GUARDADO: los costos repartieron $130.040 por encima de los netos, así que el papel TRAE impuestos", () => {
  // Los importes impresos son los netos y suman $545.999,90; el subtotal que el
  // papel imprime es $546.000,38. Los 48 centavos son del propio papel de Arcor
  // —comprobado contra la foto—, no un renglón mal leído.
  const neto = FILAS.reduce((s, f) => s + f[4], 0);
  assert.equal(Math.round(neto * 100), 54599990);
  assert.equal(papelGuardadoSinImpuestos(GUARDADO), false);
  assert.equal(avisoDeImpuestos({ papel: GUARDADO, anteriores: ANTERIORES }), null, "sin el aviso falso");
});

test("un papel guardado donde cada costo ES su importe sigue siendo sin impuestos", () => {
  const sinImpuestos = {
    ...GUARDADO,
    lineas: GUARDADO.lineas.map((l) => ({ ...l, costoFinalRenglon: l.subtotalImpreso })),
  };
  assert.equal(papelGuardadoSinImpuestos(sinImpuestos), true);
});

test("EL LECTOR PIDE LOS IMPORTES DEL PIE: neto, IVA, interno y conceptos, ninguno obligatorio", () => {
  const pie = esquemaInterpretado().properties.pie;
  for (const campo of ["total", "neto", "iva", "interno", "conceptos"]) assert.ok(pie.properties[campo], campo);
  assert.equal(pie.required, undefined, "un campo obligatorio se completa inventando");
  assert.match(instruccionesInterpretadas({}), /`iva` el IVA/);
});

test("CON EL PIE LEÍDO, SE GUARDA EL IVA Y LA PERC. IVA, y el papel guardado dice que trae impuestos", () => {
  const lectura = normalizarLectura(
    {
      identidad: {},
      lineas: FILAS.map(([, descripcion, cantidad, precioImpreso, importeImpreso, costoFinal]) => ({
        descripcion, cantidad, precioImpreso, importeImpreso, costoFinal, enQueViene: "UN", tipo: "MERCADERIA",
      })),
      pie: {
        total: 677040.48, neto: 546000.38, iva: 114660.08,
        conceptos: [{ nombre: "PERC. IVA", importe: 16380.02 }],
      },
      lineasEnElPapel: 10,
      hayTotalImpreso: true,
      explicacion: GUARDADO.explicacionLeida,
    },
    { interpretada: true }
  );
  const r = pasarPorLaPuerta({ lectura, receta: {} });
  assert.equal(r.cierra, true);
  assert.equal(r.aGuardar.ivaLeido, 114660.08);
  assert.equal(r.aGuardar.netoLeido, 546000.38);
  assert.deepEqual(r.aGuardar.conceptosDelPieLeidos, [{ nombre: "PERC. IVA", importe: 16380.02, resta: false }]);
  // Aunque los costos no repartieran nada, el pie guardado alcanza.
  const guardado = {
    ...GUARDADO,
    ...r.aGuardar,
    lineas: GUARDADO.lineas.map((l) => ({ ...l, costoFinalRenglon: l.subtotalImpreso })),
  };
  assert.equal(papelGuardadoSinImpuestos(guardado), false);
});
