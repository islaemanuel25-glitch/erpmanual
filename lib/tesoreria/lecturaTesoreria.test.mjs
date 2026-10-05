// LA LECTURA CANÓNICA DE TESORERÍA — candados del armado puro.
//
//   node --import ./scripts/alias-loader.mjs --test lib/tesoreria/lecturaTesoreria.test.mjs
//
// Las filas tienen la forma que producen las rutas reales, no una forma
// "razonable" escrita a mano (regla 2 de CLAUDE.md, el defecto que más se
// repite):
//   · un movimiento llega YA clasificado, como lo devuelve `clasificarMovimientos`;
//   · un pago en EFECTIVO trae `turnoId` y `cajaMovimientoId` —el CHECK
//     *_efectivo_con_caja de la base lo obliga— y uno que no es efectivo trae los
//     dos en null;
//   · una venta trae `pagos` con la identidad del medio configurado.
// La prueba contra PostgreSQL (scripts/pruebas-db/tesoreriaLectura.mjs) arma
// esas filas con las rutas reales y ejerce lo mismo de punta a punta.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { armarLecturaTesoreria, ALERTA, ESTADO_DIGITAL, ESTADO_ENTREGA } from "./lecturaTesoreria.js";
import { CRITERIO_SIN_TURNO, CRITERIO_TURNO_OPERATIVO, ROTULO_SIN_TURNO } from "./turnoComercial.js";
import { CLASE_MOVIMIENTO } from "../finanzas/movimientosDeCaja.js";
import { formatoDeVerificacion } from "./verificacionEfectivoLectura.js";
import { MOTIVO_DESACTUALIZADA } from "./desactualizacion.js";

const LOCAL = 7;
const MAÑANA = new Date("2026-10-05T12:00:00-03:00");
const TARDE = new Date("2026-10-05T18:00:00-03:00");

const caja = (id, extra = {}) => ({
  id,
  localId: LOCAL,
  apertura: new Date("2026-10-05T08:00:00-03:00"),
  cierre: new Date("2026-10-05T20:00:00-03:00"),
  cierreEnPreparacionEn: new Date("2026-10-05T19:55:00-03:00"),
  anuladoEn: null,
  operadorId: 100 + id,
  operadorNombre: `Op ${id}`,
  vendedorId: 1,
  vendedorNombre: "Cuenta",
  diferenciaEfectivo: 0,
  ...extra,
});
const pago = (medio, monto, extra = {}) => ({
  medio,
  monto,
  comision: 0,
  neto: monto,
  procesador: null,
  medioNombre: null,
  modalidadNombre: null,
  ...extra,
});
const digital = (medio, monto, pct, extra = {}) => {
  const comision = Math.round(monto * pct) / 100;
  return pago(medio, monto, { comision, neto: monto - comision, ...extra });
};
let nVenta = 0;
const venta = (turnoId, pagos, extra = {}) => ({
  id: (nVenta += 1),
  fecha: MAÑANA,
  turnoId,
  total: pagos.reduce((s, p) => s + p.monto, 0),
  esFiado: pagos.length === 1 && pagos[0].medio === "FIADO",
  formaPago: pagos.length > 1 ? "mixto" : pagos[0].medio.toLowerCase(),
  comisionBancaria: pagos.reduce((s, p) => s + (p.comision || 0), 0),
  netoRecibido: null,
  comisionPendiente: false,
  pagos,
  ...extra,
});
const mov = (id, turnoId, clase, monto, extra = {}) => ({
  id,
  turnoId,
  tipo: clase === "INGRESO" ? "INGRESO" : "RETIRO",
  monto,
  motivo: null,
  createdAt: TARDE,
  clase: clase === "INGRESO" ? CLASE_MOVIMIENTO.MANUAL : clase,
  ...extra,
});
const pagoEfectivoDesdeCaja = (id, turnoId, cajaMovimientoId, monto) => ({
  id,
  fecha: TARDE,
  monto,
  medio: "EFECTIVO",
  turnoId,
  cajaMovimientoId,
});
const pagoExterior = (id, medio, monto) => ({ id, fecha: TARDE, monto, medio, turnoId: null, cajaMovimientoId: null });

const cajaDe = (lectura, turnoId) => lectura.cajas.find((c) => c.turnoId === turnoId);
const medioDe = (lista, medio) => lista.find((m) => m.medio === medio);

// ── EL EJEMPLO DEL NEGOCIO ───────────────────────────────────────────────────
//
// Turno mañana con dos cajas. Caja 1: efectivo 100.000, MP 5.000, crédito 5.000.
// Caja 2: efectivo 10.000, MP 1.000, crédito 1.000. Cada caja entrega su efectivo
// al cerrar.
function dosCajas() {
  return armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1), caja(2)],
    ventas: [
      venta(1, [pago("EFECTIVO", 100000)]),
      venta(1, [digital("MERCADOPAGO", 5000, 6, { procesador: "MERCADOPAGO", medioNombre: "MP QR", modalidadNombre: "QR" })]),
      venta(1, [digital("CREDITO", 5000, 3, { procesador: "BANCO", medioNombre: "Posnet", modalidadNombre: "1 pago" })]),
      venta(2, [pago("EFECTIVO", 10000)]),
      venta(2, [digital("MERCADOPAGO", 1000, 6, { procesador: "MERCADOPAGO", medioNombre: "MP QR", modalidadNombre: "QR" })]),
      venta(2, [digital("CREDITO", 1000, 3, { procesador: "BANCO", medioNombre: "Posnet", modalidadNombre: "1 pago" })]),
    ],
    movimientos: [mov(11, 1, CLASE_MOVIMIENTO.CIERRE, 100000), mov(12, 2, CLASE_MOVIMIENTO.CIERRE, 10000)],
  });
}

