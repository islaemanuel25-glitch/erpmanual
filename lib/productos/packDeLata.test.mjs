// EL PACK DE UNA LATA, Y LA PREGUNTA DEL PRECIO QUE SIGUE AL PACK EN VIVO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/productos/packDeLata.test.mjs
//
// El caso (2026-11-18): "BRAHMA FT LIMON CAN 4X6 473CC", el renglón 1137 de un
// papel de Quilmes, 5 planchas por $ 181.294,57. Es una plancha de 24 latas (4
// packs de 6); el alta proponía pack de 4 y la pregunta ofrecía "Por la caja de
// 4" o "Por unidad".
//
// La regla de Emanuel para las latas: plancha entera; 24, 16, 6 o 4; "AxB" sin
// peso ni volumen es A×B; si no, 24 para 473 cc y menos, y para 710 cc 24 salvo
// que el papel o la lista digan 16; y si el precio por lata es un disparate al
// lado de las otras latas del proveedor, la opción coherente.
//
// Datos de producción, leídos el 2026-11-18: el renglón 1137 (Quilmes), el 373
// "MGD LAT 473cc NR 1x6" (proveedor 29) y las siete latas de Quilmes del
// catálogo con su costo y su pack.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
for (const clave of ["window", "document", "HTMLElement", "HTMLInputElement", "Node", "Event", "FocusEvent", "MouseEvent", "KeyboardEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  Object.defineProperty(globalThis, clave, { value: clave === "window" ? dom.window : dom.window[clave], configurable: true, writable: true });
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = () => {};

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: AltaDesdeElPapel } = await import("@/components/compras-proveedor/AltaDesdeElPapel.jsx");
const { UserProvider } = await import("@/app/context/UserContext");
const { filasDeConciliacion } = await import("@/lib/compras-proveedor/comprobante/filasDeConciliacion");
const {
  bultoDelAltaDesdeElPapel,
  bultoPropuestoDelAltaDesdeElPapel,
  costoDelAltaDesdeElPapel,
  costoDelRenglonParaElAlta,
  lecturaRecordadaDelAltaDesdeElPapel,
  precargaDelAlta,
  preguntaDelAltaDesdeElPapel,
} = await import("@/lib/compras-proveedor/altaDesdeElPapel");
const {
  OPCIONES_PACK_LATA,
  esLata,
  packDeLataCoherente,
  packPropuestoDeLata,
  precioPorLataDeReferencia,
} = await import("./packDeLata.js");
const { bultoDeLaFila } = await import("@/lib/proveedores/listas/altaDesdeLaLista");
const { PRECIO_ES } = await import("@/lib/proveedores/listas/costoDelAltaDesdeLaLista");

const h = React.createElement;
const QUILMES = 26;

// Las siete latas de Quilmes del catálogo, como las devuelve `GET productos`.
const LATAS_DE_QUILMES = [
  { nombre: "QUILMES LATA 473ML", factor_pack: 24, precio_costo: "40000" },
  { nombre: "CORONA LATA 473ML", factor_pack: 24, precio_costo: "36000" },
  { nombre: "QUILMES 710ML LATA", factor_pack: 16, precio_costo: "42000" },
  { nombre: "QUILMES NEGRA LATA 473ML ", factor_pack: 24, precio_costo: "44500" },
  { nombre: "CERVEZA 1890 LATA", factor_pack: 24, precio_costo: "26000" },
  { nombre: "BRAHMA LATA 710", factor_pack: 16, precio_costo: "42000" },
  { nombre: "QUILMES LATA SIN ALCOHOL", factor_pack: 24, precio_costo: "35000" },
];

/** Un renglón sin vincular, como lo arma la conciliación del pedido. */
function renglon({ id, texto, cantidad, importe, enQueViene, codigoProveedor }) {
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 120, estado: "CARGADO", lineas: [{
      id, orden: 1, textoCrudo: texto, codigoProveedor, cantidad, netoUnitario: importe / cantidad,
      subtotalImpreso: importe, costoFinalRenglon: importe, cargoDelRenglon: 0, enQueViene,
      productoLocalId: null, pedidoDetalleId: null, precio: null, unidad: null, candidatos: [], origen: "SIN_CANDIDATOS",
    }] }],
    detalles: [],
  }).grupos[0].filas;
  return f;
}
const BRAHMA = () => renglon({ id: 1137, texto: "BRAHMA FT LIMON CAN 4X6 473CC", cantidad: 5, importe: 181294.57, enQueViene: "PACK", codigoProveedor: "32471" });
const MGD = () => renglon({ id: 373, texto: "MGD LAT 473cc NR 1x6 LOC (V2)", cantidad: 1, importe: 11077.09, enQueViene: "CJ", codigoProveedor: "23284" });

