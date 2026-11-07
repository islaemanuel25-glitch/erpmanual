// Candados de la deducción de unidad por precio.
//
// Lo que se protege: que un AUMENTO DE PRECIO nunca se lea como un cambio de
// unidad, y que cuando las dos lecturas sean creíbles NO SE ADIVINE.
//
// La distribución de `factor_pack` sale del catálogo real de `erpazul_al`
// medido el 2026-08-11: 1279 productos, mínimo 2, máximo 450, y los packs de 2 y
// 3 son SEIS productos — el 0,5 %.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deducirUnidad,
  lecturasPosibles,
  explicarVeredicto,
  UNIDAD,
  CAMBIO_PLAUSIBLE_PCT,
} from "./unidadPorPrecio.js";

/** Los factores que de verdad existen en el catálogo, con su peso. */
const FACTORES_REALES = [
  { f: 2, n: 4 }, { f: 3, n: 2 }, { f: 4, n: 15 }, { f: 5, n: 12 }, { f: 6, n: 238 },
  { f: 8, n: 28 }, { f: 10, n: 168 }, { f: 12, n: 287 }, { f: 15, n: 33 }, { f: 16, n: 36 },
  { f: 18, n: 37 }, { f: 20, n: 97 }, { f: 24, n: 128 }, { f: 30, n: 35 }, { f: 48, n: 13 },
  { f: 50, n: 9 }, { f: 400, n: 6 }, { f: 450, n: 1 },
];

// ── El caso que pidió Emanuel, textual ─────────────────────────────────────

test("EL PACK DE 10 A 10.000 Y LA FACTURA COBRA 1.000: vino por unidad", () => {
  const r = deducirUnidad({ costoAnteriorFinal: 10000, precioFacturaFinal: 1000, factorPack: 10 });
  assert.equal(r.unidad, UNIDAD.POR_UNIDAD);
  assert.equal(r.requiereDecision, false);
  assert.equal(r.cociente, 10);
});

test("y si cobra 10.000, vino por bulto", () => {
  const r = deducirUnidad({ costoAnteriorFinal: 10000, precioFacturaFinal: 10000, factorPack: 10 });
  assert.equal(r.unidad, UNIDAD.POR_BULTO);
  assert.equal(r.requiereDecision, false);
});

// ── UN AUMENTO NO ES UN CAMBIO DE UNIDAD ───────────────────────────────────

test("NINGÚN AUMENTO RAZONABLE SE LEE COMO CAMBIO DE UNIDAD, en los factores reales", () => {
  // El candado central. Se recorre todo el catálogo real con aumentos de hasta
  // el 30 % y bajas de hasta el 25 %, y NINGUNO puede salir POR_UNIDAD.
  const fallas = [];
  for (const { f } of FACTORES_REALES) {
    for (const cambio of [-25, -20, -10, -5, 0, 5, 10, 15, 20, 25, 30]) {
      const costo = 10000;
      const precio = costo * (1 + cambio / 100); // la factura cobra el BULTO
      const r = deducirUnidad({ costoAnteriorFinal: costo, precioFacturaFinal: precio, factorPack: f });
      if (r.unidad === UNIDAD.POR_UNIDAD) {
        fallas.push(`factor ${f} con ${cambio} % salió POR_UNIDAD`);
      }
    }
  }
  assert.deepEqual(fallas, [], `un aumento se leyó como cambio de unidad:\n  ${fallas.join("\n  ")}`);
});

test("Y AL REVÉS: un precio por unidad no se lee como bulto barato", () => {
  const fallas = [];
  for (const { f } of FACTORES_REALES) {
    for (const cambio of [-20, -10, 0, 10, 20, 30]) {
      const costo = 10000;
      const precio = (costo / f) * (1 + cambio / 100); // la factura cobra la UNIDAD
      const r = deducirUnidad({ costoAnteriorFinal: costo, precioFacturaFinal: precio, factorPack: f });
      if (r.unidad === UNIDAD.POR_BULTO) {
        fallas.push(`factor ${f} con ${cambio} % salió POR_BULTO`);
      }
    }
  }
  assert.deepEqual(fallas, [], `un precio por unidad se leyó como bulto:\n  ${fallas.join("\n  ")}`);
});

// ── LOS PACKS CHICOS, que son los que Emanuel pidió medir ──────────────────

