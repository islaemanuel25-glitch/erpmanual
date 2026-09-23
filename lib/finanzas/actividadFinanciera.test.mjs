// CANDADO: LA ACTIVIDAD POR DÍA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/finanzas/actividadFinanciera.test.mjs
//
// Lo que se afirma acá es la regla de arquitectura del módulo: **Finanzas no
// crea hechos, los reúne**. Cada fila tiene que poder decir de qué tabla salió y
// con qué id, o la lista deja de ser una vista de lo que ya existe y pasa a ser
// una tabla nueva.
//
// Y el otro: el día es el ARGENTINO. Un turno que abre a las 22 de un sábado es
// del domingo en UTC, así que agrupar por la fecha cruda armaría un día que
// nadie trabajó — justo con los turnos de la noche.

import test from "node:test";
import assert from "node:assert/strict";

import {
  HECHO,
  ORIGEN,
  aCargoDelTurno,
  actividadPorDia,
  hechoDeMovimiento,
  hechoDeTurno,
  rangoHorarioDelTurno,
  rotuloDelDiaFinanciero,
} from "@/lib/finanzas/actividadFinanciera";
import { CLASE_MOVIMIENTO, clasificarMovimientos } from "@/lib/finanzas/movimientosDeCaja";

// La forma que arma la ruta a partir de `prisma.turno.findMany` más el total de
// ventas ya sumado. `apertura` y `cierre` son Date, como los devuelve Prisma.
const TURNO = {
  id: 501,
  apertura: new Date("2026-09-12T11:00:00.000Z"), // 08:00 en Argentina
  cierre: new Date("2026-09-12T19:00:00.000Z"), // 16:00
  anuladoEn: null,
  vendedorNombre: "Emanuel",
  operadorNombre: "Juan",
  ventasTotal: 100000,
  cantidadVentas: 42,
};

const RETIRO = {
  id: 9001,
  tipo: "RETIRO",
  monto: "25000.00",
  motivo: "Panadería",
  createdAt: new Date("2026-09-12T17:00:00.000Z"),
  turnoId: 501,
};

const INGRESO = {
  id: 9002,
  tipo: "INGRESO",
  monto: "10000.00",
  motivo: "Trajo cambio",
  createdAt: new Date("2026-09-12T13:00:00.000Z"),
  turnoId: 501,
};

// ══════════════════════════════════════════════════════════════════════════
// CADA HECHO CONSERVA SU ORIGEN
// ══════════════════════════════════════════════════════════════════════════

test("T1 · un turno lleva su tabla y su id", () => {
  const h = hechoDeTurno(TURNO);
  assert.equal(h.tipo, HECHO.TURNO);
  assert.deepEqual(h.origen, { tipo: ORIGEN.TURNO, id: 501 });
});

test("T2 · un movimiento lleva SU id y el del turno que lo explica", () => {
  // El turno es su documento de origen navegable: no hay pantalla de un
  // movimiento suelto en ninguna parte del ERP.
  const h = hechoDeMovimiento(RETIRO);
  assert.deepEqual(h.origen, { tipo: ORIGEN.CAJA_MOVIMIENTO, id: 9001, turnoId: 501 });
});

test("T3 · NINGÚN hecho se inventa un id", () => {
  // Con datos incompletos el origen queda en null y la fila deja de ser
  // tocable, que es lo correcto: un "Ver ›" que no lleva a ningún lado es peor
  // que no ofrecerlo.
  assert.equal(hechoDeTurno({}).origen.id, null);
  assert.equal(hechoDeMovimiento({}).origen.id, null);
  assert.equal(hechoDeMovimiento({}).origen.turnoId, null);
});

// ══════════════════════════════════════════════════════════════════════════
// EL MOTIVO NO SE INTERPRETA
// ══════════════════════════════════════════════════════════════════════════

