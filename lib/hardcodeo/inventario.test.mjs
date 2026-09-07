// CANDADO: EL TRINQUETE VE LAS ALTAS AUNQUE EL TOTAL BAJE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/hardcodeo/inventario.test.mjs
//
// ── EL DEFECTO QUE FIJA, CON SUS NÚMEROS ───────────────────────────────────
//
// El trinquete comparaba TOTALES por categoría. Entre el 2026-08-22 y el
// 2026-09-06 entraron 17 medidas mágicas nuevas y salieron 15 viejas, y lo único
// que el guardia informó fue "+2". Las 17 pasaron sin que nadie las viera,
// tapadas por deuda ajena que alguien había limpiado en otra pantalla.
//
// Eso es compensación cruzada, y convierte el trinquete en un permiso: basta con
// que otro limpie para poder ensuciar. Peor todavía, se puede dar sin que nadie
// lo busque —fue el caso—, así que no alcanza con pedir cuidado.
//
// ── LO QUE SE ELIGIÓ, Y QUÉ SE PAGA ────────────────────────────────────────
//
// Una ocurrencia es **archivo + categoría + texto**, con cantidad. NO entra el
// número de línea: con él, mover un bloque veinte líneas abajo convertiría cada
// ocurrencia vieja en una nueva, y un refactor produciría cientos de falsos
// positivos. El precio elegido a cambio: renombrar un archivo se ve como bajas
// en el nombre viejo y altas en el nuevo. Está dicho arriba de `contador.mjs`.

import test from "node:test";
import assert from "node:assert/strict";

import {
  inventarioDeHallazgos,
  altasContraBase,
  totalDeAltas,
  compararConLineaBase,
} from "@/lib/hardcodeo/contador.mjs";

/** Atajo para escribir hallazgos sin repetir la forma entera. */
const h = (archivo, categoria, que) => ({ archivo, categoria, que });

/** El total de una categoría, para poder afirmar sobre los totales VIEJOS. */
function totalPorCategoria(inv) {
  const t = {};
  for (const porCat of Object.values(inv)) {
    for (const [cat, porQue] of Object.entries(porCat)) {
      for (const n of Object.values(porQue)) t[cat] = (t[cat] ?? 0) + n;
    }
  }
  return t;
}

// ══════════════════════════════════════════════════════════════════════════
// EL INVENTARIO SE ARMA COMO SE DIJO
// ══════════════════════════════════════════════════════════════════════════

test("agrupa por archivo, categoría y texto, contando repeticiones", () => {
  const inv = inventarioDeHallazgos([
    h("a.jsx", "medida", "text-[11px]"),
    h("a.jsx", "medida", "text-[11px]"),
    h("a.jsx", "medida", "w-[44px]"),
    h("b.jsx", "medida", "text-[11px]"),
    h("a.jsx", "color", "bg-red-"),
  ]);

  assert.deepEqual(inv, {
    "a.jsx": { medida: { "text-[11px]": 2, "w-[44px]": 1 }, color: { "bg-red-": 1 } },
    "b.jsx": { medida: { "text-[11px]": 1 } },
  });
});

test("un hallazgo sin archivo o sin categoría no entra", () => {
  // Fallar acá sería peor que ignorarlo: una clave `undefined` en el inventario
  // se sella en el archivo y después nunca coincide con nada.
  const inv = inventarioDeHallazgos([{ que: "x" }, { archivo: "a.jsx", que: "y" }, null]);
  assert.deepEqual(inv, {});
});

// ══════════════════════════════════════════════════════════════════════════
// A · LOS SEIS CASOS DEL CONTRATO
// ══════════════════════════════════════════════════════════════════════════

test("A · BASE 10, SE QUITAN 5 Y ENTRAN 3 DISTINTAS: se ven las 3", () => {
  const base = inventarioDeHallazgos([
    ...Array.from({ length: 10 }, () => h("viejo.jsx", "medida", "text-[9px]")),
  ]);
  const actual = inventarioDeHallazgos([
    ...Array.from({ length: 5 }, () => h("viejo.jsx", "medida", "text-[9px]")),
    h("nuevo.jsx", "medida", "w-[44px]"),
    h("nuevo.jsx", "medida", "h-[51.5px]"),
    h("otro.jsx", "medida", "text-[13px]"),
  ]);

  // El total BAJA de 10 a 8: con el modelo viejo esto era verde.
  assert.equal(totalPorCategoria(base).medida, 10);
  assert.equal(totalPorCategoria(actual).medida, 8);
  assert.equal(compararConLineaBase({ medida: 10 }, { medida: 8 }).estado, "bajo");

  // Y con el inventario son tres altas, cada una con su archivo y su texto.
  const altas = altasContraBase(base, actual);
  assert.equal(altas.length, 3);
  assert.equal(totalDeAltas(altas), 3);
  assert.deepEqual(
    altas.map((a) => `${a.archivo} ${a.que}`).sort(),
    ["nuevo.jsx h-[51.5px]", "nuevo.jsx w-[44px]", "otro.jsx text-[13px]"]
  );
});

