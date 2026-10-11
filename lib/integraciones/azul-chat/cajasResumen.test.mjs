// Candados de la capacidad `cajas_resumen`: el pedido, el día argentino, el
// turno operativo, la agrupación, las diferencias por caja, los retiros con su
// "a quién", y que cada número salga de la pieza que usan las pantallas.
//
// Las filas tienen la forma de la base, no una "razonable": la lectura de
// Tesorería se arma con `armarLecturaTesoreria` —la función real— sobre filas
// como las que lee `leerTesoreria` (movimientos YA clasificados, pagos en
// efectivo con su caja); las ventas tienen la forma de `SELECT_RESUMEN_VENTA`
// más `turnoId`, con `formaPago` en minúscula y un `VentaPago` por medio, como
// las escribe `/api/pos-ventas/crear`; los Turno, la de `SELECT_TURNO` de
// cajasResumenServer.js. `scripts/pruebas-db/azulChatCajasResumen.mjs` produce
// esas mismas filas por las rutas reales y ejerce todo contra PostgreSQL.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/integraciones/azul-chat/cajasResumen.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolverPedido,
  elegirTurnoOperativo,
  armarCajasResumen,
  ESTADO_CAJA,
  VERIFICACION_TESORERIA,
  TIPO_RETIRO,
} from "./cajasResumen.js";
import { cajasResumen } from "./cajasResumenServer.js";
import { armarLecturaTesoreria } from "../../tesoreria/lecturaTesoreria.js";
import { whereVentasDeTesoreria } from "../../tesoreria/lecturaTesoreriaServer.js";
import { whereVentaComercial } from "../../ventas/filtroVentaComercial.js";
import { CLASE_MOVIMIENTO } from "../../finanzas/movimientosDeCaja.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sinComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const leer = (rel) => sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

// 2026-10-06 02:30 UTC = 2026-10-05 23:30 en Argentina: un error de zona se ve.
const NOCHE = Date.parse("2026-10-06T02:30:00.000Z");
const DIA = "2026-10-05";
const INICIO = new Date("2026-10-05T03:00:00.000Z");
const LOCAL = { id: 7, nombre: "Local Centro", activo: true };
const MANANA = { id: 1, nombre: "Mañana", orden: 0 };
const TARDE = { id: 2, nombre: "Tarde", orden: 1 };
const hora = (h) => new Date(`2026-10-05T${h}:00-03:00`);

// ── Las filas, con la forma de la base ──────────────────────────────────────

/** Un Turno como lo lee cajasResumenServer.js (SELECT_TURNO). Decimal llega como string. */
const turno = (id, { to = MANANA, abierta = false, inicial = "1000", esperado, contado, ...extra } = {}) => ({
  id,
  apertura: hora("08:00"),
  cierre: abierta ? null : hora("14:00"),
  cierreEnPreparacionEn: abierta ? null : hora("13:55"),
  anuladoEn: null,
  montoInicial: inicial,
  montoEsperadoEfectivo: abierta ? null : esperado,
  montoRealEfectivo: abierta ? null : contado,
  efectivoRetiradoCierre: null,
  fondoDejadoCierre: null,
  destinoRetiroCierre: null,
  recibidoPorCierre: null,
  turnoOperativoId: to ? to.id : null,
  fechaOperativa: to ? new Date(`${DIA}T00:00:00.000Z`) : null,
  turnoOperativo: to ? { nombre: to.nombre, orden: to.orden } : null,
  ...extra,
});

let nVenta = 0;
/** Una venta en las DOS formas: la de Tesorería (SELECT_VENTA) y la del reporte (SELECT_RESUMEN_VENTA + turnoId). */
function venta(turnoId, pagos) {
  const total = pagos.reduce((s, p) => s + p.monto, 0);
  const id = (nVenta += 1);
  const formaPago = pagos.length > 1 ? "mixto" : pagos[0].medio.toLowerCase();
  const esFiado = pagos.some((p) => p.medio === "FIADO");
  return {
    tesoreria: {
      id, fecha: hora("10:00"), turnoId, total, esFiado, formaPago, comisionBancaria: 0, netoRecibido: null, comisionPendiente: false,
      pagos: pagos.map((p) => ({ medio: p.medio, monto: p.monto, comision: 0, neto: p.monto, procesador: null, medioNombre: null, modalidadNombre: null })),
    },
    reporte: {
      id, total: String(total), subtotal: String(total), descuento: "0", comisionBancaria: "0", netoRecibido: String(total),
      comisionPendiente: false, costoTotal: "0", gananciaBruta: "0", gananciaNeta: "0", formaPago, esFiado, turnoId,
      pagos: pagos.map((p) => ({ medio: p.medio, monto: String(p.monto), comision: "0", neto: String(p.monto) })),
    },
  };
}

