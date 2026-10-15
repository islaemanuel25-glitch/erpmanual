// lib/pos-ventas/consumoPersonal.test.mjs
//
// CANDADOS DEL CONSUMO DEL PERSONAL. Lo que se ejerce contra Postgres está en
// scripts/pruebas-db/consumoPersonal.mjs —stock, Venta, caja, gasto al costo,
// resultado del turno— con sus contrapruebas CP-1 y CP-2. Acá va lo que se
// puede afirmar sin base: que el descuento es el de la venta y no otro, que el
// archivo no escribe ventas ni caja, y la aritmética.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CATEGORIA_CONSUMO_PERSONAL,
  ERROR_SIN_OPERADOR,
  ERROR_SIN_PRODUCTOS,
  conceptoDelConsumo,
  costoDelConsumo,
  leerPedidoDeConsumo,
  resumenDelConsumo,
} from "./consumoPersonal.js";
import { MAXIMO_CONCEPTO } from "../finanzas/gastos.js";
import { resultadoDelTurno, consumosDeCaja } from "../turnosYCierres/lecturaTurnosYCierres.js";

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const SERVIDOR = sinComentarios(readFileSync("lib/pos-ventas/consumoPersonalServer.js", "utf8"));
const VENTA = sinComentarios(readFileSync("app/api/pos-ventas/crear/route.js", "utf8"));

test("descuenta el stock con las MISMAS funciones que la venta, y no con otra", () => {
  for (const pieza of ["cargarMapasDeProductos(", "construirLineasComerciales(tx", "aplicarConsumoStock(tx"]) {
    assert.ok(SERVIDOR.includes(pieza), `el consumo no usa ${pieza}`);
    assert.ok(VENTA.includes(pieza), `la venta ya no usa ${pieza}: el candado tiene que mirar la nueva`);
  }
  assert.match(SERVIDOR, /import \{ construirLineasComerciales, aplicarConsumoStock \} from "@\/lib\/combos\/ventaConsumo";/);
  // Ningún descuento propio: el consumo no escribe StockLocal por su cuenta.
  assert.doesNotMatch(SERVIDOR, /stockLocal\.(update|updateMany|upsert|create)/);
  assert.doesNotMatch(SERVIDOR, /"StockLocal"/);
});

test("no es una Venta y no toca la caja: el archivo no las escribe", () => {
  assert.doesNotMatch(SERVIDOR, /\.venta\.(create|createMany|upsert|update)/);
  assert.doesNotMatch(SERVIDOR, /\.ventaDetalle\./);
  assert.doesNotMatch(SERVIDOR, /\.cajaMovimiento\./);
  assert.doesNotMatch(SERVIDOR, /resolverSalidaDelPago|registrarPagoGasto|pagoInicial/);
});

test("el gasto va por el COSTO de las líneas, sin pago y en su categoría", () => {
  assert.match(SERVIDOR, /const totalCosto = costoDelConsumo\(lineasComerciales\);/);
  assert.match(SERVIDOR, /total: totalCosto,/);
  assert.match(SERVIDOR, /delConsumoDelPersonal: true,/);
  assert.match(SERVIDOR, /where: \{ nombre: CATEGORIA_CONSUMO_PERSONAL \}/);
  // Cada egreso del Libro dice que vino de este consumo.
  assert.match(SERVIDOR, /declararOrigenDeStock\(tx, \{ origen: ORIGEN_STOCK\.CONSUMO_PERSONAL, referencia: String\(consumo\.id\) \}\)/);
});

test("costoDelConsumo suma costoLinea, no el subtotal de venta", () => {
  const lineas = [
    { costoLinea: 200, subtotal: 300 },
    { costoLinea: 2000, subtotal: 3000 },
  ];
  assert.equal(costoDelConsumo(lineas), 2200);
  assert.equal(costoDelConsumo([{ costoLinea: 0.1 }, { costoLinea: 0.2 }]), 0.3);
});

test("el pedido: quién, qué y la clave; sin costo, cae al del bulto", () => {
  assert.deepEqual(leerPedidoDeConsumo({ turnoId: 1, items: [{ productoBaseId: 2, cantidad: 1 }], idempotencyKey: "k" }), { error: ERROR_SIN_OPERADOR });
  assert.deepEqual(leerPedidoDeConsumo({ turnoId: 1, operadorId: 3, items: [], idempotencyKey: "k" }), { error: ERROR_SIN_PRODUCTOS });
  const p = leerPedidoDeConsumo({
    turnoId: 1,
    operadorId: 3,
    idempotencyKey: "k",
    items: [{ productoBaseId: 2, cantidad: 0.25, precio: 12000, precioCosto: null, subtotalFijado: 3000 }],
  });
  // `undefined` y no `null`: construirLineasComerciales lee Number(null) como
  // un costo de cero y no caería al costo del bulto.
  assert.equal(p.items[0].precioCosto, undefined);
  assert.equal(Number.isFinite(Number(p.items[0].precioCosto)), false);
  // El importe fijado es de una venta: acá el peso ya viene calculado.
  assert.equal(p.items[0].subtotalFijado, null);
  assert.equal(p.clave, "k");
});

test("el concepto dice quién y qué, y entra en el largo del concepto", () => {
  const corto = conceptoDelConsumo({ operador: "Mariangel", lineas: [{ nombre: "Coca", cantidad: 1 }, { nombre: "Jamón", cantidad: 0.15 }] });
  assert.equal(corto, `${CATEGORIA_CONSUMO_PERSONAL} · Mariangel: Coca x1, Jamón x0.15`);
  const largo = conceptoDelConsumo({ operador: "M", lineas: Array.from({ length: 40 }, (_, i) => ({ nombre: `Producto ${i}`, cantidad: 1 })) });
  assert.equal(largo.length, MAXIMO_CONCEPTO);
  assert.ok(largo.endsWith("…"));
});

test("el resumen del panel: productos y costo del carrito, sin servicios", () => {
  const r = resumenDelConsumo([
    { precioCosto: 100, cantidad: 2 },
    { precioCosto: 8000, cantidad: 0.25 },
  ]);
  assert.deepEqual(r, { productos: 2, costo: 2200, hayServicios: false });
  assert.equal(resumenDelConsumo([{ esServicio: true, precioCosto: 10, cantidad: 1 }]).hayServicios, true);
});

test("el resultado del turno resta el consumo UNA vez, en su fila", () => {
  assert.equal(resultadoDelTurno({ neto: 10000, costo: 4000, sueldosYGastos: 1000, consumoPersonal: 2200 }), 2800);
  // Sin consumo, el de siempre.
  assert.equal(resultadoDelTurno({ neto: 10000, costo: 4000, sueldosYGastos: 1000 }), 5000);
  const filas = consumosDeCaja([
    { id: 2, createdAt: "2026-10-15T12:00:00Z", totalCosto: "1500.00", operador: { nombre: "B" }, lineas: [{ id: 1 }] },
    { id: 1, createdAt: "2026-10-15T11:00:00Z", totalCosto: "2200.00", operador: { nombre: "A" }, lineas: [{ id: 2 }, { id: 3 }] },
  ]);
  assert.deepEqual(filas.map((f) => [f.quien, f.productos, f.costo]), [["A", 2, 2200], ["B", 1, 1500]]);
});
