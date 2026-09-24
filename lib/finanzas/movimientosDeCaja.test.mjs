// CANDADO: QUÉ ES CADA `CajaMovimiento`, DECIDIDO POR VÍNCULO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/finanzas/movimientosDeCaja.test.mjs
//
// El pago a proveedor en efectivo deja UN `CajaMovimiento` RETIRO, vinculado por
// `PagoProveedor.cajaMovimientoId` (UNIQUE). Es un solo hecho: la plata que salió
// del cajón para pagarle al proveedor. Si Finanzas lo clasificara como retiro
// manual, el día que sume los pagos a proveedores lo contaría dos veces — una
// como pago y otra como retiro.
//
// Lo que se afirma acá:
//   · el vínculo con el pago lo clasifica como PAGO_PROVEEDOR, y el texto del
//     motivo no decide nada;
//   · un retiro sin ese vínculo sigue siendo MANUAL;
//   · recaudación y cierre no cambian;
//   · el pago sigue restando del efectivo esperado, exactamente una vez;
//   · y ya no entra en el renglón de retiros manuales del resumen.
//
// Los movimientos tienen la forma del `select` de las dos rutas que clasifican
// (`app/api/finanzas/tablero/route.js` y `turno/[turnoId]/route.js`), y el motivo
// del pago lo escribe la misma función que usa `registrarPagoProveedor`.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CLASE_MOVIMIENTO,
  clasificarMovimientos,
  paraElEsperado,
  soloManuales,
  soloRecaudacion,
} from "@/lib/finanzas/movimientosDeCaja";
import { calcularEfectivoEsperado } from "@/lib/caja/efectivoEsperado";
import { desglosarCaja, resumenDelPeriodo } from "@/lib/finanzas/resumenFinanciero";
import { motivoDelRetiroDePago } from "@/lib/finanzas/pagosProveedores";

const CREADO = new Date("2026-09-24T15:00:00.000Z");

const mov = (id, tipo, monto, motivo) => ({
  id,
  tipo,
  // Prisma devuelve `Decimal`; la aritmética de caja lo lee con `Number()`, así
  // que la cadena con dos decimales es la forma que llega de verdad.
  monto: Number(monto).toFixed(2),
  motivo,
  createdAt: CREADO,
  turnoId: 77,
});

const PAGO = mov(
  101,
  "RETIRO",
  100000,
  motivoDelRetiroDePago({ proveedorNombre: "Arcor", pedidoProveedorId: 55 })
);
const MANUAL = mov(102, "RETIRO", 3000, "Cambio para el kiosco");
const INGRESO = mov(103, "INGRESO", 2000, "Vuelve plata del cambio");
const RECAUDACION = mov(104, "RETIRO", 50000, "Retiro de recaudación #9");
const CIERRE = mov(105, "RETIRO", 40000, "Retiro de cierre del turno #77");

const VINCULOS = {
  idsDeRecaudacion: new Set([RECAUDACION.id]),
  idsDeCierre: new Set([CIERRE.id]),
  idsDePagoProveedor: new Set([PAGO.id]),
};

const claseDe = (clasificados, id) => clasificados.find((m) => m.id === id)?.clase;

// ══════════════════════════════════════════════════════════════════════════
// LA CLASIFICACIÓN
// ══════════════════════════════════════════════════════════════════════════

test("Caso 1 · el retiro vinculado a un PagoProveedor es PAGO_PROVEEDOR, no MANUAL", () => {
  const clasificados = clasificarMovimientos([PAGO], VINCULOS);
  assert.equal(claseDe(clasificados, PAGO.id), CLASE_MOVIMIENTO.PAGO_PROVEEDOR);
  assert.notEqual(claseDe(clasificados, PAGO.id), CLASE_MOVIMIENTO.MANUAL);
});

test("Caso 2 · un retiro manual real, sin vínculo con un pago, sigue siendo MANUAL", () => {
  const clasificados = clasificarMovimientos([MANUAL, INGRESO], VINCULOS);
  assert.equal(claseDe(clasificados, MANUAL.id), CLASE_MOVIMIENTO.MANUAL);
  assert.equal(claseDe(clasificados, INGRESO.id), CLASE_MOVIMIENTO.MANUAL);
});

test("Caso 2 bis · el motivo 'Pago a proveedor' NO alcanza: sin el vínculo es MANUAL", () => {
  // La contraprueba del heurístico. Cualquiera puede escribir ese texto desde
  // Caja +/−, y el modal hasta lo sugiere ("pago a proveedor, cambio,
  // adelantos"). Lo que decide es `PagoProveedor.cajaMovimientoId`.
  const impostor = { ...PAGO, id: 9101 };
  const [m] = clasificarMovimientos([impostor], VINCULOS);
  assert.equal(m.clase, CLASE_MOVIMIENTO.MANUAL);
});

test("Caso 2 ter · el vínculo manda aunque el motivo no diga nada de un pago", () => {
  const sinTexto = { ...MANUAL, id: 9102 };
  const [m] = clasificarMovimientos([sinTexto], { idsDePagoProveedor: new Set([9102]) });
  assert.equal(m.clase, CLASE_MOVIMIENTO.PAGO_PROVEEDOR);
});

test("Caso 3 · la recaudación conserva su clase", () => {
  const clasificados = clasificarMovimientos([RECAUDACION], VINCULOS);
  assert.equal(claseDe(clasificados, RECAUDACION.id), CLASE_MOVIMIENTO.RECAUDACION);
});

test("Caso 4 · el cierre conserva su clase", () => {
  const clasificados = clasificarMovimientos([CIERRE], VINCULOS);
  assert.equal(claseDe(clasificados, CIERRE.id), CLASE_MOVIMIENTO.CIERRE);
});