/** Un movimiento YA clasificado, como lo devuelve `clasificarMovimientos`, y su detalle con autor. */
const mov = (id, turnoId, clase, monto, { tipo = "RETIRO", motivo = null, h = "12:00" } = {}) => ({
  id, turnoId, tipo, monto, motivo, createdAt: hora(h), clase,
});

/** Arma la entrada de `armarCajasResumen` con la lectura REAL de Tesorería. */
function escenario({ turnos, ventas = [], movimientos = [], pagosProveedor = [], pagosGasto = [], arqueos = [], verificaciones = [], esperadosVivos = new Map(), filtro = null, pedido = { tipo: "fecha", dia: DIA, hoy: "2026-10-06" }, local = LOCAL }) {
  const lectura = armarLecturaTesoreria({
    localId: local.id,
    ventas: ventas.map((v) => v.tesoreria),
    movimientos,
    pagosProveedor,
    pagosGasto,
    cajas: turnos.map((t) => ({
      id: t.id, localId: local.id, apertura: t.apertura, cierre: t.cierre, cierreEnPreparacionEn: t.cierreEnPreparacionEn, anuladoEn: t.anuladoEn,
      operadorId: 100 + t.id, vendedorId: 1, diferenciaEfectivo: t.diferenciaEfectivo ?? null,
      turnoOperativoId: t.turnoOperativoId, fechaOperativa: t.fechaOperativa,
      operadorNombre: t.operadorNombre ?? `Op ${t.id}`, vendedorNombre: "Cuenta",
      turnoOperativoNombre: t.turnoOperativo?.nombre ?? null, turnoOperativoOrden: t.turnoOperativo?.orden ?? null,
    })),
    verificaciones,
  });
  const detalle = movimientos.map((m) => ({ id: m.id, motivo: m.motivo, createdAt: m.createdAt, usuario: { nombre: "cuenta-del-mostrador" } }));
  for (const p of [...pagosProveedor, ...pagosGasto]) detalle.push({ id: p.cajaMovimientoId, motivo: "Pago desde caja", createdAt: p.fecha, usuario: { nombre: "cuenta-del-mostrador" } });
  return armarCajasResumen({
    local, grupoId: 3, pedido, filtro, lectura, turnos, ventas: ventas.map((v) => v.reporte), movimientos: detalle, arqueos, esperadosVivos, inicioDelDia: INICIO,
  });
}
const cajas = (r) => r.turnosOperativos.flatMap((t) => t.cajas);
const caja = (r, id) => cajas(r).find((c) => c.id === id);

// ── El pedido ───────────────────────────────────────────────────────────────

test("hoy, ayer y una fecha son UN día argentino, no del reloj UTC", () => {
  assert.equal(resolverPedido({ periodo: { tipo: "hoy" } }, { ahora: NOCHE }).dia, "2026-10-05");
  assert.equal(resolverPedido({ periodo: { tipo: "ayer" } }, { ahora: NOCHE }).dia, "2026-10-04");
  assert.equal(resolverPedido({ periodo: { tipo: "fecha", fecha: "2026-09-30" } }, { ahora: NOCHE }).dia, "2026-09-30");
});

