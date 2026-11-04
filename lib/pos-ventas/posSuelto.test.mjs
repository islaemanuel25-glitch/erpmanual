// CANDADOS DEL SUELTO EN EL POS (tercer nivel de empaque, tanda 8 —
// docs/roadmap/tercer-nivel-empaque.md).
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/posSuelto.test.mjs
//
// Decisión de Emanuel: el suelto aparece en el buscador como un producto más,
// "Camel Yellow 20 · suelto", con el precio del cigarrillo. Por detrás es el
// mismo producto y comparten el stock. Acá van las piezas puras: el gemelo, la
// línea del carrito que arma el reducer, lo que se manda al servidor, los
// límites del modal y los nombres de la escala del valor del stock. El camino
// contra la base —buscar, vender, escanear— está en
// `scripts/pruebas-db/tercerNivelEmpaque.mjs`, sección H.
//
// Los resultados del buscador tienen la forma que devuelve
// `pos-ventas/buscar-producto` (ver `construirItems` en la ruta): el gemelo solo
// existe si la ruta dejó `precioVentaSuelto`, que es null en el depósito, sin el
// dato o sin precio de suelto.

import test from "node:test";
import assert from "node:assert/strict";

import {
  MODO_SUELTO,
  SUFIJO_SUELTO,
  conGemelosSueltos,
  esLaMismaLinea,
  escalaDeLineaDelCarrito,
  gemeloSuelto,
  textoDeStockDeLaLinea,
  topeDeLineaDelCarrito,
} from "./lineaSuelta.js";
import { itemCrearPayload } from "./payloadVenta.js";
import { posVentaReducer, ActionTypes, initialState } from "../../app/modulos/pos-ventas/reducer/posVentaReducer.js";
import { limiteEnLaEscalaDeCarga, limiteParaEnviar } from "../stock/limites.js";
import { escalaDelMomento } from "../stock/libro/valorDelStock.js";

// Un resultado del buscador del local: 10 atados de 20 = 200 sueltos.
const ATADO = Object.freeze({
  productoBaseId: 7,
  productoLocalId: 70,
  nombre: "Camel Yellow 20",
  codigoBarra: "7790000000001",
  codigoBarraSecundario: "",
  codigoBarraPropio: "",
  precioVenta: 2000,
  precioVentaUnitario: 2000,
  precioVentaBulto: 2000,
  precioVentaUnitarioReal: 2000,
  precioVentaFormatoDepositoReal: 2000,
  precioCosto: 1500,
  precioCostoUnitario: 1500,
  precioCostoBulto: 1500,
  precioCostoUnitarioReal: 1500,
  precioCostoFormatoDepositoReal: 1500,
  unidadMedida: "pack",
  factorPack: 10,
  stock: 200,
  modoSalidaDefault: "UNIDAD",
  oferta: null,
  sueltosPorUnidad: 20,
  precioVentaSuelto: 100,
  precioCostoSuelto: 75,
  nombreUnidad: "atado",
  nombreBulto: "cartón",
});

// El mismo producto sin el dato: lo que devuelve hoy la ruta para todo.
const SIN_SUELTOS = Object.freeze({
  ...ATADO,
  stock: 10,
  sueltosPorUnidad: null,
  precioVentaSuelto: null,
  precioCostoSuelto: null,
  nombreUnidad: null,
  nombreBulto: null,
});

const agregar = (st, producto) => posVentaReducer(st, { type: ActionTypes.ADD_ITEM, payload: { producto } });

test("H1. el gemelo: mismo producto, nombre con ' · suelto', precio y costo del cigarrillo, sin códigos ni oferta", () => {
  const g = gemeloSuelto(ATADO);
  assert.equal(g.esSuelto, true);
  assert.equal(g.nombre, "Camel Yellow 20 · suelto");
  assert.equal(SUFIJO_SUELTO, " · suelto");
  assert.equal(g.productoBaseId, ATADO.productoBaseId);
  assert.equal(g.productoLocalId, ATADO.productoLocalId);
  assert.equal(g.stock, ATADO.stock, "comparten el stock");
  assert.equal(g.precioVenta, 100);
  assert.equal(g.precioCosto, 75);
  assert.equal(g.codigoBarra, "", "el escáner no puede elegir el suelto");
  assert.equal(g.oferta, null);
});

test("H2. sin precio de suelto (depósito, sin el dato o sin precio): no hay gemelo y la lista queda idéntica", () => {
  assert.equal(gemeloSuelto(SIN_SUELTOS), null);
  const lista = [SIN_SUELTOS, { ...SIN_SUELTOS, productoBaseId: 8 }];
  assert.deepEqual(conGemelosSueltos(lista), lista);
  const conUno = conGemelosSueltos([ATADO, SIN_SUELTOS]);
  assert.deepEqual(conUno.map((i) => i.nombre), ["Camel Yellow 20", "Camel Yellow 20 · suelto", "Camel Yellow 20"]);
  assert.strictEqual(conUno[0], ATADO, "el resultado de siempre no se toca");
});