test("4/5 · dos cajas se consolidan en un turno comercial y conservan su drill-down", () => {
  const l = dosCajas();
  assert.equal(l.grupos.length, 1, "un solo turno comercial");
  const g = l.grupos[0];
  assert.equal(g.efectivoDeclaradoEntregado, 110000);
  assert.equal(medioDe(g.cobradoPorMedio, "EFECTIVO").montoDeclarado, 110000);
  assert.equal(medioDe(g.cobradoPorMedio, "MERCADOPAGO").montoDeclarado, 6000);
  assert.equal(medioDe(g.cobradoPorMedio, "CREDITO").montoDeclarado, 6000);
  assert.equal(g.digitalCobradoDeclarado, 12000);

  assert.deepEqual(g.cajas.map((c) => c.turnoId), [1, 2]);
  const [c1, c2] = g.cajas;
  assert.deepEqual(
    [c1.efectivoDeclaradoEntregado, medioDe(c1.cobradoPorMedio, "MERCADOPAGO").montoDeclarado, medioDe(c1.cobradoPorMedio, "CREDITO").montoDeclarado],
    [100000, 5000, 5000]
  );
  assert.deepEqual(
    [c2.efectivoDeclaradoEntregado, medioDe(c2.cobradoPorMedio, "MERCADOPAGO").montoDeclarado, medioDe(c2.cobradoPorMedio, "CREDITO").montoDeclarado],
    [10000, 1000, 1000]
  );
  assert.equal(l.resumen.baseConocida, 122000, "110.000 entregados + 12.000 digitales declarados");
});

test("1 · una entrega RECAUDACION aparece una sola vez, aunque la fila llegue repetida", () => {
  const r = mov(21, 1, CLASE_MOVIMIENTO.RECAUDACION, 30000);
  const l = armarLecturaTesoreria({ localId: LOCAL, cajas: [caja(1)], movimientos: [r, { ...r }] });
  assert.equal(l.entregas.length, 1);
  assert.equal(l.entregas[0].clase, CLASE_MOVIMIENTO.RECAUDACION);
  assert.equal(l.resumen.efectivoDeclaradoEntregado, 30000);
});

test("2 · una entrega CIERRE aparece una sola vez", () => {
  const c = mov(22, 1, CLASE_MOVIMIENTO.CIERRE, 45000);
  const l = armarLecturaTesoreria({ localId: LOCAL, cajas: [caja(1)], movimientos: [c, c] });
  assert.equal(l.entregas.length, 1);
  assert.equal(cajaDe(l, 1).efectivoDeclaradoEntregado, 45000);
});

test("3 · las copias del retiro en Turno, Arqueo y preparaciones no se suman", () => {
  // La caja trae las copias que el cierre escribe; la lectura no las mira.
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1, { efectivoRetiradoCierre: 45000, montoRealEfectivo: 55000, fondoDejadoCierre: 10000 })],
    movimientos: [mov(23, 1, CLASE_MOVIMIENTO.CIERRE, 45000)],
  });
  assert.equal(l.resumen.efectivoDeclaradoEntregado, 45000);
  // Y el código no las lee: ningún nombre de copia aparece fuera de comentarios.
  for (const archivo of ["lib/tesoreria/lecturaTesoreria.js", "lib/tesoreria/lecturaTesoreriaServer.js"]) {
    const codigo = readFileSync(archivo, "utf8").replace(/\/\/[^\n]*/g, "");
    for (const copia of ["efectivoRetiradoCierre", "efectivoRetirado", "totalRetiroContado", "retiroFinal", "montoRealEfectivo"]) {
      assert.doesNotMatch(codigo, new RegExp(`\\b${copia}\\b`), `${archivo} lee ${copia}`);
    }
  }
});

test("6 · un pago a proveedor en EFECTIVO desde la caja NO se resta otra vez", () => {
  // Caja: vendió 150.000 en efectivo, pagó 20.000 al panadero desde el cajón y
  // entregó 130.000 al cerrar.
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1)],
    ventas: [venta(1, [pago("EFECTIVO", 150000)])],
    movimientos: [mov(31, 1, CLASE_MOVIMIENTO.PAGO_PROVEEDOR, 20000), mov(32, 1, CLASE_MOVIMIENTO.CIERRE, 130000)],
    pagosProveedor: [pagoEfectivoDesdeCaja(501, 1, 31, 20000)],
  });
  assert.equal(l.resumen.efectivoDeclaradoEntregado, 130000);
  assert.equal(l.resumen.egresosExterioresConocidos, 0);
  assert.equal(l.resumen.pagosDesdeCajaInformativos, 20000);
  assert.equal(l.resumen.baseConocida, 130000, "130.000, no 110.000");
  assert.equal(cajaDe(l, 1).pagosDesdeCaja[0].pagadoDesdeCaja, true);
});

