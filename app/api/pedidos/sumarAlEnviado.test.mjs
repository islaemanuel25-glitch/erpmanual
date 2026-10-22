// SUMAR AL PEDIDO ENVIADO, HASTA QUE EL DEPÓSITO LO EMPIEZA.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/pedidos/sumarAlEnviado.test.mjs
//
// Regla de Emanuel (2026-10-22): mientras el pedido enviado espera, el local
// le suma productos, le cambia cantidades y le saca, sin cancelarlo y sin
// abrir otro. Desde que el depósito lo EMPIEZA —prepara una línea o lo
// despacha (`depositoEmpezo`, en `lib/pedidos/bloqueoDelPedido.js`)—, 409.
//
// Las respuestas son las de `scripts/pruebas-db/pedidosEnviarCancelar.mjs`,
// sección 9, contra erpazul_al. Las dos carreras (9e y 9f) se midieron también
// SIN el bloqueo en la ruta del depósito (CONTRAPRUEBA_DEPOSITO): preparar dejó
// 38 de 40 líneas tarde, dos veces; despachar, 2 y 4 de 40. Con el bloqueo, 0.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const real = JSON.parse(readFileSync("app/modulos/pedidos/enviarCancelar.fixture.json", "utf8"));
const MENSAJE_409 = "El depósito ya está preparando tu pedido. Ya no se puede cambiar.";

const sinComentarios = (ruta) =>
  readFileSync(ruta, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

test("9a: lo que se suma después de enviar va al MISMO pedido enviado", () => {
  const pendiente = real.sumarCarritoEnviado.cuerpo.pendiente;
  const r = real.sumarSetCantidad;
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.ok, true);
  assert.equal(r.cuerpo.posId, pendiente.posId, "la cantidad fue a otro pedido");
  assert.equal(pendiente.depositoEmpezo, false);
  // Y "Ver mi pedido" lo trae, con lo cambiado y sin lo sacado.
  const tras = real.sumarCarritoTrasSumar.cuerpo;
  assert.equal(tras.posId, null, "se abrió un borrador al lado del enviado");
  const items = Object.fromEntries(tras.pendiente.items.map((i) => [i.nombre, i.sugerido]));
  assert.deepEqual(items, { ACEITE: 2, ARROZ: 5, GALLETITAS: 4 });
});

test("9b: cada cambio deja su fila en la bitácora, bajo el pedido", () => {
  const filas = real.sumarBitacora;
  assert.equal(filas.length, 3, "agregar, cambiar y sacar no dejaron una fila cada uno");
  assert.ok(filas.every((f) => f.accion === "pos_transferencia.editar"));
  assert.ok(filas[1].campos.includes("Sugerido:1→3"), "el cambio no dice de cuánto a cuánto");
  assert.ok(filas[2].campos.some((c) => c.startsWith("Producto Id:")) && filas[2].campos.includes("Sugerido:3→null"), "sacar no dice qué producto ni cuánto había");
});

test("9b: las líneas del pedido están en la lista blanca de la bitácora, agrupadas bajo su pedido", () => {
  const f = sinComentarios("lib/auditoria/interceptor.js");
  assert.match(f, /PosTransferenciaDetalle: \["create", "update", "delete", "deleteMany"\]/);
  assert.match(f, /grupoKey: \(e\) => `TransferenciaPOS:\$\{\(e\.despues \|\| e\.antes\)\?\.posTransferenciaId\}`/);
});

test("9c: si se saca todo, el pedido sigue enviado y vacío", () => {
  const p = real.sumarEnviadoVacio.cuerpo;
  assert.equal(p.posId, null);
  assert.equal(p.pendiente.estado, "Solicitado");
  assert.equal(p.pendiente.itemCount, 0);
});

test("9d: con el pedido empezado, set-cantidad contesta 409 con el mensaje", () => {
  assert.equal(real.empezadoCarrito.cuerpo.pendiente.depositoEmpezo, true);
  assert.equal(real.empezadoSetCantidad.status, 409);
  assert.deepEqual(real.empezadoSetCantidad.cuerpo, { ok: false, error: MENSAJE_409 });
  assert.ok(sinComentarios("app/api/pedidos/set-cantidad/route.js").includes(MENSAJE_409));
  // Y cancelar todavía lo permite: la pantalla tiene que mostrar el botón.
  assert.equal(real.empezadoCancelar.status, 200);
});

