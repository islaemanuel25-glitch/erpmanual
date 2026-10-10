// LA EXPLICACIÓN DEL PAPEL, PROBADA CON LOS NÚMEROS REALES DE PATY.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/pruebaDeExplicacion.test.mjs
//
// ── DE DÓNDE SALEN ESTOS NÚMEROS ──────────────────────────────────────────
//
// De la sonda `sonda-explicacion-papel.mjs` corrida contra el papel real de
// Paty el 2026-09-21 (cd05b779): once renglones, tres corridas idénticas. NO
// están escritos a mano.
//
// El papel tiene DESCUENTO por renglón y PRECIO POR KILO en tres de los once.
// Y tiene, medido, un número mal leído: el yogur vainilla salió 46.896,56 donde
// el papel dice 46.886,55.
//
// ── LO QUE YA NO ESTÁ ACÁ ─────────────────────────────────────────────────
//
// El control por renglón —(kilos o cantidad) × precio × (1 − descuento) contra
// el importe impreso— y su tolerancia se borraron en la segunda parte de la
// lectura interpretada (#165): eran reglas de formato. El modelo da el costo
// final de cada renglón y la cuenta que se controla es su suma contra el total.
// Paty factura sin IVA discriminado, así que su costo final es su importe.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  comoLoEntendio,
  textoDelResultado,
  textoDeLaCantidad,
} from "@/lib/compras-proveedor/comprobante/pruebaDeExplicacion";
import { netoQueFacturaElProveedor } from "@/lib/compras-proveedor/comprobante/precioDeLinea";

/** Los once renglones, tal como los devolvió el modelo. */
const PAPEL_DE_PATY = {
  lineas: [
    { descripcion: "BUTLER C. TRAD 9MM X2,5KG -6-", cantidad: 12, peso: null, netoUnitario: 18991.95, bonificacion: 57, subtotalImpreso: 97998.47 },
    { descripcion: "TREM3 MANTECA X100 GS 60", cantidad: 60, peso: null, netoUnitario: 1984.23, bonificacion: 24, subtotalImpreso: 90481.03 },
    { descripcion: "TREM3 QUESO RALL 40GR X20 6", cantidad: 6, peso: null, netoUnitario: 25565.43, bonificacion: 20, subtotalImpreso: 122714.07 },
    { descripcion: "PATY CLASICO FLOW X80GR X2 30", cantidad: 90, peso: null, netoUnitario: 4113.57, bonificacion: 50, subtotalImpreso: 185110.67 },
    // El mal leído: el modelo leyó 46.896,56, diez pesos de más. El papel
    // dice 46.886,55.
    { descripcion: "TREM3 YOG VAINILLA X 900ML 10", cantidad: 30, peso: null, netoUnitario: 2442.01, bonificacion: 36, subtotalImpreso: 46896.56 },
    { descripcion: "TREM3 YOG FRUTILLA X 900ML 10", cantidad: 40, peso: null, netoUnitario: 2442.01, bonificacion: 36, subtotalImpreso: 62515.42 },
    { descripcion: "TREM3 Q.UNT CLASICO X180GR -12-", cantidad: 12, peso: null, netoUnitario: 2502.4, bonificacion: 30, subtotalImpreso: 21020.17 },
    { descripcion: "TREM3 Q.UNT SALAME X180GR -12-", cantidad: 12, peso: null, netoUnitario: 2502.4, bonificacion: 30, subtotalImpreso: 21020.17 },
    // ── LOS TRES QUE SE COBRAN POR KILO ─────────────────────────────────
    { descripcion: "FOX SAL BAST CHACAR GRUESO X2U 1", cantidad: 2, peso: 2.9, netoUnitario: 22627, bonificacion: 28, subtotalImpreso: 47245.18 },
    { descripcion: "FOX SAL PIC FINO X 4U 1", cantidad: 3, peso: 2.1, netoUnitario: 24889.7, bonificacion: 28, subtotalImpreso: 37633.23 },
    { descripcion: "TREM3 QUESO DANBO (AMARILLO) -1-", cantidad: 3, peso: 11.685, netoUnitario: 16694.69, bonificacion: 34, subtotalImpreso: 128751.11 },
  ],
  pie: { total: 861376.07 },
};

