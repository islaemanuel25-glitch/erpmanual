// LA UNIDAD DEL COSTO LA DECIDE EL PRODUCTO, NO EL PAPEL.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/unidadDelCosto.test.mjs
//
// ── LA REGLA, Y POR QUÉ NECESITA UN CANDADO PROPIO ────────────────────────
//
// Cómo se maneja cada producto en el depósito ya está en el catálogo. El queso
// danbo va por kilo; las papas van por pieza, aunque el papel del proveedor
// imprima su peso. El peso del papel es un dato, no una orden.
//
// Entre el 2026-09-21 y `6787934d` esto estuvo al revés: el neto se dividía por
// los kilos siempre que el renglón los trajera. Medido contra producción, eso
// alcanza a **2.611 productos activos que NO se miden en kilos** —1.281 por
// unidad, 1.312 en pack, 18 en cajón— contra 100 que sí. Un renglón de papas
// entraba al catálogo con un precio por kilo, y después se comparaba contra un
// costo que está por pieza: la comparación no significa nada y el aviso de
// aumento tampoco.
//
// Nada de eso rompe nada visible. El comprobante cierra igual —el control de
// lectura no mira el costo—, la pantalla dibuja un número, y el error aparece
// meses después como un margen que no da.
//
// ── Y EL CONTRAPESO: EL CONTROL DE LECTURA SÍ SIGUE AL PAPEL ──────────────
//
// Son dos preguntas distintas y este archivo afirma las dos, para que nadie las
// unifique "de paso". Verificar con la unidad del producto haría fallar papeles
// perfectos; costear con la unidad del papel es el defecto de arriba.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { seMideEnKilos, esProductoFiambre } from "@/lib/conversiones/stock";
import { netoQueFacturaElProveedor } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { verificarCoherenciaDeLineas } from "@/lib/compras-proveedor/comprobante/lector/puerta";

/**
 * EL RENGLÓN REAL DEL DANBO, del papel de Paty medido el 2026-09-21.
 * 3 piezas, 11,685 kg, 34 % de descuento, subtotal impreso 128.751,11.
 */
const RENGLON_CON_PESO = {
  descripcion: "TREM3 QUESO DANBO (AMARILLO) -1-",
  cantidad: 3,
  peso: 11.685,
  netoUnitario: 16694.69,
  bonificacion: 34,
  subtotalImpreso: 128751.11,
};

/** Un renglón sin peso impreso: el butler del mismo papel. */
const RENGLON_SIN_PESO = {
  descripcion: "BUTLER C. TRAD 9MM X2,5KG -6-",
  cantidad: 12,
  peso: null,
  netoUnitario: 18991.95,
  bonificacion: 57,
  subtotalImpreso: 97998.47,
};

// Los productos, con el ÚNICO campo que decide. Los valores del enum son los
// del schema: `UnidadMedida { unidad, pack, cajon, kg }`.
const POR_KILO = { unidad_medida: "kg", precio_costo: 10000, factor_pack: 1 };
const POR_PIEZA = { unidad_medida: "unidad", precio_costo: 40000, factor_pack: 1 };
const EN_PACK = { unidad_medida: "pack", precio_costo: 40000, factor_pack: 6 };

const alCentavo = (n) => Math.round(Number(n) * 100) / 100;

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// ── EL PREDICADO ──────────────────────────────────────────────────────────

test("EL PREDICADO SALE DE `unidad_medida`, QUE ES EL CAMPO QUE YA EXISTE", () => {
  assert.equal(seMideEnKilos(POR_KILO), true);
  assert.equal(seMideEnKilos(POR_PIEZA), false);
  assert.equal(seMideEnKilos(EN_PACK), false);
  assert.equal(seMideEnKilos({ unidad_medida: "cajon" }), false);
  // Sin producto no se opina.
  assert.equal(seMideEnKilos(null), false);
  assert.equal(seMideEnKilos(undefined), false);
  // Y no se inventó ningún campo nuevo: es el mismo que ya condiciona el
  // fiambre, y por eso los dos predicados no pueden divergir.
  assert.equal(esProductoFiambre({ ...POR_KILO, modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 4.5 }), true);
  assert.equal(esProductoFiambre({ ...POR_PIEZA, modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 4.5 }), false);
});

test("UN PRODUCTO POR KILO QUE NO ES FIAMBRE EXISTE, Y SE MIDE EN KILOS IGUAL", () => {
  // Medido contra producción: de los 100 productos en kg, 64 son fiambre
  // —`modoCompraProveedor = UNIDAD`— y 36 se compran por kilo. El danbo es de
  // los segundos. Si el predicado hubiera usado el criterio del fiambre, esos
  // 36 habrían quedado costeados por pieza.
  const compradoPorKilo = { unidad_medida: "kg", modoCompraProveedor: "BULTO", pesoReferenciaKg: null };
  assert.equal(esProductoFiambre(compradoPorKilo), false);
  assert.equal(seMideEnKilos(compradoPorKilo), true, "un producto por kilo dejó de medirse en kilos");
});

// ── EL NETO, QUE ES LO QUE SE CONVIERTE EN COSTO ──────────────────────────

