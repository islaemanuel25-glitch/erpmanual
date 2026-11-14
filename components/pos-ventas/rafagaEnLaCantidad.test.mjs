// CANDADO: EL LECTOR ESCRIBIENDO ADENTRO DE LA CANTIDAD NO CAMBIA LA LÍNEA.
//
//   node --import ./scripts/alias-loader.mjs --test components/pos-ventas/rafagaEnLaCantidad.test.mjs
//
// El defecto, en producción: con el cursor en la cantidad de un renglón del
// carrito, el lector escribía el código entero adentro de la cantidad y
// apretaba Enter. La línea quedaba con el código como cantidad.
//
// Se monta el buscador y el carrito DE VERDAD en un DOM (jsdom), con el reducer
// real del POS, y se teclea como lo hacen el lector y la persona: keydown, y si
// nadie lo frenó, la letra entra al campo con su `input`. El reloj es del
// candado, así los intervalos entre teclas son exactos. El servidor es `fetch`
// contestando con la forma de `construirItems` de
// `app/api/pos-ventas/buscar-producto/route.js`.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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
const { default: BuscadorProductos } = await import("@/components/pos-ventas/BuscadorProductos.jsx");
const { default: CarritoVenta } = await import("@/components/pos-ventas/CarritoVenta.jsx");
const { default: AvisoProductoNoEncontrado } = await import("@/components/pos-ventas/AvisoProductoNoEncontrado.jsx");
const { posVentaReducer, initialState, ActionTypes } = await import("@/app/modulos/pos-ventas/reducer/posVentaReducer.js");
const {
  MENSAJE_CURSOR_EN_CANTIDAD,
  MS_MAX_ENTRE_TECLAS_RAFAGA,
  LARGO_MIN_RAFAGA,
  seguirRafaga,
  esCampoFueraDelBuscador,
} = await import("@/lib/pos-ventas/lecturaEscaner.js");

const h = React.createElement;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const TEXTO_NO_ENCONTRADO = "Este código no corresponde a ningún producto";
const CODIGO = "7790895000997";

// La forma de un renglón de `construirItems`, producto por unidad, sin sueltos
// ni lista de precios.
const PRODUCTO = {
  productoBaseId: 11,
  productoLocalId: 501,
  nombre: "Gaseosa cola 1,5 L",
  codigoBarra: CODIGO,
  codigoBarraSecundario: "",
  codigoBarraPropio: "",
  precioVenta: 1500,
  precioVentaUnitario: 1500,
  precioVentaBulto: 1500,
  precioCosto: 900,
  precioCostoUnitario: 900,
  precioCostoBulto: 900,
  precioVentaFormatoDepositoReal: 1500,
  precioVentaUnitarioReal: 1500,
  precioCostoFormatoDepositoReal: 900,
  precioCostoUnitarioReal: 900,
  stock: 40,
  sinStock: false,
  allowNegativeStock: false,
  disponibleParaVenta: true,
  unidadMedida: "unidad",
  factorPack: 1,
  modoEnvio: null,
  modoSalidaDefault: "UNIDAD",
  esFiambreFijo: false,
  pesoReferenciaKg: undefined,
  aplicacionLista: null,
  sueltosPorUnidad: null,
  precioVentaSuelto: null,
  precioCostoSuelto: null,
};

// ── El reloj, el servidor y el teclado ──────────────────────────────────────
let reloj = 1_000_000;
const dateNowReal = Date.now;
let pedidos = [];

before(() => {
  Date.now = () => reloj;
  globalThis.fetch = async (url) => {
    const q = new URL(url, "http://localhost").searchParams.get("q");
    pedidos.push(q);
    const items = q === CODIGO ? [PRODUCTO] : [];
    return { ok: true, status: 200, json: async () => ({ ok: true, items }) };
  };
});
after(() => {
  Date.now = dateNowReal;
});

/** Escribe como el teclado: el setter nativo y un `input`, que es lo que lee React. */
function escribir(campo, valor) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(campo, valor);
  campo.dispatchEvent(new window.Event("input", { bubbles: true }));
}

