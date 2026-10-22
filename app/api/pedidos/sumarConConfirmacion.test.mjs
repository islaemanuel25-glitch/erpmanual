// SUMAR AL PEDIDO ENVIADO CON CONFIRMACIÓN: TODOS LOS CAMBIOS JUNTOS, O NINGUNO.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/pedidos/sumarConConfirmacion.test.mjs
//
// `/api/pedidos/sumar-al-enviado` (Emanuel, 2026-10-22). Las respuestas son las
// de `scripts/pruebas-db/pedidosEnviarCancelar.mjs`, sección 12, contra
// erpazul_al. La carrera 12e se midió también SIN el bloqueo en la ruta
// (CONTRAPRUEBA_DEPOSITO=sumar): 17 y 12 de 40 confirmaciones entraron después
// de empezado y borraron lo preparado. Con el bloqueo, 0.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const real = JSON.parse(readFileSync("app/modulos/pedidos/enviarCancelar.fixture.json", "utf8"));
const MENSAJE = "El depósito ya está preparando tu pedido. Ya no se puede cambiar.";

const sinComentarios = (ruta) =>
  readFileSync(ruta, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
const ruta = sinComentarios("app/api/pedidos/sumar-al-enviado/route.js");

test("12b: confirmar aplica los tres cambios juntos, y la bitácora tiene uno por línea", () => {
  assert.equal(real.sumarConfirmado.status, 200);
  assert.equal(real.sumarConfirmado.cuerpo.aplicados, 3);
  const items = Object.fromEntries(real.sumarConfirmadoCarrito.cuerpo.pendiente.items.map((i) => [i.nombre, i.sugerido]));
  assert.deepEqual(items, { ACEITE: 5, ARROZ: 3, GALLETITAS: 4 });
  assert.equal(real.sumarConfirmadoBitacora.length, 3, "la bitácora no registró cada línea");
  assert.ok(real.sumarConfirmadoBitacora.some((c) => c.includes("Sugerido:2→5")), "el cambio de cantidad no quedó");
});

test("12c: empezado entre medio, 409 con el mensaje y no entra ninguno", () => {
  assert.deepEqual(real.sumarEmpezado, { status: 409, cuerpo: { ok: false, error: MENSAJE } });
  const p = real.sumarEmpezadoCarrito.cuerpo.pendiente;
  assert.equal(p.depositoEmpezo, true);
  assert.deepEqual(p.items.map((i) => [i.nombre, i.sugerido]), [["ACEITE", 2]], "entró algún cambio");
});

test("12e: confirmar contra el depósito empezando: cero tarde, cero a medias", () => {
  const m = real.carreraSumar;
  assert.ok(m.vueltas >= 20);
  assert.equal(m.tardes, 0, `${m.tardes} confirmaciones borraron lo preparado`);
  assert.equal(m.parciales, 0, `${m.parciales} confirmaciones entraron a medias`);
  assert.equal(m.otras, 0);
  assert.equal(m.antes + m.rechazos, m.vueltas);
  assert.ok(m.antes > 0 && m.rechazos > 0, "la carrera no cayó de los dos lados: no se ejerció");
});

test("12f: en el local de la pantalla, dos cambios entran y el carrito los trae", () => {
  assert.equal(real.mainSumado.cuerpo.aplicados, 2);
  assert.equal(real.mainTrasSumar.cuerpo.pendiente.depositoEmpezo, false);
  const items = Object.fromEntries(real.mainTrasSumar.cuerpo.pendiente.items.map((i) => [i.nombre, i.sugerido]));
  assert.deepEqual(items, { "Coca 2L": 5, "Agua x6": 2, "Yerba 1kg": 1 });
});

test("la forma: valida todo antes, y escribe adentro del bloqueo, con el criterio y la escritura compartidos", () => {
  const valida = ruta.indexOf("await validarCambio(prisma, depositoId, e)");
  const tx = ruta.indexOf("prisma.$transaction(async (tx) =>");
  const par = ruta.indexOf("bloquearParDelPedido(tx, depositoId, localId)");
  const fila = ruta.indexOf("bloquearFilaDelPedido(tx, posId)");
  const empezo = ruta.indexOf("await depositoEmpezo(tx, fila)");
  const escribe = ruta.indexOf("await fijarCantidadEnPedido(tx, posId, cambio)");
  assert.ok(valida > -1 && tx > valida, "valida adentro de la transacción o no valida");
  assert.ok(par > tx && fila > par && empezo > fila && escribe > empezo, "el orden no es par → fila → empezado → escribir");
  assert.match(ruta, /from "@\/lib\/pedidos\/cantidadEnPedido"/);
  assert.match(ruta, /from "@\/lib\/pedidos\/bloqueoDelPedido"/);
  assert.doesNotMatch(ruta, /posTransferenciaDetalle\.(create|update|delete)/, "escribe líneas por su cuenta en vez de la función compartida");
  assert.ok(ruta.includes(MENSAJE));
  // Los mismos permisos que set-cantidad.
  assert.ok(ruta.includes('permisos.includes("pedidos.editar")'));
  assert.ok(ruta.includes("localUser?.es_deposito"));
});