test("POR KILO CON PESO EN EL PAPEL: SUBTOTAL ÷ KILOS", () => {
  const r = netoQueFacturaElProveedor({ linea: RENGLON_CON_PESO, producto: POR_KILO });
  assert.equal(alCentavo(r.neto), 11018.49);
  assert.equal(r.porKilo, true);
  assert.equal(r.faltanKilos, false);
});

test("POR PIEZA CON PESO EN EL PAPEL: SUBTOTAL ÷ CANTIDAD, Y EL PESO SE IGNORA", () => {
  // EL CANDADO DE ESTA TANDA. Mismo renglón, mismo peso impreso.
  const r = netoQueFacturaElProveedor({ linea: RENGLON_CON_PESO, producto: POR_PIEZA });
  assert.equal(alCentavo(r.neto), 42917.04, "128.751,11 ÷ 3 piezas");
  assert.equal(r.porKilo, false);
  // Y NO es el número por kilo, que es el que salía antes de esta tanda.
  assert.notEqual(alCentavo(r.neto), 11018.49);
});

test("LO MISMO PARA PACK Y CAJÓN: SOLO `kg` DIVIDE POR KILOS", () => {
  for (const producto of [EN_PACK, { unidad_medida: "cajon", precio_costo: 1, factor_pack: 12 }]) {
    const r = netoQueFacturaElProveedor({ linea: RENGLON_CON_PESO, producto });
    assert.equal(alCentavo(r.neto), 42917.04);
    assert.equal(r.porKilo, false);
  }
});

test("POR KILO SIN KILOS EN EL PAPEL: NO HAY NETO, SE PIDEN AL RECIBIR", () => {
  const r = netoQueFacturaElProveedor({ linea: RENGLON_SIN_PESO, producto: POR_KILO });
  assert.equal(r.neto, null, "se inventó un precio por kilo sin tener los kilos");
  assert.equal(r.faltanKilos, true);
  assert.equal(r.porKilo, true);
  // Y NO se cayó a la cantidad, que es la trampa: 97.998,47 ÷ 12 daría un
  // número perfectamente creíble que no es un precio por kilo.
  assert.notEqual(alCentavo(r.neto), alCentavo(97998.47 / 12));
});

test("SIN VINCULAR NO HAY NETO NI OPINIÓN SOBRE LA UNIDAD", () => {
  const r = netoQueFacturaElProveedor({ linea: RENGLON_CON_PESO, producto: null });
  assert.equal(r.neto, null);
  assert.equal(r.sinProducto, true);
  assert.equal(r.porKilo, null);
  // Y el análisis entero tampoco devuelve nada, que es lo que la pantalla ya
  // sabe dibujar como "sin vincular".
  assert.equal(analizarPrecioDeLinea({ linea: RENGLON_CON_PESO, producto: null }), null);
});

// ── EL ANÁLISIS COMPLETO, QUE ES LO QUE VIAJA A LA PANTALLA ───────────────

test("FALTANDO LOS KILOS, EL ANÁLISIS NO PROPONE NINGÚN PRECIO", () => {
  const r = analizarPrecioDeLinea({
    linea: RENGLON_SIN_PESO,
    producto: POR_KILO,
    proveedor: null,
  });
  assert.equal(r.faltanKilos, true);
  assert.equal(r.precioFinal, null, "propuso un precio sin saber los kilos");
  assert.equal(r.precioAEscribir, null);
  // Sin precio no hay decisión que ofrecer: nadie puede aceptar un número que
  // no existe.
  assert.equal(r.decision, null);
  assert.equal(r.clasificacion, null);
});

test("Y CON LOS KILOS, EL ANÁLISIS SIGUE ANDANDO COMO ANTES", () => {
  const r = analizarPrecioDeLinea({
    linea: RENGLON_CON_PESO,
    producto: POR_KILO,
    proveedor: null,
  });
  assert.equal(r.faltanKilos, false);
  assert.equal(r.porKilo, true);
  assert.ok(Number.isFinite(r.precioFinal));
  assert.ok(r.decision, "se perdió la decisión de precio");
});

// ── Y LA OTRA MITAD: EL CONTROL DE LECTURA NO CAMBIÓ ──────────────────────

test("EL CONTROL DE LECTURA SIGUE AL PAPEL Y NO MIRA NINGÚN PRODUCTO", () => {
  // El danbo se COBRA por kilo. Si la verificación usara la unidad del
  // producto, el mismo renglón daría "incoherente" cuando el producto es de
  // pieza — sobre un papel perfectamente leído.
  const { ok, incoherentes } = verificarCoherenciaDeLineas([RENGLON_CON_PESO]);
  assert.equal(ok, true, "un renglón bien leído quedó señalado");
  assert.equal(incoherentes.length, 0);
  // Y el módulo entero de la puerta no conoce al producto: no puede mirarlo
  // aunque alguien quisiera. Se afirma sobre el fuente porque una firma con
  // default no se puede contar —`fn.length` no cuenta los parámetros con valor
  // por defecto— y lo que importa acá es que la dependencia no exista.
  const puerta = fs
    .readFileSync(path.join(RAIZ, "lib/compras-proveedor/comprobante/lector/puerta.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert.ok(!/seMideEnKilos|unidad_medida/.test(puerta), "la verificación de lectura empezó a mirar el producto");
});
