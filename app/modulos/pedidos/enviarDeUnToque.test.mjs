// ENVIAR ES UN TOQUE: EL MISMO BOTÓN EN EL CATÁLOGO Y EN "VER MI PEDIDO".
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/enviarDeUnToque.test.mjs
//
// Este archivo se llamaba `revisarAntesDeEnviar.test.mjs` y afirmaba lo
// contrario: que en el catálogo "Revisar y enviar (N)" NO enviaba y llevaba a
// "Ver mi pedido", donde "Confirmar y enviar al depósito (N productos)" era el
// que mandaba (280ec05). Ese contrato se fue A PROPÓSITO el 2026-10-22: Emanuel
// había pedido "una página antes" y se refería a una página de ENTRADA al
// módulo, no a un paso antes de enviar. En el celular, confirmar lo que se
// acababa de confirmar y quedarse en el catálogo como si nada era el defecto.
//
// Lo que se afirma ahora: "Enviar pedido al depósito (N)" está en el catálogo
// y en "Ver mi pedido", y tocarlo envía, sin otro paso; después la pantalla
// vuelve a la entrada. Con las respuestas REALES del recorrido del celular
// sobre erpazul_al (sección 7 del script de base).

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const { real, montar, desmontarTodo, tarjetas, boton, tocar, asentar, llamadas, filaShell, texto, entrada } = await import("./montarPantallaPedidos.mjs");

afterEach(desmontarTodo);

const local = {
  me: real.recorridoMe,
  operadorMe: real.recorridoOperadorMe,
  opciones: real.recorridoOpciones,
  catalogo: () => real.recorridoCatalogo,
  trasEnviar: real.recorridoTrasEnviar,
};
const enviados = (pedidos) => llamadas(pedidos, "/api/pos-transferencias/solicitar").length;

test("en el catálogo, Enviar pedido al depósito (N) envía al primer toque y vuelve a la entrada", async () => {
  const { pedidos } = await montar({ inicio: real.recorridoRevision, solicitar: [real.recorridoSolicitado], local });
  const enviar = boton("Enviar pedido al depósito");
  assert.ok(enviar, "falta Enviar pedido al depósito");
  assert.equal(enviar.textContent.trim(), "Enviar pedido al depósito (5)");
  assert.ok(!boton("Revisar y enviar"), "volvió el paso de revisión");

  await tocar(enviar);
  await asentar(400);
  assert.equal(enviados(pedidos), 1, "el primer toque no envió");
  assert.deepEqual(llamadas(pedidos, "/api/pos-transferencias/solicitar")[0].cuerpo, { posId: real.recorridoRevision.cuerpo.posId });
  assert.ok(!boton("Confirmar y enviar"), "apareció un segundo paso");
  // Lo de 8b25d40 se conserva: el aviso y el pendiente en el acto, ahora en
  // la entrada.
  assert.match(texto(), /Pedido enviado al depósito correctamente/);
  assert.ok(entrada(), "no volvió a la entrada");
  assert.match(entrada().textContent, /Enviado/);
});

test("en Ver mi pedido, el MISMO botón, y envía", async () => {
  const { pedidos } = await montar({ inicio: real.recorridoRevision, solicitar: [real.recorridoSolicitado], local });
  await tocar(boton("Ver mi pedido ›"));
  assert.equal(tarjetas().length, 5);
  assert.ok(boton("Volver al catálogo", filaShell()), "arriba, Volver al catálogo en el shell");
  assert.match(texto(), /5 productos en el pedido/);
  assert.ok(!boton("Confirmar y enviar"), "el botón de 280ec05 volvió");
  // Editable como antes: la ✕ y el − valor + andan.
  assert.ok(tarjetas().every((t) => t.quitar && !t.mas.disabled));

  await tocar(boton("Enviar pedido al depósito (5)"));
  await asentar(400);
  assert.equal(enviados(pedidos), 1, "Enviar no envió desde Ver mi pedido");
  assert.ok(entrada(), "no volvió a la entrada");
});

test("Volver al catálogo vuelve sin enviar", async () => {
  const { pedidos } = await montar({ inicio: real.recorridoRevision, solicitar: [real.recorridoSolicitado], local });
  await tocar(boton("Ver mi pedido ›"));
  await tocar(boton("Volver al catálogo", filaShell()));
  assert.equal(enviados(pedidos), 0);
  assert.equal(tarjetas().length, 5, "no volvió al catálogo");
  assert.ok(boton("Ver mi pedido ›"));
});

test("con el pedido vacío, Enviar pedido al depósito queda apagado", async () => {
  await montar({ inicio: real.recorridoCarritoVacio, local });
  assert.equal(real.recorridoCarritoVacio.cuerpo.itemCount, 0);
  const enviar = boton("Enviar pedido al depósito");
  assert.equal(enviar.textContent.trim(), "Enviar pedido al depósito (0)");
  assert.equal(enviar.disabled, true, "con el pedido vacío se puede tocar");
});
