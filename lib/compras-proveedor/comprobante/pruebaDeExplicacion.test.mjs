// LA EXPLICACIÓN DEL PAPEL, PROBADA CON LOS NÚMEROS REALES DE PATY.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/pruebaDeExplicacion.test.mjs
//
// ── DE DÓNDE SALEN ESTOS NÚMEROS ──────────────────────────────────────────
//
// De la sonda `sonda-explicacion-papel.mjs` corrida contra el papel real de
// Paty el 2026-09-21 (cd05b779): once renglones, tres corridas idénticas. NO
// están escritos a mano — es el fixture que este repo pide y que tres veces
// costó no tener.
//
// El papel tiene las dos cosas que el circuito de Mauro nunca vio: DESCUENTO
// por renglón y PRECIO POR KILO en tres de los once. Y tiene, medido, un número
// mal leído: el yogur vainilla salió 46.896,56 donde el papel dice 46.886,55.
// Ese renglón es el candado más importante de este archivo.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  comoLoEntendio,
  textoDelResultado,
  textoDeLaCantidad,
} from "@/lib/compras-proveedor/comprobante/pruebaDeExplicacion";
import { netoQueFacturaElProveedor } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { toleranciaDelRenglon } from "@/lib/compras-proveedor/comprobante/lector/puerta";

/** La receta de Paty, medida: sin IVA discriminado y sin percepciones. */
const RECETA_PATY = {
  ivaPorLinea: false,
  alicuotaIvaPct: 0,
  tieneImpuestoInterno: false,
  ivaIncluyeInternoEnLaBase: false,
  percepciones: [],
  percepcionesEnCosto: true,
};

