// UNA VENTA OFFLINE NO SE DA POR GUARDADA SI NO QUEDÓ EN LA COLA.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pos-ventas/helpers/offlineQueue.test.mjs
//
// El cajero ya recibió el efectivo cuando la pantalla encola la venta. Antes,
// `enqueue` ignoraba que `saveQueue` hubiera fallado —almacenamiento lleno,
// bloqueado, ventana privada— y la pantalla imprimía el ticket, vaciaba el
// carrito y decía "Venta guardada offline" de una venta que no existía en
// ningún lado.
//
// Arriba se ejerce el `enqueue` REAL contra un almacenamiento en memoria que
// puede rechazar escrituras, como lo hace el navegador (`setItem` tira). Abajo,
// que la pantalla no haga nada irreversible antes de saber que quedó guardada.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { enqueue, loadQueue, ERROR_VENTA_OFFLINE_NO_GUARDADA } from "./offlineQueue.js";

const CLAVE = "posVentasOfflineQueue_v1";

function almacenamiento({ rechaza = () => false } = {}) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (rechaza(k, v)) {
        const e = new Error("The quota has been exceeded.");
        e.name = "QuotaExceededError";
        throw e;
      }
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}

const venta = (id) => ({ clientVentaId: id, localId: 1, turnoId: 10, total: 100, items: [{ productoBaseId: 1, cantidad: 1, precio: 100 }] });

let errorDeConsola;
beforeEach(() => {
  // `saveQueue` deja el error en la consola; acá no ensucia la salida.
  errorDeConsola = console.error;
  console.error = () => {};
  return () => { console.error = errorDeConsola; };
});

test("se guarda: ok, la venta está en la cola y se informa el largo", () => {
  globalThis.localStorage = almacenamiento();
  assert.deepEqual(enqueue(venta("a")), { ok: true, length: 1 });
  assert.deepEqual(enqueue(venta("b")), { ok: true, length: 2 });
  assert.deepEqual(loadQueue().map((v) => v.clientVentaId), ["a", "b"]);
});

test("el almacenamiento rechaza: NO ok, y lo que ya estaba en la cola sigue intacto", () => {
  globalThis.localStorage = almacenamiento();
  enqueue(venta("a"));
  const antes = globalThis.localStorage.getItem(CLAVE);
  globalThis.localStorage = Object.assign(almacenamiento({ rechaza: () => true }), {});
  // Mismo contenido previo, ahora con un almacenamiento que no acepta escribir.
  globalThis.localStorage._m.set(CLAVE, antes);
  const r = enqueue(venta("b"));
  assert.deepEqual(r, { ok: false });
  assert.equal(globalThis.localStorage.getItem(CLAVE), antes, "la cola anterior no se tocó");
  assert.deepEqual(loadQueue().map((v) => v.clientVentaId), ["a"]);
});

test("setItem no tira pero no guarda: tampoco se da por guardada", () => {
  // Un almacenamiento que acepta en silencio y no persiste (o persiste otra cosa).
  const s = almacenamiento();
  s.setItem = () => {};
  globalThis.localStorage = s;
  assert.deepEqual(enqueue(venta("a")), { ok: false });
});

test("sin localStorage disponible: NO ok, sin excepción hacia la pantalla", () => {
  delete globalThis.localStorage;
  assert.deepEqual(enqueue(venta("a")), { ok: false });
});

test("el mensaje dice que NO está registrada y que el carrito sigue", () => {
  assert.match(ERROR_VENTA_OFFLINE_NO_GUARDADA, /NO se pudo guardar/);
  assert.match(ERROR_VENTA_OFFLINE_NO_GUARDADA, /NO está registrada/);
  assert.match(ERROR_VENTA_OFFLINE_NO_GUARDADA, /carrito sigue/);
});

// ── La pantalla, leída SIN comentarios ──────────────────────────────────────
const pantalla = readFileSync("app/modulos/pos-ventas/page.jsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

function cuerpoDe(nombre) {
  const inicio = pantalla.indexOf(`const ${nombre} = `);
  assert.ok(inicio >= 0, `no está ${nombre}`);
  const fin = pantalla.indexOf("\n  const ", inicio + 1);
  return pantalla.slice(inicio, fin < 0 ? undefined : fin);
}

test("guardarVentaPendiente: nada irreversible antes de confirmar que quedó en la cola", () => {
  const cuerpo = cuerpoDe("guardarVentaPendiente");
  const encolar = cuerpo.indexOf("const encolada = enqueue(ventaPendiente)");
  assert.ok(encolar > 0, "la pantalla tiene que mirar el resultado de enqueue");
  const corte = cuerpo.indexOf("if (!encolada.ok)", encolar);
  assert.ok(corte > encolar, "sin cortar ante un fallo");
  const rama = cuerpo.slice(corte, cuerpo.indexOf("}", corte) + 1);
  assert.match(rama, /ERROR_VENTA_OFFLINE_NO_GUARDADA/);
  assert.match(rama, /return;/);
  assert.doesNotMatch(rama, /CLEAR_CART|posUltimoTicket_v1|showSuccess|setUltimoTicketOffline/);

  const antes = cuerpo.slice(0, encolar);
  for (const irreversible of ["CLEAR_CART", "posUltimoTicket_v1", "setUltimoTicketOffline", "showSuccess", "Venta guardada offline"]) {
    assert.ok(!antes.includes(irreversible), `${irreversible} pasa ANTES de confirmar el guardado`);
    assert.ok(cuerpo.indexOf(irreversible, corte) > corte, `${irreversible} tiene que pasar después de confirmar`);
  }
});

test("guardarVentaPendiente: la copia del ticket no puede abortar una venta ya guardada", () => {
  const cuerpo = cuerpoDe("guardarVentaPendiente");
  const copia = cuerpo.indexOf('localStorage.setItem("posUltimoTicket_v1"');
  assert.ok(copia > 0);
  const previo = cuerpo.slice(0, copia);
  assert.ok(previo.lastIndexOf("try {") > previo.lastIndexOf("}"), "el setItem del ticket va dentro de un try");
});