test("un período que no es un día se rechaza: rango, fecha futura, fecha falsa, claves de más", () => {
  const codigo = (p) => resolverPedido({ periodo: p }, { ahora: NOCHE }).codigo;
  assert.equal(codigo({ tipo: "rango", desde: DIA, hasta: DIA }), "PERIODO_INVALIDO");
  assert.equal(codigo({ tipo: "fecha", fecha: "2026-10-06" }), "PERIODO_INVALIDO", "mañana en Argentina es futuro");
  assert.equal(codigo({ tipo: "fecha", fecha: "2026-02-30" }), "PERIODO_INVALIDO");
  assert.equal(codigo({ tipo: "hoy", fecha: DIA }), "PERIODO_INVALIDO");
  assert.equal(codigo(undefined), "PERIODO_INVALIDO");
  assert.equal(resolverPedido({}, { ahora: NOCHE }).status, 400);
});

test("el turno operativo es un nombre o un id; cualquier otra cosa se rechaza", () => {
  const turnoDe = (t) => resolverPedido({ periodo: { tipo: "hoy" }, turnoOperativo: t }, { ahora: NOCHE });
  assert.deepEqual(turnoDe(" Tarde ").turnoOperativo, { nombre: "Tarde" });
  assert.deepEqual(turnoDe(2).turnoOperativo, { id: 2 });
  assert.equal(turnoDe(undefined).turnoOperativo, null);
  for (const malo of [0, -1, 1.5, "", "   ", "x".repeat(81), { id: 1 }, [1], true]) {
    assert.equal(turnoDe(malo).codigo, "TURNO_OPERATIVO_INVALIDO", JSON.stringify(malo));
  }
});

test("el turno se elige entre los del local, sin mayúsculas ni acentos; uno ajeno dice cuáles hay", () => {
  const delLocal = [MANANA, TARDE];
  assert.deepEqual(elegirTurnoOperativo({ nombre: "manana" }, delLocal), { ok: true, id: 1, nombre: "Mañana" });
  assert.deepEqual(elegirTurnoOperativo({ nombre: "TARDE" }, delLocal), { ok: true, id: 2, nombre: "Tarde" });
  assert.deepEqual(elegirTurnoOperativo({ id: 2 }, delLocal), { ok: true, id: 2, nombre: "Tarde" });
  const ajeno = elegirTurnoOperativo({ id: 99 }, delLocal);
  assert.deepEqual([ajeno.status, ajeno.codigo], [400, "TURNO_OPERATIVO_INVALIDO"]);
  assert.match(ajeno.error, /Mañana, Tarde/);
  assert.match(elegirTurnoOperativo({ nombre: "Noche" }, []).error, /no tiene turnos operativos/);
  assert.equal(elegirTurnoOperativo(null, delLocal), null);
});

// ── La agrupación ───────────────────────────────────────────────────────────

function diaCompleto(extra = {}) {
  return escenario({
    turnos: [
      turno(11, { to: TARDE, esperado: "5000", contado: "5000", operadorNombre: "Diego", apertura: hora("14:00") }),
      turno(10, { to: null, esperado: "3000", contado: "3000", operadorNombre: "Sofía", apertura: hora("07:00") }),
      turno(12, { to: MANANA, esperado: "2000", contado: "2000", operadorNombre: "Ana", apertura: hora("08:00") }),
    ],
    ventas: [venta(10, [{ medio: "EFECTIVO", monto: 2000 }]), venta(11, [{ medio: "EFECTIVO", monto: 4000 }]), venta(12, [{ medio: "EFECTIVO", monto: 1000 }])],
    ...extra,
  });
}

test("por turno operativo en el orden del catálogo, y «Sin turno asignado» al final", () => {
  const r = diaCompleto();
  assert.deepEqual(
    r.turnosOperativos.map((t) => [t.turnoOperativo, t.sinTurnoAsignado, t.cajas.map((c) => c.operador)]),
    [[{ id: 1, nombre: "Mañana" }, false, ["Ana"]], [{ id: 2, nombre: "Tarde" }, false, ["Diego"]], [{ id: null, nombre: "Sin turno asignado" }, true, ["Sofía"]]]
  );
});

