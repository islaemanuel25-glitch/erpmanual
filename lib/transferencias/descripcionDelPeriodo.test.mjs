// CÓMO SE LLAMA EL PERÍODO, Y CÓMO SE ROTULA SU IMPORTE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/descripcionDelPeriodo.test.mjs
//
// ── EL DEFECTO QUE ESTO CIERRA ────────────────────────────────────────────
//
// La pantalla escribía "Semana cerrada" a mano en el JSX, aunque el chip
// estuviera en Mes. El título decía una cosa y el rango de abajo otra, sobre la
// pantalla que dice cuánta plata hay que cobrar.
//
// Todos los candados se paran en un día FIJO —sábado 2026-09-12 salvo que digan
// otra cosa— porque un rótulo que depende de "hoy" no se puede afirmar si "hoy"
// se mueve.

import { test } from "node:test";
import assert from "node:assert/strict";

import { UNIDADES } from "@/lib/transferencias/periodoDePago";
import {
  ROTULO,
  avisoDelPeriodo,
  descripcionDelPeriodo,
  diasEntre,
  mesDe,
  rangoEnLargo,
} from "@/lib/transferencias/descripcionDelPeriodo";

// Sábado. Con corte domingo, la semana en curso va del domingo 6 al sábado 12.
const SABADO = "2026-09-12";
const DOMINGO_CORTE = 0;

// ── 1 · EL ROTULO DEL IMPORTE SIGUE AL PERÍODO, NO A LA UNIDAD ────────────

test("P1 · período TERMINADO → «Para cobrar»; EN CURSO → «Va acumulado»", () => {
  const cerrada = descripcionDelPeriodo({
    unidad: UNIDADES.SEMANA, diaDeCorte: DOMINGO_CORTE, hoy: SABADO, desplazamiento: -1,
  });
  const enCurso = descripcionDelPeriodo({
    unidad: UNIDADES.SEMANA, diaDeCorte: DOMINGO_CORTE, hoy: SABADO, desplazamiento: 0,
  });

  assert.equal(cerrada.rotuloDelImporte, ROTULO.COBRAR);
  assert.equal(cerrada.enCurso, false);
  assert.equal(enCurso.rotuloDelImporte, ROTULO.ACUMULADO);
  assert.equal(enCurso.enCurso, true);

  // Y es lo que NO puede pasar: un período abierto rotulado para cobrar. Pedirle
  // a alguien que cobre un número que mañana es otro es el defecto que abrió
  // toda esta línea de trabajo.
  assert.notEqual(enCurso.rotuloDelImporte, ROTULO.COBRAR);
});

test("P2 · el título NO dice «Semana» cuando el chip está en Mes", () => {
  // El defecto textual, tal cual estaba: el JSX escribía "Semana cerrada" fijo.
  for (const desplazamiento of [0, -1, -2]) {
    const d = descripcionDelPeriodo({
      unidad: UNIDADES.MES, diaDeCorte: DOMINGO_CORTE, hoy: SABADO, desplazamiento,
    });
    assert.ok(!/semana/i.test(d.titulo), `el título de un mes dice «semana»: ${d.titulo}`);
    assert.ok(!/semana/i.test(d.subtitulo), `el rango de un mes dice «semana»: ${d.subtitulo}`);
  }
});

// ── 2 · LOS CINCO CASOS DE LA ESPECIFICACIÓN, UNO POR UNO ────────────────

test("P3 · semana cerrada: título, rango largo y rótulo", () => {
  const d = descripcionDelPeriodo({
    unidad: UNIDADES.SEMANA, diaDeCorte: DOMINGO_CORTE, hoy: SABADO, desplazamiento: -1,
  });
  assert.equal(d.titulo, "Semana cerrada");
  assert.equal(d.rango.desde, "2026-08-30");
  assert.equal(d.rango.hasta, "2026-09-05");
  // A CABALLO DE DOS MESES, que es el caso que se paga una vez al mes: el mes se
  // nombra DOS veces. Sin eso diría "dom 30 al sáb 5 de septiembre", que nombra
  // un 30 de septiembre que no está en el rango.
  assert.equal(d.subtitulo, "dom 30 de agosto al sáb 5 de septiembre");
  assert.equal(d.rotuloDelImporte, ROTULO.COBRAR);
});

