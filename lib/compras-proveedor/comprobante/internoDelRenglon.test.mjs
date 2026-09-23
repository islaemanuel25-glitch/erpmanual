// CANDADO: EL IMPUESTO INTERNO, EL FINAL DEL RENGLÓN Y EL CARTEL QUE LOS DICE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/internoDelRenglon.test.mjs
//
// ── LOS DOS PAPELES, Y POR QUÉ HACEN FALTA LOS DOS ───────────────────────
//
// DYSSA imprime el impuesto interno POR UNIDAD y TDC POR RENGLÓN. Los dos son
// ciertos para su papel, y hasta esta tanda el prompt pedía "por unidad": o sea
// le pedía al modelo que dividiera, que es exactamente el agujero del campo
// derivable que `CLAUDE.md` tiene anotado con el total.
//
// Los números están escritos a mano y verificados al centavo contra la foto,
// igual que los de DAS y DYSSA que ya estaban en `impuestos.test.mjs`. No
// dependen de que la receta del proveedor esté guardada — la de TDC todavía no
// lo está.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { verificarComprobante, aCentavos } from "./impuestos.js";
import {
  ESCALA_INTERNO,
  escalaDelInterno,
  normalizarInternoDeLineas,
} from "./internoDelRenglon.js";
import { comoLoEntendio, textoDelResultado } from "./pruebaDeExplicacion.js";

