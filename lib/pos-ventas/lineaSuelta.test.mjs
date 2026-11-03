// CANDADOS DE LA LÍNEA SUELTA Y DE LA ESCALA CONGELADA (tercer nivel de
// empaque, tanda 4 — docs/roadmap/tercer-nivel-empaque.md).
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/lineaSuelta.test.mjs
//
// La atadura de cobro y descuento en las tres escalas vive en
// `lib/precios/escalaDeVenta.test.mjs`. Acá va lo demás: qué cobra y qué cuesta
// un suelto, qué se congela en la venta y cómo vuelve el stock cuando se anula o
// se corrige una venta hecha con otro N.
//
// Los productos con sueltos de estos casos tienen la forma de la base: la ficha
// trae `sueltos_por_unidad` y `ProductoLocal` trae `precio_venta_suelto`
// (migración `20261103230000_tercer_nivel_empaque`). Hoy nadie los escribe; los
// casos los cargan a mano para ejercer las ramas que los usan.

import test from "node:test";
import assert from "node:assert/strict";

import {
  MODO_SUELTO,
  MOTIVO_SUELTO,
  costoDeUnSuelto,
  modoDeLineaGuardada,
  precioDeUnSuelto,
  resolverLineaSuelta,
} from "./lineaSuelta.js";
import { cantidadDeStockEnLaEscalaDeHoy, sueltosParaCongelar } from "../conversiones/stock.js";
import { planConsumoVenta } from "../combos/planConsumoVenta.js";
import { deltaDeDevolucion } from "./reversionVenta.js";
import { reconstruirConsumoOriginal } from "./motorCorreccion.js";
import { detectarEscalaContradictoria, MOTIVO } from "./escalaContradictoria.js";

// Un cartón de 10 atados de 20 cigarrillos, a $12.000 el cartón. El atado sale
// $1.200 de costo y el cigarrillo $60. El local cobra el suelto $100.
const CARTON = { precio_costo: "12000.00", unidad_medida: "pack", factor_pack: 10, sueltos_por_unidad: 20, es_combo: false, modalidad: "NORMAL" };
const EN_EL_LOCAL = { precio_venta_suelto: "100.00", precio_costo: null };

// ── 1. LO QUE COBRA Y LO QUE CUESTA UN SUELTO ─────────────────────────────

test("el suelto cobra su propio precio, no el del atado dividido, y cuesta el atado ÷ 20", () => {
  const r = resolverLineaSuelta({ esDeposito: false, base: CARTON, productoLocal: EN_EL_LOCAL, lista: null });
  assert.equal(r.ok, true);
  assert.equal(r.precio, 100, "el precio del suelto no es el cargado en la ubicación");
  assert.equal(r.precioCosto, 60, "el costo del suelto no es el del atado repartido");
  assert.equal(r.aplicacionLista, null);
});

test("el costo propio de la ubicación manda sobre el de la ficha, como en el resto del POS", () => {
  assert.equal(costoDeUnSuelto({ base: CARTON, costoLocal: "24000.00" }), 120);
  assert.equal(costoDeUnSuelto({ base: CARTON, costoLocal: null }), 60);
});

test("la lista del cliente se aplica al suelto como en buscar-producto", () => {
  const alCostoMas50 = { id: 7, tipoBase: "COSTO", margenPorcentaje: 50, redondeo_100: false };
  const r = resolverLineaSuelta({ esDeposito: false, base: CARTON, productoLocal: EN_EL_LOCAL, lista: alCostoMas50 });
  assert.equal(r.precio, 90, "costo $60 + 50 %");
  assert.equal(r.aplicacionLista.listaPrecioId, 7);
  assert.equal(r.aplicacionLista.precioOriginal, 100);
});

test("una lista que no se puede aplicar deja el precio cargado, igual que en buscar-producto", () => {
  const manual = { id: 8, tipoBase: "MANUAL_AUTORIZADO" };
  assert.deepEqual(precioDeUnSuelto({ precioVentaSuelto: 100, costoSuelto: 60, lista: manual }), { precio: 100, aplicacionLista: null });
});