// ══════════════════════════════════════════════════════════════════════════
// LA REGLA
// ══════════════════════════════════════════════════════════════════════════

test("la Brahma 4X6 es una plancha de 24: el alta propone 24 y pregunta por la caja de 24", () => {
  const f = BRAHMA();
  assert.equal(esLata(f.textoCrudo), true);
  assert.equal(bultoDelAltaDesdeElPapel(f), 24);
  const p = precargaDelAlta({ fila: f, proveedorId: QUILMES });
  assert.equal(p.unidad_medida, "pack");
  assert.equal(p.factor_pack, 24);
  const pregunta = preguntaDelAltaDesdeElPapel(f);
  assert.equal(pregunta.cantidad, 24);
  assert.equal(pregunta.opciones[0].texto, "Por la caja de 24");
});

test("si se toca 6, la pregunta, el costo y lo que se recuerda siguen al 6", () => {
  const f = BRAHMA();
  const precio = costoDelRenglonParaElAlta(f);
  const pregunta = preguntaDelAltaDesdeElPapel(f, { bulto: 6 });
  assert.equal(pregunta.opciones[0].texto, "Por la caja de 6");
  assert.equal(costoDelAltaDesdeElPapel({ fila: f, precioEs: PRECIO_ES.CAJA, bulto: 6 }), precio);
  assert.equal(costoDelAltaDesdeElPapel({ fila: f, precioEs: PRECIO_ES.UNIDAD, bulto: 6 }), Math.round(precio * 6 * 100) / 100);
  assert.deepEqual(lecturaRecordadaDelAltaDesdeElPapel({ fila: f, precioEs: PRECIO_ES.UNIDAD, bulto: 6 }), { clave: "PACK_6", multiplicador: 6, cantidad: null });
  // Un pack de 1 no es una caja: no se pregunta.
  assert.equal(preguntaDelAltaDesdeElPapel(f, { bulto: 1 }), null);
});

test("un pack suelto de 6 es la excepción, y se respeta: MGD LAT 473cc 1x6", () => {
  assert.equal(bultoDelAltaDesdeElPapel(MGD()), 6);
  assert.equal(packPropuestoDeLata({ texto: "MGD LAT 473cc NR 1x6 LOC (V2)" }), 6);
});

test("la de 710: 24, salvo que el papel o la lista digan 16", () => {
  // Las dos 710 de Quilmes del catálogo vienen por 16.
  assert.equal(packPropuestoDeLata({ texto: "QUILMES 710ML LATA", dicho: 16 }), 16);
  assert.equal(packPropuestoDeLata({ texto: "BRAHMA LATA 710 CC", dicho: 16 }), 16);
  assert.equal(packPropuestoDeLata({ texto: "QUILMES 710ML LATA" }), 24, "sin decir nada, la plancha de 24");
  assert.equal(packPropuestoDeLata({ texto: "QUILMES 710ML LATA", dicho: 6 }), 24, "solo un 16 cambia la plancha");
  // En la lista, el "por caja" es lo que dice.
  assert.equal(bultoDeLaFila({ descripcionProveedor: "QUILMES 710ML LATA", unidadesPorBulto: 16 }), 16);
  // Y la de 473 por 24 siempre, aunque la lista guarde otra cosa.
  assert.equal(bultoDeLaFila({ descripcionProveedor: "QUILMES LATA 473ML", unidadesPorBulto: 6 }), 24);
  // Con "AxB" manda el nombre: 4x6 es 24 aunque sea de 710.
  assert.equal(packPropuestoDeLata({ texto: "HNK RUB LAT 710 cc NR 4x6 LOC", dicho: 16 }), 24);
});

