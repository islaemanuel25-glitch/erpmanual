// CANDADO: QUÉ UBICACIÓN MIRA EL VALOR DEL STOCK.
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/libro/ubicacionDelValor.test.mjs
//
// Un usuario con local mira el suyo y nada más. Un admin en vista global elige
// entre las ubicaciones que `resolveVistaOperativa` ya le da (`vista.localIds`,
// las del grupo activo): la lista la arma el servidor y viaja en la respuesta, o
// en el 400 FALTA_UBICACION cuando todavía no eligió. No se suma nada ni se
// amplía ningún alcance. Contra PostgreSQL y con los handlers reales, en
// `scripts/pruebas-db/valorDelStock.mjs`, sección I.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { CODIGO_FALTA_UBICACION, ERROR_FUERA_DE_ALCANCE, localDeLaVista, ubicacionesApi } from "./stockDiarioApi.js";
import { consultaDeTransferencias, consultaDelResumen, opcionesDeUbicacion, parseContextoStockDiario, urlDeStockDiario } from "./stockDiarioPantalla.js";

const sinComentarios = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("local normal: su ubicación, y un localId ajeno es 403; nunca recibe lista", () => {
  const vista = { modo: "LOCAL", localId: 5 };
  assert.deepEqual(localDeLaVista(vista, null), { localId: 5 });
  assert.deepEqual(localDeLaVista(vista, "6"), { status: 403, error: ERROR_FUERA_DE_ALCANCE });
  const rutas = sinComentarios(readFileSync("lib/stock/libro/stockDiarioRutas.js", "utf8"));
  assert.match(rutas, /vista\.modo === "GLOBAL"\s*\?\s*ubicacionesApi\(/, "la lista solo se arma en la vista global");
});

test("admin global sin localId: 400 con el código FALTA_UBICACION (no un error suelto, no una suma)", () => {
  const r = localDeLaVista({ modo: "GLOBAL", localIds: [1, 2] }, null);
  assert.equal(r.status, 400);
  assert.equal(r.codigo, CODIGO_FALTA_UBICACION);
  assert.match(r.error, /falta localId/);
});

test("admin global: elige una del grupo activo; una de afuera es 403", () => {
  const vista = { modo: "GLOBAL", localIds: [1, 2] };
  assert.deepEqual(localDeLaVista(vista, "2"), { localId: 2 });
  assert.equal(localDeLaVista(vista, "9").status, 403);
});

test("la lista: solo las de la vista, activas, el depósito primero; una de otro grupo no entra aunque la base la traiga", () => {
  const locales = [
    { id: 3, nombre: "mini el 7", es_deposito: false, activo: true },
    { id: 1, nombre: "depo", es_deposito: true, activo: true },
    { id: 2, nombre: "Casiano casas", es_deposito: false, activo: true },
    { id: 4, nombre: "cerrado", es_deposito: false, activo: false },
    { id: 99, nombre: "de otro grupo", es_deposito: false, activo: true },
  ];
  const u = ubicacionesApi(locales, { modo: "GLOBAL", localIds: [1, 2, 3, 4] });
  assert.deepEqual(u.map((x) => x.nombre), ["depo", "Casiano casas", "mini el 7"]);
  assert.deepEqual(opcionesDeUbicacion(u).map((o) => o.texto), ["depo · depósito", "Casiano casas", "mini el 7"]);
  assert.equal(opcionesDeUbicacion(null), null, "sin lista no hay selector");
  assert.equal(opcionesDeUbicacion([]), null);
});

test("cambio de ubicación: el localId vive en la URL y viaja en las dos consultas", () => {
  const ctx = parseContextoStockDiario({ localId: "3", unidad: "SEMANA", fecha: "2026-10-05" });
  assert.equal(ctx.localId, 3);
  assert.equal(new URLSearchParams(consultaDelResumen(ctx)).get("localId"), "3");
  assert.equal(new URLSearchParams(consultaDeTransferencias(ctx)).get("localId"), "3");
  assert.match(urlDeStockDiario({ ...ctx, localId: 2 }), /localId=2/);
  // Basura en la URL no se manda: el servidor decidiría con el suyo.
  assert.equal(parseContextoStockDiario({ localId: "1 OR 1=1" }).localId, null);
  assert.equal(new URLSearchParams(consultaDelResumen(parseContextoStockDiario({}))).get("localId"), null);
});

test("la pantalla pregunta la ubicación con el kit y solo cuando el servidor manda la lista", () => {
  const p = sinComentarios(readFileSync("components/stock_diario/PantallaStockDiario.jsx", "utf8"));
  assert.match(p, /opcionesDeUbicacion\(respuesta\?\.ubicaciones \?\? faltaUbicacion\)/);
  assert.match(p, /<SunmiSelectAdv\b/);
  assert.match(p, /e\.codigo === CODIGO_FALTA_UBICACION/);
  assert.doesNotMatch(p, /contexto-activo\/set/, "elegir acá no cambia el contexto de toda la app");
});
