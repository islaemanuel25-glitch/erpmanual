// LA PANTALLA DE PEDIDOS AL DEPÓSITO, TAL COMO LA APROBÓ EMANUEL.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/pantallaPedidos.test.mjs
//
// La pantalla montada entera con el arnés de `montarPantallaPedidos.mjs`, y
// `fetch` contestando las respuestas REALES de las rutas sobre la base de
// desarrollo (`scripts/pruebas-db/pedidosEnviarCancelar.mjs`): un catálogo de
// tres —Coca 2L por unidad, Agua x6 por bulto de 6 y Yerba 1kg—, dos categorías,
// y un pedido con la coca y el agua.
//
// Lo que se afirma, en el orden del diseño:
//   1. la tarjeta de contexto: "Borrador" mientras se arma, "Enviado" esperando;
//   2. un solo filtro, Categoría, y la pantalla no manda proveedor ni área;
//   3. la ✕ solo en los productos del pedido; "Por BULTO de N u" contra
//      "UNIDAD", y la unidad con la que se manda la cantidad;
//   4. "Ver mi pedido": la misma lista, solo con lo pedido, y su Volver en el
//      slot del shell;
//   5. esperando al depósito: solo lo enviado, sin ✕ y sin poder tocar nada.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const {
  real, montar, desmontarTodo, asentar, act, texto, contenido, filaShell, boton, botones, llamadas, tocar, tarjetas, tarjeta,
} = await import("./montarPantallaPedidos.mjs");

afterEach(desmontarTodo);

// Ojo: nunca `assert.equal(nodo, null)`. Si falla, el mensaje quiere imprimir
// el nodo de jsdom entero y el proceso se cuelga en vez de dar rojo —pasó en la
// contraprueba de la ✕—. Con `assert.ok(!nodo, …)` el rojo se ve.

const nombres = () => tarjetas().map((t) => t.nombre).sort();
const setCantidades = (pedidos) => llamadas(pedidos, "/api/pedidos/set-cantidad").map((p) => p.cuerpo);
const pill = () => contenido().querySelector("span.inline-block")?.textContent.trim();
const buscador = () => contenido().querySelector('input[placeholder="Buscar producto o código"]');
const categoria = () => contenido().querySelector("#categoria-pedido");

/** El pendiente real, con su fecha corrida: es lo único que cambia de un día al otro. */
const pendienteDel = (fecha) => ({
  ...real.carritoPendiente,
  cuerpo: { ...real.carritoPendiente.cuerpo, pendiente: { ...real.carritoPendiente.cuerpo.pendiente, solicitadoAt: fecha.toISOString() } },
});

test("el fixture es el que contestan las rutas: tres en el catálogo, el agua por bulto de 6, dos en el pedido", () => {
  const cat = real.catalogo.cuerpo.items;
  assert.deepEqual(cat.map((i) => i.nombre).sort(), ["Agua x6", "Coca 2L", "Yerba 1kg"]);
  const agua = cat.find((i) => i.nombre === "Agua x6");
  assert.equal(agua.modoEnvio, "SOLO_BULTO");
  assert.equal(agua.factorPack, 6);
  assert.deepEqual(real.carritoBorrador.cuerpo.items.map((i) => i.nombre).sort(), ["Agua x6", "Coca 2L"]);
  assert.equal(real.opciones.cuerpo.categorias.length, 2);
  // Lo enviado trae unidad y factor: la tarjeta del pendiente puede decir "Por BULTO".
  const aguaEnviada = real.carritoPendiente.cuerpo.pendiente.items.find((i) => i.nombre === "Agua x6");
  assert.equal(aguaEnviada.modoEnvio, "SOLO_BULTO");
  assert.equal(aguaEnviada.factorPack, 6);
});

