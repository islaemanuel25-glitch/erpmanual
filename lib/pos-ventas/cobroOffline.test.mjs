// EL COBRO OFFLINE QUE SE GUARDA: LISTA BLANCA, TOPES Y HASH CANÓNICO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/cobroOffline.test.mjs
//
// Se ejercen las funciones reales de lib/pos-ventas/cobroOffline.js. Que el
// endpoint y `crear` las usen con la base de verdad lo prueba
// scripts/pruebas-db/cobrosOffline.mjs, por los handlers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  sanearCobro,
  hashDePayload,
  horaDeDispositivo,
  totalDeclarado,
  CAMPOS_COBRO,
  CAMPOS_LINEA,
  LIMITES_REGISTRO,
} from "@/lib/pos-ventas/cobroOffline";
import { itemCrearPayload } from "@/lib/pos-ventas/payloadVenta";

const VOUCHER = "eyJhbGciOiJIUzI1NiJ9.voucher-firmado.firma";

/** Un ítem de la cola como lo arma `guardarVentaPendiente`. */
const cobro = (cambios = {}) => ({
  clientVentaId: "c0ffee00-0000-4000-8000-000000000001",
  createdAt: Date.UTC(2026, 9, 3, 12, 0, 0),
  localId: 5,
  grupoId: 2,
  userId: 9,
  formaPago: "efectivo",
  subtotal: 2500,
  descuento: 0,
  descuentoPorPuntos: 0,
  total: 2500,
  clienteId: null,
  operadorId: 7,
  operadorVoucher: VOUCHER,
  turnoId: 10,
  items: [itemCrearPayload({ productoBaseId: 3, nombre: "Yerba", precio: 2500, cantidad: 1 })],
  ...cambios,
});

test("los campos de la línea son exactamente los que arma itemCrearPayload", () => {
  assert.deepEqual([...CAMPOS_LINEA].sort(), Object.keys(itemCrearPayload({})).sort());
});

test("lista blanca: el voucher, un PIN, una cookie o un token no llegan al payload", () => {
  const conCredenciales = cobro({
    pin: "1234",
    cookie: "erpazul_operador_activo=xyz",
    token: "abc",
    sesion: { id: 1 },
    items: [{ ...itemCrearPayload({ productoBaseId: 3, nombre: "Yerba", precio: 2500, cantidad: 1 }), operadorVoucher: VOUCHER, pin: "1234" }],
  });
  const r = sanearCobro(conCredenciales);
  assert.equal(r.ok, true);
  const texto = JSON.stringify(r.payload);
  for (const prohibido of [VOUCHER, "operadorVoucher", "pin", "cookie", "token", "sesion", "grupoId"]) {
    assert.ok(!texto.includes(prohibido), `"${prohibido}" llegó al payload`);
  }
  assert.deepEqual(Object.keys(r.payload).sort(), [...CAMPOS_COBRO, "items"].sort());
  assert.deepEqual(Object.keys(r.payload.items[0]).sort(), [...CAMPOS_LINEA].sort());
});

test("se conserva lo declarado para investigar: turno, cuenta, operador, local, hora", () => {
  const { payload } = sanearCobro(cobro({ turnoId: 999, localId: 5 }));
  assert.equal(payload.turnoId, 999);
  assert.equal(payload.userId, 9);
  assert.equal(payload.operadorId, 7);
  assert.equal(payload.localId, 5);
  assert.equal(payload.createdAt, Date.UTC(2026, 9, 3, 12, 0, 0));
});

test("un objeto metido en un campo simple no se guarda; los textos se recortan", () => {
  const { payload } = sanearCobro(cobro({ clienteId: { colado: "x" }, formaPago: "efectivo" + "x".repeat(500) }));
  assert.equal(payload.clienteId, null);
  assert.equal(payload.formaPago.length, LIMITES_REGISTRO.largoTexto);
});

