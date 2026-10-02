// CANDADO: QUÉ VENTAS ENTRAN EN FINANZAS.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/finanzas/ventasQueEntran.test.mjs
//
// Tres casos, y los tres son de plata:
//
//   · una venta ANULADA no entra. Se marca y no se borra, así que sigue
//     apareciendo en toda consulta que no la excluya a propósito;
//   · una venta con REMITO no entra. Cuando el POS del depósito le vende a un
//     local propio se crea una Venta + una Transferencia, y eso no es una venta:
//     es un movimiento interno entre dos cajas del mismo grupo. Sin filtrarla,
//     el depósito aparecería facturando la mercadería que se manda a sí mismo;
//   · una venta COMERCIAL normal sí entra.
//
// ── LO QUE ESTE ARCHIVO PUEDE Y NO PUEDE AFIRMAR ─────────────────────────
//
// No puede correr Prisma: los candados son funciones puras y no tocan la base.
// Lo que hace son dos cosas distintas y las dos hacen falta:
//
//   1. EJERCE EL SIGNIFICADO del filtro, evaluando las condiciones que
//      `whereVentaComercial` produce contra filas con la forma real. La
//      evaluación está escrita acá —`pasaElFiltro`— y es una SIMULACIÓN de lo
//      que hace Postgres con esas dos condiciones; no reemplaza probar la
//      consulta contra la base, que queda pendiente y está anotado.
//   2. AFIRMA LA ESTRUCTURA: que TODA consulta a `Venta` de las rutas de
//      Finanzas pase por el helper. Esto no lo puede dar la simulación, y es lo
//      que evita que mañana alguien agregue una consulta sin filtro.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  evaluarVentaComercial,
  whereVentaComercial,
} from "@/lib/ventas/filtroVentaComercial";

const sinComentarios = (ruta) =>
  readFileSync(ruta, "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const RUTAS = [
  "app/api/finanzas/tablero/route.js",
  "app/api/finanzas/turno/[turnoId]/route.js",
];

// ── LAS TRES FILAS, CON LA FORMA QUE TIENE LA TABLA ──────────────────────
//
// `anuladaEn` y `transferencia` son las dos columnas que el filtro mira.
// `transferencia` es la relación inversa: `null` cuando no hay remito y un
// objeto cuando lo hay. Escribirlo como booleano sería la forma que la base
// nunca devuelve.
const COMERCIAL = {
  id: 1,
  total: "1000.00",
  costoTotal: "600.00",
  anuladaEn: null,
  transferencia: null,
};
const ANULADA = {
  id: 2,
  total: "5000.00",
  costoTotal: "3000.00",
  anuladaEn: new Date("2026-09-12T18:00:00Z"),
  transferencia: null,
};
const INTERNA = {
  id: 3,
  total: "80000.00",
  costoTotal: "70000.00",
  anuladaEn: null,
  transferencia: { id: 211 },
};

/**
 * Evalúa en JS las dos condiciones que este filtro produce.
 *
 * SOLO entiende las dos que `whereVentaComercial` agrega —`anuladaEn: null` y
 * `transferencia: { is: null }`— y cualquier otra la ignora: no es un motor de
 * Prisma, es el ejercicio de una regla concreta. Si el helper empezara a agregar
 * una tercera condición, el candado de abajo que cuenta las claves se pone rojo.
 */
