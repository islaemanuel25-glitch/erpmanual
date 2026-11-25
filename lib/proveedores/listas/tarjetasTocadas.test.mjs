// Candados de `tarjetasTocadas.js`: después de tocar una tarjeta, la pantalla
// trae esa tarjeta sola y la une con las que ya tenía.
//
// La prueba fuerte es contra Postgres —`scripts/pruebas-db/listasRendimiento.mjs`
// compara la unión contra releer la lista entera, con la misma lista—. Estos
// fijan las reglas de la unión, con la forma que manda `resultado`: las
// tarjetas se identifican por `productoBaseId`, que es el campo que la ruta
// manda siempre (`tusProductosDeLaLista`).

import { test } from "node:test";
import assert from "node:assert/strict";

import { conLasTarjetasTocadas, productosPedidos, soloLasPedidas } from "./tarjetasTocadas.js";

const tarjeta = (productoBaseId, estado = "CAMBIA") => ({ productoBaseId, nombre: `P${productoBaseId}`, estado });
const cabecera = { estado: "CONCILIADA", rango: { minPct: 0, maxPct: 15 }, costos: { puedeCambiar: true, ubicacion: null }, proveedor: { id: 1, nombre: "Arcor" } };

const previo = {
  ok: true,
  cabecera,
  conteo: { listos: 2 },
  tusProductos: { items: [tarjeta(1), tarjeta(2), tarjeta(3)], conteo: { total: 3 } },
  puedenSer: { porConfirmar: [], confirmados: [tarjeta(9)], conteo: { porConfirmar: 0, confirmados: 1 } },
};

/** Lo que manda la ruta con `?productos=`, armado con su misma función. */
function parcialDe(itemsDespues, confirmadosDespues, pedidos, extra = {}) {
  const t = soloLasPedidas(itemsDespues, pedidos);
  const c = soloLasPedidas(confirmadosDespues, pedidos);
  return {
    ok: true,
    cabecera,
    conteo: { listos: 1 },
    tusProductos: { ...t, conteo: { total: itemsDespues.length } },
    puedenSer: { porConfirmar: [], confirmados: c.items, ordenConfirmados: c.orden, conteo: { porConfirmar: 0, confirmados: confirmadosDespues.length } },
    ...extra,
  };
}

test("la tarjeta tocada reemplaza a la suya, en su lugar, y lo demás viene de la respuesta", () => {
  const despues = [tarjeta(1), tarjeta(2, "NO_LO_CAMBIO"), tarjeta(3)];
  const unido = conLasTarjetasTocadas(previo, parcialDe(despues, [tarjeta(9)], new Set([2])));
  assert.deepEqual(unido.tusProductos.items, despues);
  assert.deepEqual(unido.tusProductos.conteo, { total: 3 });
  assert.deepEqual(unido.conteo, { listos: 1 }, "los contadores son los de la respuesta, no los de antes");
  assert.equal(unido.tusProductos.orden, undefined, "el orden no queda en los datos de la pantalla");
  assert.equal(unido.puedenSer.ordenConfirmados, undefined);
  // Las que no se tocaron son las MISMAS: no se vuelven a dibujar por gusto.
  assert.equal(unido.tusProductos.items[0], previo.tusProductos.items[0]);
});

test("una tarjeta que pasa de un paquete al otro sale de uno y entra en el otro, en el orden de la base", () => {
  const unido = conLasTarjetasTocadas(previo, parcialDe([tarjeta(1), tarjeta(3)], [tarjeta(2), tarjeta(9)], new Set([2])));
  assert.deepEqual(unido.tusProductos.items.map((t) => t.productoBaseId), [1, 3]);
  assert.deepEqual(unido.puedenSer.confirmados.map((t) => t.productoBaseId), [2, 9]);
});

test("si el orden nombra una tarjeta que ni estaba ni llegó, no se adivina: null y se relee entera", () => {
  const parcial = parcialDe([tarjeta(1), tarjeta(2), tarjeta(3), tarjeta(4)], [tarjeta(9)], new Set([2]));
  assert.equal(conLasTarjetasTocadas(previo, parcial), null);
});

test("si cambió algo que dibuja todas las tarjetas, null y se relee entera", () => {
  const items = [tarjeta(1), tarjeta(2), tarjeta(3)];
  for (const cambio of [
    { estado: "PARCIALMENTE_APLICADA" },
    { rango: { minPct: 0, maxPct: 20 } },
    { costos: { puedeCambiar: false, ubicacion: { localId: 7, nombre: "Depo", esDeposito: true } } },
    { proveedor: { id: 1, nombre: "Arcor SA" } },
  ]) {
    const parcial = parcialDe(items, [tarjeta(9)], new Set([2]), { cabecera: { ...cabecera, ...cambio } });
    assert.equal(conLasTarjetasTocadas(previo, parcial), null, JSON.stringify(cambio));
  }
});

test("una respuesta entera —sin el orden— no se une: es la de siempre", () => {
  assert.equal(conLasTarjetasTocadas(previo, previo), null);
  assert.equal(conLasTarjetasTocadas(null, parcialDe([], [], new Set([1]))), null);
});

test("productosPedidos: ids enteros y positivos, o null si no pide ninguno", () => {
  assert.deepEqual([...productosPedidos("12,7,,x,-3,7")], [12, 7]);
  assert.equal(productosPedidos(null), null);
  assert.equal(productosPedidos(""), null);
  assert.equal(productosPedidos("x"), null);
});
