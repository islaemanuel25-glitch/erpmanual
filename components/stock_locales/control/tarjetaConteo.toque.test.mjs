// EL TOQUE EN LA TARJETA DEL CONTROL DE STOCK, COMO LO HACE LA PERSONA.
//
//   node --import ./scripts/alias-loader.mjs --test components/stock_locales/control/tarjetaConteo.toque.test.mjs
//
// Los candados de `controlStock.test.mjs` dibujan la tarjeta con
// `renderToStaticMarkup`: ven el HTML y no ven el foco, el blur ni lo que pasa
// cuando contesta el servidor. Los tres errores que vio Emanuel en el local
// vivían ahí —"Está bien" que no quedaba guardado, el campo escrito sin nada que
// tocar para aceptarlo y el rótulo "Contado" en un producto sin contar—, así que
// acá se monta la PANTALLA y el HOOK de verdad en un DOM (jsdom) y se toca como
// en el celular: el campo con el foco, el dedo en el botón —el foco pasa del
// campo al botón, que es lo que hace Chrome en Android— y el click.
//
// El servidor es `fetch` contestando con las respuestas REALES del fixture
// (`lecturaReal.fixture.json`, escrito por scripts/pruebas-db/controlStock.mjs):
// la lista de antes de tocar y lo que contestó el guardado.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
for (const clave of ["window", "document", "HTMLElement", "HTMLInputElement", "Node", "Event", "FocusEvent", "MouseEvent", "KeyboardEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  Object.defineProperty(globalThis, clave, { value: clave === "window" ? dom.window : dom.window[clave], configurable: true, writable: true });
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: PantallaControlStock } = await import("@/components/stock_locales/control/PantallaControlStock.jsx");
const { useControlStock } = await import("@/components/stock_locales/control/useControlStock.js");

const real = JSON.parse(readFileSync("components/stock_locales/control/lecturaReal.fixture.json", "utf8"));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * El servidor: cada pedido de la pantalla contesta con una respuesta real.
 * `lista` es una respuesta, o una función de los parámetros del listado.
 */
function servidor({ lista, guardado }) {
  const pedidos = [];
  globalThis.fetch = async (url, opciones = {}) => {
    const u = new URL(url, "http://localhost");
    const metodo = opciones.method || "GET";
    pedidos.push({ ruta: u.pathname, metodo, params: Object.fromEntries(u.searchParams), cuerpo: opciones.body ? JSON.parse(opciones.body) : null });
    let datos = { ok: true, items: [] };
    if (u.pathname === "/api/stock_locales/control") datos = real.abierto;
    else if (u.pathname === "/api/stock_locales/listar") datos = typeof lista === "function" ? lista(u.searchParams) : lista;
    else if (u.pathname === "/api/stock_locales/control/conteos" && metodo === "PUT") datos = guardado;
    return { ok: true, status: 200, json: async () => datos };
  };
  return pedidos;
}

const listados = (pedidos) => pedidos.filter((p) => p.ruta === "/api/stock_locales/listar");

// Estable, como el `useCallback` de OperadorContext: una función nueva en cada
// render rehace `pedir` y el estado se vuelve a pedir sin fin.
const requerirOperador = () => {};

function Pantalla() {
  const c = useControlStock({ puedeGestionar: false, requerirOperador });
  return React.createElement(PantallaControlStock, { c, puedeGestionar: false });
}

// Lo montado se desmonta SIEMPRE, también cuando un caso falla: una pantalla
// que queda viva con sus esperas deja el proceso colgado y el rojo no se ve.
let montadas = [];
afterEach(async () => {
  for (const r of montadas) await act(async () => r.unmount());
  montadas = [];
});

/** Monta la pantalla y espera la lista (el buscador filtra a los 300 ms). */
async function montar(respuestas) {
  const pedidos = servidor(respuestas);
  const raiz = document.createElement("div");
  document.body.replaceChildren(raiz);
  const root = createRoot(raiz);
  const desmontar = root.unmount.bind(root);
  let vivo = true;
  root.unmount = () => {
    if (vivo) desmontar();
    vivo = false;
  };
  montadas.push(root);
  await act(async () => {
    root.render(React.createElement(Pantalla));
  });
  await act(async () => {
    await esperar(400);
  });
  const fila = raiz.querySelector("[data-fila-conteo]");
  assert.ok(fila, "la tarjeta tiene que estar dibujada");
  return { raiz, root, pedidos };
}

const fila = (raiz) => raiz.querySelector("[data-fila-conteo]");
const rotulo = (raiz) => fila(raiz).querySelector("p");
const campo = (raiz) => fila(raiz).querySelector("input");
const boton = (raiz, texto) => [...fila(raiz).querySelectorAll("button")].find((b) => b.textContent.trim() === texto) ?? null;

/** El dedo en un campo: el foco entra. */
async function tocarCampo(input) {
  await act(async () => {
    input.focus();
  });
}

/** El dedo en un botón: el foco pasa del campo al botón y después llega el click. */
async function tocarBoton(b) {
  await act(async () => {
    b.focus();
  });
  await act(async () => {
    b.click();
    await esperar(0);
  });
  await act(async () => {
    await esperar(0);
  });
}

/** Escribir como el teclado: el valor nuevo y el evento `input`. */
async function escribir(input, texto) {
  const poner = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    poner.call(input, texto);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

const texto = (el) => el.textContent.replace(/\s+/g, " ").trim();

test("el foco pasa del campo al botón como en el celular (si no, este arnés no prueba nada)", async () => {
  const { raiz, root } = await montar({ lista: real.listaAntesDeEstaBien, guardado: real.estaBienDelAceite });
  let relacionado = undefined;
  campo(raiz).addEventListener("focusout", (e) => (relacionado = e.relatedTarget));
  await tocarCampo(campo(raiz));
  await act(async () => {
    boton(raiz, "Está bien").focus();
  });
  // Se comparan booleanos, nunca nodos: si falla, inspeccionar un nodo de jsdom
  // para el mensaje se come la memoria y el rojo no llega a verse.
  assert.equal(relacionado === boton(raiz, "Está bien"), true);
  await act(async () => root.unmount());
});

test("1 · 'Está bien' con el campo tocado guarda el stock del sistema y la tarjeta queda contada", async () => {
  const { raiz, root, pedidos } = await montar({ lista: real.listaAntesDeEstaBien, guardado: real.estaBienDelAceite });
  const aceite = real.listaAntesDeEstaBien.items[0];
  assert.equal(aceite.conteo, null, "arranca sin contar");
  await tocarCampo(campo(raiz));
  await tocarBoton(boton(raiz, "Está bien"));

  const puts = pedidos.filter((p) => p.metodo === "PUT");
  assert.deepEqual(puts.map((p) => p.cuerpo), [{ productoLocalId: aceite.id, estaBien: true }], "un solo guardado, el de Está bien");
  assert.match(texto(rotulo(raiz)), /^✓ Contado · Ana · \d\d:\d\d$/);
  assert.equal(campo(raiz).value, "3", "el campo dice lo que se guardó");
  assert.match(texto(fila(raiz)), /Sistema 3 · Contado 3 · Sin diferencia/);
  assert.equal(fila(raiz).dataset.filaConteo, "contado");
  assert.match(texto(raiz), new RegExp(`Contados · ${real.estaBienDelAceite.resumen.contados}`), "y sube Contados");
  // Y salir del campo después no borra lo guardado.
  await act(async () => {
    document.body.focus();
    campo(raiz).focus();
  });
  await act(async () => {
    campo(raiz).blur();
    await esperar(0);
  });
  assert.equal(pedidos.filter((p) => p.metodo === "PUT").length, 1, "tocar y salir del campo no manda un borrado");
  await act(async () => root.unmount());
});

test("1 · 'Está bien' sin tocar el campo también queda contado", async () => {
  const { raiz, root } = await montar({ lista: real.listaAntesDeEstaBien, guardado: real.estaBienDelAceite });
  await tocarBoton(boton(raiz, "Está bien"));
  assert.match(texto(rotulo(raiz)), /^✓ Contado · Ana/);
  assert.equal(campo(raiz).value, "3");
  await act(async () => root.unmount());
});

test("2 · con un valor escrito aparece 'Aceptar' en lugar de 'Está bien', a todo el ancho y de 44 px, y guarda al tocarlo", async () => {
  const { raiz, root, pedidos } = await montar({ lista: real.listaAntesDelQueso, guardado: real.guardadoDelQueso });
  const queso = real.listaAntesDelQueso.items[0];
  assert.equal(boton(raiz, "Aceptar") === null, true, "vacío y sin contar: no hay Aceptar");
  await tocarCampo(campo(raiz));
  await escribir(campo(raiz), "1,25");
  const aceptar = boton(raiz, "Aceptar");
  assert.ok(aceptar, "con un valor escrito, Aceptar");
  assert.equal(boton(raiz, "Está bien") === null, true, "en su lugar, no al lado");
  assert.match(aceptar.className, /(^| )min-h-toque( |$)/);
  assert.match(aceptar.className, /(^| )w-full( |$)/);
  assert.match(aceptar.className, /sunmi-btn-primary/);
  await tocarBoton(aceptar);

  assert.deepEqual(pedidos.filter((p) => p.metodo === "PUT").map((p) => p.cuerpo), [{ productoLocalId: queso.id, total: 1.25 }]);
  assert.match(texto(rotulo(raiz)), /^✓ Contado · Emanuel · \d\d:\d\d$/);
  assert.equal(campo(raiz).value, "1,25");
  assert.equal(boton(raiz, "Aceptar") === null, true, "guardado igual a lo escrito: no hay Aceptar");
  assert.match(texto(fila(raiz)), /Sistema 2,5 · Contado 1,25 · Faltan 1,25 kg/);
  await act(async () => root.unmount());
});

test("2 · Enter y salir del campo siguen guardando", async () => {
  const { raiz, root, pedidos } = await montar({ lista: real.listaAntesDelQueso, guardado: real.guardadoDelQueso });
  await tocarCampo(campo(raiz));
  await escribir(campo(raiz), "1,25");
  await act(async () => {
    campo(raiz).blur();
    await esperar(0);
  });
  await act(async () => {
    await esperar(0);
  });
  assert.deepEqual(pedidos.filter((p) => p.metodo === "PUT").map((p) => p.cuerpo.total), [1.25], "al salir");
  assert.match(texto(rotulo(raiz)), /^✓ Contado/);
  await act(async () => root.unmount());

  const otra = await montar({ lista: real.listaAntesDelQueso, guardado: real.guardadoDelQueso });
  await tocarCampo(campo(otra.raiz));
  await escribir(campo(otra.raiz), "1,25");
  await act(async () => {
    campo(otra.raiz).dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await esperar(0);
  });
  await act(async () => {
    await esperar(0);
  });
  assert.deepEqual(otra.pedidos.filter((p) => p.metodo === "PUT").map((p) => p.cuerpo.total), [1.25], "con Enter");
  assert.match(texto(rotulo(otra.raiz)), /^✓ Contado/);
  await act(async () => otra.root.unmount());
});

test("3 · con el campo vacío y el foco adentro, dice 'Sin contar' en gris; 'Contado' en acción solo escribiendo", async () => {
  const { raiz, root } = await montar({ lista: real.listaAntesDelQueso, guardado: real.guardadoDelQueso });
  await tocarCampo(campo(raiz));
  assert.equal(texto(rotulo(raiz)), "Sin contar");
  assert.match(rotulo(raiz).className, /sunmi-text-muted/);
  assert.doesNotMatch(rotulo(raiz).className, /sunmi-text-accent/);
  await escribir(campo(raiz), "1");
  assert.equal(texto(rotulo(raiz)), "Contado");
  assert.match(rotulo(raiz).className, /sunmi-text-accent/);
  await escribir(campo(raiz), "");
  assert.equal(texto(rotulo(raiz)), "Sin contar", "borrar lo escrito sin aceptar vuelve a Sin contar");
  await act(async () => root.unmount());
});

// ── LO QUE PIDIÓ EMANUEL DESPUÉS DE USARLO ────────────────────────────────

const tarjetas = (raiz) => [...raiz.querySelectorAll("[data-ancla^='conteo-']")];
// El nombre es el primer renglón de la tarjeta del kit, adentro del ancla.
const nombres = (raiz) => tarjetas(raiz).map((t) => t.firstElementChild?.textContent.trim());
const tarjetaDe = (raiz, id) => raiz.querySelector(`[data-ancla='conteo-${id}']`);
const chip = (raiz, comienzo) => [...raiz.querySelectorAll("button[aria-pressed]")].find((b) => texto(b).startsWith(comienzo));
const buscador = (raiz) => raiz.querySelector("[data-buscador-control] input");

/** Tocar un chip, como el dedo, y esperar la lista. */
async function tocarChip(raiz, comienzo) {
  await act(async () => {
    chip(raiz, comienzo).click();
    await esperar(0);
  });
  await act(async () => {
    await esperar(0);
  });
}

/** El lector: teclas muy seguidas y un Enter, en el campo que tenga el foco. */
async function leerConElLector(input, codigo) {
  await act(async () => {
    input.focus();
    for (const key of codigo) input.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true }));
    input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await esperar(0);
  });
  // El buscador filtra a los 300 ms.
  await act(async () => {
    await esperar(400);
  });
}

