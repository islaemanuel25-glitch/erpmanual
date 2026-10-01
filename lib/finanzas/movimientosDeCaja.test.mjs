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
import { readFileSync } from "node:fs";

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
import { motivoDelRetiroDeGasto } from "@/lib/finanzas/gastos";

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
  // Caja +/− —el modal hasta lo sugería, hasta el 2026-09-29—, y los retiros
  // viejos lo tienen. Lo que decide es `PagoProveedor.cajaMovimientoId`.
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

// ══════════════════════════════════════════════════════════════════════════
// EL PAGO DE UN GASTO: LA MISMA REGLA, OTRO VÍNCULO
// ══════════════════════════════════════════════════════════════════════════
//
// `registrarPagoGasto` en efectivo deja su RETIRO apuntado por
// `PagoGasto.cajaMovimientoId`, y el motivo lo escribe `motivoDelRetiroDeGasto`,
// la misma función que usa esa puerta.

const PAGO_GASTO = mov(106, "RETIRO", 40000, motivoDelRetiroDeGasto({ concepto: "Reparación heladera", gastoId: 12 }));
const CON_GASTO = { ...VINCULOS, idsDePagoGasto: new Set([PAGO_GASTO.id]) };
const TODOS = [PAGO, PAGO_GASTO, MANUAL, INGRESO, RECAUDACION, CIERRE];

test("Gasto 1 · el retiro vinculado a un PagoGasto es PAGO_GASTO, no MANUAL", () => {
  const clasificados = clasificarMovimientos(TODOS, CON_GASTO);
  assert.equal(claseDe(clasificados, PAGO_GASTO.id), CLASE_MOVIMIENTO.PAGO_GASTO);
  assert.equal(soloManuales(clasificados).some((m) => m.id === PAGO_GASTO.id), false);
  assert.equal(soloRecaudacion(clasificados).some((m) => m.id === PAGO_GASTO.id), false);
});

test("Gasto 2 · el motivo 'Pago de gasto' NO alcanza: sin el vínculo es MANUAL", () => {
  const impostor = { ...PAGO_GASTO, id: 9201 };
  const [m] = clasificarMovimientos([impostor], CON_GASTO);
  assert.equal(m.clase, CLASE_MOVIMIENTO.MANUAL);
});

test("Gasto 3 · el vínculo manda aunque el motivo no diga nada de un gasto", () => {
  const sinTexto = { ...MANUAL, id: 9202 };
  const [m] = clasificarMovimientos([sinTexto], { idsDePagoGasto: [9202] });
  assert.equal(m.clase, CLASE_MOVIMIENTO.PAGO_GASTO);
});

test("Gasto 4 · las otras clases no cambian con el conjunto nuevo", () => {
  const clasificados = clasificarMovimientos(TODOS, CON_GASTO);
  assert.equal(claseDe(clasificados, PAGO.id), CLASE_MOVIMIENTO.PAGO_PROVEEDOR);
  assert.equal(claseDe(clasificados, RECAUDACION.id), CLASE_MOVIMIENTO.RECAUDACION);
  assert.equal(claseDe(clasificados, CIERRE.id), CLASE_MOVIMIENTO.CIERRE);
  assert.equal(claseDe(clasificados, MANUAL.id), CLASE_MOVIMIENTO.MANUAL);
  assert.equal(claseDe(clasificados, INGRESO.id), CLASE_MOVIMIENTO.MANUAL);
});

test("Gasto 5 · el cierre y el pago a proveedor siguen ganando si un id apareciera también como gasto", () => {
  const vinculos = {
    idsDeCierre: [CIERRE.id],
    idsDePagoProveedor: [PAGO.id],
    idsDePagoGasto: [CIERRE.id, PAGO.id],
  };
  const clasificados = clasificarMovimientos([CIERRE, PAGO], vinculos);
  assert.equal(claseDe(clasificados, CIERRE.id), CLASE_MOVIMIENTO.CIERRE);
  assert.equal(claseDe(clasificados, PAGO.id), CLASE_MOVIMIENTO.PAGO_PROVEEDOR);
});