test("los rechazos dicen qué pasó, con su código", () => {
  const casos = [
    [{ esDeposito: true, base: CARTON, productoLocal: EN_EL_LOCAL }, MOTIVO_SUELTO.EN_DEPOSITO],
    [{ esDeposito: false, base: { ...CARTON, sueltos_por_unidad: null }, productoLocal: EN_EL_LOCAL }, MOTIVO_SUELTO.SIN_SUELTOS],
    [{ esDeposito: false, base: CARTON, productoLocal: { precio_venta_suelto: null } }, MOTIVO_SUELTO.SIN_PRECIO],
    [{ esDeposito: false, base: { ...CARTON, modalidad: "IMPORTE_VARIABLE" }, productoLocal: EN_EL_LOCAL }, MOTIVO_SUELTO.NO_ADMITE],
  ];
  for (const [args, motivo] of casos) {
    const r = resolverLineaSuelta(args);
    assert.equal(r.ok, false);
    assert.equal(r.motivo, motivo);
    assert.ok(r.error.length > 20, "un rechazo sin explicación");
  }
});

// ── 2. LO QUE SE CONGELA EN LA VENTA ──────────────────────────────────────

const lineaNormal = (modoVentaLinea, sueltos) => ({
  tipo: "NORMAL", productoBaseId: 1, productoLocalId: 11, cantidad: 2, precio: 1500, costoUnitario: 1200,
  baseStock: { factorPack: 10, modo_envio: null, unidad_medida: "pack", sueltos_por_unidad: sueltos },
  modoVentaLinea,
});

test("la venta congela el N con que calculó cantidadStock, y null cuando es 1", () => {
  const conSueltos = planConsumoVenta({ lineas: [lineaNormal("NORMAL", 20)], esDeposito: false }).lineasComerciales[0];
  assert.deepEqual(conSueltos.consumoFisico, { productoLocalId: 11, cantidadStock: 40, sueltosPorUnidadCongelado: 20 });

  const suelta = planConsumoVenta({ lineas: [lineaNormal(MODO_SUELTO, 20)], esDeposito: false }).lineasComerciales[0];
  assert.deepEqual(suelta.consumoFisico, { productoLocalId: 11, cantidadStock: 2, sueltosPorUnidadCongelado: 20 });

  // Hoy: sin sueltos no se congela nada, y la cantidad es la de siempre.
  const hoy = planConsumoVenta({ lineas: [lineaNormal("NORMAL", null)], esDeposito: false }).lineasComerciales[0];
  assert.deepEqual(hoy.consumoFisico, { productoLocalId: 11, cantidadStock: 2, sueltosPorUnidadCongelado: null });
});

test("sueltosParaCongelar: 20 se congela, 1 y lo que la base no admite no", () => {
  assert.equal(sueltosParaCongelar({ sueltos_por_unidad: 20 }), 20);
  for (const s of [null, undefined, 1, 0, -3, 2.5]) assert.equal(sueltosParaCongelar({ sueltos_por_unidad: s }), null, `s=${s}`);
});

test("una línea guardada se reconoce suelta solo con N congelado, en un local, y cuando descontó la cantidad tal cual", () => {
  assert.equal(modoDeLineaGuardada({ cantidad: 3, cantidadStock: 3, sueltosPorUnidadCongelado: 20, esDeposito: false }), MODO_SUELTO);
  assert.equal(modoDeLineaGuardada({ cantidad: 3, cantidadStock: 60, sueltosPorUnidadCongelado: 20, esDeposito: false }), null, "una línea por unidad");
  assert.equal(modoDeLineaGuardada({ cantidad: 3, cantidadStock: 3, sueltosPorUnidadCongelado: null, esDeposito: false }), null, "sin N, hoy");
  assert.equal(modoDeLineaGuardada({ cantidad: 3, cantidadStock: 3, sueltosPorUnidadCongelado: 20, esDeposito: true }), null, "el depósito");
});