/** El listado según el chip y el texto: las respuestas reales de cada caso. */
const listadoReal = (porChip, porTexto = {}) => (params) => {
  const q = params.get("q");
  if (q && porTexto[q]) return porTexto[q];
  return porChip[params.get("control")] ?? porChip.todos;
};

test("1 · con 'Sin contar', lo contado queda en ✓ Contado, los números suben en el momento, y sale a los 1,5 s sin pedir la lista", async () => {
  const sinContar = real.listaSinContarAntesDeEstaBien;
  const { raiz, root, pedidos } = await montar({
    lista: listadoReal({ todos: sinContar, sin_contar: sinContar }),
    guardado: real.estaBienDelAceite,
  });
  await tocarChip(raiz, "Sin contar");
  const [aceite, siguiente] = sinContar.items;
  assert.deepEqual(nombres(raiz), sinContar.items.map((i) => i.nombre));
  const pedidosDeLista = listados(pedidos).length;

  await tocarBoton(tarjetaDe(raiz, aceite.id).querySelector("button.sunmi-btn-primary"));
  assert.match(texto(tarjetaDe(raiz, aceite.id).querySelector("[data-fila-conteo] p")), /^✓ Contado/, "se ve que quedó contado");
  const { contados, sinContar: quedan } = real.estaBienDelAceite.resumen;
  assert.equal(texto(chip(raiz, "Sin contar")), `Sin contar · ${quedan}`, "los chips ya cambiaron");
  assert.equal(texto(chip(raiz, "Contados")), `Contados · ${contados}`);
  assert.match(texto(raiz), new RegExp(`${contados}\\s*contados de ${real.estaBienDelAceite.resumen.total}`), "y el avance");

  await act(async () => {
    await esperar(1600);
  });
  assert.equal(tarjetaDe(raiz, aceite.id) === null, true, "salió de Sin contar");
  assert.equal(nombres(raiz)[0], siguiente.nombre, "la de abajo ocupa su lugar");
  assert.equal(tarjetas(raiz).length, sinContar.items.length - 1);
  assert.equal(listados(pedidos).length, pedidosDeLista, "sin volver a pedir la lista");
  await act(async () => root.unmount());
});