test("7 · un pago de gasto en EFECTIVO desde la caja NO se resta otra vez", () => {
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1)],
    movimientos: [mov(33, 1, CLASE_MOVIMIENTO.PAGO_GASTO, 8000), mov(34, 1, CLASE_MOVIMIENTO.CIERRE, 42000)],
    pagosGasto: [pagoEfectivoDesdeCaja(601, 1, 33, 8000)],
  });
  assert.equal(l.resumen.baseConocida, 42000);
  assert.equal(l.pagosDesdeCaja.length, 1);
  assert.equal(l.egresosExteriores.length, 0);
});

test("8/9 · los pagos que no son en efectivo SÍ son egresos exteriores y restan", () => {
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1)],
    movimientos: [mov(35, 1, CLASE_MOVIMIENTO.CIERRE, 100000)],
    pagosProveedor: [pagoExterior(502, "TRANSFERENCIA", 30000)],
    pagosGasto: [pagoExterior(602, "MERCADO_PAGO", 12000)],
  });
  assert.deepEqual(l.egresosExteriores.map((e) => [e.origen, e.montoPagado, e.pagadoDesdeCaja]), [
    ["PAGO_PROVEEDOR", 30000, false],
    ["PAGO_GASTO", 12000, false],
  ]);
  assert.equal(l.resumen.egresosExterioresConocidos, 42000);
  assert.equal(l.resumen.baseConocida, 58000);
});

// Con la forma de `SELECT_PAGO_PROVEEDOR` / `SELECT_PAGO_GASTO`: la relación
// llega anidada en la misma fila, y un gasto sin beneficiario lo trae en null.
const conCuenta = (p, nombre, pedidoProveedorId) => ({ ...p, nota: null, cuenta: { pedidoProveedorId, proveedor: { nombre } } });
const conGasto = (p, gasto) => ({ ...p, nota: null, gasto });

test("cómo se nombra un pago: proveedor y gasto con sus datos reales, nada del motivo", () => {
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1)],
    movimientos: [
      mov(31, 1, CLASE_MOVIMIENTO.PAGO_PROVEEDOR, 20000, { motivo: "Pago a Panadería Trucha" }),
      mov(33, 1, CLASE_MOVIMIENTO.PAGO_GASTO, 8000, { motivo: "Gasto: algo escrito a mano" }),
      mov(32, 1, CLASE_MOVIMIENTO.CIERRE, 130000),
    ],
    pagosProveedor: [
      conCuenta(pagoEfectivoDesdeCaja(501, 1, 31, 20000), "Panadería Real", 77),
      conCuenta(pagoExterior(502, "TRANSFERENCIA", 30000), "Distribuidora Sur", null),
    ],
    pagosGasto: [
      conGasto(pagoEfectivoDesdeCaja(601, 1, 33, 8000), { id: 40, concepto: "Limpieza", beneficiario: null, categoria: { nombre: "Mantenimiento" } }),
      conGasto(pagoExterior(602, "MERCADO_PAGO", 12000), { id: 41, concepto: "Luz", beneficiario: "Edesur", categoria: { nombre: "Servicios" } }),
    ],
  });
  const campos = (f) => [f.id, f.beneficiario, f.concepto, f.categoria, f.referencia, f.nota];
  assert.deepEqual(l.pagosDesdeCaja.map(campos), [
    [501, "Panadería Real", null, null, { tipo: "PEDIDO_PROVEEDOR", id: 77 }, null],
    [601, null, "Limpieza", "Mantenimiento", { tipo: "GASTO", id: 40 }, null],
  ]);
  assert.deepEqual(l.egresosExteriores.map(campos), [
    [502, "Distribuidora Sur", null, null, null, null],
    [602, "Edesur", "Luz", "Servicios", { tipo: "GASTO", id: 41 }, null],
  ]);
  // El motivo libre del movimiento no aparece en ningún pago.
  assert.equal(/Trucha|escrito a mano/.test(JSON.stringify([l.pagosDesdeCaja, l.egresosExteriores])), false);
  // Y nombrarlos no cambia la plata: los de caja siguen sin restar.
  assert.equal(l.resumen.baseConocida, 130000 - 30000 - 12000);
  assert.equal(l.resumen.pagosDesdeCajaInformativos, 28000);
});

test("la etiqueta de una caja sale del operador o del turno, nunca de un número inventado", () => {
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1, { operadorNombre: "Lucía" }), caja(2, { operadorId: null, operadorNombre: null })],
    movimientos: [mov(1, 1, CLASE_MOVIMIENTO.CIERRE, 1000), mov(2, 2, CLASE_MOVIMIENTO.CIERRE, 2000)],
  });
  assert.deepEqual(l.cajas.map((c) => [c.turnoId, c.etiqueta]), [[1, "Caja de Lucía"], [2, "Caja del turno #2"]]);
  assert.deepEqual(l.entregas.map((e) => [e.cajaMovimientoId, e.turnoId, e.etiquetaCaja, e.operadorNombre]), [
    [1, 1, "Caja de Lucía", "Lucía"],
    [2, 2, "Caja del turno #2", null],
  ]);
  assert.deepEqual(l.grupos[0].cajas.map((c) => c.etiqueta), ["Caja de Lucía", "Caja del turno #2"]);
  assert.equal(/Caja \d/.test(JSON.stringify(l)), false);
});