test("P4 · semana en curso: el mes se nombra UNA vez cuando las dos puntas caen en él", () => {
  const d = descripcionDelPeriodo({
    unidad: UNIDADES.SEMANA, diaDeCorte: DOMINGO_CORTE, hoy: SABADO, desplazamiento: 0,
  });
  assert.equal(d.titulo, "Semana en curso");
  assert.equal(d.subtitulo, "dom 6 al sáb 12 de septiembre");
  assert.equal(d.rotuloDelImporte, ROTULO.ACUMULADO);
});

test("P5 · mes en curso: «Septiembre · en curso» y los días corridos", () => {
  // El 12 de septiembre van 12 días del mes, contando el primero y el de hoy.
  const d = descripcionDelPeriodo({ unidad: UNIDADES.MES, hoy: SABADO, desplazamiento: 0 });
  assert.equal(d.titulo, "Septiembre · en curso");
  assert.equal(d.subtitulo, "1 al 30 de septiembre · van 12 días");
  assert.equal(d.rotuloDelImporte, ROTULO.ACUMULADO);
  // El rango es el MES ENTERO aunque hoy sea 12: el período es el mes, y lo que
  // «va» son los días corridos, que se dicen aparte.
  assert.equal(d.rango.desde, "2026-09-01");
  assert.equal(d.rango.hasta, "2026-09-30");
});

test("P6 · mes cerrado: solo el nombre del mes, sin «en curso»", () => {
  const d = descripcionDelPeriodo({ unidad: UNIDADES.MES, hoy: SABADO, desplazamiento: -1 });
  assert.equal(d.titulo, "Agosto");
  assert.equal(d.subtitulo, "1 al 31 de agosto");
  assert.equal(d.rotuloDelImporte, ROTULO.COBRAR);
  assert.ok(!/en curso/.test(d.titulo), "un mes terminado no está en curso");
});

test("P7 · día: el título nombra el día y el rótulo es «Del día»", () => {
  const d = descripcionDelPeriodo({ unidad: UNIDADES.DIA, hoy: SABADO, desplazamiento: 0 });
  assert.equal(d.titulo, "Sábado 12 de septiembre");
  assert.equal(d.rotuloDelImporte, ROTULO.DEL_DIA);
  assert.equal(d.rango.desde, d.rango.hasta);

  // Y AYER TAMBIÉN dice «Del día», aunque haya terminado: el título ya nombra el
  // día exacto, así que "para cobrar" no agregaría nada que no esté escrito
  // arriba. Es la única unidad que rompe la simetría y está decidido así.
  const ayer = descripcionDelPeriodo({ unidad: UNIDADES.DIA, hoy: SABADO, desplazamiento: -1 });
  assert.equal(ayer.titulo, "Viernes 11 de septiembre");
  assert.equal(ayer.rotuloDelImporte, ROTULO.DEL_DIA);
});

// ── 3 · MOVERSE ENTRE PERÍODOS ───────────────────────────────────────────

test("P8 · las flechas se mueven EN LA UNIDAD DEL CHIP, no en días fijos", () => {
  // Es el defecto que tendría restar 7×N o 30×N: los meses no miden lo mismo.
  const mes1 = descripcionDelPeriodo({ unidad: UNIDADES.MES, hoy: SABADO, desplazamiento: -1 });
  const mes2 = descripcionDelPeriodo({ unidad: UNIDADES.MES, hoy: SABADO, desplazamiento: -2 });
  const mes3 = descripcionDelPeriodo({ unidad: UNIDADES.MES, hoy: SABADO, desplazamiento: -3 });

  assert.deepEqual([mes1.titulo, mes2.titulo, mes3.titulo], ["Agosto", "Julio", "Junio"]);
  // Agosto tiene 31 días, junio 30. Restar 30 fijos habría salteado uno.
  assert.equal(mes1.rango.hasta, "2026-08-31");
  assert.equal(mes3.rango.hasta, "2026-06-30");

  const sem = (n) =>
    descripcionDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: DOMINGO_CORTE, hoy: SABADO, desplazamiento: n });
  assert.equal(sem(-1).rango.desde, "2026-08-30");
  assert.equal(sem(-2).rango.desde, "2026-08-23");
  assert.equal(sem(-4).rango.desde, "2026-08-09");
});

