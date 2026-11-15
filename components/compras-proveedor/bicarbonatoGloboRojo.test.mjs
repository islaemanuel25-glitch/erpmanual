// CANDADO: SI UNA SOLA LECTURA CIERRA CON EL IMPORTE DEL PAPEL, ÉSA VIENE CARGADA.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/bicarbonatoGloboRojo.test.mjs
//
// ── EL CASO (Globo Rojo, papel del 13/11/2026) ────────────────────────────
//
//   BICARBONATO    200 × $265,33 = $53.065,60
//
// El renglón quedó vinculado a un producto que no estaba en el pedido, así que
// la fila no trae el bulto de la ficha. La lectura del precio dice "por
// unidad" y deja 2 —bultos de 100—, y la hoja los ofrecía como 2 unidades:
// "Pediste 0 · la factura dice 2 · el papel dice 200 u", Bultos en 2, y abajo
// el aviso "Tendrían que ser 200". Si nadie lo leía, entraban 2 en vez de 200.
//
// La fila sale por el camino de la pantalla —`analizarPrecioDeLinea` y
// `filasDeConciliacion`—, con el renglón con las columnas de `ComprobanteLinea`
// (`netoUnitario`, `subtotalImpreso`). El producto es un bulto de 100 a
// $26.000: con él, la hoja dibujaba exactamente el texto de la pantalla del
// local (RG0). La hoja se monta en un DOM (jsdom) para que corra el efecto que
// carga el campo al abrir.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
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
const { default: HojaCorregirLinea } = await import("@/components/compras-proveedor/HojaCorregirLinea.jsx");
const { analizarPrecioDeLinea } = await import("@/lib/compras-proveedor/comprobante/precioDeLinea");
const { filasDeConciliacion } = await import("@/lib/compras-proveedor/comprobante/filasDeConciliacion");
const { laCantidadQueCierraConElPapel } = await import("@/lib/compras-proveedor/laCantidadCuadraConElPrecio");
const { cuantoEntroAlAbrir, unidadesFisicasDeLaFactura } = await import("@/lib/compras-proveedor/estadoDeLineaFacturada");

const BICARBONATO = { precio_costo: 26000, factor_pack: 100, unidad_medida: "pack", modoCompraProveedor: "BULTO" };

/** El renglón del papel, vinculado y sin línea del pedido. */
function fila({ cantidad = 200, netoUnitario = 265.33, subtotalImpreso = 53065.6 } = {}) {
  const linea = {
    orden: 1,
    textoCrudo: "BICARBONATO",
    cantidad,
    netoUnitario,
    subtotalImpreso,
    costoFinalRenglon: subtotalImpreso,
    enQueViene: null,
  };
  const precio = analizarPrecioDeLinea({ linea, producto: BICARBONATO, proveedor: { nombre: "Globo Rojo" } });
  const [f] = filasDeConciliacion({
    comprobantes: [{
      id: 80,
      estado: "CARGADO",
      lineas: [{ ...linea, id: 800, pedidoDetalleId: null, pedidoDetalle: null, productoLocalId: 1, productoBaseId: 900, precio, unidad: precio.unidad, decisionPrecio: null, costoMaestroCatalogo: BICARBONATO.precio_costo }],
    }],
    detalles: [],
  }).grupos[0].filas;
  return { ...f, variacionNormalPct: 10 };
}