test("1. armando: la tarjeta de contexto dice Borrador, de dónde a dónde y cuántos", async () => {
  await montar({ inicio: real.carritoBorrador });
  const { local, deposito } = real.opciones.cuerpo;
  assert.match(contenido().textContent, /Pedido al depósito/);
  assert.equal(pill(), "Borrador");
  assert.match(contenido().textContent, new RegExp(`${local.nombre} → ${deposito.nombre} · se guarda solo`));
  assert.match(contenido().textContent, /2 productos en el pedido/);
  // La cinta y el Volver escrito a mano se fueron; el Volver está en el shell.
  assert.doesNotMatch(texto(), /CATÁLOGO DE PEDIDO|Catálogo de Pedido/);
  assert.ok(!botones(contenido()).some((b) => /Volver/.test(b.textContent)), "el Volver no se dibuja en el contenido");
  assert.ok(boton("Volver", filaShell()), "el Volver va en el slot del shell");
  // La barra: cuántos, "Ver mi pedido" y enviar.
  assert.ok(boton("Ver mi pedido ›"));
  const enviar = boton("Enviar pedido al depósito");
  assert.ok(enviar && !enviar.disabled);
});

test("2. un solo filtro, Categoría, con Todas y el total; no se manda proveedor ni área", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador });
  assert.ok(buscador(), "el buscador con su placeholder");
  assert.ok(categoria(), "el desplegable de categoría");
  assert.match(contenido().textContent, /Categoría/);
  // Decía también "ni tamaño de página": el rediseño lo había sacado. Volvió el
  // 2026-10-22 a pedido de Emanuel, al pie de la lista junto al paginador, y lo
  // afirma `porPagina.test.mjs`. Proveedor y área siguen afuera.
  assert.doesNotMatch(contenido().textContent, /Proveedor|Área/, "ni proveedor ni área");

  // Abierto: "Todas · 3" y las dos por nombre, sin cantidad.
  await tocar(categoria().querySelector("button"));
  const total = real.catalogo.cuerpo.total;
  assert.match(texto(), new RegExp(`Todas · ${total}`));
  const bebidas = real.opciones.cuerpo.categorias.find((c) => c.nombre.startsWith("Bebidas"));
  // Las opciones abiertas de `SunmiSelectAdv` son los `div` tocables de la lista.
  const opcion = [...document.querySelectorAll("div.cursor-pointer")].find((d) => d.textContent.trim() === bebidas.nombre);
  assert.ok(opcion, "la categoría aparece por su nombre solo");
  await tocar(opcion);
  await asentar(400);
  assert.deepEqual(nombres(), ["Agua x6", "Coca 2L"], "filtrado por Bebidas");

  const delCatalogo = llamadas(pedidos, "/api/pedidos/catalogo");
  assert.ok(delCatalogo.length >= 2);
  for (const p of delCatalogo) {
    assert.deepEqual(Object.keys(p.params).filter((k) => !["page", "pageSize", "q", "categoriaId"].includes(k)), [], `pidió de más: ${JSON.stringify(p.params)}`);
  }
  assert.equal(delCatalogo.at(-1).params.categoriaId, String(bebidas.id));
});

test("3. la ✕ solo en lo pedido, y pone la cantidad en 0", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador });
  assert.deepEqual(nombres(), ["Agua x6", "Coca 2L", "Yerba 1kg"]);
  assert.ok(tarjeta("Coca 2L").quitar, "la coca está en el pedido: lleva ✕");
  assert.ok(tarjeta("Agua x6").quitar, "el agua está en el pedido: lleva ✕");
  assert.ok(!tarjeta("Yerba 1kg").quitar, "la yerba no está en el pedido: sin ✕");

  await tocar(tarjeta("Coca 2L").quitar);
  assert.deepEqual(setCantidades(pedidos).at(-1), { productoLocalId: real.catalogo.cuerpo.items.find((i) => i.nombre === "Coca 2L").productoLocalId, cantidad: 0, unidad: "UNIDAD" });
  assert.ok(!tarjeta("Coca 2L").quitar, "sacada del pedido, la ✕ se va");
  assert.equal(tarjeta("Coca 2L").campo.value, "0");
});

