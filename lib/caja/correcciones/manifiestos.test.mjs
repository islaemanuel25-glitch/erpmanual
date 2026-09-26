// I4 E I6: lo que cada manifiesto PROPUESTO calcula, antes del primer ensayo real.
//
// Los alcances de abajo tienen la FORMA y los VALORES que se leyeron en
// producción el 2026-09-26 para cada fila. Donde un campo no se leyó —la
// composición de un desglose cuyo total sí se leyó, o la copia que la
// confirmación escribe en el arqueo—, está marcado como SUPUESTO y armado para
// que sume el total leído. El ensayo en seco en producción lee los valores de
// verdad; esto afirma que, con esos números, el plan corrige lo que tiene que
// corregir y NADA más.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/correcciones/manifiestos.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { MANIFIESTOS, buscarManifiesto, DESGLOSE_DEJADO_SOBRE_190, DESGLOSE_RECIBIDO_SOBRE_312 } from "./manifiestos.js";
import { armarPlan, invariantes, validarManifiesto, ESTADO_MANIFIESTO, EXCLUSIONES, TIPO_CORRECCION } from "./plan.js";
import { ejecutarCorreccion, RESULTADO } from "./motor.js";
import { totalDesglose } from "../conteoBilletes.js";
import { unirDesgloses, calcularCierreDesdeRetiro, calcularRetiroEsperado } from "../cierreRelevo.js";

const CERRADO = "2026-09-20T12:00:00.000Z";
const cambio = (plan, entidad, id, campo) => plan.cambios.find((c) => c.entidad === entidad && c.id === id && c.campo === campo);
const noCambia = (plan, entidad, id, campo) => cambio(plan, entidad, id, campo) === undefined;

// ── I4 ─────────────────────────────────────────────────────────────────────

function alcanceI4() {
  // SUPUESTO: la composición del cambio y del retiro del corte 198 no se leyó;
  // se leyeron sus totales ($23.000 cada uno).
  const cambio198 = { 1000: 23 };
  const retiro198 = { 1000: 23 };
  return {
    Turno: {
      388: {
        id: 388, localId: 1, cierre: CERRADO, cierreEnPreparacionEn: CERRADO, anuladoEn: null,
        montoInicial: 23000000, montoEsperadoEfectivo: 23423772, montoRealEfectivo: 46000, diferenciaEfectivo: -23377772,
        efectivoRetiradoCierre: 23000, fondoDejadoCierre: 23000, retiroCierreMovimientoId: 503,
      },
    },
    CierrePreparacion: {
      198: {
        id: 198, turnoId: 388, estado: "CONFIRMADO", efectivoEsperadoCorte: 23423772,
        desgloseCambio: cambio198, totalCambio: 23000, efectivoRetiradoEsperado: 23400772,
        desgloseRetiroContado: retiro198, totalRetiroContado: 23000,
        desgloseContado: unirDesgloses(retiro198, cambio198), totalContado: 46000,
        retiroFinal: 23000, diferencia: -23377772, arqueoFinalId: 236,
      },
    },
    RetiroPreparacion: {},
    CambioPendiente: {
      190: {
        id: 190, estado: "RECIBIDO", cierrePreparacionId: 190, turnoOrigenId: 383, turnoDestinoId: 388,
        total: 23000, desglose: { ...DESGLOSE_DEJADO_SOBRE_190 },
        totalRecibido: 23000000, desgloseRecibido: { 1000: 23000 }, diferencia: 22977000,
      },
      // SUPUESTO: el sobre 198 se recibió por lo que decía.
      198: {
        id: 198, estado: "RECIBIDO", cierrePreparacionId: 198, turnoOrigenId: 388, turnoDestinoId: 399,
        total: 23000, desglose: cambio198, totalRecibido: 23000, desgloseRecibido: cambio198, diferencia: 0,
      },
    },
    ArqueoCaja: {
      // SUPUESTO: las copias que la confirmación escribe en el arqueo final.
      236: { id: 236, turnoId: 388, tipo: "FINAL", efectivoEsperado: 23423772, efectivoContado: 46000, diferencia: -23377772, efectivoRetirado: 23000, fondoDejado: 23000 },
    },
    CajaMovimiento: { 503: { id: 503, turnoId: 388, tipo: "RETIRO", monto: 23000 } },
  };
}