/** Una tecla, `ms` después de la anterior. Si nadie frenó el keydown, la letra entra. */
async function teclear(campo, tecla, ms) {
  reloj += ms;
  await act(async () => {
    const pasa = campo.dispatchEvent(new window.KeyboardEvent("keydown", { key: tecla, bubbles: true, cancelable: true }));
    if (!pasa) return;
    if (tecla === "Backspace") escribir(campo, campo.value.slice(0, -1));
    else if (tecla.length === 1) escribir(campo, campo.value + tecla);
  });
}

/** El lector: cada carácter a 8 ms del anterior y el Enter a 8 ms del último. */
async function escanear(campo, codigo) {
  reloj += 2000;
  for (const c of codigo) await teclear(campo, c, 8);
  await teclear(campo, "Enter", 8);
  await act(async () => { await esperar(20); });
}

/** Una persona: 180 ms entre tecla y tecla. */
async function tipearAMano(campo, teclas) {
  for (const t of teclas) await teclear(campo, t, 180);
  await act(async () => { await esperar(20); });
}

async function enfocar(campo) {
  await act(async () => { campo.focus(); });
}

// ── La pantalla: buscador + carrito con el reducer del POS ─────────────────
let raiz;
let contenedor;
let estado;
let agregados;

function Pos() {
  const [state, dispatch] = React.useReducer(posVentaReducer, initialState);
  estado = state;
  const onAgregar = React.useCallback((p) => {
    agregados.push(p);
    dispatch({ type: ActionTypes.ADD_ITEM, payload: { producto: p } });
  }, []);
  return h(
    React.Fragment,
    null,
    h(BuscadorProductos, { localId: 1, onAgregar, avisarNoEncontrado: true, conSueltos: true }),
    h(CarritoVenta, {
      items: state.carrito,
      onCantidadChange: (idx, nuevaCantidad) => dispatch({ type: ActionTypes.UPDATE_CANTIDAD, payload: { idx, nuevaCantidad } }),
      onEliminar: () => {},
      onLimpiar: () => {},
      subtotal: 0,
    })
  );
}

const buscador = () => document.getElementById("buscar-producto");
const cantidad = () => document.querySelector('input[aria-label="Cantidad"]');
const avisoAbierto = () => document.querySelector("[data-codigo-leido]") !== null;
// Con `===` y no con `assert.equal`: al fallar, `assert.equal` arma el diff
// recorriendo los dos nodos de jsdom enteros y se queda sin memoria.
const enfocado = (el) => document.activeElement === el;
const textoDelAviso = () => document.querySelector("[data-sunmi-modal]")?.textContent ?? "";

/** Monta la pantalla con una línea de `cantidad` unidades, cargada como en el local. */
async function montarConUnaLinea(cant) {
  await escanear(buscador(), CODIGO);
  assert.equal(estado.carrito.length, 1, "el escaneo en el buscador no agregó");
  await enfocar(cantidad());
  await tipearAMano(cantidad(), ["Backspace", ...String(cant)]);
  assert.equal(estado.carrito[0].cantidad, cant);
  agregados = [];
  pedidos = [];
}

beforeEach(async () => {
  if (raiz) await act(async () => raiz.unmount());
  contenedor?.remove();
  document.body.innerHTML = "";
  contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  agregados = [];
  pedidos = [];
  raiz = createRoot(contenedor);
  await act(async () => raiz.render(h(Pos)));
});

// ══════════════════════════════════════════════════════════════════════════
// LA RÁFAGA EN LA CANTIDAD
// ══════════════════════════════════════════════════════════════════════════

test("RC1. una ráfaga del lector en la cantidad: la cantidad vuelve, no se agrega nada, sale el aviso y el foco va al buscador", async () => {
  await montarConUnaLinea(6);

  await enfocar(cantidad());
  await escanear(cantidad(), CODIGO);

  assert.equal(estado.carrito.length, 1, "apareció otra línea");
  assert.equal(estado.carrito[0].cantidad, 6, "la cantidad quedó con el código");
  assert.equal(cantidad().value, "6");
  assert.equal(agregados.length, 0, "se agregó un producto");
  assert.deepEqual(pedidos, [], "se buscó el código");
  assert.ok(avisoAbierto(), "no salió el aviso");
  assert.match(textoDelAviso(), new RegExp(MENSAJE_CURSOR_EN_CANTIDAD.replace(/\./g, "\\.")));
  assert.doesNotMatch(textoDelAviso(), new RegExp(TEXTO_NO_ENCONTRADO));
  assert.equal(document.querySelector("[data-codigo-leido]").textContent, CODIGO);
  assert.ok(enfocado(buscador()), "el foco no volvió al buscador");
});

