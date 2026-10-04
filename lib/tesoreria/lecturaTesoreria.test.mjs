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

import { armarLecturaTesoreria, ALERTA, ESTADO_DIGITAL } from "./lecturaTesoreria.js";
import { turnoComercialDe, CRITERIO_TURNO_COMERCIAL } from "./turnoComercial.js";
import { CLASE_MOVIMIENTO } from "../finanzas/movimientosDeCaja.js";

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

test("20 · la agrupación es la frontera reemplazable y no mira Turno.apertura", () => {
  // La caja abrió el día 4; vendió y entregó el día 5: el grupo es el día 5.
  const l = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1, { apertura: new Date("2026-10-04T22:00:00-03:00") })],
    ventas: [venta(1, [pago("EFECTIVO", 1000)])],
    movimientos: [mov(46, 1, CLASE_MOVIMIENTO.CIERRE, 1000)],
  });
  assert.deepEqual(l.grupos.map((g) => g.dia), ["2026-10-05"]);
  assert.equal(l.grupos[0].criterio, CRITERIO_TURNO_COMERCIAL);
  assert.equal(l.grupos[0].provisorio, true);

  // Reemplazable: otra frontera agrupa distinto sin tocar nada más.
  const franja = (localId, instante) => {
    const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Argentina/Cordoba", hour: "numeric", hour12: false }).format(instante));
    const nombre = h < 14 ? "MAÑANA" : "TARDE";
    return { clave: `${localId}:${nombre}`, etiqueta: nombre, dia: null, criterio: "PRUEBA", provisorio: false };
  };
  const conFranja = armarLecturaTesoreria({
    localId: LOCAL,
    cajas: [caja(1)],
    ventas: [venta(1, [pago("EFECTIVO", 1000)])],
    movimientos: [mov(47, 1, CLASE_MOVIMIENTO.CIERRE, 1000)],
    turnoComercialDe: franja,
  });
  assert.deepEqual(conFranja.grupos.map((g) => g.etiqueta), ["MAÑANA", "TARDE"]);

  // Y la apertura nunca llega a la frontera: la frontera no la conoce, y el
  // armado le pasa solo el instante del hecho. La caja sí expone su apertura
  // como dato del drill-down, y eso no agrupa nada.
  const frontera = readFileSync("lib/tesoreria/turnoComercial.js", "utf8").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(frontera, /apertura/);
  const armado = readFileSync("lib/tesoreria/lecturaTesoreria.js", "utf8").replace(/\/\/[^\n]*/g, "");
  const llamadas = [...armado.matchAll(/\bgrupo\(([^)]*)\)/g)].map((m) => m[1].trim());
  // `s.instante` es el del cierre sin conteo: también un hecho, no una apertura.
  assert.deepEqual(llamadas.sort(), ["instante", "m.createdAt", "p.fecha", "s.instante", "v.fecha"].sort());
  assert.match(armado, /const tc = turnoComercialDe\(localId, instante\);/);
  assert.equal(turnoComercialDe(LOCAL, MAÑANA).clave, `${LOCAL}:2026-10-05`);
});
