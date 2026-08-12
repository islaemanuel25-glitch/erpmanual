// EL PIE SIGUE A LAS COLUMNAS, NO A UN NÚMERO ESCRITO A MANO.
//
// Las tres formas de acá son las tres filas de totales que existen hoy en el
// repo, con la cantidad de columnas y de números que tienen de verdad. Si el pie
// no sirve para las tres tal como están, el pie está mal.

import test from "node:test";
import assert from "node:assert/strict";

import { celdasDelPie } from "@/lib/sunmi/pieDeTabla";

const col = (clave, align) => ({ clave, align });

// compras-proveedor/[id]: un solo número, y una columna de acciones vacía atrás.
const COMPRAS = [col("producto"), col("unidad"), col("cantidad", "der"), col("costo", "der"),
                 col("subtotal", "der"), col("total", "der"), col("acciones")];
// EditorVentaCorreccion: tres números y una columna de acciones vacía atrás.
const EDITOR = [col("producto"), col("cant", "der"), col("precio", "der"), col("desc", "der"),
                col("sub", "der"), col("original", "der"), col("total", "der"), col("dif", "der"), col("acciones")];
// auditoria-pos-ventas/turnos/[id]: cinco números y nada atrás.
const TURNO = [col("hora"), col("ticket"), col("cliente"), col("total", "der"), col("comision", "der"),
               col("neto", "der"), col("costo", "der"), col("ganancia", "der")];

test("UN número: la etiqueta abarca todo lo de antes y atrás queda la vacía", () => {
  const p = celdasDelPie(COMPRAS, { total: "$134400.00" });
  assert.equal(p.span, 5);
  assert.deepEqual(p.celdas.map((c) => c.clave), ["total", "acciones"]);
  assert.equal(p.celdas[1].valor, null, "la de acciones va vacía, como se dibuja hoy");
});

test("TRES números seguidos, con la vacía atrás", () => {
  const p = celdasDelPie(EDITOR, { original: "$1000", total: "$1200", dif: "+$200" });
  assert.equal(p.span, 5);
  assert.deepEqual(p.celdas.map((c) => c.clave), ["original", "total", "dif", "acciones"]);
  assert.deepEqual(p.celdas.map((c) => c.valor), ["$1000", "$1200", "+$200", null]);
});

test("CINCO números y nada atrás", () => {
  const p = celdasDelPie(TURNO, { total: "1", comision: "2", neto: "3", costo: "4", ganancia: "5" });
  assert.equal(p.span, 3);
  assert.equal(p.celdas.length, 5);
});

// ── LO QUE ESTO VINO A ARREGLAR ────────────────────────────────────────────

test("AGREGAR UNA COLUMNA CONDICIONAL NO CORRE EL PIE", () => {
  // Es el defecto que se está sacando: hoy ese span se calcula a mano sumando
  // condiciones —`(esRecepcion ? 1 : 0) + (esRecepcion && tieneFiambre ? 1 : 0)`—
  // y nada avisa cuando deja de seguir a las columnas. Acá el pie las sigue solo.
  const conRecepcion = [...COMPRAS.slice(0, 5), col("recibido", "der"), col("kg", "der"), ...COMPRAS.slice(5)];
  const p = celdasDelPie(conRecepcion, { total: "$134400.00" });
  assert.equal(p.span, 7, "la etiqueta se estiró sola por las dos columnas nuevas");
  assert.deepEqual(p.celdas.map((c) => c.clave), ["total", "acciones"]);
});

test("SACAR una columna tampoco lo corre", () => {
  const sinAcciones = COMPRAS.slice(0, 6);
  const p = celdasDelPie(sinAcciones, { total: "$1" });
  assert.equal(p.span, 5);
  assert.deepEqual(p.celdas.map((c) => c.clave), ["total"]);
});

test("cada celda del pie se alinea como SU columna, sin decirlo dos veces", () => {
  const p = celdasDelPie(TURNO, { total: "1", ganancia: "5" });
  assert.equal(p.celdas.find((c) => c.clave === "total").align, "der");
  assert.equal(p.celdas.find((c) => c.clave === "cliente"), undefined);
});

// ── LOS BORDES ─────────────────────────────────────────────────────────────

test("sin ningún número, la etiqueta abarca la tabla entera", () => {
  const p = celdasDelPie(COMPRAS, {});
  assert.equal(p.span, COMPRAS.length);
  assert.deepEqual(p.celdas, []);
});

test("UNA CLAVE QUE NO EXISTE se ignora y se informa, no explota", () => {
  // A propósito: esto corre dentro del render y una fila de totales mal escrita
  // no puede dejar una pantalla entera en blanco. El costo es que un error de
  // tipeo sale como un número que no aparece.
  const p = celdasDelPie(COMPRAS, { totl: "$1" });
  assert.deepEqual(p.desconocidas, ["totl"]);
  assert.equal(p.span, COMPRAS.length, "una clave que no existe no mueve la etiqueta");
});

test("una clave que existe y otra que no: la que existe manda", () => {
  const p = celdasDelPie(COMPRAS, { total: "$1", inventada: "x" });
  assert.equal(p.span, 5);
  assert.deepEqual(p.desconocidas, ["inventada"]);
});

test("sin columnas o sin valores no se rompe", () => {
  for (const [c, v] of [[null, null], [[], {}], [COMPRAS, null], [null, { total: 1 }]]) {
    const p = celdasDelPie(c, v);
    assert.ok(Array.isArray(p.celdas));
    assert.ok(Number.isInteger(p.span));
  }
});
