// lib/pos-ventas/lineaPorImporte.test.mjs
//
// Líneas de PESO cargadas POR IMPORTE.
//
// El caso que originó todo: precio $8.500/kg, el cajero teclea $2.000. El peso
// derivado es 0,235294… kg, se cuantiza a 0,235 (gramos: lo hace el POS y lo
// hace la columna Decimal(12,3)) y reconstruir la plata como precio × cantidad
// devuelve $1.997,50. La regla es que el importe manda y NO se re-deriva.
//
// Se cubre el recorrido entero, no solo el helper: carrito (reducer) → payload →
// líneas persistidas (planConsumoVenta) → comprobante → corrección.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/lineaPorImporte.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  esProductoPorPeso,
  pesoDesdeImporte,
  validarSubtotalFijado,
  esLineaPorImporte,
  subtotalLinea,
  sumarSubtotales,
  combinarSubtotalFijado,
  preservarSubtotalOriginal,
} from "./lineaPorImporte.js";
import { planConsumoVenta } from "../combos/planConsumoVenta.js";
import { itemCrearPayload, itemsCrearPayload } from "./payloadVenta.js";
import { posVentaReducer, ActionTypes, initialState } from "../../app/modulos/pos-ventas/reducer/posVentaReducer.js";

const KG = { unidad_medida: "kg" };
const UNIDAD = { unidad_medida: "unidad" };

// Arma la línea tal como la deja el POS al cargar POR IMPORTE.
function lineaPorImporte(precioPorKg, importe) {
  return {
    tipo: "NORMAL",
    productoBaseId: 1,
    productoLocalId: 10,
    nombre: "Paleta",
    precio: precioPorKg,
    cantidad: pesoDesdeImporte(importe, precioPorKg),
    costoUnitario: 0,
    subtotalFijado: importe,
  };
}

// ---------------------------------------------------------------------------
// 1 · $8.500/kg + $2.000 → total exacto $2.000
// ---------------------------------------------------------------------------
test("1 · precio 8500/kg e importe 2000 cobra exactamente 2000", () => {
  const l = lineaPorImporte(8500, 2000);

  // El peso derivado NO es exacto y la reconstrucción vieja perdía plata.
  assert.equal(l.cantidad, 0.235);
  assert.equal(Math.round(8500 * 0.235 * 100) / 100, 1997.5, "así se rompía antes");

  // Con la regla nueva, el importe manda.
  assert.equal(subtotalLinea(l), 2000);
});

// ---------------------------------------------------------------------------
// 2 · $7.999/kg + $2.000 → total exacto $2.000
// ---------------------------------------------------------------------------
test("2 · precio 7999/kg e importe 2000 cobra exactamente 2000", () => {
  const l = lineaPorImporte(7999, 2000);
  assert.equal(l.cantidad, 0.25); // 2000/7999 = 0,2500312… → 0,250
  assert.notEqual(Math.round(7999 * 0.25 * 100) / 100, 2000);
  assert.equal(subtotalLinea(l), 2000);
});

// ---------------------------------------------------------------------------
// 3 · Precio con decimales y peso periódico
// ---------------------------------------------------------------------------
test("3 · precio con centavos y peso periódico igual cobra el importe exacto", () => {
  // 3000 / 7000,55 = 0,42853…  → 0,429 kg (periódico, se corta al gramo)
  const l = lineaPorImporte(7000.55, 3000);
  assert.equal(l.cantidad, 0.429);
  assert.equal(Math.round(7000.55 * 0.429 * 100) / 100, 3003.24, "así se rompía antes");
  assert.equal(subtotalLinea(l), 3000);

  // Un tercio de kilo sobre un precio con centavos: 1000 / 2999,99 = 0,33333…
  const l2 = lineaPorImporte(2999.99, 1000);
  assert.equal(l2.cantidad, 0.333);
  assert.notEqual(Math.round(2999.99 * 0.333 * 100) / 100, 1000);
  assert.equal(subtotalLinea(l2), 1000);
});

