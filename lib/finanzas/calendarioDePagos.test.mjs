// CANDADO: DÓNDE CAE CADA CUENTA POR PAGAR EN EL CALENDARIO DE LA LISTA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/finanzas/calendarioDePagos.test.mjs
//
// Se para en el miércoles 2026-09-16. La semana financiera va de domingo a
// sábado, así que la en curso es del 13 al 19.
//
// ── LAS CUENTAS NO SE ESCRIBEN A MANO ─────────────────────────────────────
//
// Total, pagado, saldo y estado salen de `estadoDeCuenta`, y `saldadaEl` de
// `diaEnQueSeSaldo`, las mismas dos funciones que usa `serializarCuenta`. Los
// nombres de los campos los comprueba contra el fuente de la ruta el candado de
// `pagosProveedores.test.mjs`.

import test from "node:test";
import assert from "node:assert/strict";

import {
  ESTADO_CUENTA,
  FILTRO_CUENTAS,
  ROTULO_ESTADO_CUENTA,
  diaEnQueSeSaldo,
  estadoDeCuenta,
} from "@/lib/finanzas/pagosProveedores";
import {
  DESPLAZAMIENTO_MAXIMO_PENDIENTES,
  calendarioDeCuentas,
  cuentaVencida,
  descripcionDePagos,
  desplazamientoDePagos,
  diaDeLaCuenta,
  puedeAvanzarPagos,
  puedeRetrocederPagos,
  tituloDelDiaDePago,
  totalDelPeriodo,
} from "@/lib/finanzas/calendarioDePagos";
import { descripcionFinanciera, DESPLAZAMIENTO_MINIMO } from "@/lib/finanzas/periodoFinanciero";
import {
  parseContextoPagos,
  serializarContextoPagos,
  urlDeCuentaPorPagar,
  urlDePagosProveedores,
} from "@/lib/finanzas/contextoFinanzas";

const HOY = "2026-09-16";
const { PENDIENTES, PAGADAS, TODAS } = FILTRO_CUENTAS;

function cuenta({ id, total, pagos = [], vence = null, creada = "2026-09-14T10:00:00-03:00" }) {
  const e = estadoDeCuenta({ total, pagos });
  return {
    id,
    pedidoProveedorId: 200 + id,
    proveedor: { id: 1, nombre: "Als" },
    localGasto: { id: 2, nombre: "Local Centro" },
    ...e,
    rotuloEstado: ROTULO_ESTADO_CUENTA[e.estado],
    vencimientoProveedor: vence,
    createdAt: new Date(creada).toISOString(),
    saldadaEl: diaEnQueSeSaldo({ total, pagos }),
  };
}

const pago = (id, monto, iso) => ({ id, monto, fecha: new Date(iso) });
const rangoDe = (filtro, desplazamiento = 0, unidad = "SEMANA") =>
  descripcionDePagos({ unidad, desplazamiento, filtro, hoy: HOY }).rango;

// ── PENDIENTES ────────────────────────────────────────────────────────────

const PEND = [
  cuenta({ id: 1, total: 1000, vence: "2026-09-10" }), //                    venció la semana pasada
  cuenta({ id: 2, total: 2000, pagos: [pago(1, 500, "2026-09-14T12:00:00-03:00")], vence: "2026-09-18" }),
  cuenta({ id: 3, total: 3000, vence: "2026-09-16" }), //                    vence hoy: no está vencida
  cuenta({ id: 4, total: 4000, vence: "2026-09-25" }), //                    la semana que viene
  cuenta({ id: 5, total: 5000 }), //                                         sin vencimiento
  cuenta({ id: 6, total: 600, vence: "2026-09-15" }), //                     ayer: vencida, aunque es de esta semana
];

test("Pendientes: las vencidas van arriba y no se repiten en los días", () => {
  const cal = calendarioDeCuentas({ cuentas: PEND, filtro: PENDIENTES, rango: rangoDe(PENDIENTES), hoy: HOY });
  assert.deepEqual(cal.vencidas.cuentas.map((c) => c.id), [1, 6], "la más atrasada primero");
  assert.equal(cal.vencidas.titulo, "Vencidas");
  const enDias = cal.dias.flatMap((d) => d.cuentas.map((c) => c.id));
  assert.ok(!enDias.includes(1) && !enDias.includes(6), "una vencida quedó también en un día");
});