// ── ESTOS CANDADOS CAMBIARON DE REGLA (2026-11-07) ─────────────────────────
//
// Medían la "zona ambigua" de la regla de las dos de siempre con su 35 %:
// dónde la unidad y el bulto explicaban el precio a la vez. Esa regla se borró:
// la de toda la recepción —Corregir, el cierre y la importación— es la de la
// menor diferencia (`elegirLectura`). Lo que se exige no cambia: cuando las
// dos lecturas son creíbles NO SE ADIVINA, se pregunta.

test("EL PACK DE 2: CUANDO LAS DOS LECTURAS SE APARTAN PARECIDO, SE PREGUNTA", () => {
  // Cociente 1,5: por unidad +33 %, por el bulto −33 %. Ninguna gana.
  const r = deducirUnidad({ costoAnteriorFinal: 10000, precioFacturaFinal: 10000 / 1.5, factorPack: 2 });
  assert.equal(r.unidad, UNIDAD.NO_SE_PUEDE_DECIDIR);
  assert.equal(r.requiereDecision, true);
  assert.match(r.porque, /bulto de 2/);

  // El precio exacto de la unidad: se decide, y bien.
  const porUnidad = deducirUnidad({ costoAnteriorFinal: 10000, precioFacturaFinal: 5000, factorPack: 2 });
  assert.equal(porUnidad.unidad, UNIDAD.POR_UNIDAD);
});

test("EN LOS FACTORES REALES, UN PRECIO DENTRO DE LA VARIACIÓN SE DECIDE SOLO", () => {
  // Si el mecanismo preguntara por precios normales no serviría: la unidad o el
  // bulto con hasta un 10 % de diferencia ganan siempre, en todo el catálogo.
  const fallas = [];
  for (const { f } of FACTORES_REALES) {
    for (const cambio of [-10, -5, 0, 5, 10]) {
      const bulto = deducirUnidad({ costoAnteriorFinal: 10000, precioFacturaFinal: 10000 * (1 + cambio / 100), factorPack: f });
      if (bulto.unidad !== UNIDAD.POR_BULTO) fallas.push(`bulto, factor ${f}, ${cambio} %: ${bulto.unidad}`);
      const unidad = deducirUnidad({ costoAnteriorFinal: 10000, precioFacturaFinal: (10000 / f) * (1 + cambio / 100), factorPack: f });
      if (unidad.unidad !== UNIDAD.POR_UNIDAD) fallas.push(`unidad, factor ${f}, ${cambio} %: ${unidad.unidad}`);
    }
  }
  assert.deepEqual(fallas, []);
});

// ── EL ORDEN: NETO A FINAL ANTES DE COMPARAR ───────────────────────────────