test("RC2. después de «Entendido», el próximo escaneo entra al buscador y agrega", async () => {
  await montarConUnaLinea(6);
  await enfocar(cantidad());
  await escanear(cantidad(), CODIGO);

  const entendido = [...document.querySelectorAll("button")].find((b) => b.textContent === "Entendido");
  await act(async () => entendido.click());
  assert.equal(avisoAbierto(), false);
  assert.ok(enfocado(buscador()), "«Entendido» no devolvió el foco al buscador");

  await escanear(buscador(), CODIGO);
  assert.equal(agregados.length, 1, "el escaneo siguiente no agregó");
  assert.equal(estado.carrito[0].cantidad, 7);
  assert.ok(enfocado(buscador()), "después de agregar el foco no quedó en el buscador");
});

test("RC3. el texto es del aviso de la cantidad: cerrado, un código inexistente vuelve a decir lo de siempre", async () => {
  await montarConUnaLinea(6);
  await enfocar(cantidad());
  await escanear(cantidad(), CODIGO);
  const entendido = [...document.querySelectorAll("button")].find((b) => b.textContent === "Entendido");
  await act(async () => entendido.click());

  await escanear(buscador(), "1234567890");
  assert.ok(avisoAbierto());
  assert.match(textoDelAviso(), new RegExp(TEXTO_NO_ENCONTRADO));
  assert.doesNotMatch(textoDelAviso(), /El cursor estaba/);
});

// ══════════════════════════════════════════════════════════════════════════
// LA CANTIDAD A MANO SIGUE IGUAL
// ══════════════════════════════════════════════════════════════════════════

test("RC4. tipear la cantidad a mano —«6», «12»— y Enter sigue cambiándola, sin aviso", async () => {
  await escanear(buscador(), CODIGO);
  await enfocar(cantidad());
  await tipearAMano(cantidad(), ["Backspace", "6", "Enter"]);
  assert.equal(estado.carrito[0].cantidad, 6);
  await tipearAMano(cantidad(), ["Backspace", "1", "2", "Enter"]);
  assert.equal(estado.carrito[0].cantidad, 12);
  assert.equal(cantidad().value, "12");
  assert.equal(avisoAbierto(), false);
  assert.ok(enfocado(cantidad()), "tipear a mano le sacó el foco a la cantidad");
});

test("RC5. los botones + y − siguen sumando y restando", async () => {
  await montarConUnaLinea(12);
  const boton = (etiqueta) => document.querySelector(`button[aria-label="${etiqueta}"]`);
  await act(async () => boton("Sumar uno a Cantidad").click());
  assert.equal(estado.carrito[0].cantidad, 13);
  await act(async () => boton("Restar uno a Cantidad").click());
  await act(async () => boton("Restar uno a Cantidad").click());
  assert.equal(estado.carrito[0].cantidad, 11);
  assert.equal(avisoAbierto(), false);
});

// ══════════════════════════════════════════════════════════════════════════
// EL CRITERIO, EJERCIDO EN SUS BORDES
// ══════════════════════════════════════════════════════════════════════════

const correr = (teclas, ms, campo = "c", valor = "6") => {
  let rafaga = null;
  let t = 0;
  let escaneo = null;
  for (const tecla of teclas) {
    t += ms;
    ({ rafaga, escaneo } = seguirRafaga(rafaga, { tecla, ahora: t, campo, valorDelCampo: valor }));
  }
  return escaneo;
};

