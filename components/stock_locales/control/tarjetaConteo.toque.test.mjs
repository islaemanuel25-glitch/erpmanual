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
const { AccionDePaginaProvider, useAccionDelShell } = await import("@/app/context/AccionDePaginaContext.jsx");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime.js");

const real = JSON.parse(readFileSync("components/stock_locales/control/lecturaReal.fixture.json", "utf8"));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * El servidor: cada pedido de la pantalla contesta con una respuesta real.
 * `lista` es una respuesta, o una función de los parámetros del listado.
 */
function servidor({ lista, guardado, terminar = real.terminar, terminado = null, informe = real.diferenciasAbierto }) {
  const pedidos = [];
  globalThis.fetch = async (url, opciones = {}) => {
    const u = new URL(url, "http://localhost");
    const metodo = opciones.method || "GET";
    pedidos.push({ ruta: u.pathname, metodo, params: Object.fromEntries(u.searchParams), cuerpo: opciones.body ? JSON.parse(opciones.body) : null });
    let datos = { ok: true, items: [] };
    if (u.pathname === "/api/stock_locales/control") datos = real.abierto;
    else if (u.pathname === "/api/stock_locales/listar") datos = typeof lista === "function" ? lista(u.searchParams) : lista;
    else if (u.pathname === "/api/stock_locales/control/conteos" && metodo === "PUT") datos = guardado;
    else if (u.pathname === "/api/stock_locales/control/diferencias") datos = informe;
    else if (u.pathname === "/api/stock_locales/control/terminar" && metodo === "GET") datos = terminar;
    else if (u.pathname === "/api/stock_locales/control/terminar" && metodo === "POST") datos = terminado ?? { ok: true, controlId: informe.control.id };
    else if (u.pathname === "/api/stock_locales/control/revision") datos = { ok: true, productos: [], aCorregir: 0 };
    return { ok: true, status: 200, json: async () => datos };
  };
  return pedidos;
}

const listados = (pedidos) => pedidos.filter((p) => p.ruta === "/api/stock_locales/listar");

// Estable, como el `useCallback` de OperadorContext: una función nueva en cada
// render rehace `pedir` y el estado se vuelve a pedir sin fin.
const requerirOperador = () => {};

function Pantalla({ puedeGestionar = false }) {
  const c = useControlStock({ puedeGestionar, requerirOperador });
  return React.createElement(PantallaControlStock, { c, puedeGestionar });
}

// La fila del shell, como la dibuja `LayoutBase`: lo que la pantalla registró
// con `useAccionDePagina`, en un lugar aparte del contenido.
function FilaDelShell() {
  return React.createElement("div", { "data-fila-shell": "" }, useAccionDelShell());
}

// El router de Next montado, como en la app: `SunmiBackButton` lo pide aunque
// vuelva con `onVolver`.
const router = { push: () => {}, back: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} };
function ConShell(props) {
  return React.createElement(
    AppRouterContext.Provider,
    { value: router },
    React.createElement(AccionDePaginaProvider, null, React.createElement(FilaDelShell), React.createElement(Pantalla, props))
  );
}

// Lo montado se desmonta SIEMPRE, también cuando un caso falla: una pantalla
// que queda viva con sus esperas deja el proceso colgado y el rojo no se ve.
let montadas = [];
afterEach(async () => {
  for (const r of montadas) await act(async () => r.unmount());
  montadas = [];
});