test("lo que no es un cobro se rechaza", () => {
  const casos = {
    "no es objeto": null,
    "arreglo": [],
    "sin id": cobro({ clientVentaId: undefined }),
    "id vacío": cobro({ clientVentaId: "  " }),
    "id demasiado largo": cobro({ clientVentaId: "x".repeat(LIMITES_REGISTRO.largoId + 1) }),
    "sin líneas": cobro({ items: [] }),
    "líneas que no son arreglo": cobro({ items: {} }),
    "una línea que no es objeto": cobro({ items: ["x"] }),
    "más de 500 líneas": cobro({ items: Array.from({ length: LIMITES_REGISTRO.lineasPorCobro + 1 }, () => ({ productoBaseId: 1 })) }),
    "total inválido": cobro({ total: "mucho" }),
    "total negativo": cobro({ total: -1 }),
    "sin forma de pago": cobro({ formaPago: "" }),
  };
  for (const [nombre, c] of Object.entries(casos)) {
    assert.equal(sanearCobro(c).ok, false, nombre);
  }
  assert.equal(sanearCobro(cobro({ items: Array.from({ length: LIMITES_REGISTRO.lineasPorCobro }, () => ({ productoBaseId: 1 })) })).ok, true, "500 líneas sí");
});

test("hash canónico: el mismo contenido con las claves en otro orden da el mismo hash", () => {
  const a = sanearCobro(cobro()).payload;
  const desordenado = Object.fromEntries(Object.entries(cobro()).reverse());
  desordenado.items = desordenado.items.map((l) => Object.fromEntries(Object.entries(l).reverse()));
  const b = sanearCobro(desordenado).payload;
  assert.equal(hashDePayload(a), hashDePayload(b));
  assert.match(hashDePayload(a), /^[0-9a-f]{64}$/);
});

test("el hash es del payload SANEADO: el voucher o un campo ajeno no lo cambian", () => {
  const base = hashDePayload(sanearCobro(cobro()).payload);
  assert.equal(hashDePayload(sanearCobro(cobro({ operadorVoucher: "otro" })).payload), base);
  assert.equal(hashDePayload(sanearCobro(cobro({ basura: 1 })).payload), base);
});

test("cualquier cambio de contenido cambia el hash", () => {
  const base = hashDePayload(sanearCobro(cobro()).payload);
  const otros = [
    cobro({ total: 2600 }),
    cobro({ turnoId: 11 }),
    cobro({ items: [itemCrearPayload({ productoBaseId: 3, nombre: "Yerba", precio: 2500, cantidad: 2 })] }),
    cobro({ clienteId: 4 }),
  ];
  for (const c of otros) assert.notEqual(hashDePayload(sanearCobro(c).payload), base);
});

test("la hora del dispositivo solo se guarda si es creíble", () => {
  const ahora = Date.UTC(2026, 9, 3, 12, 0, 0);
  assert.equal(horaDeDispositivo(ahora - 1000, ahora).getTime(), ahora - 1000);
  assert.equal(horaDeDispositivo(Date.UTC(2019, 0, 1), ahora), null, "antes de 2020");
  assert.equal(horaDeDispositivo(ahora + 2 * 24 * 3600 * 1000, ahora), null, "dos días en el futuro");
  assert.equal(horaDeDispositivo("ayer", ahora), null);
  assert.equal(horaDeDispositivo(null, ahora), null);
});

test("el total declarado va con dos decimales", () => {
  assert.equal(totalDeclarado({ total: 2500 }), "2500.00");
  assert.equal(totalDeclarado({ total: 10.005 }), "10.01");
});

// ── El servidor, leído SIN comentarios ──────────────────────────────────────
const sin = (ruta) => readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

test("registro y crear toman EL MISMO candado, por la misma función", () => {
  const crear = sin("app/api/pos-ventas/crear/route.js");
  const servidor = sin("lib/pos-ventas/cobroOfflineServidor.js");
  assert.match(crear, /await tomarCandadoDelLocal\(tx, localId\);/);
  assert.doesNotMatch(crear, /pg_advisory_xact_lock/, "crear volvió a tomar el candado a mano");
  assert.match(servidor, /await tomarCandadoDelLocal\(tx, ctx\.localId\);/);
});

test("el registro sanea antes de calcular el hash, y el voucher se resuelve antes de sanear", () => {
  const servidor = sin("lib/pos-ventas/cobroOfflineServidor.js");
  const sanea = servidor.indexOf("sanearCobro(cobro)");
  const hash = servidor.indexOf("hashDePayload(payload)");
  assert.ok(sanea > 0 && hash > sanea);
  assert.doesNotMatch(servidor, /operadorVoucher/, "el servidor no toca el voucher: le llega verificado");
  const ruta = sin("app/api/pos-ventas/cobros-offline/registrar/route.js");
  assert.match(ruta, /verificarVoucherOperador\(cobro\.operadorVoucher, localId\)/);
});