test("Gasto 6 · el pago del gasto resta del esperado una vez, y el esperado no cambia con la clase nueva", () => {
  const ahora = paraElEsperado(clasificarMovimientos(TODOS, CON_GASTO));
  const antes = paraElEsperado(clasificarMovimientos(TODOS, VINCULOS)); // sin el conjunto: caía en MANUAL
  assert.equal(ahora.filter((m) => m.id === PAGO_GASTO.id).length, 1);
  const base = { montoInicial: 200000, ventas: [] };
  const eAhora = calcularEfectivoEsperado({ ...base, movimientos: ahora }).efectivoEsperado;
  // 200.000 + 2.000 − 3.000 − 50.000 − 100.000 − 40.000 = 9.000
  assert.equal(eAhora, 9000);
  assert.equal(eAhora, calcularEfectivoEsperado({ ...base, movimientos: antes }).efectivoEsperado);
});

test("Gasto 7 · el renglón de retiros manuales del resumen no incluye el pago del gasto", () => {
  const clasificados = clasificarMovimientos(TODOS, CON_GASTO);
  const resumen = resumenDelPeriodo({
    ventas: [],
    manuales: soloManuales(clasificados),
    recaudacion: soloRecaudacion(clasificados),
  });
  assert.equal(resumen.caja.retiros, 3000);
  assert.equal(resumen.caja.cantidadRetiros, 1);
});

