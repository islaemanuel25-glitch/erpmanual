// CANDADO: LA OFERTA Y EL TOTAL POR MEDIO, DIBUJADOS DE VERDAD.
//
//   node --import ./scripts/alias-loader.mjs --test components/pos-ventas/ofertaEnPantallaRender.test.mjs
//
// ── POR QUÉ ESTE ARCHIVO EJECUTA EL JSX EN VEZ DE LEERLO ────────────────────
//
// Porque leer un archivo y buscar una palabra no prueba que la pantalla dibuje
// nada. El proyecto ya pagó ese error dos veces: un identificador usado sin
// importar compiló, pasó el lint, pasaron más de mil candados y reventó en
// producción, porque ninguna prueba EJECUTABA ese JSX. Y en el módulo de
// comprobante, un `SunmiInput` sin importar hizo exactamente lo mismo.
//
// Acá se monta el panel de cobro y el carrito con `renderToStaticMarkup` y se
// leen los IMPORTES que quedaron escritos. Si el cableado se corta —el preview
// no llega, la etiqueta no se dibuja, el total del botón sale del lugar
// equivocado— el número no aparece y esto se pone en rojo.
//
// ── LO QUE ESTO NO PRUEBA, Y CONVIENE TENERLO PRESENTE ─────────────────────
//
// Que se VEA bien. No hay navegador, no hay CSS aplicado y no hay 360 px de
// ancho: si los cuatro importes no entran en el botón de una Sunmi, esto pasa en
// verde igual. Eso lo tiene que mirar una persona con la pantalla abierta.
//
// El caso es el del pedido, con números redondos para que un error de un peso se
// vea a simple vista: 9 × "Nueve de Oro" a $1.000, oferta SOLO EFECTIVO a $900,
// y el local con débito 5 %, crédito 10 % y Mercado Pago 5 %.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import FormaPago from "@/components/pos-ventas/FormaPago";
import CarritoVenta from "@/components/pos-ventas/CarritoVenta";
import { totalesPorMedio } from "@/lib/ofertas/previewPos";

const RECARGOS = { EFECTIVO: 0, DEBITO: 5, CREDITO: 10, MERCADOPAGO: 5 };

const OFERTA_EFECTIVO = {
  ofertaId: 7,
  ofertaNombre: "Semana del vino",
  precioOferta: 900,
  condicionPago: "SOLO_EFECTIVO",
};

const LINEA = {
  productoLocalId: 42,
  productoBaseId: 11,
  nombre: "Nueve de Oro",
  cantidad: 9,
  precio: 1000,
  stockMax: 100,
  factorPack: 1,
  unidadMedida: "unidad",
  modoVentaLinea: "NORMAL",
  oferta: OFERTA_EFECTIVO,
};

/** El markup del panel de cobro con el carrito dado. */
function panelDeCobro({ carrito, recargos = RECARGOS, descuento = 0 }) {
  const subtotal = carrito.reduce((a, i) => a + i.precio * i.cantidad, 0);
  const preview = totalesPorMedio({
    carrito,
    recargosPorMedio: recargos,
    descuentos: { manual: descuento },
  });
  return renderToStaticMarkup(
    createElement(FormaPago, {
      subtotal,
      descuento,
      formaPago: "efectivo",
      onFormaPagoChange: () => {},
      onCobrar: () => {},
      cobrando: false,
      disabled: false,
      previewPorMedio: preview,
      recargosPorMedio: recargos,
      hayOfertaSoloEfectivo: carrito.some((i) => i?.oferta?.condicionPago === "SOLO_EFECTIVO"),
    })
  );
}

/** El markup del carrito. */
function carritoDibujado(items) {
  return renderToStaticMarkup(
    createElement(CarritoVenta, {
      items,
      subtotal: items.reduce((a, i) => a + i.precio * i.cantidad, 0),
      onCantidadChange: () => {},
      onEliminar: () => {},
      onLimpiar: () => {},
      onAbrirDescuento: () => {},
      onAbrirCliente: () => {},
    })
  );
}

// El markup trae entidades HTML y espacios finos del formato es-AR. Se
// normalizan ANTES de buscar: si no, "$8.100,00" no matchea por un nbsp.
function normalizar(html) {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;| | /g, " ");
}

// ══════════════════════════════════════════════════════════════════════════
// EL PANEL DE COBRO DIBUJA UN TOTAL POR MEDIO
// ══════════════════════════════════════════════════════════════════════════

test("los cuatro importes están escritos en el panel antes de elegir nada", () => {
  const html = normalizar(panelDeCobro({ carrito: [LINEA] }));

  // Éstos son los cuatro números del ejemplo. Si el cableado del preview se
  // corta, ninguno aparece y las cuatro afirmaciones caen juntas.
  assert.ok(html.includes("8.100,00"), "falta el total de EFECTIVO ($8.100)");
  assert.ok(html.includes("9.450,00"), "falta el total de DÉBITO / MERCADO PAGO ($9.450)");
  assert.ok(html.includes("9.900,00"), "falta el total de CRÉDITO ($9.900)");

  // Y los cuatro medios siguen estando, cada uno con su etiqueta.
  for (const label of ["Efectivo", "Débito", "Crédito", "Mercado Pago"]) {
    assert.ok(html.includes(label), `falta el botón de ${label}`);
  }
});

test("el panel avisa que el total depende del medio", () => {
  const html = normalizar(panelDeCobro({ carrito: [LINEA] }));
  assert.ok(
    html.includes("el total cambia según el medio"),
    "el cajero tiene que saber que los importes de los botones no son decorativos"
  );
  // Y NO se dibuja un único total grande, que sería falso en tres de los cuatro casos.
  assert.ok(!html.includes("Total a cobrar"), "no puede haber un total único cuando los medios difieren");
  assert.ok(html.includes("Total según el medio"));
});

