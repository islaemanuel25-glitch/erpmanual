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
  // La barra: cuántos y "Revisar y enviar". Decía "Ver mi pedido ›" y
  // "Enviar pedido al depósito": desde 2026-10-22 el botón grande lleva a la
  // revisión y el link se fue (lo afirma `revisarAntesDeEnviar.test.mjs`).
  const revisar = boton("Revisar y enviar (2)");
  assert.ok(revisar && !revisar.disabled);
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

// ── LA ✕ NO MUEVE NADA ────────────────────────────────────────────────────
//
// Aparecía solo con el producto en el pedido, y al pasar de 0 a 1 el renglón del
// nombre crecía y el − valor + bajaba. Ahora el lugar está siempre. Sin layout
// en jsdom, lo que se afirma es la ESTRUCTURA: los mismos elementos, con las
// mismas clases, salvo `invisible` en el lugar vacío. Si el árbol es el mismo,
// no hay nada que pueda correrse.

/** El árbol de la tarjeta: etiquetas y clases, sin textos ni valores. */
function forma(el) {
  const clases = [...el.classList].filter((c) => c !== "invisible").sort().join(".");
  return `${el.tagName.toLowerCase()}${clases ? `.${clases}` : ""}(${[...el.children].map(forma).join(",")})`;
}

test("✕: la tarjeta tiene la misma estructura con y sin el producto en el pedido", async () => {
  await montar({ inicio: real.carritoBorrador });
  // Coca está en el pedido y la yerba no: las dos por unidad y sin foto, así
  // que lo único que puede diferir es la ✕.
  assert.ok(tarjeta("Coca 2L").quitar && !tarjeta("Yerba 1kg").quitar);
  assert.equal(forma(tarjeta("Yerba 1kg").tarjeta), forma(tarjeta("Coca 2L").tarjeta), "sin el producto la tarjeta tiene otra forma");

  // Y la misma tarjeta, pasando de 0 a 1 y de 1 a 0.
  const antes = forma(tarjeta("Yerba 1kg").tarjeta);
  await tocar(tarjeta("Yerba 1kg").mas);
  assert.ok(tarjeta("Yerba 1kg").quitar, "con 1 tiene que aparecer la ✕");
  assert.equal(forma(tarjeta("Yerba 1kg").tarjeta), antes, "de 0 a 1 cambió la forma");
  await tocar(tarjeta("Yerba 1kg").quitar);
  assert.equal(forma(tarjeta("Yerba 1kg").tarjeta), antes, "de 1 a 0 cambió la forma");
});

test("✕: sin el producto, el lugar está pero invisible, apagado y fuera del foco", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador });
  const { lugarQuitar } = tarjeta("Yerba 1kg");
  assert.ok(lugarQuitar, "no se reservó el lugar de la ✕");
  assert.ok(lugarQuitar.classList.contains("invisible"), "el lugar vacío se ve");
  assert.equal(lugarQuitar.disabled, true, "el lugar vacío se puede tocar");
  assert.equal(lugarQuitar.getAttribute("tabindex"), "-1", "el lugar vacío entra en el orden de foco");
  assert.equal(lugarQuitar.getAttribute("aria-hidden"), "true", "el lector de pantalla lo anuncia");
  // Mismo alto y ancho que la ✕: el toque de 44.
  assert.match(lugarQuitar.className, /min-w-toque min-h-toque/);

  const antes = llamadas(pedidos, "/api/pedidos/set-cantidad").length;
  await tocar(lugarQuitar);
  assert.equal(llamadas(pedidos, "/api/pedidos/set-cantidad").length, antes, "tocar el lugar vacío mandó algo");

  // Con el producto: el mismo lugar, visible y tocable.
  const coca = tarjeta("Coca 2L").lugarQuitar;
  assert.ok(!coca.classList.contains("invisible"));
  assert.equal(coca.disabled, false);
  assert.ok(coca === tarjeta("Coca 2L").quitar, "la ✕ no está en el lugar reservado");
});

test("✕: en el pedido enviado no va, pero el lugar se reserva igual", async () => {
  await montar({ inicio: pendienteDel(new Date()) });
  for (const t of tarjetas()) {
    assert.ok(t.lugarQuitar, `${t.nombre}: el pedido enviado no reserva el lugar`);
    assert.ok(t.lugarQuitar.classList.contains("invisible"), `${t.nombre}: se ve la ✕ en el pedido enviado`);
    assert.equal(t.lugarQuitar.disabled, true);
  }
});