test("10 · RECAUDACION y CIERRE no son gastos ni egresos", () => {
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1)],
    movimientos: [mov(36, 1, CLASE_MOVIMIENTO.RECAUDACION, 20000), mov(37, 1, CLASE_MOVIMIENTO.CIERRE, 15000)],
  });
  assert.equal(l.resumen.egresosExterioresConocidos, 0);
  assert.equal(l.resumen.pagosDesdeCajaInformativos, 0);
  assert.equal(l.resumen.movimientosManuales.retiros, 0);
  assert.equal(l.resumen.baseConocida, 35000, "suman como entregas, no restan");
});

test("11 · el fondo inicial no es ingreso nuevo", () => {
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1, { montoInicial: 50000 })],
    ventas: [venta(1, [pago("EFECTIVO", 10000)])],
  });
  assert.equal(l.resumen.efectivoDeclaradoEntregado, 0);
  assert.equal(l.resumen.baseConocida, 0);
  const codigo = readFileSync("lib/tesoreria/lecturaTesoreria.js", "utf8").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(codigo, /montoInicial|cambioPendiente/i);
});

test("12 · el Caja +/− manual no es ingreso ni egreso del negocio", () => {
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1)],
    movimientos: [mov(38, 1, "INGRESO", 5000), mov(39, 1, CLASE_MOVIMIENTO.MANUAL, 3000), mov(40, 1, CLASE_MOVIMIENTO.CIERRE, 60000)],
  });
  assert.equal(l.resumen.baseConocida, 60000);
  assert.deepEqual(l.resumen.movimientosManuales, { ingresos: 5000, retiros: 3000, cantidad: 2 });
  assert.equal(l.resumen.egresosExterioresConocidos, 0);
  assert.equal(cajaDe(l, 1).movimientosManuales.length, 2);
  assert.ok(l.alertas.some((a) => a.codigo === ALERTA.MOVIMIENTOS_MANUALES));
});

test("13 · la venta interna no entra: el lector filtra con whereVentaComercial", () => {
  const codigo = readFileSync("lib/tesoreria/lecturaTesoreriaServer.js", "utf8").replace(/\/\/[^\n]*/g, "");
  assert.match(codigo, /db\.venta\.findMany\(\{\s*where:\s*whereVentaComercial\(/);
});

test("14 · FIADO no entra como cobro", () => {
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1)],
    ventas: [venta(1, [pago("FIADO", 9000)]), venta(1, [pago("EFECTIVO", 1000)])],
  });
  assert.equal(medioDe(l.resumen.cobradoPorMedio, "FIADO"), undefined);
  assert.equal(l.resumen.efectivoCobradoDeclarado, 1000);
  assert.equal(l.resumen.digitalCobradoDeclarado, 0);
});

test("15 · lo digital es declarado por el POS, con comisión y neto estimados, nunca acreditado", () => {
  const l = dosCajas();
  const mp = medioDe(l.resumen.cobradoPorMedio, "MERCADOPAGO");
  assert.equal(mp.estado, ESTADO_DIGITAL.DECLARADO_POS);
  assert.equal(mp.comisionEstimada, 360);
  assert.equal(mp.netoEstimado, 5640);
  assert.deepEqual(mp.detalle.map((d) => [d.procesador, d.modalidadNombre]), [["MERCADOPAGO", "QR"]]);
  assert.equal(l.resumen.estadoDigital, ESTADO_DIGITAL.DECLARADO_POS);
  assert.equal(medioDe(l.resumen.cobradoPorMedio, "EFECTIVO").estado, null);
  // Ninguna clave del resultado afirma algo que el sistema no puede probar.
  const claves = JSON.stringify(l);
  assert.doesNotMatch(claves, /acreditad|conciliad|disponible|depositad/i);
  // La comisión pendiente se avisa.
  const p = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1)],
    ventas: [venta(1, [pago("DEBITO", 1000)], { comisionPendiente: true })],
  });
  assert.equal(p.resumen.comisionEstimadaIncompleta, true);
  assert.ok(p.alertas.some((a) => a.codigo === ALERTA.COMISION_PENDIENTE));
});

test("16 · cerrar sin conteo no inventa $0", () => {
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1, { diferenciaEfectivo: null })],
    ventas: [venta(1, [pago("EFECTIVO", 25000)])],
    cierresSinConteo: [{ turnoId: 1, instante: TARDE }],
  });
  const c = cajaDe(l, 1);
  assert.equal(c.efectivoDeclaradoEntregado, null, "null, no 0");
  assert.equal(c.sinImporteDeclarado, true);
  assert.equal(c.diferenciaCaja, null);
  assert.ok(l.alertas.some((a) => a.codigo === ALERTA.SIN_IMPORTE_DECLARADO && a.turnoId === 1));
  assert.equal(l.resumen.baseIncompleta, true);
  // Y el turno comercial lo dice en el mismo lugar que su número.
  assert.deepEqual(l.grupos[0].alertas, [{ codigo: ALERTA.SIN_IMPORTE_DECLARADO, turnoId: 1 }]);
});