test("T4 · 'Panadería' sigue siendo texto libre, no un pago a proveedor", () => {
  const h = hechoDeMovimiento(RETIRO);
  assert.equal(h.subtitulo, "Motivo: Panadería");
  assert.equal(h.titulo, "Retiro de caja");
  // Y no aparece ninguna clasificación inventada.
  assert.equal(h.proveedor, undefined);
  assert.equal(h.categoria, undefined);
  assert.equal(h.esGasto, undefined);
});

test("T5 · un movimiento SIN motivo lo dice, no lo inventa", () => {
  const h = hechoDeMovimiento({ ...RETIRO, motivo: null });
  assert.equal(h.subtitulo, "Sin motivo registrado");
});

test("T6 · la recaudación se nombra por lo que es", () => {
  const [clasificado] = clasificarMovimientos(
    [{ ...RETIRO, id: 9003, motivo: "Retiro de recaudación" }],
    { idsDeRecaudacion: new Set([9003]) }
  );
  const h = hechoDeMovimiento(clasificado);
  assert.equal(h.titulo, "Retiro de recaudación");
  assert.equal(h.esRecaudacion, true);
  // Y su subtítulo NO repite el motivo: ese texto lo escribe el sistema, no una
  // persona, así que ponerle "Motivo:" adelante lo haría pasar por lo que no es.
  assert.equal(h.subtitulo, "Se llevó la recaudación del turno");
});

// ══════════════════════════════════════════════════════════════════════════
// EL DÍA ES EL ARGENTINO
// ══════════════════════════════════════════════════════════════════════════

test("T7 · un turno de las 22 de un SÁBADO cae en el sábado, no en el domingo UTC", () => {
  // 2026-09-12T01:00:00Z son las 22:00 del VIERNES 11 en Argentina. Al revés:
  // el sábado 12 a las 22 es 2026-09-13T01:00Z, que en UTC ya es domingo.
  const nocturno = {
    ...TURNO,
    id: 502,
    apertura: new Date("2026-09-13T01:00:00.000Z"),
    cierre: null,
  };
  const dias = actividadPorDia({ turnos: [nocturno], movimientos: [] });
  assert.equal(dias.length, 1);
  assert.equal(dias[0].clave, "2026-09-12", "el turno se fue al día siguiente");
  assert.equal(dias[0].titulo, "Sábado 12");
});

test("T8 · el horario también se muestra en hora argentina", () => {
  assert.equal(rangoHorarioDelTurno(TURNO), "08:00–16:00");
});

test("T9 · un turno ABIERTO no muestra una punta colgando", () => {
  // "08:00–" se lee como un dato que falta. "08:00 · abierto" dice qué pasa.
  assert.equal(rangoHorarioDelTurno({ ...TURNO, cierre: null }), "08:00 · abierto");
});

// ══════════════════════════════════════════════════════════════════════════
// EL AGRUPADO Y EL ORDEN
// ══════════════════════════════════════════════════════════════════════════

test("T10 · los días van del más reciente al más viejo", () => {
  const otroDia = { ...TURNO, id: 503, apertura: new Date("2026-09-10T11:00:00.000Z") };
  const dias = actividadPorDia({ turnos: [otroDia, TURNO], movimientos: [] });
  assert.deepEqual(dias.map((d) => d.clave), ["2026-09-12", "2026-09-10"]);
});

test("T11 · dentro del día, el hecho más reciente primero", () => {
  const dias = actividadPorDia({ turnos: [TURNO], movimientos: [INGRESO, RETIRO] });
  assert.equal(dias.length, 1);
  // 17:00Z el retiro, 13:00Z el ingreso, 11:00Z la apertura del turno.
  assert.deepEqual(dias[0].hechos.map((h) => h.clave), ["caja-9001", "caja-9002", "turno-501"]);
});

test("T12 · los totales del día separan ventas, ingresos y retiros", () => {
  // NO hay un total único que los mezcle, y eso es deliberado: sumar los tres
  // daría un número que no significa nada. La banda muestra las ventas.
  const dias = actividadPorDia({ turnos: [TURNO], movimientos: [INGRESO, RETIRO] });
  assert.equal(dias[0].ventas, 100000);
  assert.equal(dias[0].ingresos, 10000);
  assert.equal(dias[0].retiros, 25000);
  assert.equal(dias[0].total, undefined, "apareció un total que mezcla los tres");
});