test("B · eliminar deuda existente está permitido", () => {
  const base = inventarioDeHallazgos([
    h("a.jsx", "medida", "text-[9px]"),
    h("a.jsx", "medida", "text-[9px]"),
    h("b.jsx", "color", "bg-red-"),
  ]);
  const actual = inventarioDeHallazgos([h("a.jsx", "medida", "text-[9px]")]);

  assert.deepEqual(altasContraBase(base, actual), []);
});

test("C · conservar la deuda sin aumentarla queda verde", () => {
  const misma = [h("a.jsx", "medida", "text-[9px]"), h("b.jsx", "color", "bg-red-")];
  assert.deepEqual(
    altasContraBase(inventarioDeHallazgos(misma), inventarioDeHallazgos(misma)),
    []
  );
});

test("D · LA MISMA VIOLACIÓN EN OTRO ARCHIVO ES NUEVA", () => {
  // Copiar y pegar una pantalla entera duplicaría su deuda sin que el total de
  // la categoría lo distinga de "estaba ahí desde antes".
  const base = inventarioDeHallazgos([h("a.jsx", "medida", "w-[44px]")]);
  const actual = inventarioDeHallazgos([
    h("a.jsx", "medida", "w-[44px]"),
    h("b.jsx", "medida", "w-[44px]"),
  ]);

  const altas = altasContraBase(base, actual);
  assert.equal(altas.length, 1);
  assert.equal(altas[0].archivo, "b.jsx");
  assert.equal(altas[0].antes, 0);
  assert.equal(altas[0].ahora, 1);
});

test("D bis · repetir la misma violación en el MISMO archivo también es nueva", () => {
  const base = inventarioDeHallazgos([h("a.jsx", "medida", "w-[44px]")]);
  const actual = inventarioDeHallazgos([
    h("a.jsx", "medida", "w-[44px]"),
    h("a.jsx", "medida", "w-[44px]"),
  ]);

  const [alta] = altasContraBase(base, actual);
  assert.deepEqual(
    { archivo: alta.archivo, antes: alta.antes, ahora: alta.ahora, delta: alta.delta },
    { archivo: "a.jsx", antes: 1, ahora: 2, delta: 1 }
  );
});

test("E · MOVER CÓDIGO NO INVENTA VIOLACIONES", () => {
  // Es la razón por la que la clave no lleva número de línea. Los hallazgos
  // traen línea —la ficha la necesita para ser accionable— y el inventario la
  // ignora a propósito.
  const base = inventarioDeHallazgos([
    { archivo: "a.jsx", linea: 10, categoria: "medida", que: "text-[9px]" },
    { archivo: "a.jsx", linea: 12, categoria: "medida", que: "text-[9px]" },
  ]);
  const actual = inventarioDeHallazgos([
    { archivo: "a.jsx", linea: 480, categoria: "medida", que: "text-[9px]" },
    { archivo: "a.jsx", linea: 902, categoria: "medida", que: "text-[9px]" },
  ]);

  assert.deepEqual(altasContraBase(base, actual), []);
});

// ══════════════════════════════════════════════════════════════════════════
// F · CONTRAPRUEBA: EL MODELO VIEJO NO VE EL CASO A
// ══════════════════════════════════════════════════════════════════════════

test("F · comparando SOLO totales, el caso A pasa desapercibido", () => {
  // Esta es la prueba de que el cambio hacía falta, y no una opinión. Se ejerce
  // el comparador viejo —que sigue existiendo y sigue sirviendo para el resumen—
  // sobre exactamente los números del caso A, y contesta "bajó".
  const veredictoViejo = compararConLineaBase({ medida: 10 }, { medida: 8 });
  assert.equal(veredictoViejo.estado, "bajo");
  assert.equal(veredictoViejo.subieron.length, 0, "el modelo viejo no ve ningún aumento");

  // O sea: con el guardia anterior, meter tres violaciones nuevas mientras otro
  // limpiaba cinco daba VERDE, y encima felicitaba por el terreno ganado.
});

test("y un alta con el total EXACTAMENTE igual tampoco se veía", () => {
  const base = inventarioDeHallazgos([h("a.jsx", "medida", "text-[9px]")]);
  const actual = inventarioDeHallazgos([h("b.jsx", "medida", "text-[13px]")]);

  assert.equal(compararConLineaBase({ medida: 1 }, { medida: 1 }).estado, "sin-cambio");
  assert.equal(altasContraBase(base, actual).length, 1);
});