/** El mismo papel como lo da la lectura interpretada: su costo final es su importe. */
const interpretado = (papel, cambios = {}) => ({
  ...papel,
  interpretada: true,
  hayTotalImpreso: papel.pie?.total != null,
  lineas: papel.lineas.map((l, i) => ({ ...l, costoFinal: cambios[i] ?? l.subtotalImpreso, tipo: "MERCADERIA" })),
});

/** Un papel como el de Mauro: sin peso, sin descuento y sin total impreso. */
const PAPEL_DE_MAURO = {
  lineas: [
    { descripcion: "PHILIPS MORRIS 10", cantidad: 80, peso: null, netoUnitario: 3460.32, bonificacion: null, subtotalImpreso: 276825.6 },
    { descripcion: "M.CRAFTED 20 BOX RED", cantidad: 2, peso: null, netoUnitario: 40500, bonificacion: null, subtotalImpreso: 81000 },
  ],
  pie: { total: null },
};

// ── EL NETO: LA UNIDAD LA DECIDE EL PRODUCTO ──────────────────────────────

/** Los dos productos del catálogo que hacen falta, con el ÚNICO campo que decide. */
const DANBO_POR_KILO = { unidad_medida: "kg", precio_costo: 9000, factor_pack: 1 };
const PAPAS_POR_PIEZA = { unidad_medida: "unidad", precio_costo: 9000, factor_pack: 1 };

test("PRODUCTO POR KILO CON PESO EN EL PAPEL: EL NETO ES POR KILO", () => {
  // Los dos valores los calculó Emanuel a mano sobre la foto y cierran exactos.
  const salame = PAPEL_DE_PATY.lineas[8];
  const danbo = PAPEL_DE_PATY.lineas[10];
  assert.equal(
    Math.round(netoQueFacturaElProveedor({ linea: salame, producto: DANBO_POR_KILO }).neto * 100) / 100,
    16291.44
  );
  assert.equal(
    Math.round(netoQueFacturaElProveedor({ linea: danbo, producto: DANBO_POR_KILO }).neto * 100) / 100,
    11018.49
  );
  // Dividir por las PIEZAS daría 42.917,04: cuatro veces el costo real.
  assert.notEqual(Math.round((danbo.subtotalImpreso / danbo.cantidad) * 100) / 100, 11018.49);
});

test("PRODUCTO POR PIEZA CON PESO EN EL PAPEL: EL NETO ES POR PIEZA", () => {
  // Mismo renglón, mismo peso impreso, y el producto dice que va por pieza: el
  // peso del papel es un dato, no una orden. Es el caso de las papas.
  const danbo = PAPEL_DE_PATY.lineas[10];
  const r = netoQueFacturaElProveedor({ linea: danbo, producto: PAPAS_POR_PIEZA });
  assert.equal(r.porKilo, false);
  assert.equal(r.faltanKilos, false);
  // 128.751,11 ÷ 3 piezas.
  assert.equal(Math.round(r.neto * 100) / 100, 42917.04);
  assert.notEqual(Math.round(r.neto * 100) / 100, 11018.49);
});

test("PRODUCTO POR KILO SIN KILOS EN EL PAPEL: NO SE INVENTA, SE PIDEN AL RECIBIR", () => {
  // El butler no trae peso. Si el producto va por kilo, dividir por las 12
  // unidades daría un "precio por kilo" que es por unidad.
  const butler = PAPEL_DE_PATY.lineas[0];
  const r = netoQueFacturaElProveedor({ linea: butler, producto: DANBO_POR_KILO });
  assert.equal(r.neto, null, "se inventó un neto sin kilos");
  assert.equal(r.faltanKilos, true);
  assert.equal(r.porKilo, true);
});

test("RENGLÓN SIN VINCULAR: NO HAY NETO TODAVÍA", () => {
  const danbo = PAPEL_DE_PATY.lineas[10];
  const r = netoQueFacturaElProveedor({ linea: danbo, producto: null });
  assert.equal(r.neto, null);
  assert.equal(r.sinProducto, true);
  assert.equal(r.porKilo, null, "se opinó sobre la unidad sin producto");
});

test("SIN KILOS, EL NETO YA TIENE EL DESCUENTO ADENTRO", () => {
  const butler = PAPEL_DE_PATY.lineas[0];
  const r = netoQueFacturaElProveedor({ linea: butler, producto: PAPAS_POR_PIEZA });
  assert.equal(Math.round(r.neto * 100) / 100, 8166.54);
  // El unitario IMPRESO es el de lista: usarlo como costo sería cargar el
  // producto a más del doble de lo que se pagó.
  assert.equal(butler.netoUnitario, 18991.95);
});