/** Monta la pantalla y espera la lista (el buscador filtra a los 300 ms). */
async function montar(respuestas, { puedeGestionar = false } = {}) {
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
    root.render(React.createElement(ConShell, { puedeGestionar }));
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
  assert.match(texto(fila(raiz)), /Sistema 3 · Contado 3 · Coincide/);
  assert.equal(fila(raiz).dataset.filaConteo, "contado");
  assert.equal(texto(chip(raiz, "Contados")), `Contados${real.estaBienDelAceite.resumen.contados}`, "y sube Contados");
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

test("volver a contar con el MISMO número: tocar el campo muestra Aceptar, y aceptarlo se manda (es un recuento)", async () => {
  const { raiz, root, pedidos } = await montar({ lista: real.listaAntesDelRecuento, guardado: real.recuentoIgualDeLaCoca });
  const coca = real.listaAntesDelRecuento.items[0];
  assert.equal(coca.conteo?.total, 7, "arranca contada en 7");
  assert.equal(boton(raiz, "Aceptar") === null, true, "contada y sin tocar: no hay Aceptar");
  await tocarCampo(campo(raiz));
  await escribir(campo(raiz), "");
  await escribir(campo(raiz), "7");
  const aceptar = boton(raiz, "Aceptar");
  assert.ok(aceptar, "tocado y con el mismo número: Aceptar, porque es volver a contarlo");
  await tocarBoton(aceptar);
  assert.deepEqual(pedidos.filter((p) => p.metodo === "PUT").map((p) => p.cuerpo), [{ productoLocalId: coca.id, total: 7 }], "se manda aunque sea igual");
  assert.equal(boton(raiz, "Aceptar") === null, true, "aceptado, el botón se va");
  assert.match(texto(fila(raiz)), /Sistema 5 · Contado 7 · Sobran 2 un/);
  await act(async () => root.unmount());

  // Y con Enter, lo mismo.
  const otra = await montar({ lista: real.listaAntesDelRecuento, guardado: real.recuentoIgualDeLaCoca });
  await tocarCampo(campo(otra.raiz));
  await act(async () => {
    campo(otra.raiz).dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await esperar(0);
  });
  await act(async () => {
    await esperar(0);
  });
  assert.deepEqual(otra.pedidos.filter((p) => p.metodo === "PUT").map((p) => p.cuerpo.total), [7], "Enter sobre un contado lo vuelve a contar");
  await act(async () => otra.root.unmount());
});

test("2 · Enter es Aceptar; salir del campo NO guarda", async () => {
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
  assert.equal(pedidos.filter((p) => p.metodo === "PUT").length, 0, "salir del campo no guarda");
  assert.equal(texto(rotulo(raiz)), "Contado", "queda escrito, sin aceptar");
  assert.ok(boton(raiz, "Aceptar"), "con Aceptar a la vista");
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
  assert.equal(texto(chip(raiz, "Sin contar")), `Sin contar${quedan}`, "los chips ya cambiaron");
  assert.equal(texto(chip(raiz, "Contados")), `Contados${contados}`);
  assert.match(texto(raiz), new RegExp(`${contados} / ${real.estaBienDelAceite.resumen.total} contados\\s*${quedan} sin contar`), "y la cabecera");

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
  // Vaciar lo contado se acepta como todo lo demás: con Aceptar.
  await tocarBoton(boton(raiz, "Aceptar"));
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
  await tocarChip(raiz, "Todos");
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

// ── LA PANTALLA LIMPIA, COMO RECIBIR UNA TRANSFERENCIA ────────────────────

const sinContarReal = () => listadoReal({ todos: real.listaSinContarAntesDeEstaBien, sin_contar: real.listaSinContarAntesDeEstaBien });

test("arriba: sin título repetido; la cabecera de recibir transferencia con 'Abierto', el local, contados y sin contar", async () => {
  const { raiz } = await montar({ lista: sinContarReal(), guardado: real.estaBienDelAceite });
  const t = texto(raiz);
  assert.doesNotMatch(t, /STOCK · CONTROL/, "sin la etiqueta propia");
  assert.equal((t.match(/Control de stock/g) || []).length, 1, "el título lo pone el shell; la tarjeta lo dice una vez");
  const cabecera = raiz.querySelector("section > div");
  const n = real.listaSinContarAntesDeEstaBien.resumenControl;
  // `textContent` pega los bloques sin espacio: cada parte se mira por separado.
  assert.match(texto(cabecera), new RegExp(`^Control de stock\\s*Abierto\\s*${real.abierto.local.nombre} · desde [a-záéíóú]+ \\d\\d/\\d\\d\\s*${n.contados} / ${n.total} contados\\s*${n.sinContar} sin contar$`));
  const sinContar = [...cabecera.querySelectorAll("span")].find((s) => s.textContent === `${n.sinContar} sin contar`);
  assert.ok(sinContar.className.includes("sunmi-text-accent"), "en el color de '4 pendientes'");
  assert.equal([...cabecera.querySelectorAll("span")].some((s) => s.textContent === "Abierto" && s.className.includes("sunmi-state-warning-soft")), true, "el chip de 'Recibiendo'");
  assert.doesNotMatch(raiz.innerHTML, /role="progressbar"|contados de/, "sin la tarjeta del número grande y la barra");
  assert.equal(raiz.querySelector("button[aria-label='Más acciones']") === null, true, "sin gestionar no hay ⋯");
});

test("el buscador y los filtros de transferencias: 2 filas de 2, Sin contar de entrada, y Categoría · Todas", async () => {
  const { raiz, pedidos } = await montar({ lista: sinContarReal(), guardado: real.estaBienDelAceite });
  assert.equal(buscador(raiz).getAttribute("placeholder"), "Buscar producto, código o categoría...");
  const filtros = [...raiz.querySelectorAll("[role='group'] button")];
  const n = real.listaSinContarAntesDeEstaBien.resumenControl;
  assert.deepEqual(filtros.map(texto), [`Sin contar${n.sinContar}`, `Con diferencia${n.conDiferencia}`, `Contados${n.contados}`, `Todos${n.total}`]);
  assert.match(raiz.querySelector("[role='group']").className, /grid-cols-2/, "dos filas de dos");
  assert.equal(filtros[0].getAttribute("aria-pressed"), "true", "de entrada, Sin contar");
  assert.equal(listados(pedidos)[0].params.control, "sin_contar");
  assert.match(texto(raiz), new RegExp(`Categoría\\s*Todas · ${n.total}`));
  assert.doesNotMatch(texto(raiz), /Más filtros|Limpiar/, "sin los filtros de Stock Locales");
});

test("quien gestiona sin PIN: '⋯' abre 'Ver diferencias', y 'Terminar control' va adentro de la cabecera, sin barra fija", async () => {
  const { raiz, pedidos } = await montar({ lista: sinContarReal(), guardado: real.estaBienDelAceite }, { puedeGestionar: true });
  assert.equal(raiz.querySelector(".sticky, .fixed, [class*='sticky'], [class*='fixed']") === null, true, "nada pegado ni fijo en la pantalla");
  const cabecera = raiz.querySelector("section > div");
  const terminar = [...cabecera.querySelectorAll("button")].find((b) => b.textContent.trim() === "Terminar control");
  assert.ok(terminar, "en la tarjeta de cabecera");
  assert.ok(terminar.className.split(/\s+/).includes("w-full"), "a todo el ancho de la tarjeta");
  assert.equal(cabecera.lastElementChild === terminar, true, "debajo de la fila de contados");
  assert.equal([...raiz.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Terminar control").length, 1, "uno solo");
  await tocarBoton(raiz.querySelector("button[aria-label='Más acciones']"));
  const ver = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Ver diferencias");
  assert.ok(ver, "la hoja de ⋯ con Ver diferencias");
  await tocarBoton(ver);
  await act(async () => {
    await esperar(0);
  });
  assert.ok(pedidos.some((p) => p.ruta === "/api/stock_locales/control/diferencias"), "abre el informe");
  assert.match(texto(cabeceraDeDiferencias(raiz)), /^Diferencias\s*Abierto/);
});

// ── LAS DIFERENCIAS: LA CABECERA DEL CONTROL Y LOS MONTOS EN SU RENGLÓN ────

/** La tarjeta de cabecera de las diferencias: la que abre con "Diferencias". */
const cabeceraDeDiferencias = (raiz) =>
  [...raiz.querySelectorAll("div")].find((d) => d.firstElementChild?.firstElementChild?.firstElementChild?.textContent === "Diferencias") ?? null;

/** Del control a las diferencias, por el '⋯', como lo hace quien gestiona. */
async function abrirDiferencias(respuestas) {
  const montada = await montar({ lista: sinContarReal(), guardado: real.estaBienDelAceite, ...respuestas }, { puedeGestionar: true });
  await tocarBoton(montada.raiz.querySelector("button[aria-label='Más acciones']"));
  await tocarBoton([...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Ver diferencias"));
  await act(async () => {
    await esperar(0);
  });
  return montada;
}

test("diferencias: sin segundo título, la tarjeta de cabecera del control con 'Abierto', y Volver en la fila del shell", async () => {
  const { raiz } = await abrirDiferencias({});
  assert.doesNotMatch(texto(raiz), /CONTROL DE STOCK · DIFERENCIAS|Diferencias del control|‹/, "el shell ya dice Control de stock");
  const cabecera = cabeceraDeDiferencias(raiz);
  assert.ok(cabecera, "la tarjeta de cabecera");
  assert.match(cabecera.className, /p-3 space-y-1/, "la misma tarjeta que la del control");
  assert.match(texto(cabecera), /^Diferencias\s*Abierto\s*Volver\s*Mini el 7 · desde [a-záéíóú]+ \d\d\/\d\d$/);
  const chip = cabecera.querySelector("span.rounded-full");
  assert.equal(chip?.textContent, "Abierto");
  assert.match(chip.className, /sunmi-state-warning-soft sunmi-text-accent/, "el chip de Recibiendo");
  const volver = [...raiz.querySelectorAll("[data-fila-shell] button")].find((b) => b.textContent.trim() === "Volver");
  assert.ok(volver, "Volver registrado en la fila del shell, como en recibir una transferencia");
  await tocarBoton(volver);
  await act(async () => {
    await esperar(0);
  });
  assert.equal(cabeceraDeDiferencias(raiz) === null, true, "vuelve al control");
  assert.match(texto(raiz), /Control de stock\s*Abierto/);
  assert.equal(raiz.querySelector("[data-fila-shell] button") === null, true, "y la fila del shell queda sin Volver");
});

test("diferencias de un terminado: el chip dice 'Terminado', con el de Recibida", async () => {
  const { raiz } = await abrirDiferencias({ informe: real.diferenciasCongeladas });
  const chip = cabeceraDeDiferencias(raiz).querySelector("span.rounded-full");
  assert.equal(chip?.textContent, "Terminado");
  assert.match(chip.className, /sunmi-state-success sunmi-text-success/);
});

test("$424.391,68 y $1.118.415,05: cada uno en su renglón, rótulo a la izquierda, sin cortarse, y debajo cuántos", async () => {
  const informe = { ...real.diferenciasAbierto, totales: { ...real.diferenciasAbierto.totales, faltante: 424391.68, sobrante: 1118415.05 } };
  const { raiz } = await abrirDiferencias({ informe });
  const monto = (m) => [...raiz.querySelectorAll("div")].find((d) => d.textContent === m && d.children.length === 0) ?? null;
  const faltante = monto("$424.391,68");
  const sobrante = monto("$1.118.415,05");
  assert.ok(faltante && sobrante, "los dos montos");
  const renglonF = faltante.parentElement;
  const renglonS = sobrante.parentElement;
  assert.equal(renglonF !== renglonS && !renglonF.contains(renglonS) && !renglonS.contains(renglonF), true, "cada uno en su renglón");
  assert.equal(renglonF.parentElement === renglonS.parentElement, true, "uno debajo del otro, hermanos");
  assert.equal(renglonF.nextElementSibling === renglonS, true, "Faltante arriba, Sobrante abajo");
  assert.match(renglonF.parentElement.className, /space-y-1/, "apilados, no en columnas");
  assert.doesNotMatch(renglonF.parentElement.className, /grid|cols/, "nada de dos columnas");
  assert.equal(renglonF.firstElementChild.textContent, "Faltante");
  assert.equal(renglonS.firstElementChild.textContent, "Sobrante");
  assert.equal(renglonF.lastElementChild === faltante && renglonS.lastElementChild === sobrante, true, "el monto a la derecha");
  for (const [m, color] of [[faltante, "sunmi-text-danger"], [sobrante, "sunmi-text-warning"]]) {
    const clases = m.className.split(/\s+/);
    assert.ok(clases.includes(color), color);
    assert.ok(clases.includes("min-w-0") && clases.includes("break-words"), "puede encogerse y bajar, nunca salirse");
    assert.equal(clases.some((c) => /truncate|ellipsis|whitespace-nowrap|overflow-hidden/.test(c)), false, "nunca con puntos suspensivos");
    assert.ok(m.parentElement.className.split(/\s+/).includes("flex-wrap"), "si no entra al lado del rótulo, baja de renglón");
  }
  const cuantos = renglonF.parentElement.nextElementSibling;
  assert.equal(cuantos?.textContent, `${informe.totales.productos} productos con diferencia`, "debajo de los dos");
});

test("sin gestionar no hay Terminar ni barra", async () => {
  const { raiz } = await montar({ lista: sinContarReal(), guardado: real.estaBienDelAceite });
  assert.equal(raiz.querySelector(".sticky.bottom-0") === null, true);
  assert.doesNotMatch(texto(raiz), /Terminar control/);
});

// ── TERMINAR PREGUNTA QUÉ HACER CON LO NO CONTADO ─────────────────────────

const botonDe = (txt) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === txt) ?? null;

/** Tocar "Terminar control" en la cabecera y después en la vista de terminar. */
async function abrirConfirmacion(raiz) {
  await tocarBoton([...raiz.querySelector("section > div").querySelectorAll("button")].find((b) => b.textContent.trim() === "Terminar control"));
  await act(async () => {
    await esperar(0);
  });
  await tocarBoton(botonDe("Terminar control"));
}

test("con no contados con stock, la confirmación dice cuántos y ofrece los tres botones", async () => {
  const t = real.terminarAntesDeComoEstaban;
  const { raiz } = await montar({ lista: sinContarReal(), guardado: real.estaBienDelAceite, terminar: t }, { puedeGestionar: true });
  await abrirConfirmacion(raiz);
  const sinContar = t.aCero.length + t.vendidos.length;
  assert.match(texto(document.body), new RegExp(`Quedaron ${sinContar} productos sin contar con stock distinto de 0`));
  assert.match(texto(document.body), /Los vendidos durante el control no se tocan/);
  assert.ok(botonDe(`Poner ${t.aCero.length} en 0 y terminar`));
  assert.ok(botonDe("Dejarlos como están y terminar"));
  assert.ok(botonDe("Cancelar"));
  await tocarBoton(botonDe("Cancelar"));
  assert.equal(botonDe("Dejarlos como están y terminar") === null, true, "Cancelar cierra sin terminar");
});

test("'Dejarlos como están y terminar' manda la elección, y el informe dice cuántos quedaron como estaban", async () => {
  const t = real.terminarAntesDeComoEstaban;
  const informe = real.diferenciasComoEstaban;
  const { raiz, pedidos } = await montar(
    { lista: sinContarReal(), guardado: real.estaBienDelAceite, terminar: t, informe, terminado: { ok: true, controlId: informe.control.id, puestosEnCero: 0, decision: "COMO_ESTABAN" } },
    { puedeGestionar: true }
  );
  await abrirConfirmacion(raiz);
  await tocarBoton(botonDe("Dejarlos como están y terminar"));
  await act(async () => {
    await esperar(0);
  });
  const post = pedidos.find((p) => p.ruta === "/api/stock_locales/control/terminar" && p.metodo === "POST");
  assert.equal(post?.cuerpo?.decision, "COMO_ESTABAN");
  assert.match(texto(cabeceraDeDiferencias(raiz)), /^Diferencias\s*Terminado/);
  assert.match(texto(raiz), new RegExp(`${informe.control.noContadosComoEstaban} productos no se contaron y quedaron como estaban`));
});

test("'Poner n en 0 y terminar' manda EN_CERO, y el informe no trae el aviso", async () => {
  const t = real.terminarAntesDeComoEstaban;
  const informe = real.diferenciasCongeladas;
  const { raiz, pedidos } = await montar({ lista: sinContarReal(), guardado: real.estaBienDelAceite, terminar: t, informe }, { puedeGestionar: true });
  await abrirConfirmacion(raiz);
  await tocarBoton(botonDe(`Poner ${t.aCero.length} en 0 y terminar`));
  await act(async () => {
    await esperar(0);
  });
  assert.equal(pedidos.find((p) => p.metodo === "POST" && p.ruta.endsWith("/terminar"))?.cuerpo?.decision, "EN_CERO");
  assert.doesNotMatch(texto(raiz), /quedaron como estaban/);
});

test("sin no contados con stock, la confirmación es la de siempre: Terminar y Cancelar", async () => {
  const nada = { ...real.terminar, vendidos: [], aCero: [] };
  const { raiz, pedidos } = await montar({ lista: sinContarReal(), guardado: real.estaBienDelAceite, terminar: nada }, { puedeGestionar: true });
  await abrirConfirmacion(raiz);
  assert.ok(botonDe("Terminar"));
  assert.ok(botonDe("Cancelar"));
  assert.equal(botonDe("Dejarlos como están y terminar") === null, true);
  await tocarBoton(botonDe("Terminar"));
  await act(async () => {
    await esperar(0);
  });
  assert.equal(pedidos.find((p) => p.metodo === "POST" && p.ruta.endsWith("/terminar"))?.cuerpo?.decision, "EN_CERO");
});

// ── NADA SE GUARDA SOLO ────────────────────────────────────────────────────

const puts = (pedidos) => pedidos.filter((p) => p.metodo === "PUT");

test("tocar − o + y esperar no guarda: queda con Aceptar", async () => {
  const { raiz, pedidos } = await montar({ lista: real.listaAntesDelQueso, guardado: real.guardadoDelQueso });
  await tocarBoton(fila(raiz).querySelector("button[aria-label^='Sumar']"));
  await act(async () => {
    await esperar(2000);
  });
  assert.equal(puts(pedidos).length, 0, "ni a los 2 s");
  assert.ok(boton(raiz, "Aceptar"));
});

test("escanear el próximo no guarda lo escrito: la tarjeta queda arriba con su Aceptar y no sale de Sin contar", async () => {
  const porCodigo = real.listaPorCodigo;
  const codigo = porCodigo.items[0].codigoBarra;
  const { raiz, pedidos } = await montar({ lista: listadoReal({ todos: real.listaSinContarAntesDeEstaBien }, { [codigo]: porCodigo }), guardado: real.estaBienDelAceite });
  const aceite = real.listaSinContarAntesDeEstaBien.items[0];
  await tocarCampo(campo(raiz));
  await escribir(campo(raiz), "7");
  // El lector, con el foco en esa cantidad: el código va al buscador.
  await leerConElLector(campo(raiz), codigo);
  assert.equal(puts(pedidos).length, 0, "nada guardado");
  assert.deepEqual(nombres(raiz), [aceite.nombre, porCodigo.items[0].nombre], "la escrita sigue a la vista, arriba");
  const escrita = tarjetaDe(raiz, aceite.id);
  assert.equal(escrita.querySelector("input").value, "7", "con lo escrito");
  assert.ok([...escrita.querySelectorAll("button")].some((b) => b.textContent.trim() === "Aceptar"));
  // Y Aceptar la guarda.
  await tocarBoton([...escrita.querySelectorAll("button")].find((b) => b.textContent.trim() === "Aceptar"));
  assert.deepEqual(puts(pedidos).map((p) => p.cuerpo), [{ productoLocalId: aceite.id, total: 7 }]);
});

test("buscar otro producto tampoco pierde lo escrito", async () => {
  const { raiz, pedidos } = await montar({ lista: listadoReal({ todos: real.listaSinContarAntesDeEstaBien }, { coco: real.listaPorTexto }), guardado: real.estaBienDelAceite });
  const aceite = real.listaSinContarAntesDeEstaBien.items[0];
  await escribir(campo(raiz), "7");
  await escribir(buscador(raiz), "coco");
  await act(async () => {
    await esperar(400);
  });
  assert.deepEqual(nombres(raiz), [aceite.nombre, "Coco rallado", "Bizcochos de coco"]);
  assert.equal(tarjetaDe(raiz, aceite.id).querySelector("input").value, "7");
  assert.equal(puts(pedidos).length, 0);
});

// ── SALIR CON CANTIDADES SIN ACEPTAR ──────────────────────────────────────

test("con cantidades sin aceptar, ir a otro módulo avisa: Quedarme se queda, Salir igual deja pasar", async () => {
  const { raiz } = await montar({ lista: sinContarReal(), guardado: real.estaBienDelAceite });
  await escribir(campo(raiz), "7");
  const enlace = document.createElement("a");
  enlace.href = "/modulos/stock_locales";
  enlace.textContent = "Stock";
  document.body.appendChild(enlace);
  const tocarEnlace = async () => {
    const ev = new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    await act(async () => {
      enlace.dispatchEvent(ev);
    });
    return ev.defaultPrevented;
  };
  assert.equal(await tocarEnlace(), true, "el enlace no navega");
  assert.match(texto(document.body), /Tenés 1 cantidad sin aceptar/);
  await tocarBoton([...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Quedarme"));
  assert.doesNotMatch(texto(document.body), /Tenés 1 cantidad sin aceptar/, "Quedarme cierra el aviso");
  assert.equal(tarjetaDe(raiz, real.listaSinContarAntesDeEstaBien.items[0].id).querySelector("input").value, "7", "y lo escrito sigue");
  assert.equal(await tocarEnlace(), true, "vuelve a avisar");
  await tocarBoton([...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Salir igual"));
  assert.equal(await tocarEnlace(), false, "Salir igual deja pasar");
});

test("con cantidades sin aceptar, recargar pide el aviso del navegador; sin nada, no", async () => {
  const { raiz } = await montar({ lista: sinContarReal(), guardado: real.estaBienDelAceite });
  const recargar = () => {
    const ev = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    return ev.defaultPrevented;
  };
  assert.equal(recargar(), false, "sin nada escrito, no avisa");
  await escribir(campo(raiz), "7");
  assert.equal(recargar(), true, "con algo sin aceptar, avisa");
  await escribir(campo(raiz), "");
  assert.equal(recargar(), false, "borrado lo escrito, deja de avisar");
});