test("1 · con 'Contados', un producto que se borra sale de la lista", async () => {
  const contados = real.listaContadosAntesDeBorrar;
  const { raiz, root } = await montar({
    lista: listadoReal({ todos: contados, contados }),
    guardado: real.borradoDeLaCoca,
  });
  await tocarChip(raiz, "Contados");
  const coca = contados.items[0];
  await tocarCampo(campo(raiz));
  await escribir(campo(raiz), "");
  await act(async () => {
    campo(raiz).blur();
    await esperar(0);
  });
  await act(async () => {
    await esperar(0);
  });
  assert.match(texto(tarjetaDe(raiz, coca.id).querySelector("[data-fila-conteo] p")), /^Sin contar/);
  await act(async () => {
    await esperar(1600);
  });
  assert.equal(tarjetaDe(raiz, coca.id) === null, true, "salió de Contados");
  await act(async () => root.unmount());
});

test("1 · con 'Todos' no sale nadie", async () => {
  const sinContar = real.listaSinContarAntesDeEstaBien;
  const { raiz, root } = await montar({ lista: sinContar, guardado: real.estaBienDelAceite });
  await tocarBoton(boton(raiz, "Está bien"));
  await act(async () => {
    await esperar(1600);
  });
  assert.ok(tarjetaDe(raiz, sinContar.items[0].id), "con Todos se queda");
  await act(async () => root.unmount());
});

