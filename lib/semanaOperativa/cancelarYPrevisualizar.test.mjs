// CANCELAR EL CAMBIO PROGRAMADO, Y LO QUE LA PANTALLA MUESTRA ANTES DE CONFIRMAR.
//
//   node --import ./scripts/alias-loader.mjs --test lib/semanaOperativa/cancelarYPrevisualizar.test.mjs
//
// Tres funciones puras del PR-2: `planificarCancelacion`, `previsualizarCambio`
// y `cambioProgramado`. Lo que se afirma de las dos últimas es que NO son un
// segundo calendario: dicen exactamente lo que `planificarCambio` y
// `semanaQueContiene` —las que usa el servidor al guardar— van a hacer.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ERROR_SEMANA,
  cambioProgramado,
  planificarCambio,
  planificarCancelacion,
  previsualizarCambio,
  semanaQueContiene,
} from "@/lib/semanaOperativa/semanaOperativa";
import { diaDeLaSemana, sumarDias } from "@/lib/transferencias/periodoDePago";

const HOY = "2026-09-24"; // jueves
const fila = (diaDeCorte, desde = null, id = 1) => ({
  id,
  localId: 1,
  diaDeCorte,
  vigenteDesde: desde ? new Date(`${desde}T00:00:00.000Z`) : null,
});
const dias = (a, b) => {
  const out = [];
  for (let d = a; d <= b; d = sumarDias(d, 1)) out.push(d);
  return out;
};
const largo = (r) => dias(r.desde, r.hasta).length;

// ── CANCELAR ───────────────────────────────────────────────────────────────

test("sin cambio pendiente, cancelar es SIN_PENDIENTE (409), no un 200 que disimula", () => {
  for (const vigencias of [[], [fila(0)], [fila(0), fila(3, "2026-08-02", 2)]]) {
    const p = planificarCancelacion({ vigencias, hoy: HOY });
    assert.equal(p.ok, false);
    assert.equal(p.codigo, ERROR_SEMANA.SIN_PENDIENTE.codigo);
    assert.equal(p.status, 409);
  }
});

test("cancela SOLO lo que empieza después de hoy", () => {
  const p = planificarCancelacion({ vigencias: [fila(0), fila(4, "2026-08-02", 2), fila(3, "2026-10-01", 3)], hoy: HOY });
  assert.equal(p.ok, true);
  assert.deepEqual(p.cancela, [{ diaDeCorte: 3, desde: "2026-10-01" }]);
});

test("una vigencia que EMPIEZA HOY ya es historia: no se cancela", () => {
  // El borde que decide. Hoy es el primer día de esa semana: ya rige, y borrarla
  // reescribiría la semana abierta.
  const p = planificarCancelacion({ vigencias: [fila(0), fila(3, HOY, 2)], hoy: HOY });
  assert.equal(p.ok, false, "canceló una vigencia que ya empezó");
  assert.equal(p.codigo, "SIN_PENDIENTE");
});

test("después de cancelar, las semanas son EXACTAMENTE las de antes de programar", () => {
  const antes = [fila(0)];
  const plan = planificarCambio({ vigencias: antes, diaDeCorte: 3, hoy: HOY });
  const conPendiente = [...antes, fila(3, plan.desde, 2)];
  const c = planificarCancelacion({ vigencias: conPendiente, hoy: HOY });
  const cancelados = new Set(c.cancela.map((v) => v.desde));
  const despues = conPendiente.filter((f) => !cancelados.has(f.vigenteDesde?.toISOString().slice(0, 10)));
  for (const d of dias("2026-08-01", "2027-03-01")) {
    assert.deepEqual(semanaQueContiene({ vigencias: despues, fecha: d }), semanaQueContiene({ vigencias: antes, fecha: d }));
  }
});

// ── PREVISUALIZAR: LA MISMA CUENTA QUE EL SERVIDOR ────────────────────────

