// QUÉ LÍNEA DECIDIÓ EL DEPÓSITO Y CUÁNTO VIAJA.
//
//   node --test lib/pedidos/revisionDeLinea.test.mjs
//
// Sobre las líneas REALES de `/api/pos-transferencias/detalle` de la sección 14
// de `scripts/pruebas-db/pedidosEnviarCancelar.mjs`: un pedido de cinco
// renglones con dos "va completo", uno a menos, uno a 0, uno sin tocar y un
// producto agregado por el depósito. Y que las rutas lean ESTAS funciones y no
// una cuenta propia.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { estaRevisada, cantidadQueViaja, vaCompleto, loPedido, WHERE_LINEA_REVISADA, DATOS_LINEA_PENDIENTE } from "./revisionDeLinea.js";

const real = JSON.parse(readFileSync("app/modulos/pos-transferencias/deposito.fixture.json", "utf8"));
const lineas = (r) => Object.fromEntries(r.cuerpo.item.detalles.map((d) => [d.productoNombre, d]));
const nuevo = lineas(real.depositoDetalleNuevo);
const trabajando = lineas(real.depositoDetalleTrabajando);

test("recién pedido: ninguna revisada, y viaja lo pedido", () => {
  for (const d of Object.values(nuevo)) {
    assert.equal(estaRevisada(d), false, d.productoNombre);
    assert.equal(cantidadQueViaja(d), d.sugerido, d.productoNombre);
  }
});

test("trabajando: el 0 decidido está revisado y NO viaja; el sin tocar viaja lo pedido", () => {
  assert.equal(trabajando.YERBA.preparado, 0);
  assert.ok(trabajando.YERBA.revisadoEn, "la yerba en 0 no quedó marcada");
  assert.equal(estaRevisada(trabajando.YERBA), true);
  assert.equal(cantidadQueViaja(trabajando.YERBA), 0, "un va 0 decidido viajaría");

  assert.equal(estaRevisada(trabajando.FIDEOS), false);
  assert.equal(cantidadQueViaja(trabajando.FIDEOS), trabajando.FIDEOS.sugerido);

  assert.equal(cantidadQueViaja(trabajando.ARROZ), 1, "la corrección a menos");
  assert.equal(cantidadQueViaja(trabajando.ACEITE), 2);
  assert.equal(cantidadQueViaja(trabajando["AGUA X6"]), 2);
  assert.equal(trabajando.AZUCAR.sugerido, 0, "el agregado no lo pidió el local");
  assert.equal(estaRevisada(trabajando.AZUCAR), true, "lo que agrega el depósito ya está decidido");
  assert.equal(cantidadQueViaja(trabajando.AZUCAR), 1);
});

test("va completo: lo pedido, en la unidad pedida (el agua en bultos)", () => {
  assert.deepEqual(vaCompleto(nuevo.ACEITE), { preparado: 2, unidadPreparada: "UNIDAD" });
  assert.deepEqual(vaCompleto(nuevo["AGUA X6"]), { preparado: 2, unidadPreparada: "BULTO" });
  // Lo que el depósito escribió con "va completo" es exactamente eso.
  for (const n of ["ACEITE", "AGUA X6"]) {
    assert.equal(trabajando[n].preparado, vaCompleto(nuevo[n]).preparado, n);
    assert.equal(trabajando[n].unidadPreparada, vaCompleto(nuevo[n]).unidadPreparada, n);
  }
});

test("lo pedido, como se dice: el agua en BULTO de 6, lo demás en UNIDAD", () => {
  assert.deepEqual(loPedido(nuevo["AGUA X6"]), { cantidad: 2, unidad: "BULTO", factorPack: 6 });
  assert.deepEqual(loPedido(nuevo.ARROZ), { cantidad: 3, unidad: "UNIDAD", factorPack: 1 });
});

test("volver a pendiente: la respuesta REAL de `detalle/editar` deja la línea sin revisar y viajando lo pedido", () => {
  assert.deepEqual(DATOS_LINEA_PENDIENTE, { preparado: 0, unidadPreparada: null, revisadoEn: null });
  const e = real.depositoEscrituras.find((x) => x.cuerpo.pendiente === true);
  assert.ok(e, "la corrida real no volvió ninguna línea a pendiente");
  assert.equal(e.ruta, "/api/pos-transferencias/detalle/editar");
  const item = e.respuesta.cuerpo.item;
  assert.equal(estaRevisada(item), false);
  assert.equal(cantidadQueViaja(item), item.sugerido);
  assert.equal(item.unidadPreparada, null);
  // Después de fijar `revisadoEn`, para pisarlo; y solo para el depósito, como
  // escribir lo preparado.
  const editar = readFileSync("app/api/pos-transferencias/detalle/editar/route.js", "utf8").replace(/\/\/[^\n]*/g, "");
  const marca = editar.indexOf("if (data.preparado !== undefined) data.revisadoEn = new Date();");
  const vuelve = editar.indexOf("if (esDeposito && body.pendiente === true) Object.assign(data, DATOS_LINEA_PENDIENTE);");
  assert.ok(marca > 0 && vuelve > marca, "volver a pendiente no pisa la marca de revisado");
});

test("las rutas usan estas funciones, no una cuenta propia", () => {
  const sin = (ruta) => readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const enviar = sin("app/api/pos-transferencias/enviar/route.js");
  assert.match(enviar, /const cantidadRaw = cantidadQueViaja\(detalle\);/);
  assert.doesNotMatch(enviar, /cantidadPreparada > 0 \? cantidadPreparada : cantidadSugerida/);
  assert.match(sin("lib/pedidos/bloqueoDelPedido.js"), /\.\.\.WHERE_LINEA_REVISADA/);
  assert.match(sin("app/api/pos-transferencias/solicitados/route.js"), /\.\.\.WHERE_LINEA_REVISADA/);
  assert.match(sin("app/api/pos-transferencias/detalle/editar/route.js"), /if \(data\.preparado !== undefined\) data\.revisadoEn = new Date\(\);/);
  assert.match(sin("app/api/pos-transferencias/detalle/quitar/route.js"), /data: \{ preparado: 0, revisadoEn: null \}/);
  assert.deepEqual(WHERE_LINEA_REVISADA, { OR: [{ preparado: { gt: 0 } }, { revisadoEn: { not: null } }] });
});
