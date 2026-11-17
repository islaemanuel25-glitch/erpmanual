// CANDADO: "NUEVO PRODUCTO" DESDE EL COMPROBANTE, POR KILO (2026-11-17).
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/altaPorKiloDesdeElPapel.test.mjs
//
// El defecto: boleta del 16/11, "BIOM ANANA TROZ X500GR -20-", 3 bolsas por
// $ 16.463,62, sin peso en el papel. Se compra por bolsa de 500 g y en los
// locales se vende por kilo, pesándola. El alta la proponía "Unidad" y no había
// forma directa de dejarla bien.
//
// Decisiones de Emanuel:
//   1. Es la ficha del MANI CON CASCARA X2KG: el depósito la maneja POR BOLSA de
//      N kg y los locales la venden POR KILO (`fichaDeBolsaDePesoFijo`).
//   2. Elegido "Kg", el alta pide solo el peso de la bolsa, precargado del nombre
//      y editable. El costo entra por bolsa y el del kilo se calcula.
//   3. Con peso en el papel (los FOX SAL), "Kg" de entrada. Sin peso, "Unidad":
//      hay bolsas de 500 g que se venden por unidad (Mogul).
//   4. Esa configuración no puede quedar en un producto que se vende por unidad
//      (Mogul Gusanitos Extreme, 2026-11-16).
//
// Los renglones son los de producción, leídos el 2026-11-17 (ComprobanteLinea
// 1059 y 1067), armados por `filasDeConciliacion` como los arma la pantalla.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
for (const clave of ["window", "document", "HTMLElement", "HTMLInputElement", "Node", "Event", "FocusEvent", "MouseEvent", "KeyboardEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  Object.defineProperty(globalThis, clave, { value: clave === "window" ? dom.window : dom.window[clave], configurable: true, writable: true });
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom no dibuja, así que no tiene `scrollTo` ni `scrollIntoView`: el
// formulario los llama al montarse y al abrir el selector.
dom.window.HTMLElement.prototype.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = () => {};

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: FormProducto } = await import("@/components/productos/FormProducto.jsx");
const { UserProvider } = await import("@/app/context/UserContext");
const { filasDeConciliacion } = await import("@/lib/compras-proveedor/comprobante/filasDeConciliacion");
const {
  bolsaDePesoDelAlta,
  costoPorKiloDeLaBolsa,
  pesoDeLaBolsaDelAlta,
  precargaDelAlta,
  preguntaDelAltaDesdeElPapel,
  trajoPesoElPapel,
} = await import("@/lib/compras-proveedor/altaDesdeElPapel");
const {
  esFiambreFijo,
  esFiambreFijoEnUbicacion,
  fichaDeBolsaDePesoFijo,
  piezaFijaFueraDeKilo,
  piezasToKg,
} = await import("@/lib/conversiones/stock");
const { recibidosDelCierre } = await import("@/lib/compras-proveedor/cierreDeRecepcion");
const { cantidadParaStockNormal } = await import("@/lib/pos-ventas/consumoStock");
const { comoViene } = await import("@/lib/unidades/reglaDeUnidades");

const h = React.createElement;
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const PROVEEDOR = 41;

/** Un renglón sin vincular, como lo arma la conciliación del pedido. */
function renglon({ texto, cantidad, importe, pesoKg = null, codigoProveedor = null }) {
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 95, estado: "CARGADO", lineas: [{
      id: 1059, orden: 1, textoCrudo: texto, codigoProveedor, cantidad, netoUnitario: importe / cantidad,
      subtotalImpreso: importe, costoFinalRenglon: importe, cargoDelRenglon: 0, pesoKg, enQueViene: "Unidad",
      productoLocalId: null, pedidoDetalleId: null, precio: null, unidad: null, candidatos: [], origen: "SIN_CANDIDATOS",
    }] }],
    detalles: [],
  }).grupos[0].filas;
  return f;
}

const ANANA = () => renglon({ texto: "BIOM ANANA TROZ X500GR -20-", cantidad: 3, importe: 16463.62, codigoProveedor: "100151" });
const FOX = () => renglon({ texto: "FOX SAL PIC GRUESO X4U 1", cantidad: 2, importe: 24451.97, pesoKg: 1.3 });

// ══════════════════════════════════════════════════════════════════════════
// LA PRECARGA DEL ALTA
// ══════════════════════════════════════════════════════════════════════════