test("14 · un turno anulado conserva sus entregas y lo avisa, en la caja y en su grupo", () => {
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1, { anuladoEn: new Date("2026-10-05T21:00:00-03:00") })],
    movimientos: [mov(48, 1, CLASE_MOVIMIENTO.CIERRE, 40000)],
  });
  assert.equal(cajaDe(l, 1).efectivoDeclaradoEntregado, 40000, "la plata entregada no desaparece");
  assert.equal(l.resumen.efectivoDeclaradoEntregado, 40000);
  assert.ok(cajaDe(l, 1).alertas.includes(ALERTA.TURNO_ANULADO));
  assert.deepEqual(l.grupos[0].alertas, [{ codigo: ALERTA.TURNO_ANULADO, turnoId: 1 }]);
});

test("el grupo informa los instantes reales de sus hechos", () => {
  const l = dosCajas();
  assert.deepEqual([l.grupos[0].primerHecho, l.grupos[0].ultimoHecho], [MAÑANA, TARDE]);
});

test("17 · las diferencias de dos operadores no se compensan", () => {
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1, { diferenciaEfectivo: -5000 }), caja(2, { diferenciaEfectivo: 5000 })],
    movimientos: [mov(41, 1, CLASE_MOVIMIENTO.CIERRE, 45000), mov(42, 2, CLASE_MOVIMIENTO.CIERRE, 55000)],
  });
  assert.deepEqual(l.cajas.map((c) => [c.turnoId, c.diferenciaCaja]), [[1, -5000], [2, 5000]]);
  // Ningún agregado suma diferencias: ni el grupo ni el resumen tienen ese campo.
  assert.equal(JSON.stringify(l.resumen).includes("diferencia"), false);
  assert.equal(JSON.stringify(l.grupos).includes("diferencia"), false);
});

test("18 · la diferencia de caja no modifica el efectivo declarado de la entrega", () => {
  // POS esperaba 111.000, el cajero contó y entregó 110.000: diferencia −1.000.
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1, { diferenciaEfectivo: -1000 })],
    movimientos: [mov(43, 1, CLASE_MOVIMIENTO.CIERRE, 110000)],
  });
  assert.equal(cajaDe(l, 1).efectivoDeclaradoEntregado, 110000);
  assert.equal(cajaDe(l, 1).diferenciaCaja, -1000);
  assert.equal(l.resumen.efectivoDeclaradoEntregado, 110000);
});

test("19 · un pago y su CajaMovimiento son el mismo dinero: aparece una sola vez", () => {
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1)],
    movimientos: [mov(44, 1, CLASE_MOVIMIENTO.PAGO_PROVEEDOR, 7000), mov(45, 1, CLASE_MOVIMIENTO.PAGO_GASTO, 2000)],
    pagosProveedor: [pagoEfectivoDesdeCaja(503, 1, 44, 7000)],
    pagosGasto: [pagoEfectivoDesdeCaja(603, 1, 45, 2000)],
  });
  const c = cajaDe(l, 1);
  assert.equal(c.movimientosManuales.length, 0, "el movimiento del pago no es manual");
  assert.equal(c.entregas.length, 0, "ni entrega");
  assert.equal(l.pagosDesdeCaja.length, 2, "solo el pago, una vez");
  assert.equal(l.resumen.pagosDesdeCajaInformativos, 9000);
  assert.equal(l.resumen.baseConocida, 0);
});

test("20 · la agrupación es del turno de la caja, nunca de su apertura ni de la hora del hecho", () => {
  // Reescrito a sabiendas con el turno operativo (migración
  // 20261004200000_turno_operativo). Antes el grupo era el día del hecho
  // para todas las cajas. Ahora: la caja con turno va a SU turno y SU fecha
  // operativa; la caja sin turno —anterior— va a "Sin turno asignado" del día
  // del hecho. Ninguna de las dos se agrupa por `Turno.apertura`.
  const vieja = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1, { apertura: new Date("2026-10-04T22:00:00-03:00") })],
    ventas: [venta(1, [pago("EFECTIVO", 1000)])],
    movimientos: [mov(46, 1, CLASE_MOVIMIENTO.CIERRE, 1000)],
  });
  assert.deepEqual(vieja.grupos.map((g) => [g.dia, g.criterio, g.etiqueta]), [["2026-10-05", CRITERIO_SIN_TURNO, ROTULO_SIN_TURNO]]);

  // Reemplazable: otra frontera agrupa distinto sin tocar nada más.
  const todoJunto = (localId) => ({ clave: `${localId}:x`, etiqueta: "X", dia: "2026-10-05", orden: 0, criterio: "PRUEBA", sinTurno: false });
  const conOtra = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1), caja(2)],
    movimientos: [mov(47, 1, CLASE_MOVIMIENTO.CIERRE, 1000), mov(48, 2, CLASE_MOVIMIENTO.CIERRE, 1000)],
    grupoDe: todoJunto,
  });
  assert.deepEqual(conOtra.grupos.map((g) => g.etiqueta), ["X"]);

  // La frontera no conoce la apertura, y el armado le pasa la caja y el
  // instante del hecho: cada llamada lleva el turnoId de su caja.
  const frontera = readFileSync("lib/tesoreria/turnoComercial.js", "utf8").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(frontera, /apertura/);
  const armado = readFileSync("lib/tesoreria/lecturaTesoreria.js", "utf8").replace(/\/\/[^\n]*/g, "");
  const llamadas = [...armado.matchAll(/\bgrupo\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.deepEqual(
    llamadas.sort(),
    ["instante, turnoId", "m.createdAt, m.turnoId", "p.fecha, p.turnoId", "s.instante, s.turnoId", "v.fecha, v.turnoId"].sort()
  );
  assert.match(armado, /grupoDe\(localId, \{ caja: datosDeCaja\.get\(turnoId\) \?\? null, instante \}\)/);
});