// ---------------------------------------------------------------------------
// 4 · Ingreso directo de peso → comportamiento actual intacto
// ---------------------------------------------------------------------------
test("4 · peso ingresado a mano sigue cobrando peso × precio", () => {
  const l = { precio: 8500, cantidad: 0.235, subtotalFijado: null };
  assert.equal(esLineaPorImporte(l), false);
  assert.equal(subtotalLinea(l), 1997.5);

  // Sin el campo siquiera (línea legacy / cola offline vieja): idéntico.
  assert.equal(subtotalLinea({ precio: 8500, cantidad: 0.235 }), 1997.5);
});

// ---------------------------------------------------------------------------
// 5 · Producto por unidad → sin cambios
// ---------------------------------------------------------------------------
test("5 · productos por unidad, pack y servicio quedan fuera de la regla", () => {
  assert.equal(subtotalLinea({ precio: 1500, cantidad: 3 }), 4500);
  assert.equal(esProductoPorPeso(UNIDAD), false);
  assert.equal(esProductoPorPeso({ unidad_medida: "pack" }), false);
  assert.equal(esProductoPorPeso({ unidad_medida: "cajon" }), false);
  assert.equal(esProductoPorPeso(KG), true);

  // Fiambre de PIEZA FIJA: unidad "kg" pero en depósito se vende por piezas.
  const piezaFija = { unidad_medida: "kg", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 3.2 };
  assert.equal(esProductoPorPeso(piezaFija, { esDeposito: true }), false);
  // En un local normal ese mismo producto sí se vende por peso.
  assert.equal(esProductoPorPeso(piezaFija, { esDeposito: false }), true);
});

// ---------------------------------------------------------------------------
// 6 · Cambiar la cantidad después de haber ingresado un importe
// ---------------------------------------------------------------------------
test("6 · editar el peso a mano suelta el importe fijado (el peso pasa a mandar)", () => {
  const conImporte = {
    ...initialState,
    carrito: [{ productoBaseId: 1, nombre: "Paleta", precio: 8500, cantidad: 0.235, subtotalFijado: 2000 }],
  };
  assert.equal(sumarSubtotales(conImporte.carrito), 2000);

  const editado = posVentaReducer(conImporte, {
    type: ActionTypes.UPDATE_CANTIDAD,
    payload: { idx: 0, nuevaCantidad: 0.5 },
  });
  assert.equal(editado.carrito[0].subtotalFijado, null);
  assert.equal(sumarSubtotales(editado.carrito), 4250); // 0,5 × 8500
});

// ---------------------------------------------------------------------------
// 7 · Eliminar y volver a cargar el producto
// ---------------------------------------------------------------------------
test("7 · eliminar y recargar deja la línea con el importe nuevo, sin arrastres", () => {
  const producto = { productoBaseId: 1, nombre: "Paleta", precioVenta: 8500, unidadMedida: "kg", stock: 20 };

  let st = posVentaReducer(initialState, {
    type: ActionTypes.ADD_ITEM,
    payload: { producto, cantidadInicial: 0.235, subtotalFijado: 2000 },
  });
  assert.equal(sumarSubtotales(st.carrito), 2000);

  st = posVentaReducer(st, { type: ActionTypes.REMOVE_ITEM, payload: { idx: 0 } });
  assert.equal(st.carrito.length, 0);

  st = posVentaReducer(st, {
    type: ActionTypes.ADD_ITEM,
    payload: { producto, cantidadInicial: 0.118, subtotalFijado: 1000 },
  });
  assert.equal(st.carrito.length, 1);
  assert.equal(st.carrito[0].subtotalFijado, 1000);
  assert.equal(sumarSubtotales(st.carrito), 1000);
});

test("7b · dos cargas por importe del mismo producto suman los importes", () => {
  const producto = { productoBaseId: 1, nombre: "Paleta", precioVenta: 8500, unidadMedida: "kg", stock: 20 };
  let st = posVentaReducer(initialState, {
    type: ActionTypes.ADD_ITEM,
    payload: { producto, cantidadInicial: 0.235, subtotalFijado: 2000 },
  });
  st = posVentaReducer(st, {
    type: ActionTypes.ADD_ITEM,
    payload: { producto, cantidadInicial: 0.118, subtotalFijado: 1000 },
  });
  assert.equal(st.carrito.length, 1);
  assert.equal(st.carrito[0].cantidad, 0.353);
  assert.equal(sumarSubtotales(st.carrito), 3000); // no 0,353 × 8500 = 3000,50
});