test("P9 · el corte de semana mueve la SEMANA y no toca el mes", () => {
  // Confirmado contra el código: `rangoDelPeriodo` solo usa `diaDeCorte` en la
  // rama SEMANA. El mes es el mes calendario, del 1 al último día.
  const conDomingo = descripcionDelPeriodo({ unidad: UNIDADES.MES, diaDeCorte: 0, hoy: SABADO });
  const conMiercoles = descripcionDelPeriodo({ unidad: UNIDADES.MES, diaDeCorte: 3, hoy: SABADO });
  assert.deepEqual(conDomingo.rango, conMiercoles.rango, "el corte movió el mes");

  const semDomingo = descripcionDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: 0, hoy: SABADO });
  const semMiercoles = descripcionDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: 3, hoy: SABADO });
  assert.notDeepEqual(semDomingo.rango, semMiercoles.rango, "el corte NO movió la semana");
  assert.equal(semMiercoles.rango.desde, "2026-09-09");
});

test("P10 · un año hacia atrás cruza el año sin romperse", () => {
  const d = descripcionDelPeriodo({ unidad: UNIDADES.MES, hoy: SABADO, desplazamiento: -9 });
  assert.equal(d.titulo, "Diciembre");
  assert.equal(d.rango.desde, "2025-12-01");
  assert.equal(d.rango.hasta, "2025-12-31");
});

test("P11 · febrero de un año bisiesto lo resuelve el calendario, no una tabla", () => {
  // 2028 es bisiesto. Si alguien escribiera los largos de mes a mano, acá fallaría.
  const d = descripcionDelPeriodo({ unidad: UNIDADES.MES, hoy: "2028-03-15", desplazamiento: -1 });
  assert.equal(d.titulo, "Febrero");
  assert.equal(d.rango.hasta, "2028-02-29");
});

// ── 4 · EL AVISO DE ABAJO ────────────────────────────────────────────────

test("P12 · el aviso distingue «no está cerrado» de «no terminó»", () => {
  // Son dos motivos distintos por los que el total puede moverse.
  assert.equal(
    avisoDelPeriodo({ sinRecibir: 9, enCurso: false, unidad: UNIDADES.SEMANA }),
    "9 sin recibir · el total no está cerrado"
  );
  assert.equal(
    avisoDelPeriodo({ sinRecibir: 33, enCurso: true, unidad: UNIDADES.MES }),
    "33 sin recibir · el mes no terminó"
  );
  // Período terminado y nada pendiente: el total ES definitivo, así que no hay
  // nada que avisar. Un aviso acá sería ruido permanente.
  assert.equal(avisoDelPeriodo({ sinRecibir: 0, enCurso: false }), null);
  // Abierto y sin pendientes: igual puede crecer, y eso sí hay que decirlo.
  assert.equal(avisoDelPeriodo({ sinRecibir: 0, enCurso: true, unidad: UNIDADES.SEMANA }),
    "La semana todavía no terminó");
});

// ── 5 · LAS PIEZAS SUELTAS ───────────────────────────────────────────────

test("P13 · `diasEntre` cuenta las DOS puntas", () => {
  assert.equal(diasEntre("2026-09-01", "2026-09-01"), 1);
  assert.equal(diasEntre("2026-09-01", "2026-09-12"), 12);
  // Cruzando un cambio de horario de verano, si lo hubiera, la cuenta sigue
  // siendo de días porque va en UTC sobre fechas ya argentinas.
  assert.equal(diasEntre("2026-08-30", "2026-09-05"), 7);
});

test("P14 · `mesDe` y `rangoEnLargo` sin día de la semana", () => {
  assert.equal(mesDe("2026-09-12"), "septiembre");
  assert.equal(
    rangoEnLargo({ desde: "2026-09-01", hasta: "2026-09-30" }, { conDiaDeLaSemana: false }),
    "1 al 30 de septiembre"
  );
});

test("P15 · sin rango no inventa un texto", () => {
  assert.equal(rangoEnLargo({}), "");
  assert.equal(rangoEnLargo({ desde: "2026-09-01" }), "");
});