test("con turno pedido, solo ese: la caja sin turno no entra; y si no tuvo cajas, aparece vacío", () => {
  const r = diaCompleto({ filtro: { ok: true, id: 2, nombre: "Tarde" } });
  assert.deepEqual(r.turnosOperativos.map((t) => t.turnoOperativo.nombre), ["Tarde"]);
  assert.deepEqual(r.turnoOperativoPedido, { id: 2, nombre: "Tarde" });
  const vacio = escenario({ turnos: [], filtro: { ok: true, id: 1, nombre: "Mañana" } });
  assert.deepEqual(vacio.turnosOperativos, [{
    turnoOperativo: { id: 1, nombre: "Mañana" }, sinTurnoAsignado: false,
    totales: { cantidadVentas: 0, totalVendido: "0.00", ventasEfectivo: "0.00", ventasPorMedio: [], ventasNoCobradas: [] }, cajas: [],
  }]);
  assert.deepEqual(escenario({ turnos: [] }).turnosOperativos, [], "sin filtro y sin cajas: nada");
});

// ── Las diferencias, por caja ───────────────────────────────────────────────

test("las diferencias son de cada caja y NUNCA se compensan: el turno no lleva una", () => {
  const r = escenario({
    turnos: [
      turno(20, { esperado: "9500", contado: "8500", diferenciaEfectivo: "-1000" }),
      turno(21, { esperado: "6000", contado: "7000", diferenciaEfectivo: "1000" }),
      turno(22, { esperado: "16000", contado: "16000", diferenciaEfectivo: "0" }),
    ],
    ventas: [venta(20, [{ medio: "EFECTIVO", monto: 10000 }]), venta(21, [{ medio: "EFECTIVO", monto: 5000 }]), venta(22, [{ medio: "EFECTIVO", monto: 15000 }])],
  });
  assert.deepEqual([20, 21, 22].map((id) => [caja(r, id).estado, caja(r, id).diferencia]), [
    [ESTADO_CAJA.CON_DIFERENCIA, { monto: "1000.00", tipo: "FALTA" }],
    [ESTADO_CAJA.CON_DIFERENCIA, { monto: "1000.00", tipo: "SOBRA" }],
    [ESTADO_CAJA.CORRECTA, { monto: "0.00", tipo: "NINGUNA" }],
  ]);
  const [t] = r.turnosOperativos;
  assert.deepEqual(Object.keys(t.totales), ["cantidadVentas", "totalVendido", "ventasEfectivo", "ventasPorMedio", "ventasNoCobradas"]);
  assert.ok(!JSON.stringify(t.totales).includes("diferencia"));
  assert.deepEqual(r.advertencias, [], "la guardada coincide: ninguna advertencia");
});

test("abierta, en corte, cerrada sin conteo y anulada: ninguna es «correcta»", () => {
  const r = escenario({
    turnos: [
      turno(30, { abierta: true }),
      turno(31, { abierta: true, cierreEnPreparacionEn: hora("13:00") }),
      turno(32, { esperado: "4000", contado: null }),
      turno(33, { esperado: "4000", contado: "4000", anuladoEn: hora("15:00") }),
    ],
    ventas: [30, 31, 32, 33].map((id) => venta(id, [{ medio: "EFECTIVO", monto: 1000 }])),
    esperadosVivos: new Map([[30, { efectivoEsperado: 2000 }], [31, { efectivoEsperado: 2000 }]]),
  });
  assert.deepEqual([30, 31, 32, 33].map((id) => [caja(r, id).estado, caja(r, id).diferencia]), [
    [ESTADO_CAJA.ABIERTA, null], [ESTADO_CAJA.ABIERTA, null], [ESTADO_CAJA.SIN_CONTEO, null], [ESTADO_CAJA.ANULADA, null],
  ]);
  assert.equal(caja(r, 30).efectivoEsperado, "2000.00", "la abierta, con el esperado de ahora");
  assert.equal(caja(r, 32).efectivoContado, null, "sin conteo: null, no 0");
});

test("la caja abierta no inventa esperado: sin el de calcularEsperadoDeTurno, null", () => {
  const r = escenario({ turnos: [turno(34, { abierta: true })], ventas: [venta(34, [{ medio: "EFECTIVO", monto: 1000 }])] });
  assert.equal(caja(r, 34).efectivoEsperado, null);
});