test("7c · dos cargas POR PESO no activan la regla (comportamiento actual)", () => {
  const producto = { productoBaseId: 1, nombre: "Paleta", precioVenta: 8500, unidadMedida: "kg", stock: 20 };
  let st = posVentaReducer(initialState, {
    type: ActionTypes.ADD_ITEM,
    payload: { producto, cantidadInicial: 0.2, subtotalFijado: null },
  });
  st = posVentaReducer(st, {
    type: ActionTypes.ADD_ITEM,
    payload: { producto, cantidadInicial: 0.3, subtotalFijado: null },
  });
  assert.equal(st.carrito[0].subtotalFijado, null);
  assert.equal(sumarSubtotales(st.carrito), 4250); // 0,5 × 8500
});

// ---------------------------------------------------------------------------
// 8 · Creación de la venta en backend (lo que efectivamente se persiste)
// ---------------------------------------------------------------------------
test("8 · planConsumoVenta persiste el importe exacto como subtotal de la línea", () => {
  const { lineasComerciales } = planConsumoVenta({
    lineas: [lineaPorImporte(8500, 2000)],
    esDeposito: false,
  });
  const l = lineasComerciales[0];
  assert.equal(l.subtotal, 2000, "VentaDetalle.subtotal = el importe tecleado");
  assert.equal(l.cantidad, 0.235, "VentaDetalle.cantidad = el peso derivado");
});

test("8b · el payload al backend transporta el importe fijado", () => {
  const item = { productoBaseId: 1, nombre: "Paleta", precio: 8500, cantidad: 0.235, subtotalFijado: 2000 };
  assert.equal(itemCrearPayload(item).subtotalFijado, 2000);

  // Servicios y productos comunes viajan sin marcador.
  assert.equal(itemCrearPayload({ ...item, esServicio: true }).subtotalFijado, null);
  assert.equal(itemCrearPayload({ productoBaseId: 2, precio: 100, cantidad: 1 }).subtotalFijado, null);

  const payload = itemsCrearPayload([item, { productoBaseId: 2, precio: 100, cantidad: 2 }]);
  assert.deepEqual(payload.map((i) => i.subtotalFijado), [2000, null]);
});

test("8c · el backend rechaza importes inválidos", () => {
  assert.equal(validarSubtotalFijado(0).valido, false);
  assert.equal(validarSubtotalFijado(-5).valido, false);
  assert.equal(validarSubtotalFijado(null).valido, false);
  assert.equal(validarSubtotalFijado("").valido, false);
  assert.equal(validarSubtotalFijado("abc").valido, false);
  assert.equal(validarSubtotalFijado(true).valido, false);
  assert.equal(validarSubtotalFijado({}).valido, false);
  assert.equal(validarSubtotalFijado(Infinity).valido, false);
  assert.equal(validarSubtotalFijado(2000).importe, 2000);
  assert.equal(validarSubtotalFijado("2000.50").importe, 2000.5);
  // Se normaliza a centavos: lo mostrado y lo guardado son el mismo número.
  assert.equal(validarSubtotalFijado(2000.555).importe, 2000.56);
});

test("8d · un importe que no alcanza a 1 gramo no deriva peso", () => {
  assert.equal(pesoDesdeImporte(1, 8500), null); // 0,000117 kg
  assert.equal(pesoDesdeImporte(0, 8500), null);
  assert.equal(pesoDesdeImporte(2000, 0), null);
  assert.equal(pesoDesdeImporte(9, 8500), 0.001);
});

