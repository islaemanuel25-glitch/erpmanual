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
const { cuantoEntroAlAbrir, unidadesFisicasDeLaFactura, faltaLaLineaDelPedido } = await import("@/lib/compras-proveedor/estadoDeLineaFacturada");
const { aplanarDetalles } = await import("@/lib/compras-proveedor/comprobante/analisisDeComprobante");
const { resolverLineaDelPedido } = await import("@/lib/compras-proveedor/comprobante/vinculo");
const { recibidosDelCierre, costosQueNoSeTocan, resumenDelCierre, loQueNoDejaCerrar } = await import("@/lib/compras-proveedor/cierreDeRecepcion");
const { filasDelPapelPorDetalle, costoMaestroDeLaLectura } = await import("@/lib/compras-proveedor/lecturaDelCierre");

const BICARBONATO = { precio_costo: 26000, factor_pack: 100, unidad_medida: "pack", modoCompraProveedor: "BULTO" };

/**
 * El renglón del papel. Sin `det`, sin línea del pedido —el caso del local—;
 * con `det`, atado a una línea del pedido. `columna` es `pedidoDetalleId` como
 * está guardado en el renglón: null cuando la línea la deduce la conciliación
 * por producto. `vinculado: false` es un renglón sin producto.
 * `nombreDelProducto` es lo que pone `analizarLineas` desde el catálogo.
 */
