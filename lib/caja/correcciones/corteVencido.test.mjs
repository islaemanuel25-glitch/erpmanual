// EL CORTE VENCIDO SIN CONTEO: la rama propia del plan, sus guardas, y el motor
// de verdad corriéndola sobre una base en memoria. Con el caso de I5.
//
// El alcance de abajo tiene la FORMA y los VALORES que se leyeron en producción
// el 2026-09-27 para la cadena de I5: turno 396 → corte 201 → sobre 201 →
// turno 566. Donde un campo no se leyó está marcado como SUPUESTO; ninguno de
// ellos cambia en el plan, así que no mueve lo que se afirma.
//
// Lo que corre contra PostgreSQL —el corte tomado y el sobre recibido por las
// rutas del circuito— está en `scripts/pruebas-db/correccionCaja.mjs`.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/correcciones/corteVencido.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { buscarManifiesto, DESGLOSE_RECIBIDO_SOBRE_201 } from "./manifiestos.js";
import {
  armarPlan,
  invariantes,
  validarManifiesto,
  CAMPOS_CORTE_VENCIDO,
  ESTADO_MANIFIESTO,
  TIPO_CORRECCION,
} from "./plan.js";
import { RESULTADO } from "./motor.js";
import { baseEnMemoria, autorizadoCon, ensayar, aplicar, unaLetraDistinta, correrValor, loEscrito } from "./baseEnMemoria.mjs";
import { totalDesglose } from "../conteoBilletes.js";
import { calcularRetiroEsperado } from "../cierreRelevo.js";
import { calcularDiferencia } from "../efectivoEsperado.js";

const EN_PREPARACION = "2026-09-10T22:00:00.000Z";
const CERRADO_566 = "2026-09-12T22:00:00.000Z";

function alcanceI5() {
  return {
    Turno: {
      396: {
        id: 396, localId: 5, cierre: null, cierreEnPreparacionEn: EN_PREPARACION, anuladoEn: null,
        // SUPUESTO: el esperado del turno no se leyó como columna; no cambia.
        montoInicial: 23000, montoEsperadoEfectivo: null,
        montoRealEfectivo: null, diferenciaEfectivo: null, efectivoRetiradoCierre: null, fondoDejadoCierre: null,
        retiroCierreMovimientoId: null,
      },
      566: {
        // SUPUESTO: lo que no es el fondo; solo se lee y se protege.
        id: 566, localId: 5, cierre: CERRADO_566, cierreEnPreparacionEn: CERRADO_566, anuladoEn: null,
        montoInicial: 23000, montoEsperadoEfectivo: 80000, montoRealEfectivo: 80000, diferenciaEfectivo: 0,
        efectivoRetiradoCierre: 57000, fondoDejadoCierre: 23000, retiroCierreMovimientoId: 900,
      },
    },
    CierrePreparacion: {
      201: {
        id: 201, turnoId: 396, estado: "VENCIDO", efectivoEsperadoCorte: 41100,
        desgloseCambio: { 1000: 23000 }, totalCambio: 23000000, efectivoRetiradoEsperado: -22958900,
        desgloseRetiroContado: null, totalRetiroContado: null, desgloseContado: null, totalContado: null,
        retiroFinal: null, diferencia: null, arqueoFinalId: null,
      },
    },
    RetiroPreparacion: {},
    CambioPendiente: {
      201: {
        id: 201, estado: "RECIBIDO", cierrePreparacionId: 201, turnoOrigenId: 396, turnoDestinoId: 566,
        total: 23000000, desglose: { 1000: 23000 },
        totalRecibido: 23000, desgloseRecibido: { 1000: 23 }, diferencia: -22977000,
      },
    },
    ArqueoCaja: {},
    CajaMovimiento: {},
  };
}

const I5 = () => buscarManifiesto("I5");
const errores = (alcance, m = I5()) => armarPlan(alcance, m).errores.join(" ");
const cambio = (plan, entidad, id, campo) => plan.cambios.find((c) => c.entidad === entidad && c.id === id && c.campo === campo);