test("3. Por BULTO de N u contra UNIDAD, y la cantidad viaja en esa unidad", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador });
  const id = (n) => real.catalogo.cuerpo.items.find((i) => i.nombre === n).productoLocalId;
  assert.equal(tarjeta("Agua x6").unidad, "Por BULTO de 6 u");
  assert.equal(tarjeta("Coca 2L").unidad, "UNIDAD");
  assert.equal(tarjeta("Yerba 1kg").unidad, "UNIDAD");
  // El agua guardada en bultos se muestra en bultos.
  assert.equal(tarjeta("Agua x6").campo.value, "2");
  assert.equal(tarjeta("Coca 2L").campo.value, "3");

  await tocar(tarjeta("Agua x6").mas);
  assert.deepEqual(setCantidades(pedidos).at(-1), { productoLocalId: id("Agua x6"), cantidad: 3, unidad: "BULTO" });
  await tocar(tarjeta("Yerba 1kg").mas);
  assert.deepEqual(setCantidades(pedidos).at(-1), { productoLocalId: id("Yerba 1kg"), cantidad: 1, unidad: "UNIDAD" });
});

test("3. el − apagado en 0, y no muestra stock, ni código, ni categoría", async () => {
  await montar({ inicio: real.carritoBorrador });
  assert.equal(tarjeta("Yerba 1kg").menos.disabled, true, "en 0 el − está apagado");
  assert.equal(tarjeta("Coca 2L").menos.disabled, false);
  const yerba = real.catalogo.cuerpo.items.find((i) => i.nombre === "Yerba 1kg");
  const t = tarjeta("Yerba 1kg").tarjeta.textContent;
  assert.doesNotMatch(t, /Stock/);
  assert.ok(!t.includes(yerba.codigoBarra), "sin código");
  assert.ok(!tarjeta("Yerba 1kg").tarjeta.querySelector("img"), "sin foto");
});

// ── LA FOTO, Y LA INICIAL EN SU LUGAR ─────────────────────────────────────
//
// El agua tiene foto en la base; la coca y la yerba no. El cuadrado va a la
// izquierda, primero en la fila, siempre: con foto o con la inicial.

/** Lo que hay en el lugar de la foto: el primer hijo de la fila de la tarjeta. */
const lugarDeLaFoto = (t) => t.tarjeta.firstElementChild?.firstElementChild ?? null;

test("FOTO: con imagenUrl, la foto; sin imagenUrl, la inicial en el mismo lugar", async () => {
  await montar({ inicio: real.carritoBorrador });
  const agua = real.catalogo.cuerpo.items.find((i) => i.nombre === "Agua x6");
  assert.ok(agua.imagenUrl, "el fixture tiene que traer la foto del agua");

  const t = tarjeta("Agua x6");
  assert.ok(t.foto, "el agua tiene foto y no se dibujó");
  assert.equal(t.foto.getAttribute("src"), agua.imagenUrl);
  assert.ok(!t.inicial, "con foto no va la inicial");
  assert.ok(lugarDeLaFoto(t) === t.foto, "la foto no está a la izquierda, primera en la fila");

  for (const [nombre, letra] of [["Coca 2L", "C"], ["Yerba 1kg", "Y"]]) {
    const s = tarjeta(nombre);
    assert.ok(!s.foto, `${nombre} no tiene foto`);
    assert.ok(s.inicial, `${nombre}: sin foto tiene que ir la inicial`);
    assert.equal(s.inicial.textContent, letra);
    assert.ok(lugarDeLaFoto(s) === s.inicial, `${nombre}: la inicial no ocupa el lugar de la foto`);
    // El mismo cuadrado que la foto: el token de lado del kit.
    assert.match(s.inicial.className, /sunmi-product-thumbnail/);
  }
});

test("FOTO: si la imagen falla, en el mismo lugar va la inicial", async () => {
  await montar({ inicio: real.carritoBorrador });
  await act(async () => {
    tarjeta("Agua x6").foto.dispatchEvent(new window.Event("error"));
  });
  const t = tarjeta("Agua x6");
  assert.ok(!t.foto, "la foto rota sigue dibujada");
  assert.ok(t.inicial, "la foto rota no dejó la inicial");
  assert.equal(t.inicial.textContent, "A");
  assert.ok(lugarDeLaFoto(t) === t.inicial);
});