test("DIFERENCIA_NO_CUADRA: si la guardada no es contado − esperado, se dice y no se elige", () => {
  const r = escenario({ turnos: [turno(40, { esperado: "5000", contado: "4000", diferenciaEfectivo: "-500" })], ventas: [venta(40, [{ medio: "EFECTIVO", monto: 4000 }])] });
  assert.deepEqual(caja(r, 40).diferencia, { monto: "1000.00", tipo: "FALTA" });
  assert.deepEqual(r.advertencias.map((a) => [a.codigo, a.cajaId]), [["DIFERENCIA_NO_CUADRA", 40]]);
});

// ── Lo vendido ──────────────────────────────────────────────────────────────

test("lo digital no es efectivo y el fiado va aparte, no cobrado; el turno suma sus cajas", () => {
  const r = escenario({
    turnos: [turno(50, { esperado: "51000", contado: "51000" }), turno(51, { esperado: "3000", contado: "3000" })],
    ventas: [
      venta(50, [{ medio: "EFECTIVO", monto: 50000 }]),
      venta(50, [{ medio: "EFECTIVO", monto: 500 }, { medio: "DEBITO", monto: 1500 }]),
      venta(50, [{ medio: "MERCADOPAGO", monto: 7000 }]),
      venta(50, [{ medio: "FIADO", monto: 3000 }]),
      venta(51, [{ medio: "EFECTIVO", monto: 2000 }]),
    ],
  });
  const c = caja(r, 50);
  assert.equal(c.ventasEfectivo, "50500.00");
  assert.deepEqual(c.ventasPorMedio.map((m) => [m.medio, m.etiqueta, m.total, m.cobrado]), [
    ["EFECTIVO", "Efectivo", "50500.00", true], ["DEBITO", "Débito", "1500.00", true], ["MERCADOPAGO", "Mercado Pago", "7000.00", true],
  ]);
  assert.deepEqual(c.ventasNoCobradas.map((m) => [m.medio, m.total, m.cobrado]), [["FIADO", "3000.00", false]]);
  assert.deepEqual([c.cantidadVentas, c.totalVendido], [4, "62000.00"]);
  const t = r.turnosOperativos[0].totales;
  assert.deepEqual([t.cantidadVentas, t.totalVendido, t.ventasEfectivo], [5, "64000.00", "52500.00"]);
});

test("DESGLOSE_NO_CUADRA: la suma por medio contra el total, se dice y no se corrige", () => {
  const v = venta(60, [{ medio: "EFECTIVO", monto: 1000 }]);
  v.reporte.total = "1200";
  const r = escenario({ turnos: [turno(60, { esperado: "2000", contado: "2000" })], ventas: [v] });
  assert.equal(caja(r, 60).totalVendido, "1200.00");
  assert.deepEqual(r.advertencias.map((a) => [a.codigo, a.cajaId]), [["DESGLOSE_NO_CUADRA", 60]]);
});

test("las anuladas e internas quedan afuera en la consulta: el where es el de Tesorería, con el filtro comercial", () => {
  const w = whereVentasDeTesoreria({ localId: 7, fechaInicio: INICIO, fechaFin: new Date("2026-10-06T02:59:59.999Z") });
  assert.equal(w.anuladaEn, null);
  assert.deepEqual(w.transferencia, { is: null });
  assert.deepEqual(w, whereVentaComercial({ localId: 7, OR: w.OR }));
});

// ── Los retiros y su "a quién" ──────────────────────────────────────────────

