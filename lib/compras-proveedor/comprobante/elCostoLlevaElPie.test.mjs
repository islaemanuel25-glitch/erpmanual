// EL COSTO DE CADA PRODUCTO LLEVA LOS CONCEPTOS DEL PIE ADENTRO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/elCostoLlevaElPie.test.mjs
//
// ── EL CASO, MEDIDO CONTRA PRODUCCIÓN EL 2026-09-23 ──────────────────────
//
// La decisión es de agosto (`8a9a5f81`): el costo de un producto es lo que de
// verdad sale de la caja por él, con el IVA, las percepciones y el IIBB
// adentro, repartidos en proporción al neto de cada renglón DENTRO DE SU
// FACTURA y con el resto de redondeo en el renglón de mayor neto.
//
// El motor que hace ese reparto —`verificarComprobante`— existe desde
// entonces y funciona. Lo que nunca se conectó fue el precio de cada producto:
// `analizarPrecioDeLinea` nació doce horas después llamando directo a
// `finalUnitarioSinPercepcionesCentavos`, y desde ahí la tarjeta, la hoja, la
// ganancia, la decisión de precio y el costo que se escribe al cerrar usaron
// neto + IVA.
//
// Medido sobre el comprobante 17 —Arcor, pedido 245, 20 renglones, neto
// $412.877,48, "PERC. IVA 5329 $12.386,34" al pie, o sea 3,0000 %—:
//
//   MOGUL. OSITOS 12X30G, neto $5.067,62 → con IVA $6.131,82 → final $6.283,85
//
// Y sobre el 18 —pedido 246, 9 renglones, percepción $8.436,58—: la ganancia
// decía "Factura de esos 9: $340.275,12" contra un papel que factura
// $348.711,61. La diferencia era exactamente la percepción.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { repartoDelPie } from "@/lib/compras-proveedor/comprobante/repartoDelPie";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";

/**
 * ── EL COMPROBANTE 17, VOLCADO DE PRODUCCIÓN ──────────────────────────────
 *
 * Vive en su propio archivo porque lo usan DOS candados —éste y el de la
 * corrección de los costos del 245— y una copia escrita en cada uno se separa
 * el día que alguien toque una. Se volcó de la base con un `select`, no se
 * escribió de memoria: `percepcionesEnCosto` en la receta es la que decide si
 * el reparto entra al costo, y un fixture "razonable" que la omitiera probaría
 * un camino que no ocurre.
 */
const COMPROBANTE_17 = JSON.parse(
  fs.readFileSync(new URL("./comprobante17.fixture.json", import.meta.url), "utf8")
);
const RECETA_ARCOR = COMPROBANTE_17.recetaUsada;
const LINEAS_17 = COMPROBANTE_17.lineas;

/** Ositos, como lo tiene el catálogo: por unidad, con su costo de ayer. */
const PRODUCTO_OSITOS = {
  id: 424,
  nombre: "Mogul Ositos",
  factor_pack: 12,
  precio_costo: 6283.85,
  unidad_medida: "UNIDAD",
};

test("OSITOS: NETO $5.067,62 → FINAL $6.283,85", () => {
  const reparto = repartoDelPie(COMPROBANTE_17);
  const deOsitos = reparto.get(1);

  // La percepción es el 3 % del neto, y eso es lo que le toca a este renglón.
  assert.equal(deOsitos.percepcionLineaCentavos, 15203);
  assert.ok(
    Math.abs(deOsitos.factorSobreNeto - 0.03) < 0.0001,
    `el factor dio ${deOsitos.factorSobreNeto}`
  );

  const a = analizarPrecioDeLinea({
    linea: LINEAS_17[0],
    producto: PRODUCTO_OSITOS,
    receta: RECETA_ARCOR,
    percepcionDeLaLinea: deOsitos,
  });
  assert.equal(a.precioFinal, 6283.85);
});