// ---------------------------------------------------------------------------
// 9 · Comprobante
// ---------------------------------------------------------------------------
test("9 · el ticket muestra el importe exacto, no peso × precio", () => {
  // Ticket en vuelo (offline / térmico): leen la línea del carrito.
  const itemTicket = { nombre: "Paleta", precio: 8500, cantidad: 0.235, subtotalFijado: 2000 };
  assert.equal(subtotalLinea(itemTicket), 2000);

  // Ticket de una venta YA guardada (PDF): manda el subtotal persistido.
  const detalle = { nombre: "Paleta", precio: 8500, cantidad: 0.235, subtotal: 2000 };
  const impreso = detalle.subtotal != null
    ? Number(detalle.subtotal)
    : Number(detalle.precio) * Number(detalle.cantidad);
  assert.equal(impreso, 2000);

  // Venta legacy sin subtotal guardado: se sigue reconstruyendo.
  const legacy = { precio: 1500, cantidad: 2 };
  const impresoLegacy = legacy.subtotal != null
    ? Number(legacy.subtotal)
    : Number(legacy.precio) * Number(legacy.cantidad);
  assert.equal(impresoLegacy, 3000);
});

// ---------------------------------------------------------------------------
// 10 · Stock: se descuenta el PESO, nunca el importe
// ---------------------------------------------------------------------------
test("10 · el stock se descuenta con el peso derivado, no con el importe", () => {
  const { lineasComerciales, consumoFisicoConsolidado } = planConsumoVenta({
    lineas: [lineaPorImporte(8500, 2000)],
    esDeposito: false,
  });
  assert.equal(lineasComerciales[0].consumoFisico.cantidadStock, 0.235);
  assert.equal(consumoFisicoConsolidado.length, 1);
  assert.equal(consumoFisicoConsolidado[0].cantidad, 0.235);
  assert.notEqual(consumoFisicoConsolidado[0].cantidad, 2000);
});

test("10b · el costo de la línea sale del peso real, no de lo cobrado", () => {
  const linea = { ...lineaPorImporte(8500, 2000), costoUnitario: 6000 };
  const { lineasComerciales } = planConsumoVenta({ lineas: [linea], esDeposito: false });
  assert.equal(lineasComerciales[0].costoLinea, 1410); // 0,235 × 6000
  assert.equal(lineasComerciales[0].subtotal, 2000);
});

// ---------------------------------------------------------------------------
// 11 · Corrección de ventas
// ---------------------------------------------------------------------------
test("11 · corregir otra cosa no reescribe el importe de una línea intacta", () => {
  const originales = [
    { id: 7, productoBaseId: 1, cantidad: 0.235, precio: 8500, subtotal: 2000 },
    { id: 8, productoBaseId: 2, cantidad: 2, precio: 1500, subtotal: 3000 },
  ];
  const delEditor = [
    { tipo: "NORMAL", origenDetalleId: 7, productoBaseId: 1, cantidad: 0.235, precio: 8500, costoUnitario: 0 },
    { tipo: "NORMAL", origenDetalleId: 8, productoBaseId: 2, cantidad: 2, precio: 1500, costoUnitario: 0 },
  ];

  const preservadas = preservarSubtotalOriginal(delEditor, originales);
  const { lineasComerciales } = planConsumoVenta({ lineas: preservadas, esDeposito: false });
  assert.equal(lineasComerciales[0].subtotal, 2000, "sin esto volvería a 1997,50");
  assert.equal(lineasComerciales[1].subtotal, 3000);

  const totalNuevo = lineasComerciales.reduce((a, l) => a + l.subtotal, 0);
  assert.equal(totalNuevo, 5000, "el total no se mueve al corregir el cliente");
});

test("11b · si el admin edita el peso, la línea vuelve a derivarse", () => {
  const originales = [{ id: 7, productoBaseId: 1, cantidad: 0.235, precio: 8500, subtotal: 2000 }];
  const editada = [
    { tipo: "NORMAL", origenDetalleId: 7, productoBaseId: 1, cantidad: 0.5, precio: 8500, costoUnitario: 0 },
  ];
  const [l] = preservarSubtotalOriginal(editada, originales);
  assert.equal(l.subtotalFijado, undefined);
  assert.equal(subtotalLinea(l), 4250); // el peso manda
});

test("11c · si el admin edita el precio, la línea vuelve a derivarse", () => {
  const originales = [{ id: 7, productoBaseId: 1, cantidad: 0.235, precio: 8500, subtotal: 2000 }];
  const editada = [
    { tipo: "NORMAL", origenDetalleId: 7, productoBaseId: 1, cantidad: 0.235, precio: 9000, costoUnitario: 0 },
  ];
  const [l] = preservarSubtotalOriginal(editada, originales);
  assert.equal(l.subtotalFijado, undefined);
  assert.equal(subtotalLinea(l), 2115); // 0,235 × 9000
});