test("I4 es PROPUESTO, válido, y corrige solo la recepción del sobre 190", () => {
  const m = buscarManifiesto("I4");
  assert.equal(m.estado, ESTADO_MANIFIESTO.PROPUESTO);
  assert.equal(m.autorizacion, undefined);
  assert.deepEqual(validarManifiesto(m).errores, []);
  assert.deepEqual(m.correcciones.map((c) => [c.tipo, c.cambioPendienteId]), [[TIPO_CORRECCION.RECEPCION_SOBRE, 190]]);
  assert.deepEqual(m.correcciones[0].antes, { desgloseRecibido: { 1000: 23000 } });
});

test("I4 usa EXACTAMENTE el desglose con que se dejó el sobre 190, que suma $23.000", () => {
  const m = buscarManifiesto("I4");
  assert.deepEqual(DESGLOSE_DEJADO_SOBRE_190, { 100: 11, 200: 2, 500: 15, 1000: 14 });
  assert.equal(totalDesglose(DESGLOSE_DEJADO_SOBRE_190), 23000);
  assert.deepEqual(m.correcciones[0].despues.desgloseRecibido, DESGLOSE_DEJADO_SOBRE_190);
  assert.match(m.evidencia, /mismo sobre 190/);
  assert.match(m.evidencia, /No se afirma conocer físicamente cada billete/);
});

test("I4: el fondo vuelve a $23.000 y el faltante real de $400.772 queda a la vista", () => {
  const plan = armarPlan(alcanceI4(), buscarManifiesto("I4"));
  assert.deepEqual(plan.errores, []);
  assert.equal(cambio(plan, "CambioPendiente", 190, "totalRecibido").despues, 23000);
  assert.deepEqual(cambio(plan, "CambioPendiente", 190, "desgloseRecibido").despues, DESGLOSE_DEJADO_SOBRE_190);
  assert.equal(cambio(plan, "CambioPendiente", 190, "diferencia").despues, 0);
  assert.equal(cambio(plan, "Turno", 388, "montoInicial").despues, 23000);
  assert.equal(cambio(plan, "Turno", 388, "montoEsperadoEfectivo").despues, 446772);
  assert.equal(cambio(plan, "CierrePreparacion", 198, "efectivoEsperadoCorte").despues, 446772);
  assert.equal(cambio(plan, "CierrePreparacion", 198, "efectivoRetiradoEsperado").despues, 423772);
  assert.equal(cambio(plan, "CierrePreparacion", 198, "diferencia").despues, -400772);
  assert.equal(cambio(plan, "Turno", 388, "diferenciaEfectivo").despues, -400772);
  assert.equal(cambio(plan, "ArqueoCaja", 236, "diferencia").despues, -400772);
  assert.ok(invariantes(plan.estado, plan.tocadas).every((i) => i.ok));
});

test("I4 NO toca el conteo, el retiro, el fondo dejado, el movimiento 503 ni el sobre 198", () => {
  const plan = armarPlan(alcanceI4(), buscarManifiesto("I4"));
  for (const campo of ["montoRealEfectivo", "efectivoRetiradoCierre", "fondoDejadoCierre"]) {
    assert.ok(noCambia(plan, "Turno", 388, campo), campo);
  }
  for (const campo of ["totalCambio", "desgloseCambio", "totalRetiroContado", "desgloseRetiroContado", "totalContado", "desgloseContado", "retiroFinal"]) {
    assert.ok(noCambia(plan, "CierrePreparacion", 198, campo), campo);
  }
  for (const campo of ["efectivoContado", "efectivoRetirado", "fondoDejado"]) assert.ok(noCambia(plan, "ArqueoCaja", 236, campo), campo);
  assert.ok(plan.sinCambio.includes("CajaMovimiento#503"));
  assert.ok(plan.sinCambio.includes("CambioPendiente#198"));
  // El sobre 190 tal cual lo dejó el corte: su total y su desglose no cambian.
  assert.ok(noCambia(plan, "CambioPendiente", 190, "total"));
  assert.ok(noCambia(plan, "CambioPendiente", 190, "desglose"));
});

// ── I6 ─────────────────────────────────────────────────────────────────────

const RETIRO_312 = Object.freeze({ 500: 1, 1000: 13, 10000: 1, 20000: 1 });