test("Y SIN EL PIE DA EL NÚMERO VIEJO: $6.131,82", () => {
  // CONTRAPRUEBA, y es la que importa: sin el reparto el precio es neto × 1,21,
  // que es exactamente lo que mostraba la pantalla. Si esta afirmación se
  // pusiera en verde con el reparto puesto, el candado no estaría probando nada.
  const a = analizarPrecioDeLinea({
    linea: LINEAS_17[0],
    producto: PRODUCTO_OSITOS,
    receta: RECETA_ARCOR,
  });
  assert.equal(a.precioFinal, 6131.82);
});

test("EL REPARTO CIERRA CONTRA EL PIE, CENTAVO POR CENTAVO", () => {
  // Es la propiedad que obliga a dar el resto de redondeo a alguien. Si se
  // dejara caer, la suma de los renglones no daría el importe impreso y el
  // comprobante "no cerraría" por un defecto nuestro.
  const reparto = repartoDelPie(COMPROBANTE_17);
  const suma = [...reparto.values()].reduce((s, r) => s + r.percepcionLineaCentavos, 0);
  assert.equal(suma, 1238634, "el reparto no suma la percepción impresa");
});

test("EL RESTO DE REDONDEO VA AL RENGLÓN DE MAYOR NETO, Y A NINGÚN OTRO", () => {
  // El resto puede ser de un signo o del otro —acá es NEGATIVO, porque los
  // veinte redondeos hacia arriba se pasaron por un centavo—, así que mirar si
  // el factor del mayor quedó por encima o por debajo no afirma nada. Lo que sí
  // afirma es QUIÉN se desvía del reparto proporcional puro: uno solo, y es el
  // de mayor neto.
  const reparto = repartoDelPie(COMPROBANTE_17);
  const netoTotal = [...reparto.values()].reduce((s, r) => s + r.subtotalCentavos, 0);
  const PERCEPCION = 1238634;

  const desviados = [];
  for (const [orden, r] of reparto) {
    const proporcional = Math.round((r.subtotalCentavos / netoTotal) * PERCEPCION);
    if (r.percepcionLineaCentavos !== proporcional) {
      desviados.push({ orden, sub: r.subtotalCentavos, de: proporcional, a: r.percepcionLineaCentavos });
    }
  }

  assert.equal(desviados.length, 1, `se desviaron ${desviados.length} renglones`);
  // El 3 es el de mayor subtotal del comprobante: $69.109,44.
  assert.equal(desviados[0].orden, 3);
  const mayorDeTodos = Math.max(...[...reparto.values()].map((r) => r.subtotalCentavos));
  assert.equal(desviados[0].sub, mayorDeTodos);
});

test("UN PAPEL SIN CONCEPTOS AL PIE NO CAMBIA NADA", () => {
  // El papel de Mauro no trae pie desglosado. Ahí el factor es cero y el precio
  // es el de siempre: esto no puede inventarle una percepción a nadie.
  const sinPie = { ...COMPROBANTE_17, conceptosDelPieLeidos: null, totalLeido: null };
  const reparto = repartoDelPie(sinPie);
  assert.equal(reparto.get(1).percepcionLineaCentavos, 0);
  assert.equal(reparto.get(1).factorSobreNeto, 0);
});

// ── DOS FACTURAS CON PIES DISTINTOS ───────────────────────────────────────

/**
 * El 17 y el 18 son dos facturas del MISMO pedido y del mismo proveedor, con
 * percepciones distintas: $12.386,34 sobre $412.877,48 en una y $8.436,58 sobre
 * $281.219,00 en la otra. Dan los dos 3,0000 %, así que para que la afirmación
 * sirva se le cambia el pie a la segunda: un papel real con otra alícuota.
 */