test("11d · una línea agregada en la corrección no hereda nada", () => {
  const originales = [{ id: 7, productoBaseId: 1, cantidad: 0.235, precio: 8500, subtotal: 2000 }];
  const nueva = [{ tipo: "NORMAL", origenDetalleId: null, productoBaseId: 3, cantidad: 1, precio: 500 }];
  const [l] = preservarSubtotalOriginal(nueva, originales);
  assert.equal(l.subtotalFijado, undefined);
  assert.equal(subtotalLinea(l), 500);
});

test("11e · los servicios conservan su propio camino server-authoritative", () => {
  const originales = [{ id: 9, productoBaseId: 5, cantidad: 1, precio: 1050, subtotal: 1050 }];
  const servicio = [{ tipo: "SERVICIO", origenDetalleId: 9, productoBaseId: 5, cantidad: 1, precio: 1050 }];
  const [l] = preservarSubtotalOriginal(servicio, originales);
  assert.equal(l.subtotalFijado, undefined);
});

// ---------------------------------------------------------------------------
// 12 · Mostrado == enviado == guardado == cobrado
// ---------------------------------------------------------------------------
test("12 · el importe es el mismo en carrito, payload, línea guardada y ticket", () => {
  const producto = { productoBaseId: 1, nombre: "Paleta", precioVenta: 8500, unidadMedida: "kg", stock: 20 };
  const peso = pesoDesdeImporte(2000, 8500);

  // Carrito (lo que ve y cobra el cajero)
  const st = posVentaReducer(initialState, {
    type: ActionTypes.ADD_ITEM,
    payload: { producto, cantidadInicial: peso, subtotalFijado: 2000 },
  });
  const mostrado = sumarSubtotales(st.carrito);

  // Payload (lo que se envía)
  const enviado = itemsCrearPayload(st.carrito)[0].subtotalFijado;

  // Línea persistida (lo que se guarda)
  const { lineasComerciales } = planConsumoVenta({
    lineas: [{ tipo: "NORMAL", productoBaseId: 1, productoLocalId: 10, precio: 8500, cantidad: peso, costoUnitario: 0, subtotalFijado: enviado }],
    esDeposito: false,
  });
  const guardado = lineasComerciales[0].subtotal;

  // Ticket (lo que se imprime)
  const impreso = subtotalLinea({ precio: 8500, cantidad: peso, subtotalFijado: guardado });

  assert.equal(mostrado, 2000);
  assert.equal(enviado, 2000);
  assert.equal(guardado, 2000);
  assert.equal(impreso, 2000);
  assert.equal(new Set([mostrado, enviado, guardado, impreso]).size, 1);
});

test("12b · una venta mixta suma sin arrastrar centavos", () => {
  const carrito = [
    { precio: 8500, cantidad: 0.235, subtotalFijado: 2000 }, // por importe
    { precio: 8500, cantidad: 0.235 },                        // por peso
    { precio: 1500, cantidad: 3 },                            // por unidad
  ];
  assert.equal(sumarSubtotales(carrito), 2000 + 1997.5 + 4500);
});

// ---------------------------------------------------------------------------
// Fusión de cargas (helper puro)
// ---------------------------------------------------------------------------
test("combinarSubtotalFijado solo activa la regla si alguna carga fue por importe", () => {
  const porPeso = { precio: 8500, cantidad: 0.2 };
  const porImporte = { precio: 8500, cantidad: 0.235, subtotalFijado: 2000 };

  assert.equal(combinarSubtotalFijado(porPeso, { precio: 8500, cantidad: 0.3 }), null);
  assert.equal(combinarSubtotalFijado(porImporte, { precio: 8500, cantidad: 0.118, subtotalFijado: 1000 }), 3000);
  // Mezcla: el importe tecleado se respeta y el peso se calcula.
  assert.equal(combinarSubtotalFijado(porImporte, porPeso), 2000 + 1700);
});