test("ANANÁ sin peso en el papel: el alta sigue en «Unidad», con el costo de la bolsa y el peso sugerido listo", () => {
  const f = ANANA();
  assert.equal(trajoPesoElPapel(f), false);
  const p = precargaDelAlta({ fila: f, proveedorId: PROVEEDOR });
  assert.equal("unidad_medida" in p, false, "el nombre solo no decide: queda «Unidad»");
  assert.equal(p.precio_costo, 5487.87, "16.463,62 ÷ 3 bolsas");
  assert.equal("modoVentaDeposito" in p, false);
  assert.equal(preguntaDelAltaDesdeElPapel(f), null, "no hay caja ni unidad que preguntar");
  assert.deepEqual(bolsaDePesoDelAlta(f), { pesoSugeridoKg: 0.5, costoBolsa: 5487.87 }, "X500GR es 0,5 kg");
});

test("FOX SAL con peso en el papel: «Kg» de entrada, con la ficha de la bolsa y el costo del kilo", () => {
  const f = FOX();
  assert.equal(trajoPesoElPapel(f), true);
  assert.equal(pesoDeLaBolsaDelAlta(f), 0.65, "el nombre no dice el peso: 1,3 kg en 2");
  const p = precargaDelAlta({ fila: f, proveedorId: PROVEEDOR });
  assert.equal(p.unidad_medida, "kg");
  assert.equal(p.modoVentaDeposito, "PIEZA");
  assert.equal(p.pesoReferenciaKg, 0.65);
  assert.equal(p.modoCompraProveedor, "UNIDAD");
  const costoBolsa = bolsaDePesoDelAlta(f).costoBolsa;
  assert.equal(p.precio_costo, costoPorKiloDeLaBolsa({ costoBolsa, pesoKg: 0.65 }));
  assert.equal(Math.round(p.precio_costo * 0.65), Math.round(24451.97 / 2), "el kilo por el peso da la pieza del papel");
  assert.equal(preguntaDelAltaDesdeElPapel(f), null, "«X4U» no es una caja en un producto por kilo");
});

test("la ficha de la bolsa es la del maní: la lee la pieza fija, y en el depósito va por bolsa", () => {
  const ficha = fichaDeBolsaDePesoFijo(0.5);
  assert.deepEqual(ficha, {
    unidad_medida: "kg", factor_pack: 1, modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 0.5,
    pesoEsFijo: true, modoVentaDeposito: "PIEZA", modo_pedido: "UNIDAD", modo_envio: "SOLO_UNIDAD",
  });
  assert.equal(esFiambreFijo(ficha), true);
  // El maní real (1881), leído en producción el 2026-11-17: la misma configuración.
  const mani = { unidad_medida: "kg", factor_pack: 2, modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 2, pesoEsFijo: true, modoVentaDeposito: "PIEZA" };
  for (const k of ["unidad_medida", "modoCompraProveedor", "pesoEsFijo", "modoVentaDeposito"]) assert.equal(ficha[k], mani[k], k);
  assert.equal(esFiambreFijo(mani), true);
  for (const malo of [0, -1, "", null, "abc"]) assert.equal(fichaDeBolsaDePesoFijo(malo), null, String(malo));
});

// ══════════════════════════════════════════════════════════════════════════
// LA REGLA DE LOS GUSANITOS
// ══════════════════════════════════════════════════════════════════════════

