// EL HISTORIAL DEL LOCAL TRAE LOS CANCELADOS.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/pedidos/historialConCancelados.test.mjs
//
// `/api/pedidos/historial` los dejaba afuera (`sinCancelados`). Desde el
// 2026-10-22 los trae: el historial del celular tiene el filtro "Cancelados".
// Nada más de lo que devuelve cambió. La respuesta es la REAL de
// `scripts/pruebas-db/pedidosEnviarCancelar.mjs`, sección 13: un local con un
// pedido en camino, uno recibido, uno cancelado y uno en curso. Con la ruta de
// antes, la misma sección da rojo: el cancelado no aparece.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const real = JSON.parse(readFileSync("app/modulos/pedidos/enviarCancelar.fixture.json", "utf8"));
const ruta = readFileSync("app/api/pedidos/historial/route.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

test("el historial real trae el cancelado, entre los demás y en su lugar", () => {
  const ids = real.historialIds;
  const items = real.historialTodos.cuerpo.items;
  assert.deepEqual(items.map((i) => i.posId), [ids.pEnCurso, ids.pCancelado, ids.pRecibido, ids.pCamino]);
  const cancelado = items.find((i) => i.posId === ids.pCancelado);
  assert.equal(cancelado.estado, "Cancelado");
});

test("lo que devuelve cada pedido no cambió: los mismos campos que antes", () => {
  const campos = Object.keys(real.historialTodos.cuerpo.items[0]).sort();
  assert.deepEqual(campos, [
    "createdAt", "estado", "itemCount", "posId", "resumen", "solicitadoAt", "totalBultos", "totalUnidades",
    "transferenciaEstado", "transferenciaFechaEnvio", "transferenciaFechaRecepcion", "transferenciaId",
  ]);
  assert.deepEqual(Object.keys(real.historialTodos.cuerpo).sort(), ["items", "ok", "page", "pageSize", "total", "totalPages"]);
});

// Desde el detalle de un pedido (2026-10-22) el alcance y los estados viven en
// `lib/pedidos/alcanceDelHistorial.js`, compartidos con
// `app/api/pedidos/historial/[id]/route.js`. Se miran los dos: que la ruta los
// use, y qué dicen.
const alcance = readFileSync("lib/pedidos/alcanceDelHistorial.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

test("la forma: Cancelado entre los estados válidos y la lectura sin sinCancelados", () => {
  assert.match(alcance, /ESTADOS_DEL_HISTORIAL = Object\.freeze\(\["Solicitado", "Preparando", "Enviado", "Cancelado"\]\);/);
  assert.match(ruta, /const estadosValidos = ESTADOS_DEL_HISTORIAL;/);
  assert.doesNotMatch(ruta, /sinCancelados\(/, "la lista sigue filtrando los cancelados");
  // El resto del alcance sigue: el local y el depósito del grupo, y solo lo
  // que se pidió desde Pedidos.
  assert.match(alcance, /destinoId: localId,\s*origenId: depositoId,\s*origenManual: true,/);
  assert.match(ruta, /\.\.\.pedidosDelHistorial\(alcance\)/);
});