// ── 3. EL STOCK QUE VUELVE, EN LA ESCALA DE HOY ───────────────────────────

test("con el mismo N la cantidad vuelve TAL CUAL, sin tocarla", () => {
  const decimal = { toString: () => "3.000" }; // como un Decimal de Prisma
  assert.equal(cantidadDeStockEnLaEscalaDeHoy({ cantidad: decimal, sueltosAlMoverse: null, sueltosHoy: null }), decimal);
  assert.equal(cantidadDeStockEnLaEscalaDeHoy({ cantidad: 40, sueltosAlMoverse: 20, sueltosHoy: 20 }), 40);
});

test("una venta de 2 atados hecha antes de cargar 20 sueltos devuelve 40 sueltos", () => {
  assert.equal(cantidadDeStockEnLaEscalaDeHoy({ cantidad: "2.000", sueltosAlMoverse: null, sueltosHoy: 20 }), 40);
  // Y al revés: si la ficha volvió a no tener sueltos, 40 sueltos son 2 atados.
  assert.equal(cantidadDeStockEnLaEscalaDeHoy({ cantidad: 40, sueltosAlMoverse: 20, sueltosHoy: null }), 2);
});

test("ANULAR: deltaDeDevolucion convierte cada línea del N de la venta al de hoy", () => {
  const detalles = [
    { productoLocalId: 11, cantidadStock: "2.000", sueltosPorUnidadCongelado: null, productoBase: { sueltos_por_unidad: 20 } },
    { productoLocalId: 12, cantidadStock: "5.000", sueltosPorUnidadCongelado: null, productoBase: { sueltos_por_unidad: null } },
  ];
  assert.deepEqual(deltaDeDevolucion(detalles), [
    { productoLocalId: 11, delta: 40 },
    { productoLocalId: 12, delta: 5 },
  ]);
});

test("CORREGIR: el consumo congelado se reconstruye en la escala de hoy", () => {
  const det = { esServicio: false, componentes: [], productoLocalId: 11, cantidadStock: 2, cantidad: 2, sueltosPorUnidadCongelado: null, sueltosHoy: 20 };
  assert.deepEqual(reconstruirConsumoOriginal(det).consumo, [{ productoLocalId: 11, cantidad: 40 }]);
  // CONTRAPRUEBA: con el mismo N, lo de siempre.
  assert.deepEqual(reconstruirConsumoOriginal({ ...det, sueltosHoy: null }).consumo, [{ productoLocalId: 11, cantidad: 2 }]);
});

// ── 4. LA ESCALA CONTRADICTORIA, UN ESCALÓN MÁS ABAJO ─────────────────────

test("una línea suelta con el costo del atado, o una de atado con el del cigarrillo, se contradicen", () => {
  const base = { costoBulto: 12000, factorPack: 10, sueltosPorUnidad: 20, esDeposito: false };
  assert.equal(detectarEscalaContradictoria({ ...base, modoVentaLinea: MODO_SUELTO, costoCliente: 1200 }).motivo, MOTIVO.COSTO_DE_UNIDAD_EN_LINEA_SUELTA);
  assert.equal(detectarEscalaContradictoria({ ...base, modoVentaLinea: "NORMAL", costoCliente: 60 }).motivo, MOTIVO.COSTO_DE_SUELTO_EN_LINEA_DE_UNIDAD);
  // Cada uno con su propio costo, sin contradicción.
  assert.equal(detectarEscalaContradictoria({ ...base, modoVentaLinea: MODO_SUELTO, costoCliente: 60 }).contradice, false);
  assert.equal(detectarEscalaContradictoria({ ...base, modoVentaLinea: "NORMAL", costoCliente: 1200 }).contradice, false);
  // Sin sueltos (hoy) no hay escalón suelto que mirar.
  assert.equal(detectarEscalaContradictoria({ ...base, sueltosPorUnidad: null, modoVentaLinea: "NORMAL", costoCliente: 60 }).contradice, false);
});