test("2 · un código leído en el buscador muestra SOLO ese producto, sin importar el chip, con el foco en su cantidad", async () => {
  const porCodigo = real.listaPorCodigo;
  const codigo = porCodigo.items[0].codigoBarra;
  const { raiz, root, pedidos } = await montar({
    lista: listadoReal({ todos: real.listaSinContarAntesDeEstaBien, sin_contar: real.listaSinContarAntesDeEstaBien }, { [codigo]: porCodigo }),
    guardado: real.estaBienDelAceite,
  });
  await tocarChip(raiz, "Sin contar");
  await leerConElLector(buscador(raiz), codigo);
  const ultimo = listados(pedidos).at(-1).params;
  assert.equal(ultimo.q, codigo, "el código va al buscador");
  assert.equal(ultimo.lectura, "1", "y se pide como lectura");
  assert.equal(ultimo.control, "sin_contar");
  assert.deepEqual(nombres(raiz), [porCodigo.items[0].nombre], "solo ese producto, aunque esté contado y el chip sea Sin contar");
  assert.equal(document.activeElement === campo(raiz), true, "con el foco en su cantidad");
  await act(async () => root.unmount());
});

test("2 · un código que no es de ningún producto: el aviso y la lista vacía; borrar el buscador vuelve al chip", async () => {
  const sinProducto = real.listaCodigoSinProducto;
  const codigo = sinProducto.lecturaControl.codigoSinProducto;
  const { raiz, root, pedidos } = await montar({
    lista: listadoReal({ todos: real.listaSinContarAntesDeEstaBien }, { [codigo]: sinProducto }),
    guardado: real.estaBienDelAceite,
  });
  await leerConElLector(buscador(raiz), codigo);
  assert.match(texto(raiz), new RegExp(`No hay ningún producto con el código ${codigo}`));
  assert.equal(tarjetas(raiz).length, 0, "la lista vacía");
  await escribir(buscador(raiz), "");
  await act(async () => {
    await esperar(400);
  });
  assert.equal(listados(pedidos).at(-1).params.q, undefined, "sin texto");
  assert.equal(tarjetas(raiz).length, real.listaSinContarAntesDeEstaBien.items.length, "vuelve la lista del chip");
  assert.doesNotMatch(texto(raiz), /No hay ningún producto con el código/);
  await act(async () => root.unmount());
});