const moneda = (v) =>
  `$${Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ══════════════════════════════════════════════════════════════════════════
// EL PAPEL DE TDC — pedido #247
// ══════════════════════════════════════════════════════════════════════════
//
// Columnas: Art · Uni · Descripción · Precio neto · Imp Int · Bonificación ·
// Total. "Precio neto" es el neto de TODO el renglón, con la bonificación ya
// aplicada y sin IVA. "Imp Int" es el del renglón entero y NO lleva IVA.
// "Total" = Precio neto × 1,21 + Imp Int, y es de donde sale el costo.
//
// ── QUÉ SE TRANSCRIBE Y QUÉ NO ──────────────────────────────────────────
//
// SOLO los números verificados al centavo contra la foto: los dos renglones
// medidos, el impuesto interno de los dos SMF, y el pie. Los otros diez
// renglones NO se inventan — un fixture plausible escrito a mano sobre una
// combinación que el papel no trae es el defecto que este repo tiene anotado
// como el que más se repite.
//
// Por eso hay dos objetos: `TDC` son los renglones medidos, y `PIE_DEL_PAPEL`
// son los totales de los doce. Lo que se afirma con cada uno es distinto y
// queda a la vista cuál es cuál.
const TDC = {
  nombre: "TDC — pedido #247",
  receta: {
    ivaPorLinea: false,
    alicuotaIvaPct: 21,
    tieneImpuestoInterno: true,
    ivaIncluyeInternoEnLaBase: false,
    percepciones: [],
    percepcionesEnCosto: true,
  },
  lineas: [
    {
      descripcion: "SMF RED BERRIE",
      cantidad: 48,
      internoImpreso: 7372.07,
      totalImpreso: 115029.54,
    },
    {
      descripcion: "DADA ART MALBEC",
      cantidad: 18,
      internoImpreso: 0,
      totalImpreso: 82869.39,
    },
  ],
  /** El interno del otro SMF. Está impreso; su renglón no se midió entero. */
  internoDelOtroSmf: 3518.46,
  /**
   * El pie que le corresponde A ESTOS DOS RENGLONES, no al papel entero.
   *
   * Solo trae el impuesto interno, que es el único dato del pie que la medición
   * de la escala necesita — y de los dos renglones medidos, el interno lo lleva
   * uno solo. Poner acá el interno de los doce mezclaría dos universos y el
   * candado afirmaría algo que estos renglones no dicen.
   */
  pie: { interno: 7372.07 },
};

/** Los totales de los DOCE renglones, tal como los imprime el pie. */
const PIE_DEL_PAPEL = {
  sumaDeNetos: 374056.62,
  iva: 78551.89,
  interno: 10890.53,
  total: 463499.07,
};

test("TDC · el interno del pie son los dos SMF y nada más", () => {
  // Es lo que hace que la medición de la escala pueda decidir: la suma de los
  // internos IMPRESOS por renglón da exactamente el del pie.
  assert.equal(
    aCentavos(7372.07) + aCentavos(TDC.internoDelOtroSmf),
    aCentavos(PIE_DEL_PAPEL.interno)
  );
});

test("TDC · el pie cierra con la suma de netos más IVA más interno", () => {
  // La cuenta del papel, para que los números del fixture no se puedan cambiar
  // de a uno sin que algo se ponga rojo. Un peso de tolerancia: el papel
  // redondea el IVA por renglón.
  const armado =
    aCentavos(PIE_DEL_PAPEL.sumaDeNetos) +
    aCentavos(PIE_DEL_PAPEL.iva) +
    aCentavos(PIE_DEL_PAPEL.interno);
  assert.ok(Math.abs(armado - aCentavos(PIE_DEL_PAPEL.total)) <= 100);
  // Y el IVA es el 21 % de los netos, no de otra cosa.
  assert.ok(
    Math.abs(Math.round(aCentavos(PIE_DEL_PAPEL.sumaDeNetos) * 0.21) - aCentavos(PIE_DEL_PAPEL.iva)) <= 100
  );
});

test("TDC · el interno estaba impreso POR RENGLÓN, y se mide contra el pie", () => {
  const d = escalaDelInterno({ lineas: TDC.lineas, pie: TDC.pie });
  assert.equal(d.escala, ESCALA_INTERNO.RENGLON);
  assert.equal(d.medido, true, "no se midió: se cayó al default sin decirlo");
  // La medición, con los dos números que la decidieron.
  assert.equal(d.porRenglonCentavos, aCentavos(7372.07));
  assert.equal(d.porUnidadCentavos, aCentavos(7372.07) * 48);
});

test("TDC · CONTRAPRUEBA: leído como unitario, el interno se va por las nubes", () => {
  // Es lo que pasaba antes de esta tanda: 7.372,07 tomado como precio por
  // unidad y multiplicado por 48. El papel trae 10.890,53 de impuesto interno y
  // la lectura vieja daría más de 400.000.
  const d = escalaDelInterno({ lineas: TDC.lineas, pie: TDC.pie });
  assert.ok(
    d.porUnidadCentavos > aCentavos(TDC.pie.interno) * 30,
    "si las dos lecturas dieran parecido, este candado no separaría nada"
  );
});

test("TDC · el interno del pie CIERRA después de normalizar", () => {
  const { lineas } = normalizarInternoDeLineas({ lineas: TDC.lineas, pie: TDC.pie });
  const v = verificarComprobante({ lineas, pie: TDC.pie, receta: TDC.receta });
  assert.equal(
    v.internoCentavos,
    aCentavos(TDC.pie.interno),
    "el impuesto interno tiene que dar EXACTAMENTE el del pie"
  );
});

test("TDC · y el interno solo lo llevan los dos SMF", () => {
  const { lineas } = normalizarInternoDeLineas({ lineas: TDC.lineas, pie: TDC.pie });
  const v = verificarComprobante({ lineas, pie: TDC.pie, receta: TDC.receta });
  assert.deepEqual(
    v.lineas.map((l) => l.internoLineaCentavos),
    [aCentavos(7372.07), 0],
    "el interno se repartió a un renglón que no lo trae"
  );
});

test("TDC · EL COSTO SALE DE LA COLUMNA TOTAL, con IVA e interno adentro", () => {
  const { lineas } = normalizarInternoDeLineas({ lineas: TDC.lineas, pie: TDC.pie });
  const v = verificarComprobante({ lineas, pie: TDC.pie, receta: TDC.receta });

  // SMF RED BERRIE: 115.029,54 ÷ 48.
  assert.equal(v.lineas[0].finalUnitarioCentavos, aCentavos(2396.45));
  // DADA ART MALBEC: 82.869,39 ÷ 18. Sin impuesto interno.
  assert.equal(v.lineas[1].finalUnitarioCentavos, aCentavos(4603.86));

  // Y el importe del renglón es el IMPRESO, no una reconstrucción: el papel
  // redondea por renglón y rearmarlo desde el neto da otro número.
  assert.equal(v.lineas[0].finalLineaCentavos, aCentavos(115029.54));
  assert.equal(v.lineas[1].finalLineaCentavos, aCentavos(82869.39));
});

test("TDC · el costo NO es el neto: hay 21 % de diferencia y se nota", () => {
  // La red contra el error que ningún otro control ve. El neto unitario de la
  // primera línea ronda los 1.853; el costo tiene que estar en 2.396.
  const { lineas } = normalizarInternoDeLineas({ lineas: TDC.lineas, pie: TDC.pie });
  const v = verificarComprobante({ lineas, pie: TDC.pie, receta: TDC.receta });
  const costo = v.lineas[0].finalUnitarioCentavos;
  const netoAprox = Math.round((aCentavos(115029.54) - aCentavos(7372.07)) / 1.21 / 48);
  assert.ok(costo > netoAprox * 1.25, `el costo ${costo} quedó pegado al neto ${netoAprox}`);
});

// ══════════════════════════════════════════════════════════════════════════
// EL CARTEL — el defecto de origen
// ══════════════════════════════════════════════════════════════════════════

/**
 * UNA LECTURA COMPLETA Y COHERENTE, armada con los DOS renglones medidos.
 *
 * El pie no es el de los doce —eso sería mezclar dos universos— sino el que le
 * corresponde a estos dos: sus netos, su IVA al 21 % y el interno de uno solo.
 * Lo que este bloque afirma es el COMPORTAMIENTO DEL CARTEL, y para eso hace
 * falta una lectura que cierre de verdad; los números del papel entero ya se
 * afirman arriba, contra `PIE_DEL_PAPEL`.
 */
const NETOS_DE_LOS_DOS = TDC.lineas.map(
  (l) => Math.round(((l.totalImpreso - l.internoImpreso) / 1.21) * 100) / 100
);
const SUMA_DE_LOS_DOS = NETOS_DE_LOS_DOS.reduce((a, n) => a + n, 0);
const IVA_DE_LOS_DOS = Math.round(SUMA_DE_LOS_DOS * 0.21 * 100) / 100;
const INTERNO_DE_LOS_DOS = 7372.07;

const LECTURA_TDC = {
  lineas: TDC.lineas.map((l, i) => ({
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    netoUnitario: Math.round((NETOS_DE_LOS_DOS[i] / l.cantidad) * 100) / 100,
    subtotalImpreso: NETOS_DE_LOS_DOS[i],
    internoImpreso: l.internoImpreso,
    totalImpreso: l.totalImpreso,
  })),
  pie: {
    interno: INTERNO_DE_LOS_DOS,
    total: Math.round((SUMA_DE_LOS_DOS + IVA_DE_LOS_DOS + INTERNO_DE_LOS_DOS) * 100) / 100,
    conceptos: [
      { nombre: "IVA 21%", importe: IVA_DE_LOS_DOS },
      { nombre: "IMP. INT.", importe: INTERNO_DE_LOS_DOS },
    ],
  },
};

test("EL CARTEL NOMBRA EL TOTAL DEL PAPEL, NUNCA LA SUMA DE NETOS", () => {
  // El defecto, con su texto: decía "Los 12 productos suman $374.056,62" y
  // abajo "Igual que el total del papel. Está bien leído." Esos $374.056,62 son
  // la suma de la columna neto y NO están impresos en ninguna parte: el total
  // del papel es $463.499,07.
  const suma = 300000;
  const r = {
    hayTotal: true,
    cierra: true,
    suma,
    totalDelPapel: 463499.07,
    productos: [{}, {}],
    sospechosos: [],
    conceptosDelPie: {
      hay: true,
      lista: [
        { nombre: "IVA 21%", importe: 78551.89, resta: false },
        { nombre: "IMP. INT.", importe: 10890.53, resta: false },
      ],
    },
  };
  const t = textoDelResultado(r, { moneda });

  assert.match(t.titulo, /463\.499,07/, "el título no nombra el total del papel");
  assert.ok(
    !t.titulo.includes(moneda(suma)),
    "el título volvió a titular con la suma de netos"
  );
  // Y la frase prohibida no puede volver sobre la suma.
  assert.ok(
    !/Igual que el total del papel/.test(`${t.titulo} ${t.detalle}`),
    "volvió la afirmación de igualdad entre la suma de netos y el total"
  );
  // La cuenta completa sí se dice, con sus conceptos.
  assert.match(t.detalle, /IVA 21%/);
  assert.match(t.detalle, /IMP\. INT\./);
  assert.match(t.detalle, /Está bien leído/);
});

test("sobre una lectura REAL, el título dice el total y no la suma de netos", () => {
  const r = comoLoEntendio({ lectura: LECTURA_TDC, receta: TDC.receta });
  const t = textoDelResultado(r, { moneda });
  assert.equal(r.cierra, true, `no cerró: ${r.diferencia}`);
  assert.match(t.titulo, new RegExp(moneda(LECTURA_TDC.pie.total).replace(/[$.]/g, "\\$&")));
  assert.ok(
    !t.titulo.includes(moneda(r.suma)),
    "el título volvió a titular con la suma de netos"
  );
  // El interno se midió por RENGLÓN y el pie cerró igual.
  assert.equal(r.suma, SUMA_DE_LOS_DOS);
});

test("si NO cierra, el cartel no dice que está bien leído", () => {
  const r = comoLoEntendio({
    lectura: { ...LECTURA_TDC, pie: { ...LECTURA_TDC.pie, total: 500000 } },
    receta: TDC.receta,
  });
  const t = textoDelResultado(r, { moneda });
  assert.equal(r.cierra, false);
  assert.equal(t.tono, "alerta");
  assert.ok(!/Está bien leído/.test(t.detalle));
});

test("EL IMPORTE DEL RENGLÓN QUE SE MUESTRA ES EL FINAL, NO EL NETO", () => {
  const r = comoLoEntendio({ lectura: LECTURA_TDC, receta: TDC.receta });
  assert.equal(r.productos[0].importeFinal, 115029.54);
  assert.equal(r.productos[1].importeFinal, 82869.39);
  // Y el costo que va a quedar viaja con él, del mismo lugar.
  assert.equal(r.productos[0].costoUnitario, 2396.45);
  assert.equal(r.productos[1].costoUnitario, 4603.86);
  // El neto sigue disponible y es OTRO número: si fueran iguales, este candado
  // no probaría que se cambió el que se muestra.
  assert.ok(r.productos[0].subtotal < r.productos[0].importeFinal);
});

// ══════════════════════════════════════════════════════════════════════════
// DYSSA NO SE MUEVE
// ══════════════════════════════════════════════════════════════════════════
//
// Es el único proveedor con impuesto interno en producción y lo imprime POR
// UNIDAD. Esta tanda cambia cómo se le pide el número al modelo, así que lo que
// hay que probar es que el resultado sea idéntico.

const DYSSA = {
  receta: {
    ivaPorLinea: true,
    alicuotaIvaPct: 21,
    tieneImpuestoInterno: true,
    ivaIncluyeInternoEnLaBase: false,
    percepciones: [
      { nombre: "IIBB", pct: 3 },
      { nombre: "IVA", pct: 3 },
    ],
    percepcionesEnCosto: true,
  },
  lineas: [
    // AMARGO OBRERO — la primera del papel.
    { cantidad: 36, netoUnitario: 2580.57, subtotalImpreso: 92900.52, internoImpreso: 535.47 },
    { cantidad: 20, netoUnitario: 1279.37, subtotalImpreso: 25587.4, internoImpreso: 0 },
    { cantidad: 8, netoUnitario: 8892.27, subtotalImpreso: 71138.16, internoImpreso: 549.28 },
    { cantidad: 8, netoUnitario: 9546.63, subtotalImpreso: 76373.04, internoImpreso: 598.0 },
    { cantidad: 30, netoUnitario: 3170.07, subtotalImpreso: 95102.1, internoImpreso: 0 },
    { cantidad: 54, netoUnitario: 657.98, subtotalImpreso: 35530.92, internoImpreso: 0 },
    { cantidad: 3, netoUnitario: 10477.03, subtotalImpreso: 31431.09, internoImpreso: 0 },
  ],
  pie: { neto: 428063.23, iva: 89893.28, interno: 28455.16, total: 572095.46 },
};

test("DYSSA · sigue midiéndose POR UNIDAD", () => {
  const d = escalaDelInterno({ lineas: DYSSA.lineas, pie: DYSSA.pie });
  assert.equal(d.escala, ESCALA_INTERNO.UNIDAD);
  assert.equal(d.medido, true);
});

test("DYSSA · EL COSTO DEL AMARGO OBRERO SIGUE EN 3.812,79", () => {
  const { lineas } = normalizarInternoDeLineas({ lineas: DYSSA.lineas, pie: DYSSA.pie });
  const v = verificarComprobante({ lineas, pie: DYSSA.pie, receta: DYSSA.receta });
  assert.equal(
    v.lineas[0].finalUnitarioCentavos,
    aCentavos(3812.79),
    "se movió el costo del único proveedor con interno que hay en producción"
  );
});

test("DYSSA · y el pie sigue cerrando, con su interno exacto", () => {
  const { lineas } = normalizarInternoDeLineas({ lineas: DYSSA.lineas, pie: DYSSA.pie });
  const v = verificarComprobante({ lineas, pie: DYSSA.pie, receta: DYSSA.receta });
  assert.equal(v.netoCentavos, aCentavos(DYSSA.pie.neto));
  assert.equal(v.internoCentavos, aCentavos(DYSSA.pie.interno));
  assert.equal(v.cierra, true, `no cerró: ${v.diferenciaCentavos} centavos`);
});

test("DYSSA · sin la columna Total impresa, el final se sigue calculando", () => {
  // El papel de DYSSA no trae un importe final por renglón, así que la rama
  // nueva —"lo impreso manda"— no se activa y el cálculo es el de siempre.
  const { lineas } = normalizarInternoDeLineas({ lineas: DYSSA.lineas, pie: DYSSA.pie });
  const v = verificarComprobante({ lineas, pie: DYSSA.pie, receta: DYSSA.receta });
  assert.equal(v.lineas[0].totalImpresoCentavos, null);
  assert.equal(v.lineas[0].finalLineaCentavos, v.lineas[0].finalSinPercepcionCentavos * 36);
});

// ══════════════════════════════════════════════════════════════════════════
// LOS BORDES DE LA MEDICIÓN
// ══════════════════════════════════════════════════════════════════════════

test("sin interno en el pie NO se adivina: se cae a por unidad y se dice", () => {
  const d = escalaDelInterno({ lineas: TDC.lineas, pie: { total: 463499.07 } });
  assert.equal(d.escala, ESCALA_INTERNO.UNIDAD);
  assert.equal(d.medido, false, "una caída al default no puede parecer una medición");
});

test("si ninguna de las dos reconcilia, tampoco se fuerza una", () => {
  // El papel no cierra por otra cosa. Forzar una escala taparía ese problema
  // con otro.
  const d = escalaDelInterno({ lineas: TDC.lineas, pie: { interno: 99999 } });
  assert.equal(d.medido, false);
});

test("con cantidad 1 las dos dan lo mismo y da igual cuál se elija", () => {
  const lineas = [{ cantidad: 1, internoImpreso: 500 }];
  const d = escalaDelInterno({ lineas, pie: { interno: 500 } });
  assert.equal(d.medido, false, "no hay nada que decidir");
  assert.equal(d.porUnidadCentavos, d.porRenglonCentavos);
});

test("una lectura YA GUARDADA, sin `internoImpreso`, se sigue leyendo igual", () => {
  // Las filas de `ComprobanteLinea` guardan `internoUnitario` por unidad. Sin
  // el campo nuevo, la medición cae a por unidad, que es lo que esas filas
  // siempre fueron. No se reescribe nada.
  const viejas = DYSSA.lineas.map(({ internoImpreso, ...l }) => ({
    ...l,
    internoUnitario: internoImpreso,
  }));
  const { lineas } = normalizarInternoDeLineas({ lineas: viejas, pie: DYSSA.pie });
  const v = verificarComprobante({ lineas, pie: DYSSA.pie, receta: DYSSA.receta });
  assert.equal(v.internoCentavos, aCentavos(DYSSA.pie.interno));
  assert.equal(v.lineas[0].finalUnitarioCentavos, aCentavos(3812.79));
});

test("EL MODELO NO TIENE QUE DIVIDIR: el prompt pide el número impreso", () => {
  // La contraprueba del agujero del campo derivable. Si alguien vuelve a pedir
  // "por unidad", este candado se pone rojo.
  const src = readFileSync(
    "lib/compras-proveedor/comprobante/lector/promptDesdeReceta.js",
    "utf8"
  );
  assert.match(src, /internoImpreso/, "el prompt dejó de pedir el interno como está impreso");
  assert.ok(
    !/Transcribilo en `internoUnitario` por unidad/.test(src),
    "volvió el pedido de dividir por la cantidad"
  );
  assert.match(src, /no lo dividas por la cantidad/i);
});