test("retiros con motivo, a quién y quién lo registró; null donde el ERP no lo guarda", () => {
  const r = escenario({
    turnos: [
      turno(70, { esperado: "15000", contado: "15000", retiroCierreMovimientoId: 702, destinoRetiroCierre: "Caja fuerte", recibidoPorCierre: "Encargada Laura", efectivoRetiradoCierre: "14000", fondoDejadoCierre: "1000" }),
      turno(71, { esperado: "8500", contado: "8500" }),
    ],
    ventas: [venta(70, [{ medio: "EFECTIVO", monto: 44000 }]), venta(71, [{ medio: "EFECTIVO", monto: 10000 }])],
    movimientos: [
      mov(701, 70, CLASE_MOVIMIENTO.RECAUDACION, 30000, { motivo: "Retiro de recaudación (corte #3)", h: "11:00" }),
      mov(702, 70, CLASE_MOVIMIENTO.CIERRE, 14000, { motivo: "Retiro de cierre del turno #70 — Caja fuerte", h: "14:00" }),
      mov(710, 71, CLASE_MOVIMIENTO.MANUAL, 2000, { motivo: "Compra de bolsas" }),
      mov(711, 71, CLASE_MOVIMIENTO.MANUAL, 500, { tipo: "INGRESO", motivo: "Cambio" }),
    ],
    pagosProveedor: [{ id: 1, fecha: hora("12:00"), monto: 5000, medio: "EFECTIVO", turnoId: 70, cajaMovimientoId: 703, nota: null, cuenta: { pedidoProveedorId: 9, proveedor: { nombre: "Panadería" } } }],
    pagosGasto: [
      { id: 2, fecha: hora("12:30"), monto: 1500, medio: "EFECTIVO", turnoId: 71, cajaMovimientoId: 712, nota: null, gasto: { id: 4, concepto: "Canilla", beneficiario: "Plomero Juan", categoria: { nombre: "Servicios" } } },
      { id: 3, fecha: hora("12:40"), monto: 300, medio: "EFECTIVO", turnoId: 71, cajaMovimientoId: 713, nota: null, gasto: { id: 5, concepto: "Fletes", beneficiario: null, categoria: { nombre: "Servicios" } } },
    ],
  });
  assert.deepEqual(caja(r, 70).retiros.map((x) => [x.tipo, x.monto, x.aQuien, x.recibidoPor]), [
    [TIPO_RETIRO.RECAUDACION, "30000.00", null, null],
    [TIPO_RETIRO.PAGO_PROVEEDOR, "5000.00", "Panadería", null],
    [TIPO_RETIRO.CIERRE, "14000.00", "Caja fuerte", "Encargada Laura"],
  ]);
  assert.ok(caja(r, 70).retiros.every((x) => x.motivo && x.hora && x.registradoPor === "cuenta-del-mostrador"));
  assert.deepEqual(caja(r, 71).retiros.map((x) => [x.tipo, x.monto, x.motivo, x.aQuien]), [
    [TIPO_RETIRO.MANUAL, "2000.00", "Compra de bolsas", null],
    [TIPO_RETIRO.PAGO_GASTO, "1500.00", "Pago desde caja", "Plomero Juan"],
    [TIPO_RETIRO.PAGO_GASTO, "300.00", "Pago desde caja", "Fletes"],
  ]);
  assert.deepEqual(caja(r, 71).ingresos.map((x) => [x.monto, x.motivo]), [["500.00", "Cambio"]]);
  assert.deepEqual([caja(r, 70).efectivoRetiradoCierre, caja(r, 70).fondoDejadoCierre], ["14000.00", "1000.00"]);
});

test("el destino de un retiro de recaudación sale de su ArqueoCaja cuando se registró", () => {
  const r = escenario({
    turnos: [turno(80, { esperado: "1000", contado: "1000" })],
    ventas: [venta(80, [{ medio: "EFECTIVO", monto: 30000 }])],
    movimientos: [mov(801, 80, CLASE_MOVIMIENTO.RECAUDACION, 30000)],
    arqueos: [{ cajaMovimientoRetiroId: 801, destino: "Banco", recibidoPor: "Tesorera" }],
  });
  assert.deepEqual(caja(r, 80).retiros.map((x) => [x.aQuien, x.recibidoPor]), [["Banco", "Tesorera"]]);
});

// ── Tesorería, aparte ───────────────────────────────────────────────────────