test("T13 · el rótulo del día no escribe ceros", () => {
  // "0 retiros" se lee como que falta algo. Mismo criterio que el rótulo del
  // día de transferencias.
  const soloTurno = actividadPorDia({ turnos: [TURNO], movimientos: [] })[0];
  assert.equal(rotuloDelDiaFinanciero(soloTurno), "1 turno");

  const completo = actividadPorDia({ turnos: [TURNO], movimientos: [INGRESO, RETIRO] })[0];
  assert.equal(rotuloDelDiaFinanciero(completo), "1 turno · 1 ingreso · 1 retiro");
});

test("T14 · un hecho sin fecha NO arma un día vacío: se saltea", () => {
  // Una fila con `apertura` en null armaría una banda titulada "—" que nadie
  // puede explicar.
  const dias = actividadPorDia({
    turnos: [{ ...TURNO, apertura: null }],
    movimientos: [{ ...RETIRO, createdAt: null }],
  });
  assert.deepEqual(dias, []);
});

// ══════════════════════════════════════════════════════════════════════════
// QUIÉN ESTUVO A CARGO
// ══════════════════════════════════════════════════════════════════════════

test("T15 · gana el OPERADOR, que es quien estuvo en el mostrador", () => {
  assert.equal(aCargoDelTurno(TURNO), "Juan");
  assert.equal(hechoDeTurno(TURNO).titulo, "Turno Juan");
});

test("T16 · sin operador, el usuario del turno", () => {
  // Es el caso de un local que no usa operadores, que es la mayoría.
  assert.equal(aCargoDelTurno({ ...TURNO, operadorNombre: null }), "Emanuel");
});

test("T17 · sin ninguno, 'Turno' a secas y no 'Turno —'", () => {
  assert.equal(aCargoDelTurno({}), null);
  assert.equal(hechoDeTurno({ id: 1 }).titulo, "Turno");
});

test("T18 · un turno ANULADO se muestra y se marca", () => {
  // Se abrió por error: no hubo plata, no hubo conteo y no hubo diferencia.
  // Esconderlo dejaría un hueco en la lista que nadie puede explicar.
  const h = hechoDeTurno({ ...TURNO, anuladoEn: new Date("2026-09-12T20:00:00.000Z") });
  assert.equal(h.anulado, true);
});

// ══════════════════════════════════════════════════════════════════════════
// LA CLASIFICACIÓN NO SE HACE POR EL TEXTO DEL MOTIVO
// ══════════════════════════════════════════════════════════════════════════

test("T19 · el cierre gana sobre la recaudación cuando está en los dos conjuntos", () => {
  // Un retiro de cierre también produce su `ArqueoCaja` FINAL, así que puede
  // estar en los dos. Si ganara la recaudación, volvería a entrar en la cuenta
  // del efectivo esperado y el número no coincidiría con el que el cierre
  // persistió. Ya pasó una vez, del otro lado.
  const [m] = clasificarMovimientos([RETIRO], {
    idsDeRecaudacion: new Set([9001]),
    idsDeCierre: new Set([9001]),
  });
  assert.equal(m.clase, CLASE_MOVIMIENTO.CIERRE);
});

test("T20 · un motivo que DICE 'recaudación' no alcanza para clasificarlo", () => {
  // La contraprueba del heurístico: el motivo es texto libre y cualquiera puede
  // escribir eso desde Caja +/−. Lo que decide es el vínculo.
  const impostor = { ...RETIRO, id: 9010, motivo: "Retiro de recaudación" };
  const [m] = clasificarMovimientos([impostor], { idsDeRecaudacion: new Set() });
  assert.equal(m.clase, CLASE_MOVIMIENTO.MANUAL);
  assert.equal(hechoDeMovimiento(m).titulo, "Retiro de caja");
});
