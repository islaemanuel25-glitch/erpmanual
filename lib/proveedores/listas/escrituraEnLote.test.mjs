// Candados de `escrituraEnLote.js`: las escrituras de aplicar una lista, en lote.
//
// Que el resultado sea IDÉNTICO al de escribir de a una —costos, auditoría en
// su orden y versiones del Libro de Costos— lo prueba contra Postgres
// `scripts/pruebas-db/listasRendimiento.mjs --comparar`. Estos fijan las reglas
// de la pieza sin base: las rondas, la lista cerrada de columnas y que una fila
// que falta tire error en vez de seguir.

import { test } from "node:test";
import assert from "node:assert/strict";

import { COLUMNAS_EN_LOTE, escribirEnLote, rondasDeEscritura } from "./escrituraEnLote.js";

test("las rondas: la k-ésima escritura de cada fila va en la ronda k, en el orden de llegada", () => {
  const rondas = rondasDeEscritura([
    { id: 1, data: { precio_costo: 10 } },
    { id: 2, data: { precio_costo: 20 } },
    { id: 1, data: { precio_costo: 11 } },
    { id: 3, data: { precio_costo: 30 } },
    { id: 1, data: { precio_costo: 12 } },
  ]);
  assert.deepEqual(
    rondas.map((r) => r.map((e) => `${e.id}:${e.data.precio_costo}`)),
    [["1:10", "2:20", "3:30"], ["1:11"], ["1:12"]]
  );
  assert.deepEqual(rondasDeEscritura([]), []);
});

/** Un `tx` que guarda cada sentencia y contesta cuántas filas tocó. */
function txQueCuenta(filasTocadas = null) {
  const sentencias = [];
  return {
    sentencias,
    $executeRaw: async (sql) => {
      sentencias.push(sql);
      // Cada fila del VALUES empieza con su id: `($n::integer, …`.
      return filasTocadas ?? (sql.text.match(/\(\$\d+::integer/g) ?? []).length;
    },
  };
}

test("una sentencia por ronda; cada fila escribe solo sus columnas, y updatedAt se pone a mano", async () => {
  const tx = txQueCuenta();
  await escribirEnLote(tx, "ProductoBase", [
    { id: 1, data: { precio_costo: 816 } },
    { id: 2, data: { precio_costo: 900.5, precio_venta: 1200 } },
    { id: 1, data: { precio_costo: 817 } },
  ], new Date("2026-11-25T21:00:00.000Z"));
  assert.equal(tx.sentencias.length, 2, "dos rondas, dos UPDATE");
  const [primera] = tx.sentencias;
  assert.match(primera.text, /^UPDATE "ProductoBase" AS t SET "precio_costo" = CASE WHEN v\."t_precio_costo" THEN v\."precio_costo" ELSE t\."precio_costo" END,\s*"precio_venta" = CASE/);
  assert.match(primera.text, /"updatedAt" = \$\d+::timestamp\(3\)/);
  // Los números viajan como texto, como un Decimal de Prisma; la marca dice si
  // la fila escribe esa columna.
  assert.ok(primera.values.includes("816"));
  assert.ok(primera.values.includes("900.5"));
  assert.ok(primera.values.includes("2026-11-25T21:00:00.000Z"));
  assert.ok(!tx.sentencias[1].text.includes("precio_venta"), "la segunda ronda no nombra una columna que nadie escribe");
});

test("una columna fuera de la lista no se escribe: tira error antes de tocar la base", async () => {
  const tx = txQueCuenta();
  await assert.rejects(() => escribirEnLote(tx, "ProductoLocal", [{ id: 1, data: { baseId: 9 } }]), /no se escribe en lote/);
  assert.equal(tx.sentencias.length, 0);
  // Ni a qué local o base pertenece un costo, ni el id.
  for (const modelo of ["ProductoBase", "ProductoLocal"]) {
    assert.ok(!Object.keys(COLUMNAS_EN_LOTE[modelo]).some((c) => /^(id|grupoId|baseId|localId)$/.test(c)), modelo);
  }
});

test("si una fila no existe, tira error —como `update`— y aplicar deshace la transacción", async () => {
  const tx = txQueCuenta(1);
  await assert.rejects(
    () => escribirEnLote(tx, "ImportacionListaFila", [{ id: 1, data: { aplicada: true } }, { id: 2, data: { aplicada: true } }]),
    /escribió 1 de 2 filas/
  );
});
