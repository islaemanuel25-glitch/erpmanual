// ELEGIR 25, 50 O 100 PRODUCTOS POR PÁGINA EN EL CATÁLOGO DE PEDIDOS.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/porPagina.test.mjs
//
// La pantalla montada entera con el arnés de `montarPantallaPedidos.mjs`, en el
// local del fixture que tiene 120 productos en el depósito, y `fetch`
// contestando las respuestas REALES de la ruta para cada tamaño
// (`scripts/pruebas-db/pedidosEnviarCancelar.mjs`, sobre erpazul_al).
//
// Lo que se afirma: elegir manda ese tamaño a la ruta, vuelve a la página 1 y
// queda guardado con la clave de siempre; al entrar se usa lo guardado, o 50;
// y el elegidor se ve aunque haya una sola página.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const { real, montar, desmontarTodo, asentar, llamadas, tocar } = await import("./montarPantallaPedidos.mjs");

afterEach(desmontarTodo);

const CLAVE = "pedidos_page_size";

// Solo las combinaciones que la ruta contestó de verdad. Otra cualquiera es un
// pedido que el candado no esperaba, y el arnés lo dice.
const RESPUESTAS = {
  "1|25": real.paginado25,
  "1|50": real.paginado50,
  "1|100": real.paginado100,
  "2|50": real.paginado50p2,
};
const localDe120 = {
  me: real.paginadoMe,
  operadorMe: real.paginadoOperadorMe,
  opciones: real.paginadoOpciones,
  catalogo: (p) => RESPUESTAS[`${p.page}|${p.pageSize}`],
};
const montar120 = () => montar({ inicio: real.paginadoCarrito, local: localDe120 });

const delCatalogo = (pedidos) => llamadas(pedidos, "/api/pedidos/catalogo").map((p) => p.params);
const ultimo = (pedidos) => delCatalogo(pedidos).at(-1);
/** El paginador del teléfono: ahí están "Página N de M", "viendo…" y el elegidor. */
const paginador = () => document.querySelector('[data-paginador="celular"]');
const opcion = (n) => [...(paginador()?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === String(n)) ?? null;
const guardado = () => window.localStorage.getItem(CLAVE);

async function elegir(n) {
  await tocar(opcion(n));
  await asentar(400); // el catálogo se vuelve a pedir con el debounce de 300 ms
}

test("el fixture: el local de los 120, con las tres páginas reales", () => {
  assert.equal(real.paginado25.cuerpo.items.length, 25);
  assert.equal(real.paginado50.cuerpo.items.length, 50);
  assert.equal(real.paginado100.cuerpo.items.length, 100);
  assert.equal(real.paginadoCarrito.cuerpo.itemCount, 0);
  // Perfil, operadora y opciones son de ESE local, no del de los tres productos.
  assert.equal(real.paginadoMe.cuerpo.user.localId, real.paginadoOpciones.cuerpo.local.id);
  assert.equal(real.paginadoOperadorMe.cuerpo.operador.localId, real.paginadoOpciones.cuerpo.local.id);
});

test("sin nada guardado, pide de a 50 y lo muestra", async () => {
  const { pedidos } = await montar120();
  assert.equal(ultimo(pedidos).pageSize, "50");
  assert.match(paginador().textContent, /Página 1 de 3/);
  assert.match(paginador().textContent, /viendo 1–50 de 120/);
  for (const n of [25, 50, 100]) assert.ok(opcion(n), `falta la opción ${n}`);
});

test("elegir 25, 100 y 50: cada uno viaja a la ruta, en la página 1, y queda guardado", async () => {
  const { pedidos } = await montar120();
  for (const [n, paginas] of [[25, 5], [100, 2], [50, 3]]) {
    await elegir(n);
    assert.deepEqual({ page: ultimo(pedidos).page, pageSize: ultimo(pedidos).pageSize }, { page: "1", pageSize: String(n) }, `elegir ${n}`);
    assert.equal(guardado(), String(n), `${n} no quedó guardado`);
    assert.match(paginador().textContent, new RegExp(`Página 1 de ${paginas}`));
    assert.match(paginador().textContent, new RegExp(`viendo 1–${n} de 120`));
  }
  // La pantalla nunca pide otra cosa que esos tres.
  assert.ok(delCatalogo(pedidos).every((p) => ["25", "50", "100"].includes(p.pageSize)));
});

test("cambiar el tamaño desde la página 2 vuelve a la 1", async () => {
  const { pedidos } = await montar120();
  await tocar(paginador().querySelector('button[aria-label="Página siguiente"]'));
  assert.deepEqual({ page: ultimo(pedidos).page, pageSize: ultimo(pedidos).pageSize }, { page: "2", pageSize: "50" });
  assert.match(paginador().textContent, /Página 2 de 3/);

  await elegir(100);
  assert.deepEqual({ page: ultimo(pedidos).page, pageSize: ultimo(pedidos).pageSize }, { page: "1", pageSize: "100" }, "no volvió a la página 1");
  assert.match(paginador().textContent, /Página 1 de 2/);
});

test("al entrar usa lo guardado; lo que no es 25, 50 o 100 vale 50", async () => {
  window.localStorage.setItem(CLAVE, "100");
  let r = await montar120();
  assert.equal(delCatalogo(r.pedidos)[0].pageSize, "100", "no usó lo guardado");
  await desmontarTodo();

  window.localStorage.setItem(CLAVE, "30");
  r = await montar120();
  assert.equal(delCatalogo(r.pedidos)[0].pageSize, "50", "un guardado inválido tiene que dar 50");
});

test("si el celular no deja leer lo guardado, 50 y la pantalla anda", async () => {
  const original = window.localStorage.getItem;
  Object.defineProperty(window.localStorage, "getItem", {
    value: () => {
      throw new Error("SecurityError");
    },
    configurable: true,
  });
  try {
    const { pedidos } = await montar120();
    assert.equal(delCatalogo(pedidos)[0].pageSize, "50");
    assert.ok(paginador(), "la pantalla no se dibujó");
  } finally {
    Object.defineProperty(window.localStorage, "getItem", { value: original, configurable: true });
  }
});

test("con una sola página, el elegidor igual se ve: quien eligió 100 puede volver a 25", async () => {
  // El local de los tres productos: la ruta contesta una sola página.
  assert.equal(real.catalogo.cuerpo.totalPages, 1);
  await montar({ inicio: real.carritoBorrador });
  assert.ok(paginador(), "con una sola página no se dibujó el paginador");
  assert.match(paginador().textContent, /Página 1 de 1/);
  for (const n of [25, 50, 100]) assert.ok(opcion(n), `con una sola página falta la opción ${n}`);
});
