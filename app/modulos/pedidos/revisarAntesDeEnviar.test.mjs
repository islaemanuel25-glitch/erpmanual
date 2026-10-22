// REVISAR ANTES DE MANDAR: EL CATÁLOGO NO ENVÍA, LA REVISIÓN SÍ.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/revisarAntesDeEnviar.test.mjs
//
// La pantalla vieja llevaba a "Mi pedido" y desde ahí se enviaba; el rediseño
// mandaba directo desde el catálogo. Ahora, en el catálogo, "Revisar y enviar
// (N)" lleva a "Ver mi pedido", y ahí "Confirmar y enviar al depósito (N
// productos)" es el que llama a la ruta. Con las respuestas REALES del
// recorrido del celular sobre erpazul_al (sección 7 del script de base).

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const { real, montar, desmontarTodo, tarjetas, boton, tocar, asentar, llamadas, filaShell, texto } = await import("./montarPantallaPedidos.mjs");

afterEach(desmontarTodo);

const local = {
  me: real.recorridoMe,
  operadorMe: real.recorridoOperadorMe,
  opciones: real.recorridoOpciones,
  catalogo: () => real.recorridoCatalogo,
  trasEnviar: real.recorridoTrasEnviar,
};
const enviados = (pedidos) => llamadas(pedidos, "/api/pos-transferencias/solicitar").length;

test("en el catálogo, el botón grande dice Revisar y enviar (N) y NO envía", async () => {
  const { pedidos } = await montar({ inicio: real.recorridoRevision, solicitar: [real.recorridoSolicitado], local });
  const revisar = boton("Revisar y enviar");
  assert.ok(revisar, "falta Revisar y enviar");
  assert.equal(revisar.textContent.trim(), "Revisar y enviar (5)");
  assert.ok(!boton("Ver mi pedido ›"), "el Ver mi pedido › de la barra se fue");
  assert.ok(!boton("Confirmar y enviar"), "el catálogo no tiene el botón que envía");

  await tocar(revisar);
  assert.equal(enviados(pedidos), 0, "Revisar y enviar mandó el pedido");
  // Y llevó a la revisión: solo lo pedido.
  assert.equal(tarjetas().length, 5);
  assert.ok(boton("Volver al catálogo", filaShell()));
});

test("en la revisión, Confirmar y enviar al depósito (N productos) es el que envía", async () => {
  const { pedidos } = await montar({ inicio: real.recorridoRevision, solicitar: [real.recorridoSolicitado], local });
  await tocar(boton("Revisar y enviar"));
  const confirmar = boton("Confirmar y enviar al depósito");
  assert.equal(confirmar.textContent.trim(), "Confirmar y enviar al depósito (5 productos)");
  // Editable como hoy: la ✕ y el − valor + andan.
  assert.ok(tarjetas().every((t) => t.quitar && !t.mas.disabled));

  await tocar(confirmar);
  await asentar(400);
  assert.equal(enviados(pedidos), 1, "Confirmar no envió");
  assert.deepEqual(llamadas(pedidos, "/api/pos-transferencias/solicitar")[0].cuerpo, { posId: real.recorridoRevision.cuerpo.posId });
  // Lo de 8b25d40 se conserva: el aviso y el pendiente en el acto.
  assert.match(texto(), /Pedido enviado al depósito correctamente/);
  assert.match(texto(), /esperando al depósito/);
});

test("Volver al catálogo vuelve sin enviar", async () => {
  const { pedidos } = await montar({ inicio: real.recorridoRevision, solicitar: [real.recorridoSolicitado], local });
  await tocar(boton("Revisar y enviar"));
  await tocar(boton("Volver al catálogo", filaShell()));
  assert.equal(enviados(pedidos), 0);
  assert.ok(boton("Revisar y enviar"), "no volvió al catálogo");
});

test("con el pedido vacío, Revisar y enviar queda apagado", async () => {
  await montar({ inicio: real.recorridoCarritoVacio, local });
  assert.equal(real.recorridoCarritoVacio.cuerpo.itemCount, 0);
  const revisar = boton("Revisar y enviar");
  assert.equal(revisar.textContent.trim(), "Revisar y enviar (0)");
  assert.equal(revisar.disabled, true, "con el pedido vacío se puede tocar");
});