function pasaElFiltro(where, fila) {
  if (Object.prototype.hasOwnProperty.call(where, "anuladaEn")) {
    if (where.anuladaEn === null && fila.anuladaEn !== null) return false;
  }
  if (Object.prototype.hasOwnProperty.call(where, "transferencia")) {
    const cond = where.transferencia;
    if (cond && cond.is === null && fila.transferencia !== null) return false;
    if (cond && cond.isNot === null && fila.transferencia === null) return false;
  }
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// 1, 2 y 3 · QUIÉN ENTRA
// ══════════════════════════════════════════════════════════════════════════

test("V1 · UNA VENTA ANULADA NO ENTRA", () => {
  const where = whereVentaComercial({ localId: 4, fecha: { gte: new Date(), lte: new Date() } });
  assert.equal(pasaElFiltro(where, ANULADA), false);
  // Y el predicado en memoria, que es la otra puerta del mismo hecho, coincide.
  assert.deepEqual(evaluarVentaComercial(ANULADA), { esComercial: false, resoluble: true });
});

test("V2 · UNA VENTA CON REMITO —interna— NO ENTRA", () => {
  const where = whereVentaComercial({ localId: 1 });
  assert.equal(pasaElFiltro(where, INTERNA), false);
  assert.deepEqual(evaluarVentaComercial(INTERNA), { esComercial: false, resoluble: true });
});

test("V3 · UNA VENTA COMERCIAL NORMAL SÍ ENTRA", () => {
  const where = whereVentaComercial({ localId: 4 });
  assert.equal(pasaElFiltro(where, COMERCIAL), true);
  assert.deepEqual(evaluarVentaComercial(COMERCIAL), { esComercial: true, resoluble: true });
});

test("V4 · CONTRAPRUEBA: sin el helper, las TRES entran", () => {
  // Es lo único que distingue un candado que afirma de uno que acompaña. Con el
  // `where` crudo —el que alguien escribiría si se olvidara del helper— la
  // anulada y la interna pasan, y el depósito facturaría $80.000 que nunca
  // vendió más $5.000 que se decidió que no entraron.
  const crudo = { localId: 4 };
  for (const fila of [COMERCIAL, ANULADA, INTERNA]) {
    assert.equal(pasaElFiltro(crudo, fila), true, `la fila ${fila.id} ya se filtraba sin el helper`);
  }

  // Y con el helper, solo una.
  const conFiltro = whereVentaComercial(crudo);
  const entran = [COMERCIAL, ANULADA, INTERNA].filter((f) => pasaElFiltro(conFiltro, f));
  assert.deepEqual(entran.map((f) => f.id), [1]);
});

test("V5 · el helper agrega EXACTAMENTE las dos condiciones que se simulan", () => {
  // Si mañana agregara una tercera, `pasaElFiltro` la ignoraría y los candados
  // de arriba seguirían verdes sin cubrirla. Acá se afirma el contrato.
  const base = { localId: 4, fecha: { gte: 1, lte: 2 } };
  const where = whereVentaComercial(base);
  const agregadas = Object.keys(where).filter((k) => !Object.keys(base).includes(k));
  assert.deepEqual(agregadas.sort(), ["anuladaEn", "transferencia"]);
  assert.equal(where.anuladaEn, null);
  assert.deepEqual(where.transferencia, { is: null });
  // Y no pisa lo que le dieron.
  assert.equal(where.localId, 4);
  assert.deepEqual(where.fecha, { gte: 1, lte: 2 });
});

// ══════════════════════════════════════════════════════════════════════════
// LA ESTRUCTURA: NINGUNA CONSULTA A `Venta` SE ESCAPA
// ══════════════════════════════════════════════════════════════════════════

test("V6 · TODA consulta a `Venta` de Finanzas pasa por `whereVentaComercial`", () => {
  // La simulación de arriba prueba la regla; esto prueba que se aplique en cada
  // lugar. Es el candado que evita que una consulta nueva nazca sin filtro: no
  // fallaría nada, simplemente contaría de más.
  for (const ruta of RUTAS) {
    const codigo = sinComentarios(ruta);
    const consultas = [...codigo.matchAll(/prisma\.venta\.(\w+)\(\{([\s\S]*?)\n\s*\}\)/g)];
    assert.ok(consultas.length > 0, `${ruta} no consulta ventas: ¿se movió la consulta?`);

    for (const [, metodo, cuerpo] of consultas) {
      assert.match(
        cuerpo,
        /where:\s*whereVentaComercial\(/,
        `${ruta}: prisma.venta.${metodo} consulta sin el filtro comercial`
      );
    }
  }
});

test("V7 · y ninguna usa Auditoría POS como fuente", () => {
  // Aquélla es la vista TÉCNICA y a propósito NO filtra internas ni anuladas,
  // porque un auditor tiene que verlas. Tomar sus números para Finanzas sería
  // traerse justo lo que hay que excluir.
  for (const ruta of RUTAS) {
    assert.doesNotMatch(
      sinComentarios(ruta),
      /auditoria-pos-ventas|auditoriaPos/i,
      `${ruta} toma datos de la vista técnica`
    );
  }
});

test("V8 · el corte es por `Venta.fecha`, no por `createdAt`", () => {
  // Es la fecha con la que el reporte de ventas ya corta. Usar `createdAt`
  // pondría una venta corregida en el período de la corrección.
  const tablero = sinComentarios("app/api/finanzas/tablero/route.js");
  // La consulta de ventas del período: hoy vive dentro del `Promise.all` que la
  // corre en paralelo con el total de gastos, así que se la ubica por la llamada
  // misma —`prisma.venta.findMany({ ... select: SELECT_VENTA })`— y no por la
  // forma de su asignación.
  const consulta = tablero.match(/prisma\.venta\.findMany\(\{[\s\S]*?select:\s*SELECT_VENTA,\s*\}\)/);
  assert.ok(consulta, "no se encontró la consulta de ventas del período");
  assert.match(consulta[0], /fecha:\s*\{\s*gte:\s*fechaInicio,\s*lte:\s*fechaFin\s*\}/);
  assert.doesNotMatch(consulta[0], /createdAt/);
});

test("V9 · y el rango de fechas sale de `getRangoArgentina`", () => {
  // `new Date("2026-09-13")` es medianoche UTC, que en Argentina es el día
  // anterior a las 21: usarlo como piso dejaría afuera las ventas de la noche
  // del primer día del período, todas las semanas.
  const tablero = sinComentarios("app/api/finanzas/tablero/route.js");
  assert.match(tablero, /getRangoArgentina\(rango\.desde, rango\.hasta\)/);
});
