// LIVERPOOL ROJO: LA DIFERENCIA CON LO PEDIDO NO ES UN ERROR DE CARGA, Y UN
// PAPEL MÁS BARATO NO ES UNA SUBA.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/liverpoolRojo.test.mjs
//
// Emanuel, 2026-11-04, en producción: pedido 25, factura 16 PACK x10, papel
// $11.600 el pack contra ERP $13.200. Dos defectos en la misma pantalla:
//
// 1. En "Cuánto entró" los dos campos —"Bultos de 10" y "Sueltas", el de
//    sueltas vacío incluido— salían con borde rojo, que se lee como un error de
//    carga. La diferencia con lo pedido se dice en el renglón "Pediste X · la
//    factura dice Y", en el color de advertencia del tema, y los campos quedan
//    con su borde normal.
// 2. El renglón ERP decía "+12,1 %" en verde sobre un papel 12,1 % más barato.
//    Ahora es la variación del papel respecto del ERP: "−12,1 %", verde.
//
// La hoja se MONTA en un DOM (jsdom) y no se dibuja con `renderToStaticMarkup`:
// los campos se llenan en un efecto al abrir, y sin efectos la cantidad queda
// vacía, no hay diferencia y el candado del borde no probaría nada.
//
// La fila se arma por el mismo camino que la conciliación —`analizarPrecioDeLinea`
// y `filasDeConciliacion`—, como en `picnicSaltoDePrecio.test.mjs`, y no a mano.

import { test } from "node:test";
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
const { renderToStaticMarkup } = await import("react-dom/server");
const { default: HojaCorregirLinea } = await import("./HojaCorregirLinea.jsx");
const { default: TarjetaLineaFactura } = await import("./TarjetaLineaFactura.jsx");
const { analizarPrecioDeLinea } = await import("@/lib/compras-proveedor/comprobante/precioDeLinea");
const { filasDeConciliacion } = await import("@/lib/compras-proveedor/comprobante/filasDeConciliacion");

const LIVERPOOL = { precio_costo: 13200, factor_pack: 10, unidad_medida: "pack", modoCompraProveedor: "BULTO" };

function liverpool({ pedidos = 25 } = {}) {
  const linea = {
    orden: 1, textoCrudo: "LIVERPOOL ROJO PACK X10", cantidad: 16, netoUnitario: 11600,
    subtotalImpreso: 16 * 11600, costoFinalRenglon: 16 * 11600, enQueViene: "bulto",
  };
  const precio = analizarPrecioDeLinea({ linea, producto: LIVERPOOL, proveedor: { nombre: "Distribuidora" } });
  const det = {
    id: 9101, cantidad: pedidos, precioCosto: 13200, unidad: "BULTO", productoBaseId: 601, factorPack: 10,
    costoMaestroHoy: 13200,
  };
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 71, estado: "CARGADO", lineas: [{ ...linea, id: 801, pedidoDetalleId: det.id, productoLocalId: 1, pedidoDetalle: det, precio, unidad: precio.unidad, costoMaestroCatalogo: 13200 }] }],
    detalles: [det],
  }).grupos[0].filas;
  return { ...f, costoMaestroHoy: 13200, variacionNormalPct: 10, producto: "LIVERPOOL ROJO" };
}

/** La hoja montada, con sus efectos corridos. Devuelve el HTML del documento. */
async function hojaMontada(fila) {
  const contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  const raiz = createRoot(contenedor);
  await act(async () => {
    raiz.render(React.createElement(HojaCorregirLinea, { fila, abierta: true, onCerrar() {}, onGuardar() {} }));
  });
  const html = document.body.innerHTML;
  await act(async () => raiz.unmount());
  document.body.innerHTML = "";
  return html;
}

/** El bloque "Cuánto entró", desde su título hasta la franja de "Entra al stock". */
const cuantoEntro = (html) => {
  const desde = html.indexOf("Cuánto entró");
  assert.ok(desde >= 0, "no está el bloque «Cuánto entró»");
  return html.slice(desde, html.indexOf("Entra al stock", desde));
};

test("1 · CON DIFERENCIA, LOS CAMPOS NO LLEVAN BORDE DE ERROR Y EL RENGLÓN VA EN ADVERTENCIA", async () => {
  const html = await hojaMontada(liverpool());
  assert.ok(html.includes("Motivo de la diferencia"), "el caso tiene que tener diferencia, o el candado no prueba nada");
  const bloque = cuantoEntro(html);
  assert.match(bloque, /Bultos de 10/);
  assert.match(bloque, /Sueltas/);
  assert.doesNotMatch(bloque, /sunmi-border-danger/, "un campo de cantidad salió con borde de error");
  assert.doesNotMatch(bloque, /sunmi-text-danger/, "un número de cantidad salió en rojo");
  assert.match(bloque, /class="text-sm3 sunmi-text-warning">Pediste 25/, "la diferencia se marca en el renglón «Pediste»");
});

test("1 · CONTRAPRUEBA: SIN DIFERENCIA EL RENGLÓN QUEDA APAGADO", async () => {
  const html = await hojaMontada(liverpool({ pedidos: 16 }));
  assert.ok(!html.includes("Motivo de la diferencia"), "pidió 16 y vinieron 16: no hay diferencia");
  assert.match(cuantoEntro(html), /class="text-sm3 sunmi-text-muted">Pediste 16/);
});

test("2 · EL PAPEL 12,1 % MÁS BARATO DICE −12,1 % EN VERDE, EN LA TARJETA Y EN LA HOJA", async () => {
  const f = liverpool();
  for (const html of [renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila: f })), await hojaMontada(f)]) {
    assert.match(html, /sunmi-text-success">−12,1 %</);
    assert.doesNotMatch(html, /\+12,1 %/);
  }
});