// ── TURNO OPERATIVO: el grupo es el turno de la caja ────────────────────────
//
// Las cajas de estos casos tienen la forma que da `leerTesoreria`: turno y
// fecha operativa de la caja, más el nombre y el orden del catálogo.
const MAÑANA_TO = { turnoOperativoId: 31, turnoOperativoNombre: "Mañana", turnoOperativoOrden: 0, fechaOperativa: new Date("2026-10-05T00:00:00.000Z") };
const TARDE_TO = { turnoOperativoId: 32, turnoOperativoNombre: "Tarde", turnoOperativoOrden: 1, fechaOperativa: new Date("2026-10-05T00:00:00.000Z") };

test("[TO-1] mismo local y misma fecha, distinto turno: dos grupos", () => {
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1, MAÑANA_TO), caja(2, TARDE_TO)],
    movimientos: [mov(61, 1, CLASE_MOVIMIENTO.CIERRE, 50000, { createdAt: MAÑANA }), mov(62, 2, CLASE_MOVIMIENTO.CIERRE, 30000)],
  });
  assert.deepEqual(
    l.grupos.map((g) => [g.etiqueta, g.fechaOperativa, g.criterio, g.efectivoDeclaradoEntregado, g.cajas.map((c) => c.turnoId)]),
    [
      ["Mañana", "2026-10-05", CRITERIO_TURNO_OPERATIVO, 50000, [1]],
      ["Tarde", "2026-10-05", CRITERIO_TURNO_OPERATIVO, 30000, [2]],
    ]
  );
  // Cada entrega dice a qué grupo fue.
  assert.notEqual(l.entregas.find((e) => e.cajaMovimientoId === 61).grupo, l.entregas.find((e) => e.cajaMovimientoId === 62).grupo);
});

test("[TO-2] dos cajas del mismo turno: un grupo con las dos", () => {
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1, MAÑANA_TO), caja(2, MAÑANA_TO)],
    movimientos: [mov(63, 1, CLASE_MOVIMIENTO.CIERRE, 50000), mov(64, 2, CLASE_MOVIMIENTO.CIERRE, 10000)],
  });
  assert.equal(l.grupos.length, 1);
  assert.equal(l.grupos[0].etiqueta, "Mañana");
  assert.deepEqual(l.grupos[0].cajas.map((c) => c.turnoId), [1, 2]);
  assert.equal(l.grupos[0].efectivoDeclaradoEntregado, 60000);
});

test("[TO-3] una caja que cruza la medianoche conserva fecha y turno y no se parte", () => {
  const NOCHE = { turnoOperativoId: 33, turnoOperativoNombre: "Noche", turnoOperativoOrden: 2, fechaOperativa: new Date("2026-10-05T00:00:00.000Z") };
  const despuesDeMedianoche = new Date("2026-10-06T00:30:00-03:00");
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1, { ...NOCHE, apertura: new Date("2026-10-05T22:00:00-03:00"), cierre: despuesDeMedianoche })],
    ventas: [venta(1, [pago("EFECTIVO", 3000)], { fecha: new Date("2026-10-05T23:10:00-03:00") }), venta(1, [pago("EFECTIVO", 2000)], { fecha: despuesDeMedianoche })],
    movimientos: [mov(65, 1, CLASE_MOVIMIENTO.CIERRE, 5000, { createdAt: despuesDeMedianoche })],
  });
  assert.deepEqual(l.grupos.map((g) => [g.etiqueta, g.dia]), [["Noche", "2026-10-05"]], "la caja se partió en dos días");
  assert.equal(l.grupos[0].efectivoDeclaradoEntregado, 5000);
  assert.equal(medioDe(l.grupos[0].cobradoPorMedio, "EFECTIVO").montoDeclarado, 5000, "la venta de después de medianoche se fue a otro grupo");
});

test("[TO-H11][TO-C10] Tesorería no vuelve a inferir turno ni fecha por la hora de los hechos", () => {
  // Domingo 23:30 y lunes 00:30 abrieron cajas del mismo turno, y la apertura
  // les fijó la jornada del lunes. Sus entregas tienen instantes de los dos
  // días: Tesorería las agrupa por lo guardado en la caja, en UN grupo.
  const JORNADA = { turnoOperativoId: 34, turnoOperativoNombre: "T34", turnoOperativoOrden: 0, fechaOperativa: new Date("2026-10-05T00:00:00.000Z") };
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [
      caja(1, { ...JORNADA, apertura: new Date("2026-10-04T23:30:00-03:00") }),
      caja(2, { ...JORNADA, apertura: new Date("2026-10-05T00:30:00-03:00") }),
    ],
    movimientos: [
      mov(70, 1, CLASE_MOVIMIENTO.CIERRE, 4000, { createdAt: new Date("2026-10-04T23:50:00-03:00") }),
      mov(71, 2, CLASE_MOVIMIENTO.CIERRE, 6000, { createdAt: new Date("2026-10-05T07:00:00-03:00") }),
    ],
  });
  assert.deepEqual(l.grupos.map((g) => [g.etiqueta, g.fechaOperativa, g.cajas.map((c) => c.turnoId)]), [["T34", "2026-10-05", [1, 2]]]);
  assert.equal(l.grupos[0].efectivoDeclaradoEntregado, 10000);
  // Y la lectura no importa nada que reconozca turnos o calcule jornadas.
  for (const ruta of ["lecturaTesoreria.js", "lecturaTesoreriaServer.js", "turnoComercial.js", "verificacionEfectivoServer.js"]) {
    const s = readFileSync(new URL(`./${ruta}`, import.meta.url), "utf8");
    assert.doesNotMatch(s, /reconocerTurno|cicloDeTurnos|ocurrenciaDeApertura|enVentanaDeReconocimiento|momentoArgentina/, `${ruta} infiere el turno`);
  }
});