test("Gasto 8 · las dos rutas que clasifican le pasan el vínculo de PagoGasto", () => {
  // Sin esto el pago del gasto caería en MANUAL en la pantalla, aunque la función
  // sepa clasificarlo: es el candado que mira el lugar donde el dato se arma.
  for (const ruta of ["app/api/finanzas/tablero/route.js", "app/api/finanzas/turno/[turnoId]/route.js"]) {
    const fuente = readFileSync(ruta, "utf8").replace(/\/\/[^\n]*/g, "");
    assert.match(fuente, /prisma\.pagoGasto\.findMany\(\{\s*where:\s*\{\s*cajaMovimientoId:\s*\{\s*in:\s*idsDeMovimiento/, ruta);
    assert.match(fuente, /idsDePagoGasto:\s*new Set\(/, ruta);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// DOBLE CONTEO: DESDE QUE EL RESUMEN SUMA LOS PAGOS
// ══════════════════════════════════════════════════════════════════════════
//
// Hasta esta tanda el riesgo era futuro —"el día que el resumen sume los
// pagos"—. Ahora los suma: `resumenDelPeriodo` recibe los `PagoProveedor` y los
// `PagoGasto` del período y los informa en `salidas`. El mismo peso existe dos
// veces en la base —el pago y su RETIRO— y tiene que salir UNA vez.
//
// Los pagos tienen la forma del `select` del tablero: `{ medio, monto }`.

const pagoEnEfectivo = (monto) => ({ medio: "EFECTIVO", monto: Number(monto).toFixed(2) });

/** Lo que salió, contado como lo cuenta el resumen: pagos + retiros manuales. */
const salioDelNegocio = (r) => r.salidas.total + r.caja.retiros;

test("Doble 1 · PagoProveedor en efectivo + su RETIRO vinculado = UNA salida", () => {
  const clasificados = clasificarMovimientos([PAGO], VINCULOS);
  const r = resumenDelPeriodo({
    manuales: soloManuales(clasificados),
    recaudacion: soloRecaudacion(clasificados),
    pagosAProveedores: [pagoEnEfectivo(100000)],
  });
  assert.equal(r.pagosAProveedores.total, 100000);
  assert.equal(r.caja.retiros, 0, "el RETIRO del pago no puede quedar como retiro manual");
  assert.equal(salioDelNegocio(r), 100000, "los $100.000 salieron una vez");

  // CONTRAPRUEBA: sin el vínculo, el mismo retiro cae en MANUAL y la salida se
  // duplica. Es exactamente lo que la clasificación existe para impedir.
  const sinVinculo = clasificarMovimientos([PAGO], { idsDeRecaudacion: VINCULOS.idsDeRecaudacion });
  const roto = resumenDelPeriodo({
    manuales: soloManuales(sinVinculo),
    recaudacion: soloRecaudacion(sinVinculo),
    pagosAProveedores: [pagoEnEfectivo(100000)],
  });
  assert.equal(salioDelNegocio(roto), 200000);
});

test("Doble 2 · PagoGasto en efectivo + su RETIRO vinculado = UNA salida", () => {
  const clasificados = clasificarMovimientos([PAGO_GASTO], CON_GASTO);
  const r = resumenDelPeriodo({
    manuales: soloManuales(clasificados),
    recaudacion: soloRecaudacion(clasificados),
    pagosDeGastos: [pagoEnEfectivo(40000)],
  });
  assert.equal(r.pagosDeGastos.total, 40000);
  assert.equal(r.caja.retiros, 0);
  assert.equal(salioDelNegocio(r), 40000);

  const sinVinculo = clasificarMovimientos([PAGO_GASTO], VINCULOS);
  const roto = resumenDelPeriodo({
    manuales: soloManuales(sinVinculo),
    recaudacion: soloRecaudacion(sinVinculo),
    pagosDeGastos: [pagoEnEfectivo(40000)],
  });
  assert.equal(salioDelNegocio(roto), 80000, "contraprueba: sin vínculo se cuenta dos veces");
});

test("Doble 3 · la RECAUDACIÓN no es salida ni gasto: es plata que cambia de lugar", () => {
  const clasificados = clasificarMovimientos([RECAUDACION], VINCULOS);
  const r = resumenDelPeriodo({
    manuales: soloManuales(clasificados),
    recaudacion: soloRecaudacion(clasificados),
    periodo: { desde: "2026-09-20", hasta: "2026-09-26", instanteFin: new Date("2026-09-27T02:59:59.999Z") },
  });
  assert.equal(r.caja.retirosDeRecaudacion, 50000, "se informa aparte, no se esconde");
  assert.equal(salioDelNegocio(r), 0);
  assert.equal(r.gastos.devengados, 0);
  assert.equal(r.resultadoEconomico.resultado, 0, "no resta del resultado");
});

test("Doble 4 · el retiro de CIERRE no es salida ni gasto, ni entra en ningún renglón", () => {
  const clasificados = clasificarMovimientos([CIERRE], VINCULOS);
  const r = resumenDelPeriodo({
    manuales: soloManuales(clasificados),
    recaudacion: soloRecaudacion(clasificados),
    periodo: { desde: "2026-09-20", hasta: "2026-09-26", instanteFin: new Date("2026-09-27T02:59:59.999Z") },
  });
  assert.equal(r.caja.retiros, 0);
  assert.equal(r.caja.retirosDeRecaudacion, 0);
  assert.equal(salioDelNegocio(r), 0);
  assert.equal(r.resultadoEconomico.resultado, 0);
});

test("Doble 5 · todos juntos: cada peso en un solo renglón", () => {
  const clasificados = clasificarMovimientos(TODOS, CON_GASTO);
  const r = resumenDelPeriodo({
    manuales: soloManuales(clasificados),
    recaudacion: soloRecaudacion(clasificados),
    pagosAProveedores: [pagoEnEfectivo(100000)],
    pagosDeGastos: [pagoEnEfectivo(40000)],
  });
  // 100.000 del proveedor + 40.000 del gasto + 3.000 del retiro manual.
  assert.equal(r.salidas.total, 140000);
  assert.equal(r.caja.retiros, 3000);
  assert.equal(salioDelNegocio(r), 143000);
  // Recaudación (50.000) y cierre (40.000) no son salidas.
  assert.equal(r.caja.retirosDeRecaudacion, 50000);
});
