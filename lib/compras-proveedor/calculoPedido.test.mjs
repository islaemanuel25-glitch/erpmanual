// Candados de lib/compras-proveedor/calculoPedido.js — la fórmula económica de
// Compras a Proveedor. Es la que decide cuánta plata dice que se le debe al
// proveedor, y no tenía un solo candado propio.
//
// Igual que su hermano costoMaestro.test.mjs: estos candados ejercitan NÚMEROS,
// no la forma del código. Entra una línea y sale un subtotal, y se compara el
// subtotal.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/calculoPedido.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  naturalezaLinea,
  permiteToggleUnidad,
  pesoPorPieza,
  unidadDisplay,
  subtotalLinea,
  convertirUnidadPedido,
  totalPedido,
} from "./calculoPedido.js";

const pack = (factor = 12) => ({ factor_pack: factor });
const fiambre = (extra = {}) => ({ modoCompraProveedor: "UNIDAD", ...extra });
const porKg = () => ({ unidad_medida: "kg" });
const suelto = () => ({ factor_pack: 1 });

// ===========================================================================
// La naturaleza de la línea decide todo lo demás
// ===========================================================================

test("la naturaleza sale del producto, y el orden de las reglas importa", () => {
  assert.equal(naturalezaLinea(fiambre()), "FIAMBRE");
  assert.equal(naturalezaLinea(porKg()), "KG");
  assert.equal(naturalezaLinea(pack(12)), "PACK");
  assert.equal(naturalezaLinea(suelto()), "UNIDAD");
  assert.equal(naturalezaLinea(null), "UNIDAD", "sin producto se asume unidad");
});

test("fiambre gana sobre kg y sobre pack", () => {
  // Un fiambre con factor_pack cargado sigue siendo fiambre: si se leyera como
  // PACK, el dinero pasaría a calcularse por piezas y no por kilos.
  assert.equal(naturalezaLinea(fiambre({ factor_pack: 10, unidad_medida: "kg" })), "FIAMBRE");
});

test("solo un PACK puede alternar BULTO/UNIDAD", () => {
  assert.equal(permiteToggleUnidad(pack(12)), true);
  assert.equal(permiteToggleUnidad(fiambre()), false);
  assert.equal(permiteToggleUnidad(porKg()), false);
  assert.equal(permiteToggleUnidad(suelto()), false);
});

// ===========================================================================
// EL FACTOR DE PACK NO ENTRA EN EL DINERO
// ===========================================================================

test("BULTO: el subtotal NO multiplica por el factor", () => {
  // 3 bultos a $1200 el bulto = $3600. Si el factor entrara, daría $43.200.
  const r = subtotalLinea({ base: pack(12), cantidad: 3, costo: 1200 });
  assert.equal(r.subtotal, 3600);
});

test("UNIDAD: el subtotal tampoco multiplica por el factor", () => {
  // 36 unidades a $100 = $3600, el mismo dinero que la línea de arriba.
  const r = subtotalLinea({ base: pack(12), cantidad: 36, costo: 100 });
  assert.equal(r.subtotal, 3600);
});

test("el factor mal cargado NO cambia el dinero de la línea", () => {
  // El factor mal cargado rompe el COSTO MAESTRO (ver costoMaestro.test.mjs),
  // pero no puede tocar lo que se le paga al proveedor: eso sale de la cantidad
  // y el costo de la línea.
  for (const f of [0, 1, 12, 1000, -5, null]) {
    assert.equal(
      subtotalLinea({ base: { factor_pack: f }, cantidad: 3, costo: 1200 }).subtotal,
      3600,
      `factor_pack ${f} movió el dinero`
    );
  }
});

test("KG: cantidad de kilos por costo por kilo", () => {
  const r = subtotalLinea({ base: porKg(), cantidad: 2.5, costo: 8000 });
  assert.equal(r.subtotal, 20000);
});

// ===========================================================================
// FIAMBRE — se cobra por kg, y sin peso NO se inventa un subtotal
// ===========================================================================

test("fiambre con kg reales usa esos kg, no las piezas", () => {
  // En la recepción se pesa: 3 piezas que pesaron 7,4 kg a $9000 el kg.
  const r = subtotalLinea({ base: fiambre({ pesoReferenciaKg: 2.5 }), cantidad: 3, costo: 9000, kg: 7.4 });
  assert.equal(r.subtotal, 66600);
  assert.equal(r.kg, 7.4, "los kg reales ganan sobre el peso de referencia");
});

test("fiambre sin kg reales estima con el peso por pieza", () => {
  const r = subtotalLinea({ base: fiambre({ pesoReferenciaKg: 2.5 }), cantidad: 3, costo: 9000 });
  assert.equal(r.kg, 7.5);
  assert.equal(r.subtotal, 67500);
});

test("el peso de REFERENCIA gana sobre el promedio", () => {
  assert.equal(pesoPorPieza({ pesoReferenciaKg: 2.5, pesoPromedioKg: 3 }), 2.5);
  assert.equal(pesoPorPieza({ pesoPromedioKg: 3 }), 3, "sin referencia cae al promedio");
  assert.equal(pesoPorPieza({}), null);
  assert.equal(pesoPorPieza({ pesoReferenciaKg: 0 }), null, "un peso 0 no es un peso");
});

test("SIN peso por pieza no hay subtotal: NO se inventa", () => {
  // Es la decisión que más importa de esta función. Devolver `cantidad × costo`
  // acá cobraría 3 × $9000 = $27.000 por tres piezas de fiambre, cuando el
  // proveedor cobra por kilo. Se devuelve null y una advertencia.
  const r = subtotalLinea({ base: fiambre(), cantidad: 3, costo: 9000 });
  assert.equal(r.subtotal, null);
  assert.equal(r.kg, null);
  assert.match(r.advertencia, /kg por pieza/i);
});