function fila({
  cantidad = 200,
  netoUnitario = 265.33,
  subtotalImpreso = 53065.6,
  det = null,
  columna = det?.id ?? null,
  vinculado = true,
  nombreDelProducto = null,
  candidatos = [],
} = {}) {
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
      lineas: [{
        ...linea,
        id: 800,
        pedidoDetalleId: columna,
        pedidoDetalle: det,
        productoLocalId: vinculado ? 1 : null,
        productoBaseId: vinculado ? 900 : null,
        nombreDelProducto: vinculado ? nombreDelProducto : null,
        candidatos,
        precio: vinculado ? precio : null,
        unidad: vinculado ? precio.unidad : null,
        decisionPrecio: null,
        costoMaestroCatalogo: vinculado ? BICARBONATO.precio_costo : null,
      }],
    }],
    detalles: det ? [det] : [],
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
async function abrir(f, props = {}) {
  await act(async () => raiz.render(React.createElement(HojaCorregirLinea, { fila: f, abierta: true, onCerrar() {}, onGuardar() {}, ...props })));
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

// ══════════════════════════════════════════════════════════════════════════
// LO QUE VINO EN EL PAPEL SIN ESTAR PEDIDO ENTRA (2026-11-15)
//
// Con d70383a la hoja abría bien y el botón no hacía nada: la página
// (`guardarCorreccion`) sale sin guardar cuando el renglón no tiene línea del
// pedido. 0010adc lo hizo avisar; la decisión de Emanuel es que entre:
// "Revisado y seguir" le agrega la línea al pedido —la ruta de "Agregar
// producto extra"— con lo que dice "Entra al stock" y el precio del papel.
// ══════════════════════════════════════════════════════════════════════════

const botonGuardar = () => [...document.querySelectorAll("button")].find((b) => b.textContent === "✓ Revisado y seguir");
const tocar = async (boton) => {
  await act(async () => {
    boton.click();
    await new Promise((r) => setTimeout(r, 0));
  });
};

const NOMBRE = "BICARBONATO DE SODIO x 100";

test("RG6. vinculado y fuera del pedido: «Revisado y seguir» agrega la línea con 200 unidades a $265,33 y guarda", async () => {
  const agregados = [];
  const guardados = [];
  await abrir(fila({ nombreDelProducto: NOMBRE }), {
    onAgregarAlPedido: async (f, datos) => (agregados.push({ f, datos }), { ok: true, pedidoDetalleId: 9001 }),
    onGuardar: (d) => guardados.push(d),
  });
  await tocar(botonGuardar());
  assert.equal(agregados.length, 1, "no agregó la línea al pedido");
  assert.equal(agregados[0].f.productoLocalId, 1);
  assert.equal(agregados[0].datos.unidades, 200);
  assert.equal(Math.round(agregados[0].datos.precioPorUnidad * 100) / 100, 265.33, "53.065,60 ÷ 200");
  assert.equal(guardados.length, 1, "agregó y no guardó");
  assert.equal(guardados[0].pedidoDetalleId, 9001, "guardó sin la línea nueva");
  assert.equal(guardados[0].lineaAgregada, true);
  assert.equal(guardados[0].cantidadRecibida, 200);
  assert.equal(guardados[0].unidadesFisicas, 200);
});

test("RG6b. arriba dice el nombre del producto vinculado; «Sin producto» solo sin producto", async () => {
  const { texto } = await abrir(fila({ nombreDelProducto: NOMBRE }));
  assert.match(texto, new RegExp(`Va a este producto\\s*${NOMBRE}`));
  assert.doesNotMatch(texto, /Sin producto/);
  // El nombre de la línea del pedido o de la sugerencia sigue mandando.
  assert.equal(fila({ nombreDelProducto: NOMBRE, det: { id: 7001, cantidad: 2, unidad: "BULTO", nombre: "Del pedido" } }).producto, "Del pedido");
});

test("RG6c. si no se pudo agregar al pedido, la hoja lo dice y no guarda", async () => {
  const guardados = [];
  await abrir(fila(), {
    onAgregarAlPedido: async () => ({ ok: false, error: "Pedido fuera de tu alcance" }),
    onGuardar: (d) => guardados.push(d),
  });
  await tocar(botonGuardar());
  assert.equal(guardados.length, 0);
  assert.match(document.body.textContent, /Pedido fuera de tu alcance/);
  // Y sin quien agregue, tampoco se queda callado.
  await abrir(fila(), { onGuardar: (d) => guardados.push(d) });
  await tocar(botonGuardar());
  assert.equal(guardados.length, 0);
  assert.match(document.body.textContent, /No se pudo agregar este producto al pedido\./);
});

test("RG6d. sin producto: la hoja abre en el selector, y al elegir se vincula; vinculado, guarda como RG6", async () => {
  const vinculados = [];
  const sinProducto = fila({ vinculado: false, candidatos: [{ productoBaseId: 900, nombre: NOMBRE }] });
  await abrir(sinProducto, { onVincular: async (f, id) => (vinculados.push(id), { ok: true }), puedeCrearProducto: true });
  const texto = document.body.textContent.replace(/\s+/g, " ");
  assert.match(texto, /Qué producto es/);
  assert.ok(!botonGuardar(), "sin producto no hay cantidad que guardar");
  assert.equal(faltaLaLineaDelPedido(sinProducto), false, "sin producto no se agrega nada al pedido");
  assert.ok([...document.querySelectorAll("button")].some((b) => /^Buscar/.test(b.textContent)), "no ofrece buscar");
  // Elegir el producto lo vincula; la página cierra la hoja y la lista vuelve
  // con el renglón vinculado, que guarda agregando la línea (RG6).
  await tocar([...document.querySelectorAll("button")].find((b) => b.textContent === NOMBRE));
  assert.deepEqual(vinculados, [900]);
});

test("RG8. con la línea agregada, el renglón queda atado a ella, entran 200 al cierre y el costo no se toca", () => {
  // La línea como la escribe `agregar-item` y la lee la conciliación.
  const [detalle] = aplanarDetalles([{
    id: 9001, cantidad: 200, precioCosto: 265.328, unidad: "UNIDAD", cantidadRecibida: 200, unidadesFisicas: 200,
    producto: { baseId: 900, base: { ...BICARBONATO, id: 900, nombre: NOMBRE } },
  }]);
  // El renglón no tiene la columna: la conciliación la deduce por producto.
  const { detalle: deducida } = resolverLineaDelPedido({ linea: { pedidoDetalleId: null }, productoBaseId: 900, detalles: [detalle] });
  assert.equal(deducida?.id, 9001, "la conciliación no ata el renglón a la línea nueva");
  const f = { ...fila({ det: deducida, columna: null }), revisada: true };
  assert.equal(f.pedidoDetalleId, 9001);
  assert.equal(faltaLaLineaDelPedido(f), false, "volvería a agregarla");
  // El cierre: no lo frena y entran las 200 contadas.
  assert.equal(loQueNoDejaCerrar(resumenDelCierre({ filas: [f] })), null, "la línea agregada frena el cierre");
  assert.equal(recibidosDelCierre({ filas: [f], contados: { 9001: 200 } })[9001], 200);
  // Y el cierre la ve CON papel: su costo sale solo de un precio aceptado.
  const conPapel = filasDelPapelPorDetalle({ grupos: [{ filas: [f] }] });
  assert.equal(conPapel.get(9001)?.length, 1);
  assert.equal(costoMaestroDeLaLectura({ filas: conPapel.get(9001), base: { ...BICARBONATO, id: 900 } }), null, "escribiría un costo que nadie aceptó");
  assert.deepEqual(costosQueNoSeTocan([f]), []);
});

test("RG7. un renglón vinculado con su línea del pedido guarda como siempre", async () => {
  const det = { id: 7001, cantidad: 2, unidad: "BULTO", precioCosto: 26000, costoMaestroHoy: 26000, productoBaseId: 900, factorPack: 100, cantidadRecibida: null };
  const guardados = [];
  await abrir(fila({ det }), {
    onAgregarAlPedido: async () => assert.fail("un renglón con su línea no agrega nada"),
    onGuardar: (d) => guardados.push(d),
    onAceptarPrecio: async () => ({ ok: true }),
    onDejarMiPrecio: async () => ({ ok: true }),
  });
  await tocar(botonGuardar());
  assert.equal(guardados.length, 1, `no guardó: ${document.body.textContent.replace(/\s+/g, " ").slice(-200)}`);
  assert.equal(guardados[0].pedidoDetalleId, 7001);
  assert.equal(guardados[0].unidadesFisicas, 200);
  assert.equal(guardados[0].lineaAgregada, false, "agregó una línea que ya estaba");
});