test("[TO-8] una caja sin turno va a «Sin turno asignado», aparte, y no recibe uno inventado", () => {
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1, MAÑANA_TO), caja(2)],
    movimientos: [mov(66, 1, CLASE_MOVIMIENTO.CIERRE, 50000, { createdAt: MAÑANA }), mov(67, 2, CLASE_MOVIMIENTO.CIERRE, 8000, { createdAt: MAÑANA })],
  });
  assert.deepEqual(l.grupos.map((g) => [g.etiqueta, g.sinTurno]), [["Mañana", false], [ROTULO_SIN_TURNO, true]]);
  assert.deepEqual(l.grupos[1].cajas.map((c) => c.turnoId), [2], "la caja vieja se mezcló con Mañana");
  assert.equal(cajaDe(l, 2).turnoOperativo, null, "a la caja sin turno se le asignó uno");
  assert.equal(cajaDe(l, 2).fechaOperativa, null);
  assert.deepEqual(cajaDe(l, 1).turnoOperativo, { id: 31, nombre: "Mañana" });
});

test("[TO-10] agrupar no compensa: cada caja conserva su diferencia y el turno no trae una neta", () => {
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1, { ...MAÑANA_TO, diferenciaEfectivo: -2000 }), caja(2, { ...MAÑANA_TO, diferenciaEfectivo: 2000 })],
    movimientos: [mov(68, 1, CLASE_MOVIMIENTO.CIERRE, 48000), mov(69, 2, CLASE_MOVIMIENTO.CIERRE, 32000)],
  });
  assert.equal(cajaDe(l, 1).diferenciaCaja, -2000);
  assert.equal(cajaDe(l, 2).diferenciaCaja, 2000);
  const g = l.grupos[0];
  assert.equal(g.cajas.length, 2);
  // Ni el grupo ni sus cajas del drill-down llevan una diferencia: se lee en
  // cada caja, una por una.
  assert.ok(!("diferenciaCaja" in g) && !("diferencia" in g), "el grupo trae una diferencia neta");
  for (const c of g.cajas) assert.ok(!("diferenciaCaja" in c), "el drill-down suma diferencias");
});

// ── LA VERIFICACIÓN EN LA LECTURA ────────────────────────────────────────────
//
// La verificación llega con la forma de `formatoDeVerificacion` sobre una fila
// con los campos que selecciona `SELECT_VERIFICACION`: la de la base, no una
// escrita a mano con nombres parecidos.
const filaDeVerificacion = (id, fotos, { importeVerificado, estado = "VIGENTE" } = {}) => {
  const declarado = fotos.reduce((s, f) => s + f.monto, 0);
  return {
    id,
    localId: LOCAL,
    importeDeclarado: declarado,
    importeVerificado,
    diferencia: importeVerificado - declarado,
    estado,
    vigente: estado === "VIGENTE",
    verificadaPorUsuarioId: 1,
    verificadaPorOperadorId: null,
    verificadaEn: TARDE,
    observacion: null,
    idempotencyKey: `k${id}`,
    anuladaEn: null,
    anuladaPorUsuarioId: null,
    motivoAnulacion: null,
    verificadaPor: { id: 1, nombre: "Responsable Tesorería" },
    anuladaPor: null,
    entregas: fotos.map((f) => ({
      cajaMovimientoId: f.id,
      vigente: estado === "VIGENTE",
      montoDeclaradoSnapshot: f.monto,
      localIdSnapshot: LOCAL,
      turnoIdSnapshot: f.turnoId,
      operadorIdSnapshot: 100 + f.turnoId,
      claseSnapshot: "CIERRE",
      instanteEntregaSnapshot: TARDE,
    })),
  };
};