function alcanceI6() {
  return {
    Turno: {
      508: {
        id: 508, localId: 1, cierre: CERRADO, cierreEnPreparacionEn: CERRADO, anuladoEn: null,
        montoInicial: 47700, montoEsperadoEfectivo: 82200, montoRealEfectivo: 23043500, diferenciaEfectivo: 22961300,
        efectivoRetiradoCierre: 43500, fondoDejadoCierre: 23000000, retiroCierreMovimientoId: 713,
      },
    },
    CierrePreparacion: {
      312: {
        id: 312, turnoId: 508, estado: "CONFIRMADO", efectivoEsperadoCorte: 82200,
        desgloseCambio: { 1000: 23000 }, totalCambio: 23000000, efectivoRetiradoEsperado: -22917800,
        desgloseRetiroContado: { ...RETIRO_312 }, totalRetiroContado: 43500,
        desgloseContado: { 500: 1, 1000: 23013, 10000: 1, 20000: 1 }, totalContado: 23043500,
        retiroFinal: 43500, diferencia: 22961300, arqueoFinalId: 382,
      },
    },
    RetiroPreparacion: {},
    CambioPendiente: {
      312: {
        id: 312, estado: "RECIBIDO", cierrePreparacionId: 312, turnoOrigenId: 508, turnoDestinoId: 510,
        total: 23000000, desglose: { 1000: 23000 },
        totalRecibido: 23000, desgloseRecibido: { ...DESGLOSE_RECIBIDO_SOBRE_312 }, diferencia: -22977000,
      },
    },
    ArqueoCaja: {
      // SUPUESTO: las copias que la confirmación escribe en el arqueo final.
      382: { id: 382, turnoId: 508, tipo: "FINAL", efectivoEsperado: 82200, efectivoContado: 23043500, diferencia: 22961300, efectivoRetirado: 43500, fondoDejado: 23000000 },
    },
    CajaMovimiento: { 713: { id: 713, turnoId: 508, tipo: "RETIRO", monto: 43500 } },
  };
}

test("I6 es PROPUESTO, válido, y corrige solo el cambio del corte 312", () => {
  const m = buscarManifiesto("I6");
  assert.equal(m.estado, ESTADO_MANIFIESTO.PROPUESTO);
  assert.equal(m.autorizacion, undefined);
  assert.deepEqual(validarManifiesto(m).errores, []);
  assert.deepEqual(m.correcciones.map((c) => [c.tipo, c.cierrePreparacionId]), [[TIPO_CORRECCION.CORTE, 312]]);
  assert.deepEqual(Object.keys(m.correcciones[0].despues), ["desgloseCambio"], "el retiro contado no se corrige");
  assert.deepEqual(m.correcciones[0].antes, { desgloseCambio: { 1000: 23000 } });
});

test("I6 usa EXACTAMENTE el conteo con que se recibió el sobre 312, que suma $23.000", () => {
  const m = buscarManifiesto("I6");
  assert.deepEqual(DESGLOSE_RECIBIDO_SOBRE_312, { 1000: 3, 20000: 1 });
  assert.equal(totalDesglose(DESGLOSE_RECIBIDO_SOBRE_312), 23000);
  assert.deepEqual(m.correcciones[0].despues.desgloseCambio, DESGLOSE_RECIBIDO_SOBRE_312);
  assert.match(m.evidencia, /mismo sobre 312/);
});