test("9e: el depósito prepara mientras el local cambia la misma línea: cero tarde", () => {
  const m = real.carreraPreparar;
  assert.ok(m.vueltas >= 20);
  assert.equal(m.tardes, 0, `${m.tardes} veces el local borró lo preparado`);
  assert.equal(m.otras, 0);
  assert.equal(m.antes + m.conflictos, m.vueltas);
  assert.ok(m.antes > 0 && m.conflictos > 0, "la carrera no cayó de los dos lados: no se ejerció");
});

test("9f: el depósito despacha mientras el local suma: cero tarde", () => {
  const m = real.carreraDespachar;
  assert.ok(m.vueltas >= 20);
  assert.equal(m.tardes, 0, `${m.tardes} líneas quedaron en el pedido sin viajar`);
  assert.equal(m.otras, 0);
  assert.ok(m.cambio > 0, "el despacho nunca encontró el pedido cambiado: la relectura no se ejerció");
  assert.deepEqual(real.despacharPedidoCambio, {
    status: 409,
    cuerpo: { ok: false, error: "El local cambió el pedido mientras lo enviabas. Volvé a abrirlo y enviá de nuevo." },
  });
});

// ── TODAS LAS RUTAS QUE EMPIEZAN EL PEDIDO TOMAN EL MISMO BLOQUEO ─────────
// Las que escriben `preparado` o mueven el estado fuera de Solicitado. Las que
// solo quitan una línea (`detalle/quitar`, `eliminarItem`) no lo empiezan.
const DEL_DEPOSITO = {
  "app/api/pos-transferencias/detalle/editar/route.js": ["detalle.pos.origenId, detalle.pos.destinoId", "detalle.pos.id"],
  "app/api/pos-transferencias/detalle/agregar/route.js": ["pos.origenId, pos.destinoId", "posId"],
  "app/api/pos-transferencias/agregarItem/route.js": ["pos.origenId, pos.destinoId", "posId"],
  "app/api/pos-transferencias/enviar/route.js": ["pos.origenId, pos.destinoId", "pos.id"],
};

for (const [ruta, [par, fila]] of Object.entries(DEL_DEPOSITO)) {
  test(`${ruta}: toma el bloqueo del par y la fila, adentro de la transacción y antes de escribir`, () => {
    const f = sinComentarios(ruta);
    const tx = f.indexOf("prisma.$transaction(async (tx) =>");
    const p = f.indexOf(`bloquearParDelPedido(tx, ${par})`);
    const r = f.indexOf(`bloquearFilaDelPedido(tx, ${fila})`);
    const escribe = f.search(/tx\.posTransferencia(Detalle)?\.(create|update|updateMany)\(/);
    assert.ok(tx > -1, "no hay transacción");
    assert.ok(p > tx, "falta el bloqueo del par adentro de la transacción");
    assert.ok(r > p, "falta el FOR UPDATE de la fila después del par");
    assert.ok(escribe > r, "escribe antes de bloquear");
  });
}

test("enviar relee las líneas adentro de la transacción y no despacha si cambiaron", () => {
  const f = sinComentarios("app/api/pos-transferencias/enviar/route.js");
  const fila = f.indexOf("bloquearFilaDelPedido(tx, pos.id)");
  const relee = f.indexOf("tx.posTransferenciaDetalle.findMany(", fila);
  const compara = f.indexOf("firmaDeLineas(ahora) !== firmaDeLineas(pos.detalles)", relee);
  const pasa = f.indexOf('data: { estado: "Enviando" }', compara);
  assert.ok(fila > -1 && relee > fila && compara > relee && pasa > compara, "la relectura no está entre el bloqueo y el cambio de estado");
});

test("el carrito dice si el depósito empezó, con el mismo criterio que set-cantidad", () => {
  const f = sinComentarios("app/api/pedidos/carrito/route.js");
  assert.ok(f.includes("depositoEmpezo: await depositoEmpezo(prisma, posPendiente)"));
  const b = sinComentarios("lib/pedidos/bloqueoDelPedido.js");
  assert.match(b, /if \(pos\.estado !== ESTADO_PEDIDO\.SOLICITADO\) return true;/);
  assert.match(b, /preparado: \{ gt: 0 \}/);
});