test("GUSANITOS: la venta por pieza del depósito en un producto por unidad está prohibida, en las dos rutas y en el formulario", () => {
  // La ficha de Mogul Gusanitos Extreme (2210) antes de corregirla el 2026-11-16.
  const gusanitos = { unidad_medida: "pack", factor_pack: 78, modoVentaDeposito: "PIEZA", pesoEsFijo: true, pesoReferenciaKg: 0.5 };
  assert.equal(piezaFijaFueraDeKilo(gusanitos), true);
  assert.equal(piezaFijaFueraDeKilo({ unidad_medida: "unidad", modoVentaDeposito: "PESO", pesoEsFijo: true }), true, "Paleta fela: peso fijo en un producto por unidad");
  assert.equal(piezaFijaFueraDeKilo({ ...gusanitos, modoVentaDeposito: "PESO", pesoEsFijo: false }), false, "corregida, pasa");
  assert.equal(piezaFijaFueraDeKilo(fichaDeBolsaDePesoFijo(0.5)), false, "por kilo es lo que corresponde");
  assert.equal(piezaFijaFueraDeKilo({ unidad_medida: "kg", modoVentaDeposito: "PIEZA", pesoEsFijo: true }), false);

  // Las dos rutas lo rechazan ANTES de escribir.
  for (const ruta of ["app/api/productos/crear/route.js", "app/api/productos/editar/[id]/route.js"]) {
    const c = codigoDe(ruta);
    const i = c.indexOf("piezaFijaFueraDeKilo(baseData)");
    assert.ok(i > 0, `${ruta} no controla la pieza fuera de kilo`);
    assert.match(c.slice(i, i + 250), /status: 400/, `${ruta} no rechaza`);
    const escribe = ruta.includes("crear") ? c.indexOf("productoBase.create") : c.indexOf("editarBase(baseId");
    assert.ok(escribe > i, `${ruta} escribe antes de controlar`);
  }
  // Y el formulario la manda apagada en cualquier tipo de venta que no sea kilo.
  const form = codigoDe("components/productos/FormProducto.jsx");
  assert.match(form, /pesoEsFijo: p\.unidad_medida === "kg" \? Boolean\(p\.pesoEsFijo\) : false,/);
  assert.match(form, /modoVentaDeposito: p\.unidad_medida === "kg" \? p\.modoVentaDeposito \|\| "PESO" : "PESO",/);
});

// ══════════════════════════════════════════════════════════════════════════
// EL FORMULARIO, MONTADO: ELEGIR KG, EL PESO, Y VOLVER A UNIDAD
// ══════════════════════════════════════════════════════════════════════════

let raiz;
let contenedor;
const fetchReal = globalThis.fetch;
before(() => {
  // Lo que pide el formulario al montarse (sesión, versión): vacío y sin red.
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
});
after(() => {
  globalThis.fetch = fetchReal;
});
beforeEach(async () => {
  if (raiz) await act(async () => raiz.unmount());
  contenedor?.remove();
  document.body.innerHTML = "";
  contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

async function montarAlta(fila) {
  await act(async () =>
    raiz.render(
      h(UserProvider, null,
        h(FormProducto, {
          initialData: precargaDelAlta({ fila, proveedorId: PROVEEDOR }),
          catalogos: { CATEGORIAS: [], PROVEEDORES: [{ id: PROVEEDOR, nombre: "Prod Nat" }], AREAS: [] },
          onSubmit() {},
          onCancel() {},
          submitLabel: "Crear producto",
          bolsaDePeso: bolsaDePesoDelAlta(fila),
        })
      )
    )
  );
}

const campo = (clave) => document.querySelector(`[data-field="${clave}"] input`);
const costo = () => campo("precio_costo");

async function elegirTipoDeVenta(texto) {
  const disparador = document.querySelector('[data-field="unidad_medida"] button');
  await act(async () => disparador.click());
  const opcion = [...document.querySelectorAll("div")].find((d) => d.children.length === 0 && d.textContent === texto && d.onclick !== undefined) ??
    [...document.querySelectorAll("div")].reverse().find((d) => d.textContent === texto);
  assert.ok(opcion, `no apareció la opción ${texto}`);
  await act(async () => opcion.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true })));
}

async function escribir(input, valor) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, valor);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

test("FORMULARIO · ANANÁ: elegir «Kg» pide el peso de la bolsa (0,5 precargado) y el costo pasa a ser el del kilo", async () => {
  await montarAlta(ANANA());
  assert.equal(campo("pesoDeLaBolsa"), null, "en «Unidad» no hay campo de peso");
  assert.equal(costo().value, "5487.87", "arranca con el costo de la bolsa");

  await elegirTipoDeVenta("Kg");
  assert.ok(campo("pesoDeLaBolsa"), "elegido «Kg», no apareció el peso de la bolsa");
  assert.equal(campo("pesoDeLaBolsa").value, "0.5", "precargado del nombre: X500GR");
  assert.equal(costo().value, "10975.74", "5.487,87 ÷ 0,5 kg");

  // Editable: otra bolsa, otro costo del kilo.
  await escribir(campo("pesoDeLaBolsa"), "0.6");
  assert.equal(costo().value, String(costoPorKiloDeLaBolsa({ costoBolsa: 5487.87, pesoKg: 0.6 })));
});