test("verificación de Tesorería: verificada, falta verificar o no aplica — y no toca la diferencia", () => {
  const verificacion = {
    id: 1, localId: 7, importeDeclarado: 30000, importeVerificado: 29000, diferencia: -1000,
    entregas: [{ cajaMovimientoId: 901, montoDeclarado: 30000, clase: CLASE_MOVIMIENTO.CIERRE, turnoId: 90, localId: 7, operadorId: 190, instante: hora("14:00") }],
  };
  const r = escenario({
    turnos: [turno(90, { esperado: "30000", contado: "30000", diferenciaEfectivo: "0" }), turno(91, { esperado: "8000", contado: "8000" }), turno(92, { esperado: "1000", contado: "1000" })],
    ventas: [venta(90, [{ medio: "EFECTIVO", monto: 29000 }]), venta(91, [{ medio: "EFECTIVO", monto: 7000 }]), venta(92, [{ medio: "DEBITO", monto: 1000 }])],
    movimientos: [mov(901, 90, CLASE_MOVIMIENTO.CIERRE, 30000, { h: "14:00" }), mov(911, 91, CLASE_MOVIMIENTO.CIERRE, 7000)],
    verificaciones: [verificacion],
  });
  assert.deepEqual([90, 91, 92].map((id) => caja(r, id).verificacionTesoreria), [
    VERIFICACION_TESORERIA.VERIFICADA, VERIFICACION_TESORERIA.FALTA_VERIFICAR, VERIFICACION_TESORERIA.NO_APLICA,
  ]);
  assert.deepEqual([caja(r, 90).estado, caja(r, 90).diferencia], [ESTADO_CAJA.CORRECTA, { monto: "0.00", tipo: "NINGUNA" }], "la diferencia de Tesorería no se mezcla con la de caja");
});

// ── El contrato ─────────────────────────────────────────────────────────────

test("el contrato: estas claves y ninguna de costo, ganancia, comisión, producto ni cliente", () => {
  const r = diaCompleto();
  assert.deepEqual(Object.keys(r), ["capacidad", "version", "local", "grupoId", "periodo", "turnoOperativoPedido", "turnosOperativos", "advertencias"]);
  assert.deepEqual([r.capacidad, r.version, r.periodo], ["cajas_resumen", 1, { tipo: "fecha", fecha: DIA, zonaHoraria: "America/Argentina/Cordoba" }]);
  assert.deepEqual(Object.keys(caja(r, 12)), [
    "id", "etiqueta", "operador", "apertura", "cierre", "estado", "montoInicial", "cantidadVentas", "totalVendido", "ventasEfectivo",
    "ventasPorMedio", "ventasNoCobradas", "retiros", "ingresos", "efectivoEsperado", "efectivoContado", "diferencia",
    "efectivoRetiradoCierre", "fondoDejadoCierre", "verificacionTesoreria",
  ]);
  assert.doesNotMatch(JSON.stringify(r), /costo|ganancia|comision|neto|producto|cliente/i);
});

test("advertencias del día: DIA_EN_CURSO si es hoy, LOCAL_INACTIVO si el ERP lo marca", () => {
  const r = escenario({ turnos: [], pedido: { tipo: "hoy", dia: "2026-10-06", hoy: "2026-10-06" }, local: { ...LOCAL, activo: false } });
  assert.deepEqual(r.advertencias.map((a) => a.codigo), ["DIA_EN_CURSO", "LOCAL_INACTIVO"]);
});

// ── El local sale de la autorización ────────────────────────────────────────

test("el local sale de la autorización; un pedido malo o un turno ajeno no lee cajas", async () => {
  const pedidas = [];
  const db = new Proxy({}, {
    get: (_, modelo) => new Proxy({}, {
      get: (__, metodo) => async (args) => {
        pedidas.push(`${String(modelo)}.${String(metodo)}`);
        if (modelo === "local") return { id: args.where.id, nombre: "L", activo: true };
        if (modelo === "turnoOperativo") return [MANANA, TARDE];
        return [];
      },
    }),
  });
  const malo = await cajasResumen({ localId: 7, grupoId: 3 }, { periodo: { tipo: "semana" } }, { db, ahora: NOCHE });
  assert.deepEqual([malo.status, pedidas], [400, []]);
  const ajeno = await cajasResumen({ localId: 7, grupoId: 3 }, { periodo: { tipo: "hoy" }, turnoOperativo: "Noche" }, { db, ahora: NOCHE });
  assert.deepEqual([ajeno.codigo, pedidas], ["TURNO_OPERATIVO_INVALIDO", ["local.findUnique", "turnoOperativo.findMany"]]);
});