let raiz;
let contenedor;
beforeEach(async () => {
  if (raiz) await act(async () => raiz.unmount());
  contenedor?.remove();
  document.body.innerHTML = "";
  contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

/** Abre la hoja y devuelve lo que dibujó, con el efecto del abrir ya corrido. */
async function abrir(f) {
  await act(async () => raiz.render(React.createElement(HojaCorregirLinea, { fila: f, abierta: true, onCerrar() {}, onGuardar() {} })));
  const texto = document.body.textContent.replace(/\s+/g, " ");
  const campos = [...document.querySelectorAll("input")].map((i) => i.value);
  return { texto, campos };
}

// ══════════════════════════════════════════════════════════════════════════

test("RG0. la fila es la del local: la factura dice 2, el papel 200 u y no hay bulto en la fila", () => {
  const f = fila();
  assert.equal(f.factorPack, null, "sin línea del pedido no hay bulto en la fila");
  assert.equal(f.cantidadPedida, null);
  assert.equal(f.netoUnitario, 265.33);
  assert.equal(unidadesFisicasDeLaFactura(f), 2, "la lectura deja 2 bultos de 100 y la fila los cuenta como 2 unidades");
  // Lo que traía el campo antes del arreglo.
  assert.deepEqual(cuantoEntroAlAbrir(f), { completos: 2, sueltas: 0 });
});

test("RG1. 200 × $265,33 = $53.065,60: la única que cierra es 200, y ésa viene cargada", () => {
  const f = fila();
  assert.equal(laCantidadQueCierraConElPapel({ fila: f, ofrecidas: 2 }), 200);
  assert.deepEqual(cuantoEntroAlAbrir(f, { unidadesQueCierran: 200 }), { completos: 200, sueltas: 0 });
});

test("RG2. la hoja abre con 200, «Entra al stock 200 unidades» y sin el aviso de «no cuadra»", async () => {
  const { texto, campos } = await abrir(fila());
  assert.match(texto, /Pediste 0 · la factura dice 2 · el papel dice 200 u/, "la frase de la tarjeta no se toca");
  assert.ok(campos.includes("200"), `el campo no vino con 200: ${JSON.stringify(campos)}`);
  assert.ok(!campos.includes("2"), "quedó cargado el 2");
  assert.match(texto, /Entra al stock\s*200 unidades/);
  assert.doesNotMatch(texto, /no cuadra con el precio del papel/);
});

test("RG3. si ninguna lectura cierra —el importe leído no es 200 × $265,33—, todo como hoy: 2 y el aviso", async () => {
  const f = fila({ subtotalImpreso: 60000 });
  assert.equal(laCantidadQueCierraConElPapel({ fila: f, ofrecidas: 2 }), null);
  const { texto, campos } = await abrir(f);
  assert.ok(campos.includes("2"), `el campo no vino con lo de la factura: ${JSON.stringify(campos)}`);
  assert.match(texto, /Entra al stock\s*2 unidades/);
  assert.match(texto, /La cantidad no cuadra con el precio del papel: \$300,00 por unidad daría \$600,00 y el papel cobra \$60\.000,00\. Tendrían que ser 200\./);
});

test("RG4. si cierra más de una, todo como hoy", () => {
  // El pedido también tenía 200: son la misma cantidad, cierra una sola.
  const conPedido = { ...fila(), cantidadPedida: 200 };
  assert.equal(laCantidadQueCierraConElPapel({ fila: conPedido, ofrecidas: 2 }), 200);
  // La factura ofrecía 200 y el papel también: ya viene cargada, no hay nada que cambiar.
  assert.equal(laCantidadQueCierraConElPapel({ fila: fila(), ofrecidas: 200 }), null);
  // Dos cantidades distintas que cierran: el papel factura 2 bultos de 100 a
  // $26.532,80 y se pidieron 2 bultos. "2" cierra tal cual y las 200 unidades
  // de lo pedido cierran por bulto. Ninguna gana: queda lo de la factura.
  const dosQueCierran = { ...fila(), factorPack: 100, cantidad: 2, netoUnitario: 26532.8, cantidadPedida: 2, unidadPedido: "BULTO" };
  assert.equal(laCantidadQueCierraConElPapel({ fila: dosQueCierran, ofrecidas: 7 }), null);
  assert.equal(laCantidadQueCierraConElPapel({ fila: { ...dosQueCierran, cantidadPedida: null }, ofrecidas: 7 }), 2, "con una sola que cierra, ésa");
});

test("RG5. sin unitario impreso, o con el papel corregido a mano, no se elige nada", () => {
  assert.equal(laCantidadQueCierraConElPapel({ fila: { ...fila(), netoUnitario: null }, ofrecidas: 2 }), null);
  const corregida = fila();
  assert.equal(
    laCantidadQueCierraConElPapel({ fila: { ...corregida, correccionDelPapel: { ...corregida.correccionDelPapel, corregidoAMano: true } }, ofrecidas: 2 }),
    null
  );
});