test("COMPARAR NETO CONTRA FINAL METE EL IVA EN EL COCIENTE", () => {
  // El orden que Emanuel fijó, demostrado con números. El producto se costea por
  // bulto de 3 y la factura cobra el bulto entero, sin cambio de precio.
  // El final con el 21 % adentro. Desde la lectura interpretada (#165) lo da el
  // modelo por renglón; acá alcanza con la cuenta.
  const netoUnitario = 10000;
  const finalUnitario = netoUnitario * 1.21;
  const costoErpFinal = finalUnitario; // el ERP ya lo tiene, sin cambio

  // La primera versión de este candado afirmaba que sin convertir CAMBIA el
  // veredicto, y con factor 3 no cambia: el desvío del 21 % no alcanza a darlo
  // vuelta. Afirmarlo habría sido vender el candado más caro de lo que vale.
  //
  // Lo que SÍ es cierto y es grave: el 21 % entra ENTERO en el cociente, y ese
  // desvío es del tamaño de un aumento de precio real. La persona lee "subió
  // 21 %" cuando no subió nada. Y en el pack de 2, que tiene zona ambigua,
  // alcanza para empujar un caso limpio adentro de ella.
  const bien = deducirUnidad({
    costoAnteriorFinal: costoErpFinal, precioFacturaFinal: finalUnitario, factorPack: 3,
  });
  assert.equal(bien.unidad, UNIDAD.POR_BULTO);
  assert.ok(bien.cambioImplicado.porBulto < 0.01, "final contra final: sin cambio implicado");

  const mal = deducirUnidad({
    costoAnteriorFinal: costoErpFinal, precioFacturaFinal: netoUnitario, factorPack: 3,
  });
  // EL COCIENTE VALE EXACTAMENTE LA ALÍCUOTA: 1,21. Ese es el enunciado
  // preciso de "el IVA entra entero en la cuenta".
  assert.ok(Math.abs(mal.cociente - 1.21) < 0.001, `el cociente fue ${mal.cociente}`);

  // El cambio que eso IMPLICA es 17,4 % y no 21 %, porque es el mismo desvío
  // visto desde el otro lado: bajar de 12.100 a 10.000 es un 17,4 %. La primera
  // versión de este candado pedía 21 y estaba mal — la métrica es "cuánto
  // tendría que cambiar el precio", no "cuánto se le sumó".
  assert.ok(
    Math.abs(mal.cambioImplicado.porBulto - 17.36) < 0.1,
    `el cambio implicado fue ${mal.cambioImplicado.porBulto.toFixed(2)} %`
  );

  // Y en el pack de 2 SÍ llega a cambiar la respuesta. El punto se buscó con la
  // cuenta, no se eligió a ojo: el cociente bien da 1,25 —afuera de la zona
  // ambigua, decide por bulto— y sin convertir da 1,512, que cae adentro.
  const costoFinal = 12100;
  const precioFinal = costoFinal / 1.25; // 9680
  const precioNeto = precioFinal / 1.21; // 8000
  const limpio = deducirUnidad({ costoAnteriorFinal: costoFinal, precioFacturaFinal: precioFinal, factorPack: 2 });
  const empujado = deducirUnidad({ costoAnteriorFinal: costoFinal, precioFacturaFinal: precioNeto, factorPack: 2 });
  assert.equal(limpio.unidad, UNIDAD.POR_BULTO, "con el final, decide");
  assert.equal(
    empujado.unidad, UNIDAD.NO_SE_PUEDE_DECIDIR,
    "sin convertir, el IVA empuja el caso adentro de la zona ambigua"
  );
});

// ── Lo que no se puede decidir ─────────────────────────────────────────────

test("si ninguna lectura explica el precio, se dice y se pregunta", () => {
  // Un precio diez veces distinto de las dos hipótesis: producto equivocado, o
  // un costo viejísimo.
  const r = deducirUnidad({ costoAnteriorFinal: 10000, precioFacturaFinal: 3, factorPack: 6 });
  assert.equal(r.unidad, UNIDAD.NO_SE_PUEDE_DECIDIR);
  // Desde la regla única (2026-11-07), con las dos lecturas y su diferencia.
  assert.match(r.porque, /Ninguna lectura gana clara: por unidad \(−99,8 %\), por el bulto de 6/);
});

test("sin costo anterior o sin factor no se inventa nada", () => {
  for (const args of [
    { costoAnteriorFinal: 0, precioFacturaFinal: 100, factorPack: 6 },
    { costoAnteriorFinal: 100, precioFacturaFinal: 0, factorPack: 6 },
    { costoAnteriorFinal: null, precioFacturaFinal: 100, factorPack: 6 },
    {},
  ]) {
    const r = deducirUnidad(args);
    assert.equal(r.unidad, UNIDAD.SIN_DATOS, JSON.stringify(args));
    assert.equal(r.requiereDecision, true);
  }
});

test("un producto SIN bulto no tiene dos lecturas: el precio es el que es", () => {
  for (const f of [null, undefined, 0, 1]) {
    const r = deducirUnidad({ costoAnteriorFinal: 500, precioFacturaFinal: 520, factorPack: f });
    assert.equal(r.unidad, UNIDAD.POR_BULTO, String(f));
    assert.equal(r.requiereDecision, false);
  }
});

test("el motivo dice los DOS números, no solo el veredicto", () => {
  // Quien lo lee tiene que poder comprobar la cuenta sin confiar en el sistema.
  const r = deducirUnidad({ costoAnteriorFinal: 12000, precioFacturaFinal: 1000, factorPack: 12 });
  // Desde la regla única (2026-11-07): cada lectura con su diferencia.
  assert.match(r.porque, /por unidad \(\+0,0 %\)/);
  assert.match(r.porque, /por el bulto de 12 \(−91,7 %\)/);
  assert.ok(r.cambioImplicado.porBulto > 0 && r.cambioImplicado.porUnidad >= 0);
});

