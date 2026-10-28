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
  ERROR_SIN_EMPLEADO,
  ERROR_SIN_PRODUCTOS,
  cantidadEscrita,
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
  assert.deepEqual(leerPedidoDeConsumo({ turnoId: 1, items: [{ productoBaseId: 2, cantidad: 1 }], idempotencyKey: "k" }), { error: ERROR_SIN_EMPLEADO });
  // Quien consume es un EMPLEADO: un `operadorId` ya no alcanza.
  assert.deepEqual(
    leerPedidoDeConsumo({ turnoId: 1, operadorId: 3, items: [{ productoBaseId: 2, cantidad: 1 }], idempotencyKey: "k" }),
    { error: ERROR_SIN_EMPLEADO }
  );
  assert.deepEqual(leerPedidoDeConsumo({ turnoId: 1, empleadoId: 3, items: [], idempotencyKey: "k" }), { error: ERROR_SIN_PRODUCTOS });
  const p = leerPedidoDeConsumo({
    turnoId: 1,
    empleadoId: 3,
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
  const corto = conceptoDelConsumo({ empleado: "Mariangel", lineas: [{ nombre: "Coca", cantidad: 1 }, { nombre: "Jamón", cantidad: 0.15 }] });
  assert.equal(corto, `${CATEGORIA_CONSUMO_PERSONAL} · Mariangel: Coca x1, Jamón x0.15`);
  const largo = conceptoDelConsumo({ empleado: "M", lineas: Array.from({ length: 40 }, (_, i) => ({ nombre: `Producto ${i}`, cantidad: 1 })) });
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

test("el kilo se escribe con coma: 0,100 vale 0.1 en el costo y en lo que se manda", () => {
  assert.equal(cantidadEscrita("0,100"), 0.1);
  assert.equal(cantidadEscrita("0,"), 0);
  assert.equal(cantidadEscrita(""), 0);
  assert.equal(cantidadEscrita(2), 2);
  assert.equal(resumenDelConsumo([{ precioCosto: 8000, cantidad: "0,100" }]).costo, 800);
  const panel = fuenteSinComentarios("components/pos-ventas/PanelConsumoPersonal.jsx");
  // El campo del kilo conserva la coma y suma el paso de la venta (1 gramo).
  assert.match(panel, /conservaLoEscrito=\{esKg\}/);
  assert.match(panel, /paso=\{esKg \? 0\.001 : 1\}/);
  assert.match(panel, /decimales=\{esKg \? 3 : 0\}/);
  // Y lo que viaja es el número, no lo escrito.
  assert.match(panel, /lista\.carrito\.map\(\(p\) => \(\{ \.\.\.p, cantidad: cantidadEscrita\(p\.cantidad\) \}\)\)/);
});

test("el resultado del turno resta el consumo UNA vez, en su fila", () => {
  assert.equal(resultadoDelTurno({ neto: 10000, costo: 4000, sueldosYGastos: 1000, consumoPersonal: 2200 }), 2800);
  // Sin consumo, el de siempre.
  assert.equal(resultadoDelTurno({ neto: 10000, costo: 4000, sueldosYGastos: 1000 }), 5000);
  const filas = consumosDeCaja([
    // La forma de `SELECT_CONSUMO` del lector: empleado y operador, los dos.
    // El primero tiene empleado; el segundo es un consumo del código de antes
    // de Empleados que el relleno no alcanzó, y se lee por su operador.
    { id: 2, createdAt: "2026-10-15T12:00:00Z", totalCosto: "1500.00", empleado: null, operador: { nombre: "B" }, lineas: [{ id: 1 }] },
    { id: 1, createdAt: "2026-10-15T11:00:00Z", totalCosto: "2200.00", empleado: { nombre: "A" }, operador: null, lineas: [{ id: 2 }, { id: 3 }] },
  ]);
  assert.deepEqual(filas.map((f) => [f.quien, f.productos, f.costo]), [["A", 2, 2200], ["B", 1, 1500]]);
});

// ── DESDE 2026-10-15 (TARDE): EL CONSUMO SALE DEL COBRO Y VA A "PAGAR" ─────
//
// Pedido de Emanuel: al lado de cada venta, un toque de más registraba un
// consumo. Se afirma que no quedó nada en el cobro, que en Pagar es la sexta
// opción, y que tiene su propia lista: el carrito de la venta no se toca.

const fuenteSinComentarios = (f) => sinComentarios(readFileSync(f, "utf8"));

test("el consumo ya no está en el panel de cobro ni en F7", () => {
  const formaPago = fuenteSinComentarios("components/pos-ventas/FormaPago.jsx");
  const pos = fuenteSinComentarios("app/modulos/pos-ventas/page.jsx");
  for (const [nombre, texto] of [["FormaPago", formaPago], ["POS", pos]]) {
    assert.doesNotMatch(texto, /Consumo del personal|PanelConsumoPersonal|consumoAbierto|onAlternarConsumo/, nombre);
  }
  assert.doesNotMatch(pos, /case "F7"/);
  assert.doesNotMatch(pos, /F7: Consumo/);
  // Fiado vuelve a ser UN botón de ancho completo, sin compañero en su fila.
  assert.match(formaPago, /<button type="button" onClick=\{cobrarFiado\} disabled=\{!puedeVender\}\s+className="sunmi-btn sunmi-pos-btn-secondary w-full min-h-11 text-sm rounded-md">/);
});

test("en Pagar es la sexta opción, después de Retiro del dueño", () => {
  const modal = fuenteSinComentarios("components/pos-ventas/ModalPagar.jsx");
  assert.match(modal, /export const OPCIONES_PAGAR = Object\.freeze\(\[\.\.\.TIPOS_EGRESO, OPCION_CONSUMO\]\);/);
  assert.match(modal, /\{OPCIONES_PAGAR\.map\(\(t\) => \(/);
  assert.match(modal, /if \(tipo === OPCION_CONSUMO\) \{[\s\S]*?<PanelConsumoPersonal/);
  const tipos = readFileSync("lib/caja/tipoEgreso.js", "utf8");
  assert.match(tipos, /RETIRO_DUENO/);
});

test("su lista es propia: el carrito de la venta no se toca", () => {
  const panel = fuenteSinComentarios("components/pos-ventas/PanelConsumoPersonal.jsx");
  // El mismo reductor del carrito, en un estado PROPIO del panel.
  assert.match(panel, /const \[lista, despachar\] = useReducer\(posVentaReducer, initialState\);/);
  assert.match(panel, /<BuscadorProductos/);
  assert.match(panel, /items: itemsCrearPayload\(productos\)/);
  assert.doesNotMatch(panel, /\bcarrito=|state\.carrito|\bdispatch\(/);
  // Y el POS no le pasa nada del carrito a Pagar.
  const pos = fuenteSinComentarios("app/modulos/pos-ventas/page.jsx");
  const pagar = pos.slice(pos.indexOf("<ModalPagar"), pos.indexOf("/>", pos.indexOf("<ModalPagar")));
  assert.ok(pagar.length > 0);
  assert.doesNotMatch(pagar, /carrito|dispatch/);
});

test("quien consume y quien cobra un sueldo son EMPLEADOS, con la misma consulta que la lista", () => {
  const consumo = fuenteSinComentarios("lib/pos-ventas/consumoPersonalServer.js");
  const pagar = fuenteSinComentarios("lib/caja/pagarDesdeElPosServer.js");
  const ruta = fuenteSinComentarios("app/api/pos-ventas/pagar/route.js");
  assert.match(consumo, /await empleadoActivoDelLocal\(tx, \{ empleadoId, localId \}\)/);
  // El sueldo lo valida `crearGasto` (2026-10-19), con la misma consulta, para
  // el POS y para Finanzas: el POS le pasa el empleado que eligió el cajero.
  const gastos = fuenteSinComentarios("lib/finanzas/gastosServer.js");
  assert.match(gastos, /await empleadoActivoDelLocal\(tx, \{ empleadoId, localId \}\)/);
  assert.match(pagar, /empleadoId = body\.empleadoId;/);
  assert.match(pagar, /crearGasto\(tx, \{/);
  assert.match(ruta, /empleadosDelLocal\(prisma, localId\)/);
  for (const [nombre, texto] of [["consumo", consumo], ["pagar", pagar], ["ruta", ruta]]) {
    assert.doesNotMatch(texto, /operadorEnLocal/, `${nombre} vuelve a elegir de Operadores`);
  }
});