test("las 42 combinaciones: la previsualización dice lo mismo que `planificarCambio`", () => {
  for (let viejo = 0; viejo <= 6; viejo++) {
    for (let nuevo = 0; nuevo <= 6; nuevo++) {
      if (viejo === nuevo) continue;
      const vigencias = [fila(viejo)];
      const plan = planificarCambio({ vigencias, diaDeCorte: nuevo, hoy: HOY, reemplazarPendiente: true });
      const p = previsualizarCambio({ vigencias, diaDeCorte: nuevo, hoy: HOY });
      assert.equal(p.ok, true);
      assert.equal(p.accion, "PROGRAMAR");
      assert.equal(p.desde, plan.desde, `${viejo}→${nuevo}: la pantalla promete otra fecha`);
      assert.deepEqual(p.transicion, plan.transicion);
      // La semana de hoy, la de siempre.
      const hoyEs = semanaQueContiene({ vigencias, fecha: HOY });
      assert.deepEqual(p.actual, { desde: hoyEs.desde, hasta: hoyEs.hasta, diaDeCorte: viejo });
      // La transición es la semana larga de 8 a 13 días…
      assert.ok(largo(p.transicion) >= 8 && largo(p.transicion) <= 13, `${viejo}→${nuevo}: transición de ${largo(p.transicion)} días`);
      // …y "después" es la primera semana REGULAR del corte nuevo, pegada.
      assert.equal(p.despues.desde, sumarDias(p.transicion.hasta, 1));
      assert.equal(largo(p.despues), 7);
      assert.equal(diaDeLaSemana(p.despues.desde), nuevo);
      assert.equal(p.despues.diaDeCorte, nuevo);
    }
  }
});

test("una ubicación sin semana: la primera configuración rige desde ya", () => {
  const p = previsualizarCambio({ vigencias: [], diaDeCorte: 2, hoy: HOY });
  assert.equal(p.accion, "PRIMERA");
  assert.equal(p.actual, null);
  assert.equal(p.desde, null);
  assert.deepEqual(p.despues, { desde: "2026-09-22", hasta: "2026-09-28", diaDeCorte: 2 });
});

test("con un cambio programado, la previsualización dice que lo REEMPLAZA", () => {
  const vigencias = [fila(0), fila(3, "2026-09-27", 2)];
  const p = previsualizarCambio({ vigencias, diaDeCorte: 5, hoy: HOY });
  assert.equal(p.ok, true);
  assert.deepEqual(p.reemplaza, { diaDeCorte: 3, desde: "2026-09-27" });
  // La frontera se calcula contra lo que YA RIGE (domingo), no contra el pendiente.
  assert.equal(p.desde, "2026-09-27");
});

test("elegir el día que ya rige no es un cambio: MISMO_CORTE", () => {
  const p = previsualizarCambio({ vigencias: [fila(0), fila(3, "2026-09-27", 2)], diaDeCorte: 0, hoy: HOY });
  assert.equal(p.ok, false);
  assert.equal(p.codigo, "MISMO_CORTE");
});

// ── EL CAMBIO YA PROGRAMADO ────────────────────────────────────────────────

test("sin pendiente, `cambioProgramado` es null", () => {
  assert.equal(cambioProgramado({ vigencias: [fila(0)], hoy: HOY }), null);
  assert.equal(cambioProgramado({ vigencias: [], hoy: HOY }), null);
});

test("con pendiente, su transición y la semana regular que sigue salen del resolvedor", () => {
  const vigencias = [fila(0), fila(3, "2026-10-04", 2)];
  const c = cambioProgramado({ vigencias, hoy: HOY });
  assert.deepEqual(c, {
    diaDeCorte: 3,
    desde: "2026-10-04",
    transicion: { desde: "2026-10-04", hasta: "2026-10-13" },
    despues: { desde: "2026-10-14", hasta: "2026-10-20", diaDeCorte: 3 },
  });
  const larga = semanaQueContiene({ vigencias, fecha: "2026-10-04" });
  assert.deepEqual(c.transicion, { desde: larga.desde, hasta: larga.hasta });
});