test("con el precio a la vista: el 4 de antes era un disparate al lado de las latas de Quilmes", () => {
  const ref = precioPorLataDeReferencia(LATAS_DE_QUILMES);
  assert.equal(Math.round(ref), 1667, "la mediana del costo por lata de las siete");
  const precio = costoDelRenglonParaElAlta(BRAHMA());
  // Por 24 da $ 1.513 la lata: coherente, queda.
  assert.equal(packDeLataCoherente({ propuesto: 24, precioCaja: precio, referenciaPorLata: ref }), 24);
  assert.equal(bultoPropuestoDelAltaDesdeElPapel({ fila: BRAHMA(), referenciaPorLata: ref }), 24);
  // Por 4 daba $ 9.065 la lata, más de cinco veces: se propone la coherente.
  assert.equal(packDeLataCoherente({ propuesto: 4, precioCaja: precio, referenciaPorLata: ref }), 24);
  // Sin referencia, el propuesto.
  assert.equal(packDeLataCoherente({ propuesto: 4, precioCaja: precio, referenciaPorLata: null }), 4);
});

test("no es lata lo que no dice CAN, LATA o LAT", () => {
  for (const t of ["CANDY CRUSH", "SCANNER", "ESCANDALO 473", "PALATABLE"]) assert.equal(esLata(t), false, t);
  for (const t of ["BRAHMA FT LIMON CAN 4X6 473CC", "QUILMES LATA 473ML", "IMP IPA LAT 473 CC NR 4x6"]) assert.equal(esLata(t), true, t);
  assert.deepEqual([...OPCIONES_PACK_LATA], [24, 16, 6, 4]);
});

// ══════════════════════════════════════════════════════════════════════════
// EN LA PANTALLA: EL ALTA DESDE EL PAPEL, MONTADA, Y TOCAR EL 6
// ══════════════════════════════════════════════════════════════════════════

let raiz;
let contenedor;
const fetchReal = globalThis.fetch;
before(() => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/compras-proveedor/productos")) return { ok: true, status: 200, json: async () => ({ ok: true, items: LATAS_DE_QUILMES }) };
    if (u.includes("/api/catalogos/proveedores")) return { ok: true, status: 200, json: async () => ({ ok: true, items: [{ id: QUILMES, nombre: "Quilmes" }] }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, items: [] }) };
  };
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

const esperar = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const botonCon = (texto, rol = null) =>
  [...document.querySelectorAll(rol ? `[role="${rol}"]` : "button")].find((b) => b.textContent.trim() === texto);
const textoDeLaPagina = () => document.body.textContent;
const campoDespuesDe = (rotulo) => {
  const etiqueta = [...document.querySelectorAll("label, span, div")].find((n) => n.childElementCount === 0 && n.textContent.trim() === rotulo);
  let n = etiqueta;
  while (n && !n.querySelector?.("input")) n = n.parentElement;
  return n?.querySelector("input") ?? null;
};

test("montada: arranca en 24 con «Por la caja de 24»; al tocar 6 dice «Por la caja de 6» y el costo por unidad se recalcula", async () => {
  await act(async () =>
    raiz.render(h(UserProvider, null, h(AltaDesdeElPapel, { fila: BRAHMA(), proveedorId: QUILMES, onCreado() {}, onCancelar() {} })))
  );
  await esperar();
  await esperar();
  // Las cuatro opciones de la lata, con el 24 marcado.
  for (const n of ["24", "16", "6", "4"]) assert.ok(botonCon(n, "tab"), `falta la opción ${n}`);
  assert.equal(botonCon("24", "tab").getAttribute("aria-selected"), "true");
  assert.match(textoDeLaPagina(), /Por la caja de 24/);

  // Por unidad: el costo de la caja es el precio × 24.
  const precio = costoDelRenglonParaElAlta(BRAHMA());
  await act(async () => botonCon("Por unidad", null)?.click() ?? [...document.querySelectorAll("[role=radio]")].find((b) => /Por unidad/.test(b.textContent))?.click());
  await esperar();
  assert.equal(Number(campoDespuesDe("Costo * (por caja)")?.value), Math.round(precio * 24 * 100) / 100);

  // Se toca el 6.
  await act(async () => botonCon("6", "tab").click());
  await esperar();
  assert.equal(botonCon("6", "tab").getAttribute("aria-selected"), "true");
  assert.match(textoDeLaPagina(), /Por la caja de 6/);
  assert.doesNotMatch(textoDeLaPagina(), /Por la caja de 24/);
  assert.equal(Number(campoDespuesDe("Costo * (por caja)")?.value), Math.round(precio * 6 * 100) / 100, "el costo de la caja con 6");
  assert.match(textoDeLaPagina(), /costo de la caja ÷ 6/);
});