test("2 · el lector con el foco en una cantidad: el código va al buscador y no queda en la cantidad", async () => {
  const porCodigo = real.listaPorCodigo;
  const codigo = porCodigo.items[0].codigoBarra;
  const { raiz, root, pedidos } = await montar({
    lista: listadoReal({ todos: real.listaSinContarAntesDeEstaBien }, { [codigo]: porCodigo }),
    guardado: real.estaBienDelAceite,
  });
  const cantidad = campo(raiz);
  await leerConElLector(cantidad, codigo);
  assert.equal(buscador(raiz).value, codigo, "en el buscador");
  assert.equal(listados(pedidos).at(-1).params.lectura, "1");
  assert.deepEqual(nombres(raiz), [porCodigo.items[0].nombre]);
  assert.equal(pedidos.filter((p) => p.metodo === "PUT").length, 0, "la ráfaga no se guardó como cantidad");
  await act(async () => root.unmount());
});

test("2 · un escaneo nuevo reemplaza el anterior", async () => {
  const porCodigo = real.listaPorCodigo;
  const codigo = porCodigo.items[0].codigoBarra;
  const sinProducto = real.listaCodigoSinProducto;
  const otro = sinProducto.lecturaControl.codigoSinProducto;
  const { raiz, root, pedidos } = await montar({
    lista: listadoReal({ todos: real.listaSinContarAntesDeEstaBien }, { [codigo]: porCodigo, [otro]: sinProducto }),
    guardado: real.estaBienDelAceite,
  });
  await leerConElLector(buscador(raiz), otro);
  await leerConElLector(buscador(raiz), codigo);
  assert.equal(listados(pedidos).at(-1).params.q, codigo);
  assert.deepEqual(nombres(raiz), [porCodigo.items[0].nombre]);
  assert.doesNotMatch(texto(raiz), /No hay ningún producto con el código/);
  await act(async () => root.unmount());
});

test("3 · escribir un nombre en el buscador pide la búsqueda de la caja y la muestra en su orden", async () => {
  const porTexto = real.listaPorTexto;
  const { raiz, root, pedidos } = await montar({
    lista: listadoReal({ todos: real.listaSinContarAntesDeEstaBien }, { coco: porTexto }),
    guardado: real.estaBienDelAceite,
  });
  await escribir(buscador(raiz), "coco");
  await act(async () => {
    await esperar(400);
  });
  const ultimo = listados(pedidos).at(-1).params;
  assert.equal(ultimo.q, "coco");
  assert.equal(ultimo.lectura, undefined, "tecleado no es lectura");
  assert.deepEqual(nombres(raiz), ["Coco rallado", "Bizcochos de coco"], "el orden de la caja: primero lo que empieza con lo buscado");
  await act(async () => root.unmount());
});