test("CONTRAPRUEBA: en un papel sin peso ni descuento, el neto ES el unitario", () => {
  for (const l of PAPEL_DE_MAURO.lineas) {
    assert.equal(
      Math.round(netoQueFacturaElProveedor({ linea: l, producto: PAPAS_POR_PIEZA }).neto * 100) / 100,
      Math.round(l.netoUnitario * 100) / 100
    );
  }
});

// ── LA CUENTA: LA SUMA DE LOS COSTOS FINALES CONTRA EL TOTAL ──────────────

test("EL YOGUR MAL LEÍDO HACE QUE NO CIERRE, POR SUS DIEZ PESOS", () => {
  const r = comoLoEntendio({ lectura: interpretado(PAPEL_DE_PATY) });
  assert.equal(r.hayTotal, true);
  assert.equal(r.cierra, false);
  assert.equal(r.diferencia, 10.01);
});

test("y con ese renglón corregido al papel, CIERRA", () => {
  const r = comoLoEntendio({ lectura: interpretado(PAPEL_DE_PATY, { 4: 46886.55 }) });
  assert.equal(r.cierra, true);
});

test("UN PAPEL SIN TOTAL NO SE MARCA COMO MAL LEÍDO", () => {
  // El de Mauro. No hay contra qué comparar: decir "no cierra" afirmaría que la
  // lectura está mal cuando puede estar perfecta.
  const r = comoLoEntendio({ lectura: interpretado(PAPEL_DE_MAURO) });
  assert.equal(r.hayTotal, false);
  assert.equal(r.cierra, null);
  const t = textoDelResultado(r);
  assert.equal(t.tono, "aviso");
  assert.match(t.titulo, /no trae total/i);
});

// ── CÓMO SE DICE, QUE ES LA MITAD DEL TRABAJO ─────────────────────────────

test("la cantidad se dice en piezas y kilos cuando hay kilos", () => {
  assert.equal(textoDeLaCantidad({ cantidad: 2, peso: 2.9 }), "2 piezas · 2.9 kg");
  assert.equal(textoDeLaCantidad({ cantidad: 1, peso: 11.685 }), "1 pieza · 11.685 kg");
  assert.equal(textoDeLaCantidad({ cantidad: 12, peso: null }), "12 unidades");
  assert.equal(textoDeLaCantidad({ cantidad: 1, peso: null }), "1 unidad");
});

test("EL TEXTO DE ARRIBA DICE CUÁL DE LOS CASOS ES", () => {
  const moneda = (v) => `$${v.toFixed(2)}`;
  const ok = textoDelResultado(comoLoEntendio({ lectura: interpretado(PAPEL_DE_PATY, { 4: 46886.55 }) }), { moneda });
  // El título nombra el total IMPRESO —que es contra lo que el control
  // compara—, nunca una suma nuestra presentada como si estuviera en el papel.
  assert.equal(ok.tono, "ok");
  assert.match(ok.titulo, /El papel cierra en \$861376\.07/);
  assert.match(ok.detalle, /Está bien leído/);

  const mal = textoDelResultado(comoLoEntendio({ lectura: interpretado(PAPEL_DE_PATY) }), { moneda });
  assert.equal(mal.tono, "alerta");
  assert.match(mal.titulo, /No cierra por \$10\.01/);
});

test("NINGÚN TEXTO DE LA CUENTA DICE LÍNEAS NI ÍTEMS", () => {
  // "Renglones" sí aparece en el que cierra —"los costos de los 11
  // renglones"—: es como se le dice en la pantalla de recetas desde #165.
  const moneda = (v) => `$${v}`;
  const textos = [
    textoDelResultado(comoLoEntendio({ lectura: interpretado(PAPEL_DE_PATY) }), { moneda }),
    textoDelResultado(comoLoEntendio({ lectura: interpretado(PAPEL_DE_MAURO) }), { moneda }),
  ];
  for (const t of textos) {
    const junto = `${t.titulo} ${t.detalle}`.toLowerCase();
    for (const palabra of ["línea", "líneas", "ítem", "items"]) {
      assert.ok(!junto.includes(palabra), `dice "${palabra}": ${junto}`);
    }
  }
});
