// Regresión del DOBLE DESCUENTO del retiro de cierre.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/resumenSinDobleDescuento.test.mjs
//
// El retiro del cierre se crea DESPUÉS del corte final, para que el cierre no se
// reste a sí mismo. Pero queda en CajaMovimiento: cualquiera que recalcule el
// esperado de un turno cerrado SIN excluirlo lo descuenta una segunda vez.
//
// Estas pruebas modelan exactamente lo que hacen el endpoint `resumen` y la
// pantalla de detalle: filtrar por `retiroCierreMovimientoId` y calcular con la
// fórmula única. Si alguien vuelve a incluir ese movimiento, fallan.

import { test } from "node:test";
import assert from "node:assert/strict";

import { calcularEfectivoEsperado } from "@/lib/caja/efectivoEsperado";

const venta = (m) => ({
  total: m,
  formaPago: "efectivo",
  esFiado: false,
  pagos: [{ medio: "EFECTIVO", monto: m }],
});

/** Lo que hace `resumen`: excluir el movimiento de cierre por id. */
function esperadoDeResumen({ montoInicial, ventas, movimientos, retiroCierreMovimientoId }) {
  const filtrados = movimientos.filter((m) => m.id !== retiroCierreMovimientoId);
  return calcularEfectivoEsperado({ montoInicial, ventas, movimientos: filtrados }).efectivoEsperado;
}

test("1. turno ABIERTO con retiros parciales: cada uno descuenta una sola vez", () => {
  const ventas = [venta(90000)];
  const movimientos = [{ id: 1, tipo: "RETIRO", monto: 90000 }];
  const esperado = esperadoDeResumen({
    montoInicial: 30000,
    ventas,
    movimientos,
    retiroCierreMovimientoId: null, // sigue abierto: no hay retiro de cierre
  });
  // 30.000 + 90.000 − 90.000 = 30.000, que es justo el fondo que quedó.
  assert.equal(esperado, 30000);
});

test("2. turno CERRADO: el resumen coincide con lo que persistió el cierre", () => {
  // Cierre: contado 70.000, se retiran 40.000 y quedan 30.000 de fondo.
  // El movimiento id=9 es el retiro DEL CIERRE.
  const ventas = [venta(90000), venta(40000)];
  const movimientos = [
    { id: 1, tipo: "RETIRO", monto: 90000 }, // retiro parcial durante el turno
    { id: 9, tipo: "RETIRO", monto: 40000 }, // retiro del cierre
  ];
  const montoEsperadoEfectivoPersistido = 70000; // 30.000 + 130.000 − 90.000

  const esperado = esperadoDeResumen({
    montoInicial: 30000,
    ventas,
    movimientos,
    retiroCierreMovimientoId: 9,
  });

  assert.equal(esperado, montoEsperadoEfectivoPersistido);
});

test("3. SIN excluir el retiro de cierre aparece el doble descuento — el bug", () => {
  // Esta prueba demuestra el defecto que se corrigió: si el movimiento del
  // cierre entra al cálculo, el esperado baja exactamente por ese importe.
  const ventas = [venta(90000), venta(40000)];
  const movimientos = [
    { id: 1, tipo: "RETIRO", monto: 90000 },
    { id: 9, tipo: "RETIRO", monto: 40000 },
  ];
  const conBug = calcularEfectivoEsperado({ montoInicial: 30000, ventas, movimientos }).efectivoEsperado;
  const correcto = esperadoDeResumen({
    montoInicial: 30000,
    ventas,
    movimientos,
    retiroCierreMovimientoId: 9,
  });

  assert.equal(correcto, 70000);
  assert.equal(conBug, 30000);
  assert.equal(correcto - conBug, 40000, "la diferencia es exactamente el retiro de cierre");
});