// ══════════════════════════════════════════════════════════════════════════
// EL ORDEN DEL INFORME ES ESTABLE
// ══════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════
// B · REEXPRESAR LA BASE NO PERDONA DEUDA POSTERIOR
// ══════════════════════════════════════════════════════════════════════════
//
// Cuando el contador aprende que algo era un falso positivo, la base histórica
// se REEXPRESA: se vuelve a medir el mismo árbol de entonces con la regla
// corregida, y algunas claves desaparecen. Pasó dos veces —`sunmi-pos-*` y
// `var(--pos-*)` primero, la prosa de los comentarios JSX después—.
//
// El riesgo de esa operación es exactamente uno: que al bajar la base, algo que
// entró DESPUÉS quede tapado. Acá se prueba que no puede pasar, porque las
// claves son independientes entre sí: sacar una no toca a las demás.

test("B · SACAR UN FALSO POSITIVO HISTÓRICO NO ESCONDE UNA VIOLACIÓN NUEVA", () => {
  // La base vieja contaba de más una clave —prosa adentro de un comentario— y
  // además tenía deuda real. Después de la reexpresión, la falsa se va.
  const baseVieja = {
    "viejo.jsx": { medida: { "max-h-[65vh]": 1, "text-[9px]": 3 } },
  };
  const baseReexpresada = {
    "viejo.jsx": { medida: { "text-[9px]": 3 } },
  };

  // El árbol de hoy: la prosa sigue estando pero ya no se cuenta, la deuda real
  // sigue igual, y alguien agregó una violación nueva en otro archivo.
  const hoy = {
    "viejo.jsx": { medida: { "text-[9px]": 3 } },
    "nuevo.jsx": { medida: { "w-[202px]": 1 } },
  };

  const conBaseVieja = altasContraBase(baseVieja, hoy);
  const conBaseNueva = altasContraBase(baseReexpresada, hoy);

  // La violación nueva se ve con las dos bases: la reexpresión no la perdonó.
  for (const [nombre, altas] of [["vieja", conBaseVieja], ["reexpresada", conBaseNueva]]) {
    assert.equal(altas.length, 1, `con la base ${nombre} tendría que verse una sola alta`);
    assert.equal(altas[0].archivo, "nuevo.jsx", `con la base ${nombre}`);
    assert.equal(altas[0].que, "w-[202px]", `con la base ${nombre}`);
  }

  // Y bajar la base no inventa altas donde no las hay: la clave que se fue no
  // reaparece como deuda nueva, porque hoy tampoco se cuenta.
  assert.equal(
    conBaseNueva.some((a) => a.que === "max-h-[65vh]"),
    false,
    "la clave reexpresada volvió como alta"
  );
});

test("y si la ocurrencia falsa SIGUIERA contándose, ahí sí sería un alta", () => {
  // El control de la de arriba. Si el contador no hubiera aprendido a ignorar la
  // prosa, sacarla de la base la convertiría en deuda nueva — que es justamente
  // el error que habría que evitar, y por eso la base se reexpresa SÓLO junto
  // con la corrección del contador, nunca antes ni después.
  const baseReexpresada = { "viejo.jsx": { medida: { "text-[9px]": 3 } } };
  const hoySinCorregir = { "viejo.jsx": { medida: { "max-h-[65vh]": 1, "text-[9px]": 3 } } };

  const altas = altasContraBase(baseReexpresada, hoySinCorregir);
  assert.equal(altas.length, 1);
  assert.equal(altas[0].que, "max-h-[65vh]");
});

test("dos corridas sobre los mismos datos informan lo mismo, en el mismo orden", () => {
  // Sin esto el informe no se puede comparar consigo mismo, y una diferencia de
  // orden se lee como una diferencia de contenido.
  const base = {};
  const actual = inventarioDeHallazgos([
    h("z.jsx", "medida", "w-[44px]"),
    h("a.jsx", "color", "bg-red-"),
    h("m.jsx", "medida", "text-[9px]"),
  ]);

  const uno = altasContraBase(base, actual).map((a) => `${a.categoria}|${a.archivo}|${a.que}`);
  const dos = altasContraBase(base, actual).map((a) => `${a.categoria}|${a.archivo}|${a.que}`);
  assert.deepEqual(uno, dos);
  // Los colores van antes que las medidas: es el orden de PRIORIDAD, no el
  // alfabético del archivo.
  assert.equal(uno[0], "color|a.jsx|bg-red-");
});