test("H3. el carrito: atado y suelto son líneas distintas; el suelto va en modo SUELTO, cobra 100 y sube de a uno", () => {
  let st = agregar(initialState, ATADO);
  st = agregar(st, gemeloSuelto(ATADO));
  assert.equal(st.carrito.length, 2, "el suelto se sumó a la línea del atado");
  const suelta = st.carrito.find((i) => i.modoVentaLinea === MODO_SUELTO);
  const atado = st.carrito.find((i) => i.modoVentaLinea === "NORMAL");
  assert.equal(suelta.nombre, "Camel Yellow 20 · suelto");
  assert.equal(suelta.precio, 100);
  assert.equal(suelta.precioCosto, 75);
  assert.equal(suelta.stockMax, 200, "el suelto se topa en los sueltos");
  assert.equal(atado.stockMax, 10, "el atado, en los atados enteros");

  st = agregar(st, gemeloSuelto(ATADO));
  assert.equal(st.carrito.find((i) => i.modoVentaLinea === MODO_SUELTO).cantidad, 2, "+ suma un cigarrillo");
  assert.equal(st.carrito.find((i) => i.modoVentaLinea === "NORMAL").cantidad, 1);

  const payload = itemCrearPayload(suelta);
  assert.equal(payload.modoVentaLinea, MODO_SUELTO);
  assert.equal(payload.precio, 100);
  assert.equal(payload.cantidad, 1);
});

test("H4. sin sueltos la línea es la de siempre: sin campos nuevos, tope = stock, se fusiona por producto", () => {
  let st = agregar(initialState, SIN_SUELTOS);
  const linea = st.carrito[0];
  assert.equal(linea.modoVentaLinea, "NORMAL");
  assert.equal(linea.stockMax, 10);
  for (const campo of ["stockSueltos", "sueltosPorUnidad", "nombreUnidad", "nombreBulto"]) {
    assert.equal(campo in linea, false, `la línea sin sueltos ganó ${campo}`);
  }
  st = agregar(st, SIN_SUELTOS);
  assert.equal(st.carrito.length, 1);
  assert.equal(st.carrito[0].cantidad, 2);
  assert.deepEqual(escalaDeLineaDelCarrito(SIN_SUELTOS), {});
  assert.equal(topeDeLineaDelCarrito(SIN_SUELTOS), 10);
  assert.equal(esLaMismaLinea(linea, SIN_SUELTOS), true);
});

test("H5. el stock de la línea en tres niveles; null sin sueltos", () => {
  const st = agregar(agregar(initialState, ATADO), gemeloSuelto(ATADO));
  assert.equal(textoDeStockDeLaLinea(st.carrito[0]), "1 cartón");
  assert.equal(textoDeStockDeLaLinea({ ...st.carrito[0], stockSueltos: 195 }, false), "9 atados y 15 sueltos");
  assert.equal(textoDeStockDeLaLinea(agregar(initialState, SIN_SUELTOS).carrito[0]), null);
});

test("H6. límites: en bultos o en unidades por el embudo; sin sueltos, exactamente lo de antes", () => {
  const depositoPack = { usarBultos: true, factorPack: 10, sueltosPorUnidad: 20 };
  assert.equal(limiteEnLaEscalaDeCarga(400, depositoPack), 2, "400 sueltos = 2 cartones");
  assert.equal(limiteParaEnviar(2, depositoPack), 400);
  const local = { usarBultos: false, factorPack: 10, sueltosPorUnidad: 20 };
  assert.equal(limiteEnLaEscalaDeCarga(60, local), 3, "60 sueltos = 3 atados");
  assert.deepEqual(limiteParaEnviar(3, local), { unidades: 3 }, "la ruta lo lleva a sueltos");
  assert.equal(limiteParaEnviar(null, local), null, "vacío sigue siendo borrar");

  // Sin sueltos: lo de antes, bultos × factor o el valor tal cual.
  const sinPack = { usarBultos: true, factorPack: 12, sueltosPorUnidad: null };
  assert.equal(limiteEnLaEscalaDeCarga(36, sinPack), 3);
  assert.equal(limiteParaEnviar(3, sinPack), 36);
  const sin = { usarBultos: false, factorPack: 1, sueltosPorUnidad: null };
  assert.equal(limiteEnLaEscalaDeCarga(7, sin), 7);
  assert.equal(limiteEnLaEscalaDeCarga(0, sin), 0, "un cero configurado sigue siendo cero");
  assert.equal(limiteEnLaEscalaDeCarga(null, sin), null);
  assert.equal(limiteParaEnviar(7, sin), 7);
});

test("H7. valor del stock: la escala del momento lleva los nombres del producto de HOY", () => {
  const base = { instante: "2026-11-01T00:00:00.000Z", productoBaseId: 7, unidadMedida: "pack", factorPack: 10, sueltosPorUnidad: 20, pesoReferenciaKg: null, pesoEsFijo: false };
  const versiones = {
    ubicaciones: [{ instante: "2026-11-01T00:00:00.000Z", tipo: "ALTA", productoBaseId: 7, esDeposito: false }],
    basesPorId: new Map([[7, [base]]]),
    instante: "2026-11-02T00:00:00.000Z",
  };
  const conNombres = escalaDelMomento(versiones, { nombreUnidad: "atado", nombreBulto: "cartón" });
  assert.equal(conNombres.escala.nombreUnidad, "atado");
  assert.equal(conNombres.escala.nombreBulto, "cartón");

  // Sin sueltos, los nombres no entran: la escala es la de siempre.
  const sinSueltos = { ...versiones, basesPorId: new Map([[7, [{ ...base, sueltosPorUnidad: null }]]]) };
  assert.deepEqual(
    escalaDelMomento(sinSueltos, { nombreUnidad: "atado", nombreBulto: "cartón" }),
    escalaDelMomento(sinSueltos),
  );
});