test("FOTO: en Ver mi pedido y en el pedido enviado, el mismo cuadrado", async () => {
  await montar({ inicio: real.carritoBorrador });
  await tocar(boton("Ver mi pedido ›"));
  assert.ok(tarjeta("Agua x6").foto, "Ver mi pedido: el carrito trae la foto del agua");
  assert.ok(tarjeta("Coca 2L").inicial, "Ver mi pedido: la coca, con su inicial");
  await desmontarTodo();

  // Lo enviado no trae la foto: `pendiente.items` no tiene `imagenUrl`. Va la
  // inicial en las dos, y el lugar se conserva igual.
  assert.ok(real.carritoPendiente.cuerpo.pendiente.items.every((i) => !("imagenUrl" in i)));
  await montar({ inicio: pendienteDel(new Date()) });
  for (const t of tarjetas()) {
    assert.ok(t.inicial, `${t.nombre}: el pedido enviado tiene que conservar el cuadrado`);
    assert.ok(lugarDeLaFoto(t) === t.inicial);
  }
});

test("3. lo tipeado se manda al salir del campo, no tecla por tecla", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador });
  const { campo } = tarjeta("Yerba 1kg");
  const antes = setCantidades(pedidos).length;
  await act(async () => campo.focus());
  for (const v of ["1", "12"]) {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(campo, v);
      campo.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  }
  assert.equal(setCantidades(pedidos).length, antes, "mientras escribe no se manda nada");
  await act(async () => campo.blur());
  await asentar();
  assert.equal(setCantidades(pedidos).length, antes + 1, "al salir, una sola vez");
  assert.equal(setCantidades(pedidos).at(-1).cantidad, 12);
});

test("4. Ver mi pedido: solo lo pedido, sin buscador ni filtro, y vuelve desde el shell", async () => {
  await montar({ inicio: real.carritoBorrador });
  await tocar(boton("Ver mi pedido ›"));
  assert.deepEqual(nombres(), ["Agua x6", "Coca 2L"]);
  assert.ok(!buscador(), "sin buscador");
  assert.ok(!categoria(), "sin filtro");
  assert.ok(!boton("Ver mi pedido ›"), "adentro no se ofrece de nuevo");
  assert.ok(boton("Enviar pedido al depósito"), "se envía desde acá también");
  assert.equal(tarjeta("Agua x6").unidad, "Por BULTO de 6 u");

  await tocar(boton("Volver al catálogo", filaShell()));
  assert.deepEqual(nombres(), ["Agua x6", "Coca 2L", "Yerba 1kg"]);
  assert.ok(buscador());
});

test("5. esperando: Enviado, solo lo enviado, sin ✕ y sin poder tocar nada", async () => {
  await montar({ inicio: pendienteDel(new Date()) });
  assert.equal(pill(), "Enviado");
  assert.match(contenido().textContent, /Enviado hoy \d\d:\d\d · esperando al depósito/);
  assert.match(contenido().textContent, /2 productos · para pedir otra cosa, cancelalo/);
  assert.match(contenido().textContent, /Pedido enviado · 2 productos/);
  assert.ok(!buscador(), "sin buscador");
  assert.ok(!categoria(), "sin filtro");
  assert.ok(!document.querySelector("[data-paginador]"), "sin paginador");
  assert.ok(!boton("Enviar pedido al depósito"), "sin enviar");
  assert.ok(boton("Cancelar pedido"));

  assert.deepEqual(nombres(), ["Agua x6", "Coca 2L"], "solo lo enviado, no el catálogo");
  for (const t of tarjetas()) {
    assert.ok(!t.quitar, `${t.nombre}: sin ✕`);
    assert.equal(t.campo.disabled, true, `${t.nombre}: el campo apagado`);
    assert.equal(t.menos.disabled, true, `${t.nombre}: el − apagado`);
    assert.equal(t.mas.disabled, true, `${t.nombre}: el + apagado`);
  }
  assert.equal(tarjeta("Agua x6").unidad, "Por BULTO de 6 u");
  assert.equal(tarjeta("Agua x6").campo.value, "2");
});

test("5. si no es de hoy, la fecha corta", async () => {
  const hace3 = new Date(Date.now() - 3 * 24 * 3600 * 1000);
  await montar({ inicio: pendienteDel(hace3) });
  assert.match(contenido().textContent, /Enviado \d\d\/\d\d \d\d:\d\d · esperando al depósito/);
  assert.doesNotMatch(contenido().textContent, /Enviado hoy/);
});