test("4. resumen y detalle devuelven el MISMO esperado", () => {
  const montoInicial = 30000;
  const ventas = [venta(90000), venta(40000)];
  const movimientos = [
    { id: 1, tipo: "RETIRO", monto: 90000 },
    { id: 3, tipo: "INGRESO", monto: 5000 },
    { id: 9, tipo: "RETIRO", monto: 40000 },
  ];
  const idCierre = 9;

  const delResumen = esperadoDeResumen({ montoInicial, ventas, movimientos, retiroCierreMovimientoId: idCierre });

  // Lo que hacía la pantalla a mano (la cuarta copia). Se conserva acá como
  // control: mientras las dos den lo mismo, eliminar la copia es seguro.
  const previos = movimientos.filter((m) => m.id !== idCierre);
  const ingresos = previos.filter((m) => m.tipo === "INGRESO").reduce((s, m) => s + m.monto, 0);
  const retiros = previos.filter((m) => m.tipo === "RETIRO").reduce((s, m) => s + m.monto, 0);
  const delDetalle = montoInicial + 130000 + ingresos - retiros;

  assert.equal(delResumen, delDetalle);
  assert.equal(delResumen, 75000);
});

test("5. un turno sin retiro de cierre no pierde ningún movimiento", () => {
  // Retiro de $0 al cerrar: no se crea movimiento y `retiroCierreMovimientoId`
  // queda en null. El filtro no debe descartar nada por eso.
  const ventas = [venta(50000)];
  const movimientos = [{ id: 1, tipo: "RETIRO", monto: 20000 }];
  const esperado = esperadoDeResumen({
    montoInicial: 10000,
    ventas,
    movimientos,
    retiroCierreMovimientoId: null,
  });
  assert.equal(esperado, 40000);
});

test("6. el retiro nuevo baja el esperado EXACTAMENTE por su importe", () => {
  const ventas = [venta(90000)];
  const antes = calcularEfectivoEsperado({ montoInicial: 30000, ventas, movimientos: [] }).efectivoEsperado;
  const despues = calcularEfectivoEsperado({
    montoInicial: 30000,
    ventas,
    movimientos: [{ id: 1, tipo: "RETIRO", monto: 90000 }],
  }).efectivoEsperado;

  assert.equal(antes, 120000);
  assert.equal(despues, 30000);
  assert.equal(antes - despues, 90000);
});

test("7. dos retiros sucesivos: el segundo parte del estado ya actualizado", () => {
  const ventas1 = [venta(90000)];
  const tras1 = calcularEfectivoEsperado({
    montoInicial: 30000,
    ventas: ventas1,
    movimientos: [{ id: 1, tipo: "RETIRO", monto: 90000 }],
  }).efectivoEsperado;
  assert.equal(tras1, 30000);

  // Se venden 40.000 más y se retira de nuevo dejando el mismo fondo.
  const ventas2 = [venta(90000), venta(40000)];
  const antes2 = calcularEfectivoEsperado({
    montoInicial: 30000,
    ventas: ventas2,
    movimientos: [{ id: 1, tipo: "RETIRO", monto: 90000 }],
  }).efectivoEsperado;
  assert.equal(antes2, 70000, "el cajón tiene el fondo más lo vendido después");

  const tras2 = calcularEfectivoEsperado({
    montoInicial: 30000,
    ventas: ventas2,
    movimientos: [
      { id: 1, tipo: "RETIRO", monto: 90000 },
      { id: 2, tipo: "RETIRO", monto: 40000 },
    ],
  }).efectivoEsperado;
  assert.equal(tras2, 30000);
});

test("8. caso funcional de referencia completo, con diferencia 0", () => {
  // fondo 30.000 · ventas 90.000 · contado 120.000 · retiro 90.000
  // luego ventas 40.000 · cierre contado 70.000 → diferencia 0
  const ventas = [venta(90000), venta(40000)];
  const movimientos = [{ id: 1, tipo: "RETIRO", monto: 90000 }];
  const esperadoCierre = calcularEfectivoEsperado({
    montoInicial: 30000,
    ventas,
    movimientos,
  }).efectivoEsperado;
  assert.equal(esperadoCierre, 70000);
  assert.equal(70000 - esperadoCierre, 0, "contado 70.000 → diferencia 0");
});