/** Lo que el plan de I5 cambia: exactamente esto, en este orden. */
const CAMBIOS_I5 = [
  { entidad: "CierrePreparacion", id: 201, campo: "desgloseCambio", antes: { 1000: 23000 }, despues: { 1000: 23 } },
  { entidad: "CierrePreparacion", id: 201, campo: "totalCambio", antes: 23000000, despues: 23000 },
  { entidad: "CierrePreparacion", id: 201, campo: "efectivoRetiradoEsperado", antes: -22958900, despues: 18100 },
  { entidad: "CambioPendiente", id: 201, campo: "total", antes: 23000000, despues: 23000 },
  { entidad: "CambioPendiente", id: 201, campo: "desglose", antes: { 1000: 23000 }, despues: { 1000: 23 } },
  { entidad: "CambioPendiente", id: 201, campo: "diferencia", antes: -22977000, despues: 0 },
];

// ── El manifiesto de I5 ─────────────────────────────────────────────────────

const HUELLA_I5 = "4194020447db32cb7a723324ca1dece5fe218b594c9dc66d56f2c4e4f534704d";

test("I5 es AUTORIZADO con la huella exacta y el autorizante 1, y corrige solo el cambio del corte 201 con lo que contó el receptor", () => {
  const m = I5();
  assert.equal(m.estado, ESTADO_MANIFIESTO.AUTORIZADO);
  assert.deepEqual(m.autorizacion, { hash: HUELLA_I5, autorizadoPorUsuarioId: 1 });
  assert.equal(m.autorizacion.hash.length, 64);
  assert.match(m.autorizacion.hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(validarManifiesto(m).errores, []);
  // La corrección es la misma que se ensayó: autorizar no la toca.
  assert.deepEqual(m.correcciones, [
    { tipo: TIPO_CORRECCION.CAMBIO_CORTE_VENCIDO, cierrePreparacionId: 201, antes: { desgloseCambio: { 1000: 23000 } }, despues: { desgloseCambio: { 1000: 23 } } },
  ]);
  assert.deepEqual(DESGLOSE_RECIBIDO_SOBRE_201, { 1000: 23 });
  assert.equal(totalDesglose(DESGLOSE_RECIBIDO_SOBRE_201), 23000);
  assert.match(m.evidencia, /mismo sobre 201/);
  assert.match(m.evidencia, /siguen desconocidos/);
});

test("I5: el plan cambia EXACTAMENTE el cambio, el retiro esperado y el sobre, con los valores de producción", () => {
  const plan = armarPlan(alcanceI5(), I5());
  assert.deepEqual(plan.errores, []);
  assert.deepEqual(plan.cambios, CAMBIOS_I5);
  assert.deepEqual(plan.tocadas, ["CierrePreparacion#201", "CambioPendiente#201"]);
  assert.deepEqual(plan.sinCambio, ["Turno#396", "Turno#566"]);
  assert.ok(invariantes(plan.estado, plan.tocadas).every((i) => i.ok), JSON.stringify(invariantes(plan.estado, plan.tocadas).filter((i) => !i.ok)));
});

test("I5: el ensayo sobre lo leído en producción da EXACTAMENTE la huella autorizada, y se aplica a nombre del autorizante 1", async () => {
  // La huella solo depende de los campos que CAMBIAN y de la lista del alcance
  // —Turno 396 y 566, corte 201, sobre 201—: los SUPUESTOS de arriba no la mueven.
  const base = baseEnMemoria(alcanceI5());
  const ensayo = await ensayar(base, I5());
  assert.equal(ensayo.resultado, RESULTADO.ENSAYO, ensayo.errores.join(" "));
  assert.equal(ensayo.hash, HUELLA_I5);
  assert.equal(ensayo.hashCoincide, true);
  assert.deepEqual(loEscrito(base), [0, 0, 0]);

  const antes = structuredClone(base.filas());
  const r = await aplicar(base, I5());
  assert.equal(r.resultado, RESULTADO.APLICADA, r.errores.join(" "));
  assert.equal(base.escrito.registros[0].manifiestoHash, HUELLA_I5);
  assert.equal(base.escrito.registros[0].autorizadoPorUsuarioId, 1);
  assert.deepEqual([...new Set(base.escrito.filas)].sort(), ["CambioPendiente#201", "CierrePreparacion#201"]);
  assert.deepEqual(base.filas().Turno, antes.Turno, "los turnos 396 y 566 se leen y no se escriben");
  assert.deepEqual(
    [base.filas().Turno[396].montoRealEfectivo, base.filas().Turno[396].diferenciaEfectivo, base.filas().CierrePreparacion[201].diferencia],
    [null, null, null]
  );
});

test("I5: cualquier otra huella NO se aplica, ni un PROPUESTO", async () => {
  for (const otra of unaLetraDistinta(HUELLA_I5)) {
    const base = baseEnMemoria(alcanceI5());
    const r = await aplicar(base, { ...I5(), autorizacion: { ...I5().autorizacion, hash: otra } });
    assert.equal(r.resultado, RESULTADO.RECHAZADA, otra);
    assert.match(r.errores.join(" "), /no es el autorizado/, otra);
    assert.deepEqual(loEscrito(base), [0, 0, 0], otra);
  }
  const { autorizacion: _sinAutorizacion, ...propuesto } = { ...I5(), estado: ESTADO_MANIFIESTO.PROPUESTO };
  const sinBase = new Proxy({}, { get() { throw new Error("no debía tocar la base"); } });
  const r = await aplicar(sinBase, propuesto);
  assert.equal(r.resultado, RESULTADO.RECHAZADA);
  assert.match(r.errores.join(" "), /PROPUESTO solo se puede ensayar/);
});

// ── Lo que se deriva, con las funciones del circuito ────────────────────────

test("el total del cambio se deriva del desglose, el retiro esperado y la diferencia del sobre con las funciones del circuito", () => {
  // Otra composición corregida, para que no coincida con ningún número escrito.
  const despues = { 500: 6, 1000: 19 };
  const m = { ...I5(), correcciones: [{ ...I5().correcciones[0], despues: { desgloseCambio: despues } }] };
  const plan = armarPlan(alcanceI5(), m);
  assert.deepEqual(plan.errores, []);
  const total = totalDesglose(despues);
  assert.equal(total, 22000);
  assert.equal(cambio(plan, "CierrePreparacion", 201, "totalCambio").despues, total);
  assert.equal(cambio(plan, "CierrePreparacion", 201, "efectivoRetiradoEsperado").despues, calcularRetiroEsperado({ efectivoEsperadoCorte: 41100, totalCambio: total }));
  assert.equal(cambio(plan, "CambioPendiente", 201, "total").despues, total);
  assert.deepEqual(cambio(plan, "CambioPendiente", 201, "desglose").despues, despues);
  assert.equal(cambio(plan, "CambioPendiente", 201, "diferencia").despues, calcularDiferencia(23000, total));
  assert.equal(cambio(plan, "CambioPendiente", 201, "diferencia").despues, 1000);
});

test("un sobre todavía DISPONIBLE se corrige sin inventarle diferencia de recepción", () => {
  const a = alcanceI5();
  Object.assign(a.CambioPendiente[201], { estado: "DISPONIBLE", turnoDestinoId: null, totalRecibido: null, desgloseRecibido: null, diferencia: null });
  delete a.Turno[566];
  const plan = armarPlan(a, I5());
  assert.deepEqual(plan.errores, []);
  assert.equal(cambio(plan, "CambioPendiente", 201, "diferencia"), undefined);
  assert.equal(plan.estado.CambioPendiente[201].diferencia, null);
});

// ── Lo que NO toca ──────────────────────────────────────────────────────────

test("no toca el turno origen, el receptor, lo recibido, los estados, ni lo que nunca se contó", () => {
  const plan = armarPlan(alcanceI5(), I5());
  const campos = plan.cambios.map((c) => `${c.entidad}#${c.id}.${c.campo}`);
  for (const c of plan.cambios) assert.ok(CAMPOS_CORTE_VENCIDO[c.entidad].includes(c.campo), `${c.entidad}.${c.campo}`);
  assert.ok(!campos.some((c) => c.startsWith("Turno#")), "no toca turnos");
  for (const campo of ["totalRecibido", "desgloseRecibido", "estado", "turnoDestinoId"]) assert.ok(!campos.includes(`CambioPendiente#201.${campo}`), campo);
  for (const campo of ["estado", "totalContado", "desgloseContado", "totalRetiroContado", "desgloseRetiroContado", "retiroFinal", "diferencia", "arqueoFinalId", "efectivoEsperadoCorte"]) {
    assert.ok(!campos.includes(`CierrePreparacion#201.${campo}`), campo);
  }
  // Desconocido no es cero: el cajón del turno 396 sigue sin contar.
  assert.equal(plan.estado.Turno[396].montoRealEfectivo, null);
  assert.equal(plan.estado.Turno[396].diferenciaEfectivo, null);
  assert.equal(plan.estado.CierrePreparacion[201].diferencia, null);
  assert.equal(plan.estado.CierrePreparacion[201].totalContado, null);
});

// ── Las guardas: si falla cualquiera, no hay plan ───────────────────────────

const RECHAZOS = [
  ["turno cerrado", (a) => { a.Turno[396].cierre = "2026-09-11T00:00:00.000Z"; }, /está CERRADO/],
  ["turno anulado", (a) => { a.Turno[396].anuladoEn = "2026-09-11T00:00:00.000Z"; }, /está ANULADO/],
  ["turno abierto", (a) => { a.Turno[396].cierreEnPreparacionEn = null; }, /está ABIERTO/],
  ["turno con contado", (a) => { a.Turno[396].montoRealEfectivo = 41100; }, /tiene conteo/],
  ["turno con diferencia", (a) => { a.Turno[396].diferenciaEfectivo = 0; }, /tiene conteo/],
  ["turno con retiro de cierre", (a) => { a.Turno[396].retiroCierreMovimientoId = 77; }, /retiro de cierre/],
  ["corte CONFIRMADO", (a) => { a.CierrePreparacion[201].estado = "CONFIRMADO"; }, /está CONFIRMADO/],
  ["corte PREPARANDO", (a) => { a.CierrePreparacion[201].estado = "PREPARANDO"; }, /está PREPARANDO/],
  ["corte CANCELADO", (a) => { a.CierrePreparacion[201].estado = "CANCELADO"; }, /está CANCELADO/],
  ["corte CERRADO_SIN_CONTEO", (a) => { a.CierrePreparacion[201].estado = "CERRADO_SIN_CONTEO"; }, /está CERRADO_SIN_CONTEO/],
  ["corte con conteo del cajón", (a) => { a.CierrePreparacion[201].totalContado = 41100; }, /conteo del cajón/],
  ["corte con desglose del cajón", (a) => { a.CierrePreparacion[201].desgloseContado = { 1000: 41 }; }, /conteo del cajón/],
  ["corte con retiro contado", (a) => { a.CierrePreparacion[201].totalRetiroContado = 18100; }, /retiro contado/],
  ["corte con desglose de retiro", (a) => { a.CierrePreparacion[201].desgloseRetiroContado = { 1000: 18 }; }, /retiro contado/],
  ["corte con retiro final", (a) => { a.CierrePreparacion[201].retiroFinal = 18100; }, /retiro contado/],
  ["corte con diferencia", (a) => { a.CierrePreparacion[201].diferencia = 0; }, /tiene diferencia/],
  ["corte con arqueo final", (a) => { a.CierrePreparacion[201].arqueoFinalId = 300; }, /arqueo final/],
  ["turno con un arqueo", (a) => { a.ArqueoCaja[300] = { id: 300, turnoId: 396, tipo: "PARCIAL", efectivoEsperado: 1, efectivoContado: 1, diferencia: 0, efectivoRetirado: 1, fondoDejado: 0 }; }, /tiene el arqueo #300/],
  ["turno con otro corte vigente", (a) => { a.CierrePreparacion[202] = { ...a.CierrePreparacion[201], id: 202, estado: "PREPARANDO" }; }, /otro corte/],
  ["turno con un retiro en preparación", (a) => { a.RetiroPreparacion[40] = { id: 40, turnoId: 396, estado: "PREPARANDO" }; }, /en preparación/],
  ["corte del orden anterior", (a) => { a.CierrePreparacion[201].efectivoRetiradoEsperado = null; }, /orden anterior/],
  ["cambio anterior distinto del declarado", (a) => { a.CierrePreparacion[201].desgloseCambio = { 1000: 22000 }; }, /no tiene el desgloseCambio/],
  ["falta el sobre", (a) => { delete a.CambioPendiente[201]; }, /no tiene el sobre/],
  ["dos sobres del mismo corte", (a) => { a.CambioPendiente[202] = { ...a.CambioPendiente[201], id: 202 }; }, /más de un sobre/],
  ["sobre de otro turno", (a) => { a.CambioPendiente[201].turnoOrigenId = 395; }, /no salió del turno/],
  ["sobre que no lleva el cambio del corte", (a) => { a.CambioPendiente[201].total = 22000000; }, /no lleva el cambio/],
  ["sobre reservado", (a) => { a.CambioPendiente[201].estado = "RESERVADO"; }, /está RESERVADO/],
  ["sobre cancelado", (a) => { a.CambioPendiente[201].estado = "CANCELADO"; }, /está CANCELADO/],
  ["receptor fuera del alcance", (a) => { delete a.Turno[566]; }, /recibió el sobre #201 no está en el alcance/],
  ["fondo del receptor distinto de lo recibido", (a) => { a.Turno[566].montoInicial = 23500; }, /fondo del turno #566 no coincide/],
  ["turno excluido", (a) => { a.Turno[277] = { ...a.Turno[566], id: 277 }; }, /Turno #277 está excluido/],
];

for (const [caso, romper, motivo] of RECHAZOS) {
  test(`corte vencido: rechaza ${caso}, y no arma ningún cambio`, () => {
    const a = alcanceI5();
    romper(a);
    const plan = armarPlan(a, I5());
    assert.match(plan.errores.join(" "), motivo);
    assert.deepEqual(plan.cambios, []);
  });
}

test("corte vencido: un desglose corregido inválido o vacío no arma plan", () => {
  for (const despues of [{}, { 1000: -23 }, { 1000: 2.5 }, { 777: 23 }]) {
    const m = { ...I5(), correcciones: [{ ...I5().correcciones[0], despues: { desgloseCambio: despues } }] };
    const plan = armarPlan(alcanceI5(), m);
    assert.notDeepEqual(plan.errores, [], JSON.stringify(despues));
    assert.deepEqual(plan.cambios, [], JSON.stringify(despues));
  }
});

test("corte vencido: el manifiesto trae una sola corrección, solo del cambio, y no se mezcla", () => {
  const c = I5().correcciones[0];
  const mezclado = { ...I5(), correcciones: [c, { tipo: "CORTE", cierrePreparacionId: 312, antes: { desgloseCambio: { 1000: 1 } }, despues: { desgloseCambio: { 1000: 2 } } }] };
  assert.match(validarManifiesto(mezclado).errores.join(" "), /exactamente una corrección/);
  assert.match(armarPlan(alcanceI5(), mezclado).errores.join(" "), /exactamente una corrección/);
  const conRetiro = { ...I5(), correcciones: [{ ...c, antes: { desgloseRetiroContado: {} }, despues: { desgloseRetiroContado: { 1000: 18 } } }] };
  assert.match(validarManifiesto(conRetiro).errores.join(" "), /no puede corregir desgloseRetiroContado/);
});

test("las reglas de siempre NO se aflojaron: un CORTE sobre el corte vencido sigue rechazado", () => {
  const comoCorte = { ...I5(), correcciones: [{ ...I5().correcciones[0], tipo: TIPO_CORRECCION.CORTE }] };
  const e = errores(alcanceI5(), comoCorte);
  assert.match(e, /El turno #396 no está cerrado/);
  assert.match(e, /El corte #201 está VENCIDO: no se corrige con esta herramienta/);
});

// ── El motor, sobre la base en memoria ──────────────────────────────────────

test("corte vencido: el ensayo en seco da la huella y no escribe nada", async () => {
  const base = baseEnMemoria(alcanceI5());
  const antes = structuredClone(base.filas());
  const r = await ensayar(base, I5());
  assert.equal(r.resultado, RESULTADO.ENSAYO, r.errores.join(" "));
  assert.match(r.hash, /^[0-9a-f]{64}$/);
  // El motor lee las columnas en su orden; lo que importa es el conjunto.
  const clave = (c) => `${c.entidad}#${c.id}.${c.campo}`;
  const ordenar = (lista) => [...lista].sort((a, b) => clave(a).localeCompare(clave(b)));
  assert.deepEqual(ordenar(r.cambios), ordenar(CAMBIOS_I5));
  assert.ok(r.invariantes.length > 0 && r.invariantes.every((i) => i.ok), JSON.stringify(r.invariantes));
  assert.deepEqual(base.filas(), antes);
  assert.deepEqual(loEscrito(base), [0, 0, 0]);
});

test("corte vencido: aplicado con su huella escribe SOLO el corte y el sobre, y nada más", async () => {
  const base = baseEnMemoria(alcanceI5());
  const antes = structuredClone(base.filas());
  const { hash } = await ensayar(base, I5());
  const r = await aplicar(base, autorizadoCon(I5(), hash));
  assert.equal(r.resultado, RESULTADO.APLICADA, r.errores.join(" "));
  assert.deepEqual([...new Set(base.escrito.filas)].sort(), ["CambioPendiente#201", "CierrePreparacion#201"]);
  assert.equal(base.escrito.registros[0].manifiestoHash, hash);
  assert.equal(base.escrito.registros[0].autorizadoPorUsuarioId, 1);
  assert.equal(base.escrito.bitacoras, 1);

  const d = base.filas();
  // Turno origen y receptor: idénticos. Sin arqueo ni movimiento nuevo.
  assert.deepEqual(d.Turno[396], antes.Turno[396]);
  assert.deepEqual(d.Turno[566], antes.Turno[566]);
  assert.deepEqual(d.ArqueoCaja, {});
  assert.deepEqual(d.CajaMovimiento, {});
  // Estados iguales; lo recibido, igual; lo nunca contado, sin contar.
  assert.equal(d.CierrePreparacion[201].estado, "VENCIDO");
  assert.equal(d.CambioPendiente[201].estado, "RECIBIDO");
  assert.equal(d.CambioPendiente[201].totalRecibido, 23000);
  assert.deepEqual(d.CambioPendiente[201].desgloseRecibido, { 1000: 23 });
  assert.equal(d.Turno[396].montoRealEfectivo, null);
  assert.equal(d.Turno[396].diferenciaEfectivo, null);
  assert.equal(d.CierrePreparacion[201].diferencia, null);
  // Lo corregido.
  assert.deepEqual(
    [d.CierrePreparacion[201].desgloseCambio, d.CierrePreparacion[201].totalCambio, d.CierrePreparacion[201].efectivoRetiradoEsperado],
    [{ 1000: 23 }, 23000, 18100]
  );
  assert.deepEqual([d.CambioPendiente[201].desglose, d.CambioPendiente[201].total, d.CambioPendiente[201].diferencia], [{ 1000: 23 }, 23000, 0]);
});

test("corte vencido: sin la huella exacta no se aplica; PROPUESTO tampoco", async () => {
  const { hash } = await ensayar(baseEnMemoria(alcanceI5()), I5());
  for (const otra of unaLetraDistinta(hash)) {
    const base = baseEnMemoria(alcanceI5());
    const r = await aplicar(base, autorizadoCon(I5(), otra));
    assert.equal(r.resultado, RESULTADO.RECHAZADA, otra);
    assert.match(r.errores.join(" "), /no es el autorizado/, otra);
    assert.deepEqual(loEscrito(base), [0, 0, 0], otra);
  }
  const { autorizacion: _sinAutorizacion, ...propuesto } = { ...I5(), estado: ESTADO_MANIFIESTO.PROPUESTO };
  const base = baseEnMemoria(alcanceI5());
  assert.equal((await aplicar(base, propuesto)).resultado, RESULTADO.RECHAZADA);
  assert.deepEqual(loEscrito(base), [0, 0, 0]);
});

// Todo lo que el plan LEE para decidir: los valores que cambia, y los que
// prueban que nunca se contó, que el sobre es de ese corte y que el receptor
// abrió con lo que contó.
const PROTEGIDOS = [
  ["CierrePreparacion", 201, "desgloseCambio"], ["CierrePreparacion", 201, "totalCambio"],
  ["CierrePreparacion", 201, "efectivoRetiradoEsperado"], ["CierrePreparacion", 201, "efectivoEsperadoCorte"],
  ["CierrePreparacion", 201, "estado", "CONFIRMADO"], ["CierrePreparacion", 201, "totalContado", 1],
  ["CierrePreparacion", 201, "totalRetiroContado", 1], ["CierrePreparacion", 201, "diferencia", 0],
  ["CierrePreparacion", 201, "arqueoFinalId", 1],
  ["CambioPendiente", 201, "total"], ["CambioPendiente", 201, "desglose"], ["CambioPendiente", 201, "diferencia"],
  ["CambioPendiente", 201, "totalRecibido"], ["CambioPendiente", 201, "estado", "RESERVADO"],
  ["Turno", 396, "cierre", "2026-09-11T00:00:00.000Z"], ["Turno", 396, "anuladoEn", "2026-09-11T00:00:00.000Z"],
  ["Turno", 396, "montoRealEfectivo", 0], ["Turno", 396, "diferenciaEfectivo", 0],
  ["Turno", 566, "montoInicial"],
];

test("corte vencido: si cambió cualquier valor protegido desde el ensayo, no se aplica NADA", async () => {
  const { hash } = await ensayar(baseEnMemoria(alcanceI5()), I5());
  for (const [entidad, id, campo, valor] of PROTEGIDOS) {
    const a = alcanceI5();
    a[entidad][id][campo] = valor !== undefined ? valor : correrValor(a[entidad][id][campo]);
    const base = baseEnMemoria(a);
    const r = await aplicar(base, autorizadoCon(I5(), hash));
    const donde = `${entidad}#${id}.${campo}`;
    assert.equal(r.resultado, RESULTADO.RECHAZADA, donde);
    assert.deepEqual(loEscrito(base), [0, 0, 0], donde);
  }
});

test("corte vencido: un fallo a mitad de la escritura deshace todo", async () => {
  const base = baseEnMemoria(alcanceI5());
  const antes = structuredClone(base.filas());
  const { hash } = await ensayar(base, I5());
  const ganchos = { despuesDeEscribirFila: ({ escritas }) => { if (escritas === 1) throw new Error("se cortó la luz"); } };
  const r = await aplicar(base, autorizadoCon(I5(), hash), ganchos);
  assert.equal(r.resultado, RESULTADO.RECHAZADA);
  assert.match(r.errores.join(" "), /se cortó la luz/);
  assert.deepEqual(base.filas(), antes);
  assert.deepEqual(loEscrito(base), [0, 0, 0]);
});

test("corte vencido: la segunda aplicación reconoce la primera y no escribe", async () => {
  const base = baseEnMemoria(alcanceI5());
  const { hash } = await ensayar(base, I5());
  assert.equal((await aplicar(base, autorizadoCon(I5(), hash))).resultado, RESULTADO.APLICADA);
  const despues = structuredClone(base.filas());
  const escrito = loEscrito(base);
  const r = await aplicar(base, autorizadoCon(I5(), hash));
  assert.equal(r.resultado, RESULTADO.YA_APLICADA);
  assert.deepEqual(base.filas(), despues);
  assert.deepEqual(loEscrito(base), escrito);
});