test("el umbral es UNO SOLO y está a la vista", () => {
  // Que el mismo número gobierne las dos preguntas —qué cambio es plausible y
  // cuánto puede desviarse el cociente— es a propósito: son el mismo fenómeno
  // visto de los dos lados, y tenerlos separados los haría divergir.
  assert.equal(CAMBIO_PLAUSIBLE_PCT, 35);
});

// ── EL VEREDICTO EN CRIOLLO ────────────────────────────────────────────────
//
// El cociente no le dice nada a nadie. "3,08" no es una respuesta; "son 3
// bultos y el bulto sale 37.474" sí.

test("EL CASO DEL BOCETO, textual: 36 ÷ 12 = 3 bultos", () => {
  const veredicto = deducirUnidad({
    costoAnteriorFinal: 37464, precioFacturaFinal: 3122, factorPack: 12,
  });
  assert.equal(veredicto.unidad, UNIDAD.POR_UNIDAD);

  const e = explicarVeredicto({ veredicto, cantidad: 36, precioFinal: 3122, factorPack: 12 });
  assert.match(e.frase, /La factura lo trae por unidad/);
  assert.match(e.frase, /36 ÷ 12 = 3 bultos/);
  assert.match(e.detalle, /37\.464/);
  // El cociente NO aparece en lo que se lee.
  assert.doesNotMatch(e.frase, /cociente/i);
});

test("LAS DOS LECTURAS SE OFRECEN CON SUS NÚMEROS, no como etiquetas", () => {
  // Elegir entre dos resultados es fácil; elegir entre "¿por unidad o por
  // bulto?" obliga a reconstruir la cuenta mentalmente.
  const l = lecturasPosibles({ cantidad: 36, precioFinal: 3122, factorPack: 12 });
  assert.match(l.porUnidad.texto, /Es por unidad: 3 bultos a \$37\.464,00 cada uno/);
  assert.match(l.porBulto.texto, /Es por bulto: 36 bultos a \$3\.122,00 cada uno/);
  assert.equal(l.porUnidad.bultos, 3);
  assert.equal(l.porBulto.bultos, 36);
  assert.equal(l.porUnidad.costoPorBulto, 37464);
  assert.equal(l.porBulto.costoPorBulto, 3122);
});

test("UNA CANTIDAD QUE NO DIVIDE JUSTO SE AVISA, no se redondea", () => {
  // Nadie compra 3,08 bultos. Que no divida justo es señal de que la lectura por
  // unidad no cierra: o el bulto no es de ese tamaño, o la cantidad está mal
  // leída. Redondearlo escondería las dos cosas.
  const l = lecturasPosibles({ cantidad: 37, precioFinal: 3122, factorPack: 12 });
  assert.equal(l.porUnidad.divideJusto, false);
  assert.match(l.porUnidad.texto, /3\.08 bultos/);

  const veredicto = deducirUnidad({ costoAnteriorFinal: 37464, precioFacturaFinal: 3122, factorPack: 12 });
  const e = explicarVeredicto({ veredicto, cantidad: 37, precioFinal: 3122, factorPack: 12 });
  // Se avisa con una frase simple (Emanuel, 2026-10-26): cuántas unidades dice
  // el papel, que no completan packs, y que se cargue lo que entró.
  assert.equal(e.frase, "El papel dice 37 unidades. No completan packs de 12: cargá cuántas entraron.");
  assert.equal(e.noCompletanPacks, true);
});

test("por bulto, la cuenta dice que el precio entra tal cual", () => {
  const veredicto = deducirUnidad({ costoAnteriorFinal: 3122, precioFacturaFinal: 3122, factorPack: 12 });
  const e = explicarVeredicto({ veredicto, cantidad: 36, precioFinal: 3122, factorPack: 12 });
  assert.match(e.frase, /por bulto/);
  assert.match(e.frase, /tal cual/);
  assert.equal(e.noCompletanPacks, undefined, "por bulto siempre completa");
});

test("sin bulto no hay dos lecturas que ofrecer", () => {
  for (const f of [null, 0, 1]) {
    assert.equal(lecturasPosibles({ cantidad: 10, precioFinal: 100, factorPack: f }), null, String(f));
  }
});

test("el singular no se rompe: 1 bulto, no 1 bultos", () => {
  const l = lecturasPosibles({ cantidad: 12, precioFinal: 100, factorPack: 12 });
  assert.match(l.porUnidad.texto, /1 bulto a/);
  assert.doesNotMatch(l.porUnidad.texto, /1 bultos/);
});