/** Los once renglones, tal como los devolvió el modelo. */
const PAPEL_DE_PATY = {
  lineas: [
    { descripcion: "BUTLER C. TRAD 9MM X2,5KG -6-", cantidad: 12, peso: null, netoUnitario: 18991.95, bonificacion: 57, subtotalImpreso: 97998.47 },
    { descripcion: "TREM3 MANTECA X100 GS 60", cantidad: 60, peso: null, netoUnitario: 1984.23, bonificacion: 24, subtotalImpreso: 90481.03 },
    { descripcion: "TREM3 QUESO RALL 40GR X20 6", cantidad: 6, peso: null, netoUnitario: 25565.43, bonificacion: 20, subtotalImpreso: 122714.07 },
    { descripcion: "PATY CLASICO FLOW X80GR X2 30", cantidad: 90, peso: null, netoUnitario: 4113.57, bonificacion: 50, subtotalImpreso: 185110.67 },
    // ── EL MAL LEÍDO, Y ES EL CANDADO MÁS IMPORTANTE DE ESTE ARCHIVO ────
    // 30 × 2.442,01 × (1 − 36 %) = 46.886,59. El modelo leyó 46.896,56, diez
    // pesos de más: un 8 que se leyó 9 en la foto. El papel dice 46.886,55.
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

/** Un papel como el de Mauro: sin peso, sin descuento y sin total impreso. */
const PAPEL_DE_MAURO = {
  lineas: [
    { descripcion: "PHILIPS MORRIS 10", cantidad: 80, peso: null, netoUnitario: 3460.32, bonificacion: null, subtotalImpreso: 276825.6 },
    { descripcion: "M.CRAFTED 20 BOX RED", cantidad: 2, peso: null, netoUnitario: 40500, bonificacion: null, subtotalImpreso: 81000 },
  ],
  pie: { total: null },
};

// ── EL NETO ───────────────────────────────────────────────────────────────

test("CON KILOS, EL NETO ES POR KILO Y NO POR PIEZA", () => {
  // Los tres valores los calculó Emanuel a mano sobre la foto y cierran exactos.
  const salame = PAPEL_DE_PATY.lineas[8];
  assert.equal(Math.round(netoQueFacturaElProveedor(salame) * 100) / 100, 16291.44);
  const danbo = PAPEL_DE_PATY.lineas[10];
  assert.equal(Math.round(netoQueFacturaElProveedor(danbo) * 100) / 100, 11018.49);
  // Dividir por las PIEZAS daría 42.917,04: cuatro veces el costo real. Es el
  // número que entraría al catálogo si los kilos no se leyeran.
  assert.notEqual(Math.round((danbo.subtotalImpreso / danbo.cantidad) * 100) / 100, 11018.49);
});

test("SIN KILOS, EL NETO YA TIENE EL DESCUENTO ADENTRO", () => {
  const butler = PAPEL_DE_PATY.lineas[0];
  assert.equal(Math.round(netoQueFacturaElProveedor(butler) * 100) / 100, 8166.54);
  // El unitario IMPRESO es el de lista, 18.991,95: usarlo como costo sería
  // cargar el producto a más del doble de lo que se pagó.
  assert.equal(butler.netoUnitario, 18991.95);
});

test("CONTRAPRUEBA: en un papel sin peso ni descuento, el neto ES el unitario", () => {
  // Es el papel de Mauro, que hoy funciona. Si esto cambiara, todo el circuito
  // que ya anda empezaría a escribir otros costos sin que nadie lo pida.
  for (const l of PAPEL_DE_MAURO.lineas) {
    // Redondeado al centavo: 276.825,60 ÷ 80 da 3460.3199999999997 en coma
    // flotante. La igualdad que importa es la del costo, no la del binario.
    assert.equal(
      Math.round(netoQueFacturaElProveedor(l) * 100) / 100,
      Math.round(l.netoUnitario * 100) / 100
    );
  }
});

// ── LOS DOS CONTROLES ─────────────────────────────────────────────────────

test("EL CONTROL POR RENGLÓN SEÑALA EL YOGUR, Y SOLO EL YOGUR", () => {
  const r = comoLoEntendio({ lectura: PAPEL_DE_PATY, receta: RECETA_PATY });
  assert.equal(r.sospechosos.length, 1, "señaló de más o de menos");
  assert.match(r.sospechosos[0].nombre, /YOG VAINILLA/);
  // Y ofrece lo que da la cuenta, para poder preguntárselo a la persona.
  assert.equal(Math.round(r.sospechosos[0].daLaCuenta * 100) / 100, 46886.59);
  assert.equal(r.enOrden, 10, "los otros diez dan su cuenta");
});

test("Y NO SEÑALA LA MANTECA, QUE DIFIERE 14 CENTAVOS Y ESTÁ BIEN LEÍDA", () => {
  // Medido: 60 × 1.984,23 × (1 − 24 %) da 90.480,89 y el papel dice 90.481,03.
  // El proveedor redondea el unitario antes de multiplicar y ese centavo se
  // multiplica por 60. Con una tolerancia fija de cinco centavos, este renglón
  // perfecto mandaría a mirar la foto — y un control que señala de más se
  // empieza a ignorar.
  const manteca = PAPEL_DE_PATY.lineas[1];
  const calculado = manteca.cantidad * manteca.netoUnitario * (1 - manteca.bonificacion / 100);
  assert.ok(Math.abs(calculado - manteca.subtotalImpreso) > 0.05, "el caso ya no es el medido");
  assert.ok(Math.abs(calculado - manteca.subtotalImpreso) < 0.6);
  assert.equal(toleranciaDelRenglon(60), 60, "cinco de piso más uno por unidad");

  const r = comoLoEntendio({ lectura: PAPEL_DE_PATY, receta: RECETA_PATY });
  assert.ok(
    !r.sospechosos.some((p) => /MANTECA/.test(p.nombre)),
    "volvió a marcar como mal leído un renglón que está bien"
  );
});

test("CONTRAPRUEBA: la tolerancia no tapa el error del yogur", () => {
  // 30 unidades dan 30 centavos de margen; el yogur difiere 9,97. Si la
  // tolerancia creciera de más, este candado se quedaría sin nada que atrapar.
  assert.equal(toleranciaDelRenglon(30), 30);
  const yogur = PAPEL_DE_PATY.lineas[4];
  const calculado = yogur.cantidad * yogur.netoUnitario * (1 - yogur.bonificacion / 100);
  assert.ok(Math.abs(calculado - yogur.subtotalImpreso) * 100 > toleranciaDelRenglon(30));
});

test("y con ese renglón corregido, el papel CIERRA", () => {
  // La prueba de que la diferencia del papel es exactamente ese renglón.
  const corregido = {
    ...PAPEL_DE_PATY,
    lineas: PAPEL_DE_PATY.lineas.map((l, i) =>
      i === 4 ? { ...l, subtotalImpreso: 46886.59 } : l
    ),
  };
  const r = comoLoEntendio({ lectura: corregido, receta: RECETA_PATY });
  assert.equal(r.sospechosos.length, 0);
  assert.equal(r.cierra, true, `quedó una diferencia de ${r.diferencia}`);
});

test("EL CONTROL PRINCIPAL ES EL DE SIEMPRE, CON LA RECETA PUESTA", () => {
  // No es una suma pelada: pasa por `verificarComprobante`, que aplica IVA y
  // percepciones. Con la receta de Paty —sin IVA discriminado— el total
  // calculado es la suma; con IVA del 21 % daría otra cosa, y ese es el punto.
  const r = comoLoEntendio({ lectura: PAPEL_DE_PATY, receta: RECETA_PATY });
  assert.equal(Math.round(r.suma * 100) / 100, 861386.08);
  assert.equal(r.totalDelPapel, 861376.07);
  assert.equal(Math.round(r.diferencia * 100) / 100, 10.01);
  assert.equal(r.cierra, false);

  const conIva = comoLoEntendio({
    lectura: PAPEL_DE_PATY,
    receta: { ...RECETA_PATY, alicuotaIvaPct: 21 },
  });
  assert.notEqual(
    conIva.totalCalculado,
    r.totalCalculado,
    "la receta dejó de influir en el control principal"
  );
});

test("UN PAPEL SIN TOTAL NO SE MARCA COMO MAL LEÍDO", () => {
  // El de Mauro. No hay contra qué comparar: decir "no cierra" afirmaría que la
  // lectura está mal cuando puede estar perfecta.
  const r = comoLoEntendio({ lectura: PAPEL_DE_MAURO, receta: {} });
  assert.equal(r.hayTotal, false);
  assert.equal(r.cierra, null);
  assert.equal(r.sospechosos.length, 0, "sus renglones dan su cuenta");
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

test("EL TEXTO DE ARRIBA DICE CUÁL DE LOS TRES CASOS ES", () => {
  const moneda = (v) => `$${v.toFixed(2)}`;
  const ok = textoDelResultado(
    comoLoEntendio({
      lectura: { ...PAPEL_DE_PATY, lineas: PAPEL_DE_PATY.lineas.map((l, i) => (i === 4 ? { ...l, subtotalImpreso: 46886.59 } : l)) },
      receta: RECETA_PATY,
    }),
    { moneda }
  );
  assert.equal(ok.tono, "ok");
  assert.match(ok.titulo, /11 productos suman/);
  assert.match(ok.detalle, /Igual que el total del papel/);

  const mal = textoDelResultado(comoLoEntendio({ lectura: PAPEL_DE_PATY, receta: RECETA_PATY }), { moneda });
  assert.equal(mal.tono, "alerta");
  assert.match(mal.titulo, /No cierra por \$10\.01/);
  assert.match(mal.detalle, /está acá abajo/);
});

test("NINGÚN TEXTO DICE RENGLONES, LÍNEAS NI ÍTEMS", () => {
  const moneda = (v) => `$${v}`;
  const textos = [
    textoDelResultado(comoLoEntendio({ lectura: PAPEL_DE_PATY, receta: RECETA_PATY }), { moneda }),
    textoDelResultado(comoLoEntendio({ lectura: PAPEL_DE_MAURO, receta: {} }), { moneda }),
  ];
  for (const t of textos) {
    const junto = `${t.titulo} ${t.detalle}`.toLowerCase();
    for (const palabra of ["renglón", "renglones", "línea", "líneas", "ítem", "items"]) {
      assert.ok(!junto.includes(palabra), `dice "${palabra}": ${junto}`);
    }
  }
});
