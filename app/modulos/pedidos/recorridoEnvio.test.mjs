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

const { real, montar, desmontarTodo, tarjetas, boton, tocar, asentar, llamadas, entrada } = await import("./montarPantallaPedidos.mjs");

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

/**
 * Enviar el pedido. Decía "Revisar y enviar" y después confirmar: desde el
 * 2026-10-22 es un toque, y la pantalla vuelve sola a la entrada.
 */
async function enviar() {
  await tocar(boton("Enviar pedido al depósito"));
  await asentar(400);
}

test("Ver mi pedido: cada producto una vez, y el de dos líneas con la suma", async () => {
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

// Desde el 2026-10-22 el pedido recién enviado se sigue armando: después de
// enviar vuelve el catálogo, vivo, con las cantidades de lo enviado. Decía
// "TODAS las tarjetas apagadas"; apagado queda solo el pedido que el depósito
// ya empezó (`pantallaPedidos.test.mjs`, "6. empezado"). Lo que sigue valiendo
// es lo que vio Emanuel: ningún producto dos veces y ninguna clave repetida.
test("enviado: el catálogo vuelve con lo enviado, cada producto una vez y el de dos líneas con la suma", async () => {
  const consola = escucharClavesRepetidas();
  try {
    assert.equal(real.recorridoTrasEnviar.cuerpo.pendiente.depositoEmpezo, false);
    const { pedidos } = await montar({ inicio: real.recorridoRevision, solicitar: [real.recorridoSolicitado], local });
    await enviar();
    assert.equal(llamadas(pedidos, "/api/pos-transferencias/solicitar").length, 1);
    // Vuelve a la entrada, en "Enviado"; "Sumar productos" abre el catálogo.
    assert.match(entrada().textContent, /todavía podés sumar productos/);
    assert.match(entrada().textContent, /5 productos en el pedido/);
    await tocar(boton("Sumar productos", entrada()));
    assert.match(document.body.textContent, /Podés sumar productos hasta que el depósito lo empiece a preparar/);

    assert.deepEqual(repetidos(), [], "un producto aparece dos veces");
    assert.equal(tarjetas().find((t) => t.nombre === ORO).campo.value, "3", "lo enviado del 9 DE ORO es 1 + 2");
    assert.ok(tarjetas().every((t) => t.quitar), "lo enviado son los cinco del catálogo: todos con ✕");
    // Decía "Pedido enviado · 5 productos" en la barra: desde el modo sumar
    // (2026-10-22) la barra cuenta los cambios sin confirmar.
    assert.match(document.body.textContent, /5 productos en el pedido/);
    assert.match(document.body.textContent, /0 cambios sin confirmar/);
    assert.deepEqual(consola.avisos, [], "React vio dos tarjetas con la misma clave");

    // Y en Ver pedido —desde la entrada, solo para mirar—, los cinco, una vez
    // cada uno. Decía "Ver mi pedido ›" de la barra, que se fue con el modo
    // sumar.
    await tocar(boton("Volver"));
    await tocar(boton("Ver pedido", entrada()));
    assert.equal(tarjetas().length, 5);
    assert.deepEqual(repetidos(), []);
    assert.equal(tarjetas().find((t) => t.nombre === ORO).campo.value, "3");
    assert.deepEqual(consola.avisos, []);
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