test("RC6. ráfaga = 6 o más caracteres a menos de 35 ms, y Enter también a menos de 35 ms", () => {
  assert.equal(MS_MAX_ENTRE_TECLAS_RAFAGA, 35);
  assert.equal(LARGO_MIN_RAFAGA, 6);
  assert.deepEqual(correr([..."123456", "Enter"], 34), { campo: "c", valorAntes: "6", codigo: "123456" });
  assert.equal(correr([..."12345", "Enter"], 10), null, "5 caracteres no es un escaneo");
  assert.equal(correr([..."123456", "Enter"], 35), null, "35 ms entre teclas ya es una persona");
  assert.equal(correr([..."12", "Enter"], 180), null);
  // Una pausa en el medio corta la ráfaga: lo de después empieza de cero.
  let rafaga = null;
  let escaneo = null;
  const pasos = [["1", 0], ["2", 10], ["3", 10], ["4", 200], ["5", 10], ["6", 10], ["Enter", 10]];
  let t = 0;
  for (const [tecla, ms] of pasos) {
    t += ms;
    ({ rafaga, escaneo } = seguirRafaga(rafaga, { tecla, ahora: t, campo: "c", valorDelCampo: "x" }));
  }
  assert.equal(escaneo, null);
  // El Shift de las mayúsculas no corta ni suma.
  assert.deepEqual(correr(["Shift", "A", "Shift", "B", ..."1234", "Enter"], 10)?.codigo, "AB1234");
});

test("RC7. solo un campo que no es el buscador cuenta como «fuera del buscador»", () => {
  const buscadorFalso = { tagName: "INPUT" };
  assert.equal(esCampoFueraDelBuscador({ tagName: "INPUT" }, buscadorFalso), true);
  assert.equal(esCampoFueraDelBuscador({ tagName: "TEXTAREA" }, buscadorFalso), true);
  assert.equal(esCampoFueraDelBuscador(buscadorFalso, buscadorFalso), false);
  assert.equal(esCampoFueraDelBuscador({ tagName: "BODY" }, buscadorFalso), false);
  assert.equal(esCampoFueraDelBuscador({ tagName: "BUTTON" }, buscadorFalso), false);
});

// ══════════════════════════════════════════════════════════════════════════
// EL AVISO ES EL MISMO, Y EL DE SIEMPRE NO CAMBIÓ
// ══════════════════════════════════════════════════════════════════════════

test("RC8. el aviso de la cantidad es el de «no encontrado» con un solo texto cambiado", async () => {
  // Con `document` presente el aviso va por portal, así que se monta en el DOM
  // y se lee lo que dibujó.
  const montar = async (props) => {
    const lugar = document.createElement("div");
    document.body.appendChild(lugar);
    const r = createRoot(lugar);
    await act(async () => r.render(h(AvisoProductoNoEncontrado, { codigos: [CODIGO], onEntendido: () => {}, ...props })));
    const html = document.querySelector("[data-sunmi-modal]").closest("body > *").outerHTML;
    await act(async () => r.unmount());
    lugar.remove();
    return html;
  };
  const deSiempre = await montar({});
  assert.match(deSiempre, new RegExp(`>${TEXTO_NO_ENCONTRADO}<`), "el aviso de código inexistente cambió");
  assert.equal(await montar({ mensaje: MENSAJE_CURSOR_EN_CANTIDAD }), deSiempre.replace(TEXTO_NO_ENCONTRADO, MENSAJE_CURSOR_EN_CANTIDAD));
  assert.equal(MENSAJE_CURSOR_EN_CANTIDAD, "El cursor estaba en la cantidad. Volvé a escanear el producto.");
});

test("RC9. el POS devuelve el foco al buscador al agregar desde el modal de peso y desde el de servicio", () => {
  const PANTALLA = fs
    .readFileSync(path.resolve(import.meta.dirname, "../../app/modulos/pos-ventas/page.jsx"), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(PANTALLA, /const volverAlBuscador = \(\) => document\.getElementById\("buscar-producto"\)\?\.focus\(\);/);
  const kg = PANTALLA.slice(PANTALLA.indexOf("<ModalPesoKg"), PANTALLA.indexOf("onCancelar", PANTALLA.indexOf("<ModalPesoKg")));
  assert.match(kg, /setProductoKgPendiente\(null\);\s*volverAlBuscador\(\);/, "el modal de peso no devuelve el foco");
  const servicio = PANTALLA.slice(PANTALLA.indexOf("const handleConfirmarServicio"), PANTALLA.indexOf("}, [state.carrito]);", PANTALLA.indexOf("const handleConfirmarServicio")));
  assert.match(servicio, /setServicioPendiente\(null\);\s*volverAlBuscador\(\);/, "el modal de servicio no devuelve el foco");
});
