// EL RECORRIDO DEL CELULAR, DE PUNTA A PUNTA: CARGAR, REVISAR Y ENVIAR.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/recorridoEnvio.test.mjs
//
// Con las respuestas REALES de ese recorrido sobre erpazul_al
// (`scripts/pruebas-db/pedidosEnviarCancelar.mjs`, sección 7): cinco productos
// cargados y el último, "9 DE ORO AGRIDULCE", tocado dos veces seguidas con el
// +. Eso dejó dos líneas del mismo producto en el pedido, de 1 y de 2.
//
// Lo que vio Emanuel en el celular, con el pedido de 15: la primera tarjeta
// viva arriba del pedido enviado —con su ✕ y su − valor +— y el producto
// repetido. Venía de que "Ver mi pedido" dibujaba las dos líneas con la MISMA
// clave de React, y al pasar a la lista del pedido enviado una tarjeta vieja
// quedaba en pantalla. Estos candados recorren ese mismo camino.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const { real, montar, desmontarTodo, tarjetas, boton, tocar, asentar, llamadas } = await import("./montarPantallaPedidos.mjs");

afterEach(desmontarTodo);

const ORO = "9 DE ORO AGRIDULCE";
const local = {
  me: real.recorridoMe,
  operadorMe: real.recorridoOperadorMe,
  opciones: real.recorridoOpciones,
  catalogo: () => real.recorridoCatalogo,
  trasEnviar: real.recorridoTrasEnviar,
};

/** React avisa por consola cuando dos hijos tienen la misma clave. */
function escucharClavesRepetidas() {
  const avisos = [];
  const original = console.error;
  console.error = (...args) => {
    if (String(args[0]).includes("same key")) avisos.push(String(args[0]));
    else original(...args);
  };
  return { avisos, soltar: () => (console.error = original) };
}

const nombres = () => tarjetas().map((t) => t.nombre);
const repetidos = () => nombres().filter((n, i, todos) => todos.indexOf(n) !== i);

/** Revisar el pedido y enviarlo, como se hace hoy en la pantalla. */
async function revisarYEnviar() {
  await tocar(boton("Ver mi pedido ›"));
  await tocar(boton("Enviar pedido al depósito"));
  await asentar(400);
}

test("revisar: cada producto una vez, y el de dos líneas con la suma", async () => {
  const consola = escucharClavesRepetidas();
  try {
    await montar({ inicio: real.recorridoRevision, local });
    await tocar(boton("Ver mi pedido ›"));
    assert.deepEqual(repetidos(), [], "un producto aparece dos veces en Ver mi pedido");
    assert.equal(tarjetas().length, 5);
    assert.equal(tarjetas().find((t) => t.nombre === ORO).campo.value, "3", "no muestra la suma de las dos líneas");
    assert.deepEqual(consola.avisos, [], "React vio dos tarjetas con la misma clave");
  } finally {
    consola.soltar();
  }
});

test("enviado: TODAS las tarjetas apagadas, sin ✕, y ningún producto repetido", async () => {
  const consola = escucharClavesRepetidas();
  try {
    const { pedidos } = await montar({ inicio: real.recorridoRevision, solicitar: [real.recorridoSolicitado], local });
    await revisarYEnviar();
    assert.equal(llamadas(pedidos, "/api/pos-transferencias/solicitar").length, 1);
    assert.match(document.body.textContent, /esperando al depósito/);

    const vivas = tarjetas().filter((t) => t.quitar || !t.mas?.disabled || !t.menos?.disabled || !t.campo?.disabled);
    assert.deepEqual(vivas.map((t) => t.nombre), [], "con el pedido enviado quedó una tarjeta viva");
    assert.deepEqual(repetidos(), [], "un producto aparece dos veces en el pedido enviado");
    assert.equal(tarjetas().length, 5, "el pedido enviado tiene cinco productos");
    assert.equal(tarjetas().find((t) => t.nombre === ORO).campo.value, "3", "lo enviado del 9 DE ORO es 1 + 2");
    // Y cada tarjeta conserva el lugar de la ✕, invisible.
    assert.ok(tarjetas().every((t) => t.lugarQuitar?.classList.contains("invisible")));
    assert.match(document.body.textContent, /Pedido enviado · 5 productos/);
    assert.deepEqual(consola.avisos, [], "React vio dos tarjetas con la misma clave");
  } finally {
    consola.soltar();
  }
});

test("los números cuentan productos, no líneas: 5, no 6", async () => {
  await montar({ inicio: real.recorridoRevision, local });
  assert.equal(real.recorridoRevision.cuerpo.itemCount, 6, "la ruta cuenta líneas");
  assert.match(document.body.textContent, /5 productos en el pedido/);
  assert.doesNotMatch(document.body.textContent, /6 productos/);
});