// ── Las mismas piezas que las pantallas ─────────────────────────────────────

/**
 * Lo que tiene que usar la capacidad, y lo que NO puede escribir al lado. Una
 * función para poder ejercer la contraprueba con un fuente modificado.
 */
function problemasDePiezas(puro, servidor) {
  const p = [];
  const usa = (src, pieza, archivo) => {
    if (!new RegExp(`\\b${pieza}\\(`).test(src)) p.push(`${archivo} no usa ${pieza}`);
  };
  for (const pieza of ["resultadoCierre", "estadoDelTurno", "grupoDeTesoreria", "resumirVentas", "mediosDePagoDe"]) usa(puro, pieza, "cajasResumen.js");
  if (!/\.sort\(compararGrupos\)/.test(puro)) p.push("cajasResumen.js no ordena con compararGrupos");
  for (const pieza of ["rangoDeTesoreria", "leerTesoreria", "whereVentasDeTesoreria", "calcularEsperadoDeTurno"]) usa(servidor, pieza, "cajasResumenServer.js");
  if (!/\.\.\.SELECT_RESUMEN_VENTA/.test(servidor)) p.push("cajasResumenServer.js no lee con el select del reporte");
  // Ninguna cuenta de caja ni filtro escrito al lado.
  const copias = [/whereVentaComercial\(/, /tendersParaAgregar\(/, /getRangoArgentina\(/, /calcularEfectivoEsperado\(/, /desglosarVentas\(/, /anuladaEn:/, /montoInicial\)?\s*\+/, /clasificarDiferencia\(/];
  for (const [archivo, src] of [["cajasResumen.js", puro], ["cajasResumenServer.js", servidor]]) {
    for (const copia of copias) if (copia.test(src)) p.push(`${archivo} reescribe ${copia}`);
  }
  return p;
}

const PURO = leer("lib/integraciones/azul-chat/cajasResumen.js");
const SERVIDOR = leer("lib/integraciones/azul-chat/cajasResumenServer.js");

test("cada número sale de la pieza que usan las pantallas, y ninguna fórmula está escrita al lado", () => {
  assert.deepEqual(problemasDePiezas(PURO, SERVIDOR), []);
  // Y esas piezas son las de las pantallas: la ficha del turno en Finanzas usa
  // resultadoCierre con el mismo esperado; la ruta de Tesorería, la lectura.
  const ficha = leer("app/api/finanzas/turno/[turnoId]/route.js");
  assert.match(ficha, /resultadoCierre\(\{\s*esperado: turno\.montoEsperadoEfectivo \?\? calculo\.efectivoEsperado,\s*contado: turno\.montoRealEfectivo,/);
  assert.match(PURO, /turno\.montoEsperadoEfectivo \?\? esperadoVivo\?\.efectivoEsperado \?\? null/);
  const tesoreria = leer("app/api/finanzas/tesoreria/route.js");
  for (const pieza of ["leerTesoreria(", "rangoDeTesoreria("]) assert.ok(tesoreria.includes(pieza), `la pantalla de Tesorería dejó de usar ${pieza}`);
});

test("CONTRAPRUEBA: sacar una pieza, o escribir una cuenta al lado, pone rojo el candado; un comentario no", () => {
  assert.ok(problemasDePiezas(PURO.replace(/resultadoCierre\(/g, "otraCosa("), SERVIDOR).some((x) => /resultadoCierre/.test(x)));
  assert.ok(problemasDePiezas(PURO, SERVIDOR.replace(/calcularEsperadoDeTurno\(/g, "esperadoPropio(")).some((x) => /calcularEsperadoDeTurno/.test(x)));
  assert.ok(problemasDePiezas(PURO + "\nconst e = turno.montoInicial + ventas;\n", SERVIDOR).some((x) => /reescribe/.test(x)));
  assert.ok(problemasDePiezas(PURO, SERVIDOR + "\nconst w = whereVentaComercial({});\n").some((x) => /whereVentaComercial/.test(x)));
  assert.deepEqual(problemasDePiezas(PURO + sinComentarios("\n// whereVentaComercial(\n"), SERVIDOR), []);
});