test("Pendientes: los días son del período, del más cercano al más lejano, y suman SALDOS", () => {
  const cal = calendarioDeCuentas({ cuentas: PEND, filtro: PENDIENTES, rango: rangoDe(PENDIENTES), hoy: HOY });
  assert.deepEqual(cal.dias.map((d) => d.clave), ["2026-09-16", "2026-09-18"]);
  assert.deepEqual(cal.dias.map((d) => d.titulo), ["Miércoles 16", "Viernes 18"]);
  // La del 18 debe 1.500 de 2.000: lo que suma es lo que falta pagar.
  assert.equal(cal.dias[1].importe, 1500);
  assert.equal(totalDelPeriodo(cal).importe, 4500);
  assert.ok(!cal.dias.some((d) => d.cuentas.some((c) => c.id === 4)), "la del 25 no es de esta semana");
});

test("Pendientes: sin vencimiento va en su bloque, abajo, en cualquier período", () => {
  for (const desp of [0, -3, 2]) {
    const cal = calendarioDeCuentas({ cuentas: PEND, filtro: PENDIENTES, rango: rangoDe(PENDIENTES, desp), hoy: HOY });
    assert.deepEqual(cal.sinFecha.cuentas.map((c) => c.id), [5], `desplazamiento ${desp}`);
    assert.equal(cal.sinFecha.titulo, "Sin fecha de vencimiento");
    assert.deepEqual(cal.vencidas.cuentas.map((c) => c.id), [1, 6], `las vencidas se esconden en ${desp}`);
  }
});

test("Pendientes: avanzar una semana muestra lo que vence la que viene", () => {
  const cal = calendarioDeCuentas({ cuentas: PEND, filtro: PENDIENTES, rango: rangoDe(PENDIENTES, 1), hoy: HOY });
  assert.deepEqual(cal.dias.map((d) => d.clave), ["2026-09-25"]);
  assert.equal(cal.dias[0].titulo, "Viernes 25");
});

test("una vencida es solo una PENDIENTE con vencimiento anterior a hoy", () => {
  assert.equal(cuentaVencida(PEND[0], HOY), true);
  assert.equal(cuentaVencida(PEND[2], HOY), false, "la que vence hoy todavía no venció");
  assert.equal(cuentaVencida(PEND[4], HOY), false, "sin vencimiento no está vencida");
  const pagada = cuenta({ id: 9, total: 100, pagos: [pago(1, 100, "2026-09-01T10:00:00-03:00")], vence: "2026-09-02" });
  assert.equal(pagada.estado, ESTADO_CUENTA.PAGADA);
  assert.equal(cuentaVencida(pagada, HOY), false);
});

// ── PAGADOS ───────────────────────────────────────────────────────────────

const PAG = [
  cuenta({ id: 11, total: 1000, pagos: [pago(1, 400, "2026-09-02T10:00:00-03:00"), pago(2, 600, "2026-09-14T10:00:00-03:00")] }),
  cuenta({ id: 12, total: 2000, pagos: [pago(3, 2000, "2026-09-15T23:30:00-03:00")] }),
  cuenta({ id: 13, total: 3000, pagos: [pago(4, 3000, "2026-09-01T10:00:00-03:00")] }),
];

test("Pagados: cada cuenta en el día en que quedó saldada, del más reciente al más viejo", () => {
  const cal = calendarioDeCuentas({ cuentas: PAG, filtro: PAGADAS, rango: rangoDe(PAGADAS), hoy: HOY });
  // La 11 empezó a pagarse el 2 y se saldó el 14: cuenta el 14.
  // La 12 se saldó a las 23:30 del 15, que en UTC ya es el 16: cuenta el 15.
  assert.deepEqual(cal.dias.map((d) => d.clave), ["2026-09-15", "2026-09-14"]);
  assert.deepEqual(cal.dias.map((d) => d.cuentas.map((c) => c.id)), [[12], [11]]);
  assert.equal(cal.dias[1].importe, 1000, "en Pagados la cifra es el total");
  assert.equal(cal.vencidas, null);
  assert.equal(cal.sinFecha, null);
});

// ── TODOS ─────────────────────────────────────────────────────────────────

test("Todos: cada cuenta en el día en que nació, en hora argentina", () => {
  const todas = [
    cuenta({ id: 21, total: 1000, creada: "2026-09-13T23:30:00-03:00" }),
    cuenta({ id: 22, total: 2000, pagos: [pago(1, 2000, "2026-09-15T10:00:00-03:00")], creada: "2026-09-12T10:00:00-03:00" }),
  ];
  assert.equal(diaDeLaCuenta(todas[0], TODAS), "2026-09-13", "las 23:30 del 13 son del 13, no del 14");
  const cal = calendarioDeCuentas({ cuentas: todas, filtro: TODAS, rango: rangoDe(TODAS), hoy: HOY });
  assert.deepEqual(cal.dias.map((d) => d.clave), ["2026-09-13"], "la del 12 es de la semana anterior");
  assert.equal(cal.vencidas, null, "Vencidas es solo de Pendientes");
});