test("el cierre sigue ganando si un id aparece también como pago", () => {
  // No puede pasar con los datos de hoy —cada movimiento lo crea un solo camino—,
  // pero si pasara, el retiro de cierre tiene que seguir fuera del esperado.
  const [m] = clasificarMovimientos([CIERRE], {
    idsDeCierre: new Set([CIERRE.id]),
    idsDePagoProveedor: new Set([CIERRE.id]),
  });
  assert.equal(m.clase, CLASE_MOVIMIENTO.CIERRE);
});

test("sin el conjunto de pagos, la clasificación queda como antes", () => {
  // Un llamador que todavía no lo pasa no rompe: el pago cae en MANUAL, que es
  // exactamente el comportamiento anterior.
  const clasificados = clasificarMovimientos([PAGO, RECAUDACION, CIERRE], {
    idsDeRecaudacion: [RECAUDACION.id],
    idsDeCierre: [CIERRE.id],
  });
  assert.equal(claseDe(clasificados, PAGO.id), CLASE_MOVIMIENTO.MANUAL);
  assert.equal(claseDe(clasificados, RECAUDACION.id), CLASE_MOVIMIENTO.RECAUDACION);
  assert.equal(claseDe(clasificados, CIERRE.id), CLASE_MOVIMIENTO.CIERRE);
});

test("acepta los ids como arreglo, igual que los otros dos conjuntos", () => {
  const [m] = clasificarMovimientos([PAGO], { idsDePagoProveedor: [PAGO.id] });
  assert.equal(m.clase, CLASE_MOVIMIENTO.PAGO_PROVEEDOR);
});

// ══════════════════════════════════════════════════════════════════════════
// EL EFECTIVO ESPERADO: LA FÓRMULA NO SE TOCA
// ══════════════════════════════════════════════════════════════════════════

test("Caso 5 · el pago sigue restando del efectivo esperado, exactamente una vez", () => {
  const clasificados = clasificarMovimientos([PAGO, MANUAL, INGRESO, RECAUDACION, CIERRE], VINCULOS);
  const paraEsperado = paraElEsperado(clasificados);

  // El pago entra en lo que se le pasa a la fórmula, una sola vez.
  assert.equal(paraEsperado.filter((m) => m.id === PAGO.id).length, 1);
  // Y el de cierre sigue afuera, como antes.
  assert.equal(paraEsperado.some((m) => m.id === CIERRE.id), false);

  const base = { montoInicial: 200000, ventas: [] };
  const conPago = calcularEfectivoEsperado({ ...base, movimientos: paraEsperado });
  const sinPago = calcularEfectivoEsperado({
    ...base,
    movimientos: paraEsperado.filter((m) => m.id !== PAGO.id),
  });

  // 200.000 + 2.000 − 3.000 − 50.000 − 100.000 = 49.000
  assert.equal(conPago.efectivoEsperado, 49000);
  assert.equal(sinPago.efectivoEsperado - conPago.efectivoEsperado, 100000);
  assert.equal(conPago.retiros, 153000);
});

test("Caso 5 bis · el esperado es el mismo que daba la clasificación anterior", () => {
  // Antes el pago caía en MANUAL, y `paraElEsperado` también lo incluía. La
  // clase nueva no puede cambiar ni un centavo del esperado.
  const movimientos = [PAGO, MANUAL, INGRESO, RECAUDACION, CIERRE];
  const antes = paraElEsperado(
    clasificarMovimientos(movimientos, {
      idsDeRecaudacion: VINCULOS.idsDeRecaudacion,
      idsDeCierre: VINCULOS.idsDeCierre,
    })
  );
  const ahora = paraElEsperado(clasificarMovimientos(movimientos, VINCULOS));
  const base = { montoInicial: 200000, ventas: [] };
  assert.equal(
    calcularEfectivoEsperado({ ...base, movimientos: ahora }).efectivoEsperado,
    calcularEfectivoEsperado({ ...base, movimientos: antes }).efectivoEsperado
  );
});

// ══════════════════════════════════════════════════════════════════════════
// SIN DOBLE CONTEO: EL PAGO NO ES UN RETIRO MANUAL DEL RESUMEN
// ══════════════════════════════════════════════════════════════════════════

test("Caso 6 · el pago no entra en los manuales ni en la recaudación", () => {
  const clasificados = clasificarMovimientos([PAGO, MANUAL, INGRESO, RECAUDACION, CIERRE], VINCULOS);
  assert.equal(soloManuales(clasificados).some((m) => m.id === PAGO.id), false);
  assert.equal(soloRecaudacion(clasificados).some((m) => m.id === PAGO.id), false);
});

test("Caso 6 bis · el renglón de retiros manuales del resumen no incluye el pago", () => {
  const clasificados = clasificarMovimientos([PAGO, MANUAL, INGRESO, RECAUDACION, CIERRE], VINCULOS);
  const caja = desglosarCaja({
    manuales: soloManuales(clasificados),
    recaudacion: soloRecaudacion(clasificados),
  });
  assert.equal(caja.retiros, 3000);
  assert.equal(caja.cantidadRetiros, 1);
  assert.equal(caja.ingresos, 2000);
  assert.equal(caja.retirosDeRecaudacion, 50000);

  // El mismo insumo por la puerta que arma el tablero.
  const resumen = resumenDelPeriodo({
    ventas: [],
    manuales: soloManuales(clasificados),
    recaudacion: soloRecaudacion(clasificados),
  });
  assert.equal(resumen.caja.retiros, 3000);
});