// ===========================================================================
// EL TOTAL IGNORA LAS LÍNEAS SIN SUBTOTAL — y eso hay que saberlo
// ===========================================================================

test("el total suma solo las líneas con subtotal válido", () => {
  const total = totalPedido([
    { base: pack(12), cantidad: 3, costo: 1200 },   // 3600
    { base: porKg(), cantidad: 2, costo: 8000 },    // 16000
  ]);
  assert.equal(total, 19600);
});

test("una línea de fiambre sin peso NO suma, y el total queda CORTO", () => {
  // Este candado no dice que esté bien: dice qué pasa. El pedido muestra un
  // total menor al que se va a pagar, porque esa línea no se puede valorizar.
  // La advertencia existe para que la pantalla lo muestre; el total, solo, miente
  // por defecto.
  const conProblema = totalPedido([
    { base: pack(12), cantidad: 3, costo: 1200 },        // 3600
    { base: fiambre(), cantidad: 3, costo: 9000 },       // sin peso → no suma
  ]);
  assert.equal(conProblema, 3600, "la línea sin peso no entra al total");

  const completo = totalPedido([
    { base: pack(12), cantidad: 3, costo: 1200 },
    { base: fiambre({ pesoReferenciaKg: 2.5 }), cantidad: 3, costo: 9000 },
  ]);
  assert.equal(completo, 71100, "con peso definido sí entra");
});

test("un total vacío es 0, no NaN", () => {
  assert.equal(totalPedido([]), 0);
  assert.equal(totalPedido(), 0);
});

// ===========================================================================
// CONVERSIÓN BULTO ↔ UNIDAD — el subtotal no puede moverse
// ===========================================================================

test("Pack → Unidad conserva el dinero exacto", () => {
  // 2 bultos a $1480 = $2960. En unidades: 36 a $82,2222… = $2960.
  const r = convertirUnidadPedido({ unidad: "BULTO", cantidad: 2, costo: 1480, factor: 18 });
  assert.equal(r.unidad, "UNIDAD");
  assert.equal(r.cantidad, 36);
  assert.equal(r.cantidad * r.costo, 2960, "el subtotal tiene que ser idéntico");
});

test("ida y vuelta NO acumula centavos", () => {
  // El drift de centavos es el defecto clásico de estas conversiones: si el costo
  // se redondeara al convertir, cada ida y vuelta perdería plata.
  const original = { unidad: "BULTO", cantidad: 2, costo: 1480, factor: 18 };
  const aUnidad = convertirUnidadPedido(original);
  const vuelta = convertirUnidadPedido({ ...aUnidad, factor: 18 });

  assert.equal(vuelta.unidad, "BULTO");
  assert.equal(vuelta.cantidad, 2);
  assert.equal(vuelta.costo, 1480, "el costo del bulto volvió exacto");
  assert.equal(vuelta.cantidad * vuelta.costo, 2960);
});

test("Unidad → Pack con resto NO convierte sola: pide confirmación", () => {
  // 40 unidades en cajas de 18 no son cajas enteras. Convertir en silencio
  // cambiaría la cantidad pedida al proveedor.
  const r = convertirUnidadPedido({ unidad: "UNIDAD", cantidad: 40, costo: 100, factor: 18 });
  assert.equal(r.needsConfirm, true);
  assert.equal(r.packs, 3, "3 cajas es lo que haría falta");
  assert.equal(r.units, 40);
  assert.equal(r.unidad, undefined, "no devuelve una conversión hecha");
});

test("con confirmación explícita redondea HACIA ARRIBA", () => {
  // Hacia arriba, no hacia abajo: pedir de menos deja el faltante sin cubrir.
  const r = convertirUnidadPedido({ unidad: "UNIDAD", cantidad: 40, costo: 100, factor: 18, redondear: true });
  assert.equal(r.unidad, "BULTO");
  assert.equal(r.cantidad, 3);
  assert.equal(r.costo, 1800);
});

test("un factor inválido no rompe la conversión ni multiplica de más", () => {
  for (const f of [0, -5, null, undefined, "abc", NaN, 0.5]) {
    const r = convertirUnidadPedido({ unidad: "BULTO", cantidad: 3, costo: 1200, factor: f });
    assert.equal(r.cantidad, 3, `factor ${JSON.stringify(f)} movió la cantidad`);
    assert.equal(r.costo, 1200, `factor ${JSON.stringify(f)} movió el costo`);
  }
});

test("las cantidades fraccionarias se truncan a entero", () => {
  // No se piden 2,7 cajas.
  const r = convertirUnidadPedido({ unidad: "BULTO", cantidad: 2.7, costo: 1200, factor: 12 });
  assert.equal(r.cantidad, 24, "2 bultos × 12, no 2,7");
});

// ===========================================================================
// El texto de la unidad — lo que ve la persona
// ===========================================================================

test("el texto de la unidad no deja elegir donde no corresponde", () => {
  assert.equal(unidadDisplay(fiambre(), "BULTO"), "PIEZA / por kg");
  assert.equal(unidadDisplay(porKg(), "BULTO"), "KG");
  assert.equal(unidadDisplay(pack(12), "UNIDAD"), "UNIDAD");
  assert.equal(unidadDisplay(pack(12), "BULTO"), "BULTO");
  assert.equal(unidadDisplay(suelto(), "BULTO"), "UNIDAD", "un producto suelto no tiene bulto");
});