test("cada tarjeta mide lo que necesita: la lista de Pedidos no iguala altos", async () => {
  await montar({ inicio: real.carritoBorrador });
  const grilla = tarjeta("Coca 2L").tarjeta.parentElement;
  assert.match(grilla.className, /sunmi-product-list/);
  assert.doesNotMatch(grilla.className, /auto-rows-fr/, "la grilla sigue estirando todas al alto de la más alta");
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
  // Decía `value === "0"`. Desde 2026-10-22 el 0 es GUÍA, no un número
  // cargado: el campo queda vacío y el 0 va de placeholder.
  assert.equal(tarjeta("Coca 2L").campo.value, "");
  assert.equal(tarjeta("Coca 2L").campo.getAttribute("placeholder"), "0");
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
// El agua tiene foto en la base; la coca y la yerba no. Con "Ver fotos"
// prendido, el cuadrado va a la izquierda, primero en la fila, siempre: con foto
// o con la inicial.
//
// Desde 2026-10-22 la foto es optativa y arranca APAGADA: estos tres candados
// la prenden antes de montar —como la deja guardada quien tocó el
// interruptor— y siguen afirmando lo mismo que en 538f894. Lo de apagada está
// más abajo, en "VER FOTOS".

const CLAVE_FOTOS = "pedidos_ver_fotos";
const conFotos = () => window.localStorage.setItem(CLAVE_FOTOS, "1");

/** Lo que hay en el lugar de la foto: el primer hijo de la fila de la tarjeta. */
const lugarDeLaFoto = (t) => t.tarjeta.firstElementChild?.firstElementChild ?? null;

test("FOTO: con imagenUrl, la foto; sin imagenUrl, la inicial en el mismo lugar", async () => {
  conFotos();
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
  conFotos();
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
  conFotos();
  await montar({ inicio: real.carritoBorrador });
  await tocar(boton("Revisar y enviar"));
  assert.ok(tarjeta("Agua x6").foto, "Ver mi pedido: el carrito trae la foto del agua");
  assert.ok(tarjeta("Coca 2L").inicial, "Ver mi pedido: la coca, con su inicial");
  await desmontarTodo();

  // Lo enviado no trae la foto: `pendiente.items` no tiene `imagenUrl`. Va la
  // inicial en las dos, y el lugar se conserva igual.
  assert.ok(real.carritoPendiente.cuerpo.pendiente.items.every((i) => !("imagenUrl" in i)));
  conFotos();
  await montar({ inicio: pendienteDel(new Date()) });
  for (const t of tarjetas()) {
    assert.ok(t.inicial, `${t.nombre}: el pedido enviado tiene que conservar el cuadrado`);
    assert.ok(lugarDeLaFoto(t) === t.inicial);
  }
});

// ── VER FOTOS ─────────────────────────────────────────────────────────────
//
// El interruptor arranca APAGADO y el celular recuerda lo elegido con la clave
// `pedidos_ver_fotos`. `SunmiToggle` toma su valor una sola vez al montarse,
// así que lo guardado se lee antes: si naciera apagado y se prendiera después,
// el interruptor seguiría mostrando "apagado" con las fotos a la vista.

const interruptor = () => document.querySelector("[data-ver-fotos]");
/** El riel del interruptor: ámbar prendido, gris apagado (los de `SunmiToggle`). */
const prendido = () => interruptor()?.querySelector(".rounded-full")?.className.includes("bg-amber-400");
const sinCuadrado = () => tarjetas().every((t) => !t.foto && !t.inicial);

test("VER FOTOS: arranca apagado, y apagado no hay cuadrado y el nombre usa todo el ancho", async () => {
  await montar({ inicio: real.carritoBorrador });
  assert.ok(interruptor(), "falta el interruptor");
  assert.match(interruptor().textContent, /Ver fotos/);
  assert.equal(prendido(), false, "tiene que arrancar apagado");
  assert.ok(sinCuadrado(), "apagado se dibujó una foto o una inicial");
  // Lo primero de la fila es la columna del nombre: el cuadrado no se reserva.
  const agua = tarjeta("Agua x6");
  assert.match(lugarDeLaFoto(agua).className, /flex-1 min-w-0/, "apagado, el lugar de la foto sigue ocupado");
  // Va debajo del filtro de Categoría, antes de la lista.
  const orden = document.body.innerHTML;
  assert.ok(orden.indexOf('id="categoria-pedido"') < orden.indexOf("data-ver-fotos"), "el interruptor no está debajo del filtro");
  assert.ok(orden.indexOf("data-ver-fotos") < orden.indexOf("data-tarjeta-pedido"), "el interruptor quedó después de la lista");
});

test("VER FOTOS: prenderlo dibuja foto o inicial, y queda guardado; apagarlo lo saca", async () => {
  await montar({ inicio: real.carritoBorrador });
  await tocar(interruptor().firstElementChild);
  assert.equal(prendido(), true);
  assert.equal(window.localStorage.getItem(CLAVE_FOTOS), "1", "no quedó guardado prendido");
  assert.ok(tarjeta("Agua x6").foto, "prendido, el agua tiene que mostrar su foto");
  assert.equal(tarjeta("Coca 2L").inicial?.textContent, "C", "prendido, la coca tiene que mostrar su inicial");

  await tocar(interruptor().firstElementChild);
  assert.equal(prendido(), false);
  assert.equal(window.localStorage.getItem(CLAVE_FOTOS), "0", "no quedó guardado apagado");
  assert.ok(sinCuadrado());
});

test("VER FOTOS: lo guardado se lee antes de montar el interruptor", async () => {
  conFotos();
  await montar({ inicio: real.carritoBorrador });
  assert.equal(prendido(), true, "el interruptor arrancó apagado con las fotos guardadas prendidas");
  assert.ok(tarjeta("Agua x6").foto);
});

test("VER FOTOS: si el celular no deja leer, apagado", async () => {
  // Guardado PRENDIDO: si la lectura no tirara, arrancaría prendido y el
  // candado lo vería. Así el caso distingue "tiró y quedó apagado" de "no
  // había nada".
  window.localStorage.setItem(CLAVE_FOTOS, "1");
  // En jsdom `localStorage` es un proxy: un `defineProperty` sobre la instancia
  // guarda un dato llamado "getItem" y no reemplaza nada. Se tapa en el
  // prototipo, que es por donde pasa la llamada de la pantalla.
  const proto = window.Storage.prototype;
  const original = proto.getItem;
  proto.getItem = () => {
    throw new Error("SecurityError");
  };
  try {
    await montar({ inicio: real.carritoBorrador });
    assert.equal(prendido(), false);
    assert.ok(sinCuadrado());
  } finally {
    proto.getItem = original;
  }
});

test("VER FOTOS: en Ver mi pedido y en el pedido enviado no se ve, pero se respeta", async () => {
  await montar({ inicio: real.carritoBorrador });
  await tocar(boton("Revisar y enviar"));
  assert.ok(!interruptor(), "en Ver mi pedido no va el interruptor");
  assert.ok(sinCuadrado(), "apagado, Ver mi pedido mostró fotos");
  await desmontarTodo();

  await montar({ inicio: pendienteDel(new Date()) });
  assert.ok(!interruptor(), "en el pedido enviado no va el interruptor");
  assert.ok(sinCuadrado(), "apagado, el pedido enviado mostró iniciales");
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

// ── EL 0 ES GUÍA, Y LO QUE SE ESCRIBE REEMPLAZA ───────────────────────────
//
// Con el teclado abierto sobre un producto en 0, el 0 quedaba escrito y se le
// sumaba lo tipeado. Ahora Pedidos prende `minimoComoGuia` de la pieza: en 0 el
// campo está vacío con "0" de placeholder, y al tocar un número lo que se
// escribe lo reemplaza. Al salir, vacío vale 0 y sin cambio no se manda nada.

/** Lo que dejó el teclado en el campo, y el `input` que escucha React. */
async function teclear(campo, texto) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(campo, texto);
    campo.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
async function entrar(campo) {
  await act(async () => {
    campo.focus();
    await new Promise((r) => setTimeout(r, 5));
  });
}
async function salir(campo) {
  await act(async () => campo.blur());
  await asentar();
}

test("GUÍA: en 0 el campo está vacío con 0 de placeholder; con cantidad, el número", async () => {
  await montar({ inicio: real.carritoBorrador });
  const yerba = tarjeta("Yerba 1kg").campo;
  assert.equal(yerba.value, "", "el 0 quedó como número cargado");
  assert.equal(yerba.getAttribute("placeholder"), "0");
  assert.equal(tarjeta("Coca 2L").campo.value, "3");
  assert.equal(tarjeta("Agua x6").campo.value, "2");
});

test("GUÍA: en 0, escribir 5 manda 5", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador });
  const { campo } = tarjeta("Yerba 1kg");
  await entrar(campo);
  assert.equal(campo.value, "", "al tocarlo quedó un 0 adentro");
  await teclear(campo, "5");
  await salir(campo);
  assert.equal(setCantidades(pedidos).at(-1).cantidad, 5);
  assert.equal(setCantidades(pedidos).at(-1).unidad, "UNIDAD");
});

test("GUÍA: con 3, tocar selecciona y escribir 1 manda 1 (no 31)", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador });
  const { campo } = tarjeta("Coca 2L");
  await entrar(campo);
  assert.deepEqual([campo.selectionStart, campo.selectionEnd], [0, 1], "el número no quedó seleccionado");
  // Con la selección perdida, el teclado deja "31": igual tiene que quedar 1.
  await teclear(campo, "31");
  await salir(campo);
  assert.deepEqual(
    setCantidades(pedidos).at(-1),
    { productoLocalId: real.catalogo.cuerpo.items.find((i) => i.nombre === "Coca 2L").productoLocalId, cantidad: 1, unidad: "UNIDAD" }
  );
});