test("I6: el cajón se deriva a $66.500 con las funciones del circuito, y el faltante es $15.700", () => {
  const plan = armarPlan(alcanceI6(), buscarManifiesto("I6"));
  assert.deepEqual(plan.errores, []);
  // Lo que se espera, calculado con las MISMAS funciones: no con números escritos.
  const cajon = unirDesgloses(RETIRO_312, DESGLOSE_RECIBIDO_SOBRE_312);
  const retiroEsperado = calcularRetiroEsperado({ efectivoEsperadoCorte: 82200, totalCambio: 23000 });
  const cuentas = calcularCierreDesdeRetiro({ totalRetiroContado: 43500, totalCambio: 23000, efectivoRetiradoEsperado: retiroEsperado });
  assert.deepEqual(cajon, { 500: 1, 1000: 16, 10000: 1, 20000: 2 });
  assert.deepEqual([retiroEsperado, cuentas.totalCajonDerivado, cuentas.diferencia], [59200, 66500, -15700]);

  assert.equal(cambio(plan, "CierrePreparacion", 312, "totalCambio").despues, 23000);
  assert.deepEqual(cambio(plan, "CierrePreparacion", 312, "desgloseCambio").despues, DESGLOSE_RECIBIDO_SOBRE_312);
  assert.equal(cambio(plan, "CierrePreparacion", 312, "efectivoRetiradoEsperado").despues, retiroEsperado);
  assert.deepEqual(cambio(plan, "CierrePreparacion", 312, "desgloseContado").despues, cajon);
  assert.equal(cambio(plan, "CierrePreparacion", 312, "totalContado").despues, cuentas.totalCajonDerivado);
  assert.equal(cambio(plan, "CierrePreparacion", 312, "diferencia").despues, cuentas.diferencia);
  assert.equal(cambio(plan, "Turno", 508, "montoRealEfectivo").despues, 66500);
  assert.equal(cambio(plan, "Turno", 508, "diferenciaEfectivo").despues, -15700);
  assert.equal(cambio(plan, "Turno", 508, "fondoDejadoCierre").despues, 23000);
  assert.equal(cambio(plan, "ArqueoCaja", 382, "fondoDejado").despues, 23000);
  assert.equal(cambio(plan, "CambioPendiente", 312, "total").despues, 23000);
  assert.deepEqual(cambio(plan, "CambioPendiente", 312, "desglose").despues, DESGLOSE_RECIBIDO_SOBRE_312);
  assert.equal(cambio(plan, "CambioPendiente", 312, "diferencia").despues, 0);
  assert.ok(invariantes(plan.estado, plan.tocadas).every((i) => i.ok));
});

test("I6 conserva el retiro de $43.500 y NO toca el movimiento 713 ni el fondo del turno 510", () => {
  const plan = armarPlan(alcanceI6(), buscarManifiesto("I6"));
  for (const campo of ["desgloseRetiroContado", "totalRetiroContado", "retiroFinal", "efectivoEsperadoCorte"]) {
    assert.ok(noCambia(plan, "CierrePreparacion", 312, campo), campo);
  }
  for (const campo of ["efectivoRetiradoCierre", "montoEsperadoEfectivo", "montoInicial"]) assert.ok(noCambia(plan, "Turno", 508, campo), campo);
  assert.ok(noCambia(plan, "CajaMovimiento", 713, "monto"));
  assert.ok(plan.sinCambio.includes("CajaMovimiento#713"));
  // El receptor contó bien: su conteo y el fondo del turno 510 no se tocan.
  assert.ok(noCambia(plan, "CambioPendiente", 312, "totalRecibido"));
  assert.ok(noCambia(plan, "CambioPendiente", 312, "desgloseRecibido"));
  assert.ok(!plan.tocadas.concat(plan.sinCambio).includes("Turno#510"));
});

// ── Lo que ninguno de los dos puede hacer ───────────────────────────────────

test("ni I4 ni I6 se pueden aplicar: el motor rechaza un PROPUESTO antes de leer la base", async () => {
  // Un cliente que explota si se lo toca: prueba que el rechazo es antes de la base.
  const sinBase = new Proxy({}, { get() { throw new Error("no debía tocar la base"); } });
  for (const codigo of ["I4", "I6"]) {
    const r = await ejecutarCorreccion(sinBase, buscarManifiesto(codigo), { modo: "aplicar", usuarioId: 1 });
    assert.equal(r.resultado, RESULTADO.RECHAZADA, codigo);
    assert.match(r.errores.join(" "), /PROPUESTO solo se puede ensayar/, codigo);
  }
});

test("ninguno toca ventas ni filas excluidas", () => {
  const excluidas = new Set(EXCLUSIONES.map((e) => `${e.entidad}#${e.id}`));
  for (const m of MANIFIESTOS) {
    for (const c of m.correcciones) {
      assert.ok(Object.values(TIPO_CORRECCION).includes(c.tipo), `${m.codigo}: ${c.tipo}`);
      assert.equal(JSON.stringify(c).includes("venta"), false, `${m.codigo} menciona una venta`);
      if (c.cierrePreparacionId) assert.equal(excluidas.has(`CierrePreparacion#${c.cierrePreparacionId}`), false);
    }
  }
  assert.equal(excluidas.has("Turno#388") || excluidas.has("Turno#508"), false);
});