test("FORMULARIO · volver de «Kg» a «Unidad» saca el peso de la bolsa y repone el costo de la bolsa", async () => {
  await montarAlta(ANANA());
  await elegirTipoDeVenta("Kg");
  assert.ok(campo("pesoDeLaBolsa"));
  await elegirTipoDeVenta("Unidad");
  assert.equal(campo("pesoDeLaBolsa"), null);
  assert.equal(costo().value, "5487.87");
});

test("FORMULARIO · FOX SAL con peso: abre ya en «Kg», con el peso y el costo del kilo", async () => {
  await montarAlta(FOX());
  assert.ok(campo("pesoDeLaBolsa"), "con peso en el papel tiene que abrir por kilo");
  assert.equal(campo("pesoDeLaBolsa").value, "0.65");
});

test("FORMULARIO · el alta de Productos no cambia: sin la bolsa, elegir «Kg» no agrega ningún campo", async () => {
  await act(async () =>
    raiz.render(
      h(UserProvider, null,
        h(FormProducto, {
          initialData: null,
          catalogos: { CATEGORIAS: [], PROVEEDORES: [], AREAS: [] },
          onSubmit() {},
          onCancel() {},
          submitLabel: "Crear producto",
        })
      )
    )
  );
  await elegirTipoDeVenta("Kg");
  assert.equal(campo("pesoDeLaBolsa"), null);
});

// ══════════════════════════════════════════════════════════════════════════
// EL CIRCUITO: RECIBIR 3 BOLSAS, TRANSFERIR 1, VENDER POR KILO
// ══════════════════════════════════════════════════════════════════════════
//
// La transferencia (el depósito descuenta 1 bolsa, el local recibe 0,5 kg, la
// bolsa viaja a $ 5.487,87) está en `lib/transferencias/crearTransferencia.test.mjs`,
// junto al maní, con el mismo despacho y la misma recepción. Acá la recepción
// en el depósito y la venta.

const FICHA = fichaDeBolsaDePesoFijo(0.5);
const COSTO_KILO = costoPorKiloDeLaBolsa({ costoBolsa: 5487.87, pesoKg: 0.5 });
const baseStock = { factorPack: FICHA.factor_pack, modoVentaDeposito: FICHA.modoVentaDeposito, pesoReferenciaKg: FICHA.pesoReferenciaKg, modo_envio: FICHA.modo_envio, unidad_medida: FICHA.unidad_medida };

test("CIRCUITO · el depósito recibe las 3 bolsas del papel como 3, y las cuenta por bolsa", () => {
  // La fila del cierre, como la arma la conciliación para una pieza fija.
  const fila = { pedidoDetalleId: 1, factorPack: comoViene(FICHA).factor, unidadPedido: "UNIDAD", unidad: "UNIDAD", cantidad: 3, cantidadEnKilos: false, esFiambre: esFiambreFijo(FICHA), porKilo: false };
  assert.equal(fila.esFiambre, true);
  assert.equal(fila.factorPack, 1, "un producto por kilo no tiene bulto de unidades");
  assert.deepEqual(recibidosDelCierre({ filas: [fila] }), { 1: 3 }, "3 bolsas entran como 3");
  assert.equal(esFiambreFijoEnUbicacion(FICHA, true), true, "en el depósito el stock va en bolsas");
  assert.equal(esFiambreFijoEnUbicacion(FICHA, false), false, "en un local va en kilos");
});

test("CIRCUITO · el local vende por kilo: 0,350 kg descuentan 0,350 y cuestan 0,350 × el kilo; el depósito vende por bolsa", () => {
  assert.equal(cantidadParaStockNormal({ cantidadVenta: 0.35, esDeposito: false, baseStock }), 0.35);
  assert.equal(Math.round(0.35 * COSTO_KILO * 100) / 100, 3841.51);
  // La bolsa recibida en el local son 0,5 kg, y cuesta lo que costó la bolsa.
  assert.equal(piezasToKg(1, FICHA.pesoReferenciaKg), 0.5);
  assert.equal(Math.round(0.5 * COSTO_KILO * 100) / 100, 5487.87);
  // En el depósito, el POS vende la bolsa entera: 1 es 1 bolsa.
  assert.equal(cantidadParaStockNormal({ cantidadVenta: 1, esDeposito: true, baseStock }), 1);
});