test("la verificación conjunta: entregas cubiertas, lo contado en el ACTO, nada repartido", () => {
  const base = {
    localId: LOCAL,
    cajas: [caja(1), caja(2)],
    movimientos: [mov(1, 1, CLASE_MOVIMIENTO.CIERRE, 100000), mov(2, 2, CLASE_MOVIMIENTO.CIERRE, 10000), mov(3, 1, CLASE_MOVIMIENTO.RECAUDACION, 5000)],
  };
  const sin = armarLecturaTesoreria(base);
  const v = formatoDeVerificacion(filaDeVerificacion(9, [{ id: 1, monto: 100000, turnoId: 1 }, { id: 2, monto: 10000, turnoId: 2 }], { importeVerificado: 108000 }));
  const con = armarLecturaTesoreria({ ...base, verificaciones: [v] });

  assert.deepEqual(sin.entregas.map((e) => e.estadoVerificacion), [ESTADO_ENTREGA.PENDIENTE, ESTADO_ENTREGA.PENDIENTE, ESTADO_ENTREGA.PENDIENTE]);
  const porId = new Map(con.entregas.map((e) => [e.cajaMovimientoId, e]));
  assert.deepEqual([porId.get(1).estadoVerificacion, porId.get(1).verificacionId, porId.get(1).montoDeclaradoVerificado], ["VERIFICADA", 9, 100000]);
  assert.deepEqual([porId.get(2).estadoVerificacion, porId.get(2).verificacionId], ["VERIFICADA", 9]);
  assert.deepEqual([porId.get(3).estadoVerificacion, porId.get(3).verificacionId], ["PENDIENTE", null]);

  // Lo contado es del acto: −2.000, una vez. Ni las entregas ni las cajas llevan un pedazo.
  assert.deepEqual([con.verificaciones[0].importeDeclarado, con.verificaciones[0].importeVerificado, con.verificaciones[0].diferencia], [110000, 108000, -2000]);
  for (const e of con.entregas) assert.equal(Object.keys(e).some((k) => /diferencia|importeVerificado/i.test(k)), false, JSON.stringify(e));
  assert.equal(JSON.stringify(con.cajas).includes("108000"), false);

  // Declarado y verificado, separados; la base declarada no cambia por verificar.
  // Lo parcial se deriva: declarado = cubierto + pendiente, y cuáles faltan.
  assert.deepEqual(con.resumen.verificacion, {
    entregadoDeclarado: 115000,
    entregadoPendienteDeVerificar: 5000,
    entregasPendientes: 1,
    entregasPendientesIds: [3],
    entregadoCubiertoPorVerificaciones: 110000,
    entregasVerificadas: 2,
    actosCompletos: 1,
    declaradoDeLosActos: 110000,
    efectivoVerificado: 108000,
    actosQueCruzan: 0,
    actosQueCruzanIds: [],
    actosDesactualizados: 0,
  });
  // Dos cajas en el acto, una sola diferencia; quién verificó, solo id y nombre.
  assert.equal(con.verificaciones[0].cantidadDeCajas, 2);
  assert.deepEqual(con.verificaciones[0].verificadaPor, { id: 1, nombre: "Responsable Tesorería" });
  assert.equal(con.verificaciones[0].verificadaPorOperador, null);
  assert.equal(con.resumen.baseConocida, sin.resumen.baseConocida);
  assert.equal(con.grupos[0].verificacion.efectivoVerificado, 108000);
  assert.equal(con.alertas.some((a) => a.codigo === ALERTA.VERIFICACION_DESACTUALIZADA), false);
});

test("una entrega que cambió después de verificarla avisa y no recalcula nada", () => {
  const v = formatoDeVerificacion(filaDeVerificacion(9, [{ id: 1, monto: 100000, turnoId: 1 }, { id: 2, monto: 10000, turnoId: 2 }], { importeVerificado: 108000 }));
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1), caja(2)],
    // El movimiento 2 hoy dice $9.000, y el 1 perdió su vínculo de cierre.
    movimientos: [mov(1, 1, CLASE_MOVIMIENTO.MANUAL, 100000), mov(2, 2, CLASE_MOVIMIENTO.CIERRE, 9000)],
    verificaciones: [v],
  });
  const alertas = l.alertas.filter((a) => a.codigo === ALERTA.VERIFICACION_DESACTUALIZADA);
  assert.deepEqual(alertas.map((a) => [a.verificacionId, a.cajaMovimientoId, a.motivos]), [
    [9, 1, [MOTIVO_DESACTUALIZADA.CLASE]],
    [9, 2, [MOTIVO_DESACTUALIZADA.MONTO]],
  ]);
  const e2 = l.entregas.find((e) => e.cajaMovimientoId === 2);
  assert.deepEqual([e2.desactualizada, e2.montoDeclarado, e2.montoDeclaradoVerificado], [true, 9000, 10000]);
  assert.deepEqual([l.verificaciones[0].importeDeclarado, l.verificaciones[0].diferencia, l.verificaciones[0].desactualizada], [110000, -2000, true]);
  assert.equal(l.resumen.verificacion.actosDesactualizados, 1);
});

test("un acto con una entrega fuera del período no se atribuye: se informa que cruza", () => {
  const v = formatoDeVerificacion(filaDeVerificacion(9, [{ id: 1, monto: 100000, turnoId: 1 }, { id: 99, monto: 10000, turnoId: 2 }], { importeVerificado: 110000 }));
  const l = armarLecturaTesoreria({ localId: LOCAL, cajas: [caja(1)], movimientos: [mov(1, 1, CLASE_MOVIMIENTO.CIERRE, 100000)], verificaciones: [v] });
  assert.deepEqual([l.verificaciones[0].completaEnElPeriodo, l.verificaciones[0].entregasEnElPeriodo], [false, [1]]);
  assert.deepEqual([l.resumen.verificacion.efectivoVerificado, l.resumen.verificacion.actosQueCruzan, l.resumen.verificacion.entregasVerificadas], [0, 1, 1]);
  assert.deepEqual(l.resumen.verificacion.actosQueCruzanIds, [9]);
  // El acto que cruza va ENTERO en `verificaciones`: su diferencia no se recorta al período.
  assert.deepEqual([l.verificaciones[0].importeDeclarado, l.verificaciones[0].diferencia], [110000, 0]);
});