// ── EL PERÍODO ────────────────────────────────────────────────────────────

test("solo Pendientes puede mirar adelante, y con el mismo tope que hacia atrás", () => {
  assert.equal(desplazamientoDePagos(3, PENDIENTES), 3);
  assert.equal(desplazamientoDePagos(3, PAGADAS), 0);
  assert.equal(desplazamientoDePagos(3, TODAS), 0);
  assert.equal(desplazamientoDePagos(9999, PENDIENTES), DESPLAZAMIENTO_MAXIMO_PENDIENTES);
  assert.equal(desplazamientoDePagos(-9999, PAGADAS), DESPLAZAMIENTO_MINIMO);
  assert.equal(desplazamientoDePagos("basura", PENDIENTES), 0);
  assert.equal(puedeAvanzarPagos(0, PENDIENTES), true);
  assert.equal(puedeAvanzarPagos(0, PAGADAS), false);
  assert.equal(puedeAvanzarPagos(-1, TODAS), true);
  assert.equal(puedeRetrocederPagos(DESPLAZAMIENTO_MINIMO, PAGADAS), false);
});

test("hasta el en curso, el período es exactamente el de Finanzas", () => {
  for (const unidad of ["DIA", "SEMANA", "MES"]) {
    for (const desp of [0, -1, -5]) {
      assert.deepEqual(
        descripcionDePagos({ unidad, desplazamiento: desp, filtro: PAGADAS, hoy: HOY }),
        descripcionFinanciera({ unidad, desplazamiento: desp, hoy: HOY })
      );
    }
  }
});

test("una semana que todavía no empezó no se llama «Semana cerrada»", () => {
  const prox = descripcionDePagos({ unidad: "SEMANA", desplazamiento: 1, filtro: PENDIENTES, hoy: HOY });
  assert.equal(prox.titulo, "Semana próxima");
  assert.deepEqual(prox.rango, { desde: "2026-09-20", hasta: "2026-09-26" });
  const lejos = descripcionDePagos({ unidad: "SEMANA", desplazamiento: 3, filtro: PENDIENTES, hoy: HOY });
  assert.equal(lejos.titulo, "Semana por venir");
  const mes = descripcionDePagos({ unidad: "MES", desplazamiento: 1, filtro: PENDIENTES, hoy: HOY });
  assert.ok(!/cerrad|en curso/i.test(mes.titulo), `el mes que viene se llamó «${mes.titulo}»`);
});

test("el título del día sale del día escrito, sin correrse por la zona horaria", () => {
  // "2026-09-19" pasado tal cual a un formateador de instantes es la medianoche
  // UTC, las 21:00 del viernes acá.
  assert.equal(tituloDelDiaDePago("2026-09-19"), "Sábado 19");
});

// ── LA URL ────────────────────────────────────────────────────────────────

test("la pestaña y el período viajan en la URL, y lo que es default no se escribe", () => {
  assert.equal(serializarContextoPagos({ estado: PENDIENTES, unidad: "SEMANA", desp: 0 }), "");
  const qs = serializarContextoPagos({ estado: PAGADAS, unidad: "MES", desp: -2 });
  assert.equal(qs, "estado=PAGADAS&unidad=MES&desp=-2");
  assert.deepEqual(parseContextoPagos(new URLSearchParams(qs)), { estado: PAGADAS, unidad: "MES", desp: -2 });
  assert.equal(urlDeCuentaPorPagar(7, { estado: PENDIENTES, unidad: "SEMANA", desp: 2 }), "/modulos/finanzas/pagos-proveedores/7?desp=2");
  assert.equal(urlDePagosProveedores({ estado: TODAS }), "/modulos/finanzas/pagos-proveedores?estado=TODAS");
  assert.equal(urlDeCuentaPorPagar(7), "/modulos/finanzas/pagos-proveedores/7");
});

test("un período futuro escrito a mano en Pagados cae al en curso", () => {
  assert.deepEqual(parseContextoPagos(new URLSearchParams("estado=PAGADAS&desp=4")).desp, 0);
  assert.deepEqual(parseContextoPagos(new URLSearchParams("desp=4")).desp, 4);
});

test("el filtro suelto como texto se sigue entendiendo", () => {
  assert.equal(urlDePagosProveedores(PAGADAS), "/modulos/finanzas/pagos-proveedores?estado=PAGADAS");
  assert.equal(urlDeCuentaPorPagar(3, TODAS), "/modulos/finanzas/pagos-proveedores/3?estado=TODAS");
});