const COMPROBANTE_18 = {
  netoLeido: 281219.03,
  ivaLeido: 59056,
  internoLeido: null,
  totalLeido: 348711.61,
  conceptosDelPieLeidos: [
    { resta: false, nombre: "PERC. IVA 5329", importe: 14060.95 },
    { resta: false, nombre: "PER.IIBB", importe: 0 },
  ],
  recetaUsada: RECETA_ARCOR,
  lineas: [
    { orden: 1, cantidad: 16, netoUnitario: 1098.33, subtotalImpreso: 17573.28 },
    { orden: 2, cantidad: 21, netoUnitario: 1909.96, subtotalImpreso: 40109.16 },
    { orden: 3, cantidad: 64, netoUnitario: 1444.75, subtotalImpreso: 92464.0 },
    { orden: 4, cantidad: 56, netoUnitario: 601.98, subtotalImpreso: 33710.88 },
    { orden: 5, cantidad: 21, netoUnitario: 1551.84, subtotalImpreso: 32588.64 },
    { orden: 6, cantidad: 12, netoUnitario: 1705.35, subtotalImpreso: 20464.2 },
    { orden: 7, cantidad: 14, netoUnitario: 1264.16, subtotalImpreso: 17698.24 },
    { orden: 8, cantidad: 5, netoUnitario: 602.58, subtotalImpreso: 3012.9 },
    { orden: 9, cantidad: 28, netoUnitario: 842.77, subtotalImpreso: 23597.56 },
  ],
};

test("CADA FACTURA REPARTE SU PROPIO PIE, NO EL DEL PEDIDO", () => {
  // Un pedido con dos facturas. La primera cobra 3,0000 % de percepción y la
  // segunda 5,0000 %: dos renglones del mismo producto tienen que salir con
  // costos distintos, porque vinieron en papeles distintos.
  const r17 = repartoDelPie(COMPROBANTE_17);
  const r18 = repartoDelPie(COMPROBANTE_18);

  assert.ok(Math.abs(r17.get(1).factorSobreNeto - 0.03) < 0.0001);
  assert.ok(Math.abs(r18.get(1).factorSobreNeto - 0.05) < 0.0001);

  // Y los dos repartos cierran contra SU pie.
  const suma18 = [...r18.values()].reduce((s, x) => s + x.percepcionLineaCentavos, 0);
  assert.equal(suma18, 1406095);
});

test("Y CONCATENAR PRIMERO DARÍA UN NÚMERO QUE NO ES DE NINGUNA DE LAS DOS", () => {
  // CONTRAPRUEBA de por qué el reparto va ANTES de juntar los renglones de las
  // dos facturas. Repartido sobre el pedido entero, el factor único sería el
  // promedio ponderado —ni el 3 % de una ni el 5 % de la otra— y los dos
  // costos saldrían mal en direcciones opuestas.
  const juntas = {
    ...COMPROBANTE_17,
    netoLeido: 412877.64 + 281219.03,
    totalLeido: 511968.28 + 348711.61,
    conceptosDelPieLeidos: [
      { resta: false, nombre: "PERC. IVA 5329", importe: 12386.34 + 14060.95 },
    ],
    lineas: [
      ...COMPROBANTE_17.lineas,
      ...COMPROBANTE_18.lineas.map((l) => ({ ...l, orden: l.orden + 100 })),
    ],
  };
  const mezclado = repartoDelPie(juntas).get(1).factorSobreNeto;

  assert.ok(Math.abs(mezclado - 0.03) > 0.0005, "la mezcla dio lo mismo que la factura sola");
  assert.ok(Math.abs(mezclado - 0.05) > 0.0005);

  // Y con el reparto bien hecho, Ositos sigue dando su número.
  const a = analizarPrecioDeLinea({
    linea: LINEAS_17[0],
    producto: PRODUCTO_OSITOS,
    receta: RECETA_ARCOR,
    percepcionDeLaLinea: repartoDelPie(COMPROBANTE_17).get(1),
  });
  assert.equal(a.precioFinal, 6283.85);
});