test("GUÍA: el agua por bulto manda en BULTO, como hoy", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador });
  const { campo } = tarjeta("Agua x6");
  await entrar(campo);
  await teclear(campo, "4");
  await salir(campo);
  assert.equal(setCantidades(pedidos).at(-1).cantidad, 4);
  assert.equal(setCantidades(pedidos).at(-1).unidad, "BULTO");
});

test("GUÍA: vacío al salir manda 0, y el producto sale del pedido", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador });
  const { campo } = tarjeta("Coca 2L");
  await entrar(campo);
  await teclear(campo, "");
  await salir(campo);
  assert.equal(setCantidades(pedidos).at(-1).cantidad, 0);
  assert.ok(!tarjeta("Coca 2L").quitar, "vaciado, la coca sigue en el pedido");
  assert.equal(tarjeta("Coca 2L").campo.value, "", "vaciado, el campo tiene que quedar con la guía");
});

test("GUÍA: tocar y salir sin cambiar no manda nada, en 0 ni con cantidad", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador });
  const antes = setCantidades(pedidos).length;
  for (const nombre of ["Yerba 1kg", "Coca 2L"]) {
    const { campo } = tarjeta(nombre);
    await entrar(campo);
    await salir(campo);
  }
  // Y borrar y volver a escribir lo mismo que había tampoco. Tiene que ser
  // borrar y escribir: poner "3" donde ya hay "3" no es un cambio para React,
  // `confirmar` no recibe nada y la comparación no llega a correr —la primera
  // versión de este caso hacía eso y daba verde con la comparación sacada—.
  const { campo } = tarjeta("Coca 2L");
  await entrar(campo);
  await teclear(campo, "");
  await teclear(campo, "3");
  await salir(campo);
  assert.equal(setCantidades(pedidos).length, antes, "salir sin cambiar mandó algo");
});