test("SIN ofertas y SIN recargos el panel queda como estaba: un solo total", () => {
  // Es el caso de casi todas las ventas. Si esto se rompe, el panel de cobro
  // cambia de aspecto para todo el mundo por una función que no aplica a nadie.
  const html = normalizar(
    panelDeCobro({
      carrito: [{ ...LINEA, oferta: null }],
      recargos: { EFECTIVO: 0, DEBITO: 0, CREDITO: 0, MERCADOPAGO: 0 },
    })
  );
  assert.ok(html.includes("Total a cobrar"), "vuelve el rótulo de siempre");
  assert.ok(html.includes("Elegí cómo cobrar"));
  assert.ok(!html.includes("el total cambia según el medio"));
  assert.ok(html.includes("9.000,00"), "y el total es el de siempre");
});

test("con una oferta de CUALQUIER MEDIO y sin recargos hay un solo total, y es el promocional", () => {
  const html = normalizar(
    panelDeCobro({
      carrito: [{ ...LINEA, oferta: { ...OFERTA_EFECTIVO, condicionPago: "CUALQUIER_MEDIO" } }],
      recargos: { EFECTIVO: 0, DEBITO: 0, CREDITO: 0, MERCADOPAGO: 0 },
    })
  );
  assert.ok(html.includes("Total a cobrar"));
  assert.ok(html.includes("8.100,00"), "el total grande ya lleva la oferta aplicada");
});

// ══════════════════════════════════════════════════════════════════════════
// EL CARRITO DICE LAS CUATRO COSAS
// ══════════════════════════════════════════════════════════════════════════

test("la línea del carrito muestra precio normal, que hay oferta, su condición y su precio", () => {
  const html = normalizar(carritoDibujado([LINEA]));

  assert.ok(html.includes("Nueve de Oro"), "el producto");
  assert.ok(html.includes("1.000,00"), "el precio NORMAL sigue a la vista");
  assert.ok(html.includes("Oferta efectivo"), "que hay oferta, y su condición");
  assert.ok(html.includes("900,00"), "el precio promocional");
});

test("el precio normal NO se reemplaza por el de oferta", () => {
  // Es la decisión del pedido: hasta saber cómo se paga, el promocional es una
  // posibilidad. Si alguien "simplifica" mostrando solo $900, el cajero promete
  // un precio que se cae cuando el cliente saca la tarjeta.
  const html = normalizar(carritoDibujado([LINEA]));
  assert.ok(html.includes("1.000,00"), "el precio normal tiene que seguir estando");
});

test("una oferta de cualquier medio no dice 'efectivo'", () => {
  const html = normalizar(
    carritoDibujado([{ ...LINEA, oferta: { ...OFERTA_EFECTIVO, condicionPago: "CUALQUIER_MEDIO" } }])
  );
  assert.ok(html.includes("Oferta"), "la etiqueta está");
  assert.ok(!html.includes("Oferta efectivo"), "pero no le inventa una condición que la oferta no tiene");
});

test("una línea sin oferta no dibuja ninguna etiqueta", () => {
  const html = normalizar(carritoDibujado([{ ...LINEA, oferta: null }]));
  assert.ok(!html.includes("Oferta"), "sin oferta no hay nada que decir");
  assert.ok(html.includes("1.000,00"), "y la línea sigue mostrando su precio");
});

// ══════════════════════════════════════════════════════════════════════════
// LA PANTALLA LE PASA EL PREVIEW AL PANEL
// ══════════════════════════════════════════════════════════════════════════
//
// Los renders de arriba prueban que el panel SABE dibujar los cuatro importes
// cuando le llegan. Falta la otra mitad, que es la que se olvidó al mudar la
// tabla del detalle del pedido: que la PANTALLA se los pase. Sin esto, todo lo
// de arriba queda en verde con un POS que nunca muestra un preview.

test("la pantalla del POS le pasa el preview, los recargos y el aviso al panel de cobro", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const RAIZ = path.resolve(import.meta.dirname, "../..");

  // Se sacan los comentarios ANTES de mirar. Un candado que busca texto encuentra
  // los comentarios, y ya pasó tres veces en este repo: la peor fue un candado
  // que dio VERDE con el chequeo que defendía sacado, porque la palabra estaba en
  // un comentario tres líneas más arriba.
  const pantalla = fs
    .readFileSync(path.join(RAIZ, "app/modulos/pos-ventas/page.jsx"), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  assert.match(pantalla, /previewPorMedio=\{previewPorMedio\}/, "el panel no recibe el preview");
  assert.match(pantalla, /recargosPorMedio=\{recargosPorMedio\}/, "el panel no recibe los recargos");
  assert.match(pantalla, /hayOfertaSoloEfectivo=\{hayOfertaSoloEfectivo\}/, "el panel no puede avisar del pago combinado");
  assert.match(pantalla, /totalesPorMedio\(/, "la pantalla no calcula el preview");
  assert.match(pantalla, /totalPantalla: datos\.totalPantalla/, "la venta no manda el total que vio el cajero");
});

test("el carrito recuerda el productoLocalId y la oferta de cada línea", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const RAIZ = path.resolve(import.meta.dirname, "../..");
  const reducer = fs
    .readFileSync(path.join(RAIZ, "app/modulos/pos-ventas/reducer/posVentaReducer.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  // Sin estas dos, el preview no puede resolver ninguna oferta: el motor busca
  // por productoLocalId y la oferta viaja en la línea.
  assert.match(reducer, /productoLocalId:\s*producto\.productoLocalId/, "la línea no guarda el id de la ubicación");
  assert.match(reducer, /oferta:\s*producto\.oferta/, "la línea no guarda la oferta");
});