test("GUÍA: el + desde 0 lleva a 1, y el 1 se ve como número", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador });
  await tocar(tarjeta("Yerba 1kg").mas);
  assert.equal(setCantidades(pedidos).at(-1).cantidad, 1);
  assert.equal(tarjeta("Yerba 1kg").campo.value, "1");
});

test("GUÍA: se prende en el catálogo y en Ver mi pedido, no en el pedido enviado", async () => {
  await montar({ inicio: real.carritoBorrador });
  assert.equal(tarjeta("Yerba 1kg").campo.getAttribute("placeholder"), "0", "el catálogo no la prende");
  await tocar(boton("Revisar y enviar"));
  assert.equal(tarjeta("Coca 2L").campo.getAttribute("placeholder"), "0", "Ver mi pedido no la prende");
  await desmontarTodo();

  await montar({ inicio: pendienteDel(new Date()) });
  for (const t of tarjetas()) assert.equal(t.campo.getAttribute("placeholder"), null, `${t.nombre}: el pedido enviado la prende`);
});

test("4. Ver mi pedido: solo lo pedido, sin buscador ni filtro, y vuelve desde el shell", async () => {
  await montar({ inicio: real.carritoBorrador });
  await tocar(boton("Revisar y enviar"));
  assert.deepEqual(nombres(), ["Agua x6", "Coca 2L"]);
  assert.ok(!buscador(), "sin buscador");
  assert.ok(!categoria(), "sin filtro");
  assert.ok(!boton("Revisar y enviar"), "adentro no se ofrece de nuevo");
  assert.ok(boton("Confirmar y enviar al depósito"), "desde acá se envía");
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
  assert.ok(!boton("Revisar y enviar") && !boton("Confirmar y enviar"), "sin enviar");
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
