// La vigencia de una confirmación, y el rango que le corresponde a una fila.
//
// Lo que se protege:
//   · que una confirmación anterior a la última vinculación NO valga —es el
//     agujero por el que se escribiría un costo decidido sobre otro producto—;
//   · que no se pierda autoría: la confirmación sigue ahí, solo deja de contar;
//   · que el rango congelado viva exactamente mientras la confirmación esté en
//     pie, ni más ni menos.

import test from "node:test";
import assert from "node:assert/strict";

import {
  confirmacionDeInterpretacionVigente,
  rangoDeLaFila,
  multiplicadorConfirmadoUsable,
  claveDeLaConfirmacion,
} from "./vigenciaConfirmacion.js";
import { RANGO_POR_DEFECTO } from "./rangoAumento.js";

const T = (iso) => new Date(iso);
const ANTES = "2026-08-01T10:00:00.000Z";
const DESPUES = "2026-08-02T10:00:00.000Z";

// ── Vigencia ────────────────────────────────────────────────────────────────

test("sin confirmar no hay nada vigente", () => {
  assert.equal(confirmacionDeInterpretacionVigente({}), false);
  assert.equal(confirmacionDeInterpretacionVigente({ confirmadoEn: null }), false);
});

test("confirmada y nunca revinculada a mano: vale", () => {
  // El caso normal: el motor macheó solo y después alguien confirmó.
  assert.equal(
    confirmacionDeInterpretacionVigente({ confirmadoEn: T(DESPUES), vinculadoEn: null }),
    true
  );
});

test("confirmada DESPUÉS de vincular: vale", () => {
  assert.equal(
    confirmacionDeInterpretacionVigente({ confirmadoEn: T(DESPUES), vinculadoEn: T(ANTES) }),
    true
  );
});

test("revinculada DESPUÉS de confirmar: NO vale", () => {
  // Éste es el agujero. La persona eligió una interpretación para un producto
  // que ya no es el que la fila tiene.
  assert.equal(
    confirmacionDeInterpretacionVigente({ confirmadoEn: T(ANTES), vinculadoEn: T(DESPUES) }),
    false
  );
});

test("empate exacto: NO vale", () => {
  // En el mismo milisegundo no se sabe cuál fue primero. Ante la duda, que la
  // fila vuelva a la cola es más barato que aplicar un costo dudoso.
  const t = T(ANTES);
  assert.equal(confirmacionDeInterpretacionVigente({ confirmadoEn: t, vinculadoEn: t }), false);
});

test("tolera fechas como texto ISO", () => {
  assert.equal(
    confirmacionDeInterpretacionVigente({ confirmadoEn: DESPUES, vinculadoEn: ANTES }),
    true
  );
});

test("una fecha inválida no se toma por buena", () => {
  assert.equal(
    confirmacionDeInterpretacionVigente({ confirmadoEn: "no es fecha", vinculadoEn: null }),
    false
  );
});

test("vencer NO borra: la autoría sigue en la fila", () => {
  // El motivo de haber elegido vencimiento en vez de borrado.
  const fila = {
    confirmadoEn: T(ANTES),
    vinculadoEn: T(DESPUES),
    confirmadoPorUsuarioId: 7,
    multiplicadorConfirmado: 450,
  };
  assert.equal(confirmacionDeInterpretacionVigente(fila), false);
  assert.equal(fila.confirmadoPorUsuarioId, 7, "quién decidió se conserva");
  assert.equal(fila.multiplicadorConfirmado, 450, "y qué decidió también");
});

// ── El multiplicador ────────────────────────────────────────────────────────

test("el multiplicador de una confirmación vencida no se puede usar", () => {
  // El consumidor grave: acá se escribe un costo en producción.
  assert.equal(
    multiplicadorConfirmadoUsable({
      confirmadoEn: T(ANTES), vinculadoEn: T(DESPUES), multiplicadorConfirmado: 450,
    }),
    false
  );
});

test("con confirmación vigente y multiplicador, se usa", () => {
  assert.equal(
    multiplicadorConfirmadoUsable({
      confirmadoEn: T(DESPUES), vinculadoEn: T(ANTES), multiplicadorConfirmado: 12,
    }),
    true
  );
});

test("vigente pero sin multiplicador: no hay nada que usar", () => {
  assert.equal(
    multiplicadorConfirmadoUsable({ confirmadoEn: T(DESPUES), multiplicadorConfirmado: null }),
    false
  );
});

// ── El rango ────────────────────────────────────────────────────────────────

const CABECERA = { aumentoEsperadoMinPct: 10, aumentoEsperadoMaxPct: 20 };
const CONGELADO = { aumentoEsperadoMinPct: 30, aumentoEsperadoMaxPct: 40 };

test("con confirmación vigente manda el rango congelado de la fila", () => {
  const r = rangoDeLaFila(
    { ...CONGELADO, confirmadoEn: T(DESPUES), vinculadoEn: T(ANTES) },
    CABECERA
  );
  assert.deepEqual({ minPct: r.minPct, maxPct: r.maxPct }, { minPct: 30, maxPct: 40 });
  assert.equal(r.origen, "fila");
});

test("con la confirmación vencida el congelado NO vale: manda la cabecera", () => {
  // Es la tercera cara de la misma regla: el rango congelado existe solo
  // mientras la decisión que protege siga en pie.
  const r = rangoDeLaFila(
    { ...CONGELADO, confirmadoEn: T(ANTES), vinculadoEn: T(DESPUES) },
    CABECERA
  );
  assert.deepEqual({ minPct: r.minPct, maxPct: r.maxPct }, { minPct: 10, maxPct: 20 });
  assert.equal(r.origen, "cabecera");
});

test("sin confirmar manda la cabecera", () => {
  const r = rangoDeLaFila({}, CABECERA);
  assert.equal(r.origen, "cabecera");
  assert.equal(r.minPct, 10);
});

test("sin cabecera cae al default del sistema, no a un 10 y 20 escritos a mano", () => {
  const r = rangoDeLaFila({}, null);
  assert.equal(r.origen, "default");
  assert.equal(r.minPct, RANGO_POR_DEFECTO.minPct);
  assert.equal(r.maxPct, RANGO_POR_DEFECTO.maxPct);
});

test("medio rango congelado no se usa: o los dos o ninguno", () => {
  // Mezclar el mínimo de la decisión con el máximo de la cabecera daría un
  // criterio que nadie eligió.
  const r = rangoDeLaFila(
    { aumentoEsperadoMinPct: 30, aumentoEsperadoMaxPct: null, confirmadoEn: T(DESPUES) },
    CABECERA
  );
  assert.equal(r.origen, "cabecera");
});

// ── QUÉ LECTURA SE CONFIRMÓ ────────────────────────────────────────────────
//
// Una fila resuelta tiene que abrirse mostrando lo que se decidió. Que se viera
// igual que una sin resolver fue lo que hizo creer que la pantalla estaba rota.

const LECTURAS = [
  { clave: "MISMA_PRESENTACION", multiplicador: 1 },
  { clave: "PACK_16", multiplicador: 16 },
];

test("la confirmación señala la tarjeta de su multiplicador", () => {
  const fila = { confirmadoEn: "2026-08-09T03:00:00Z", vinculadoEn: null, multiplicadorConfirmado: 16 };
  assert.equal(claveDeLaConfirmacion(fila, LECTURAS), "PACK_16");
});

test("sin multiplicador guardado no se marca ninguna", () => {
  const fila = { confirmadoEn: "2026-08-09T03:00:00Z", vinculadoEn: null, multiplicadorConfirmado: null };
  assert.equal(claveDeLaConfirmacion(fila, LECTURAS), null);
});

test("una confirmación vencida no marca nada", () => {
  // Se revinculó DESPUÉS de confirmar: la decisión fue sobre otro producto.
  const fila = {
    confirmadoEn: "2026-08-09T03:00:00Z",
    vinculadoEn: "2026-08-09T04:00:00Z",
    multiplicadorConfirmado: 16,
  };
  assert.equal(claveDeLaConfirmacion(fila, LECTURAS), null);
});

test("si el multiplicador guardado ya no es una lectura posible, no se marca ninguna", () => {
  // Pasa de verdad: corregir el factor_pack del producto cambia qué lecturas
  // existen. Marcar cualquier otra sería peor que no marcar.
  const fila = { confirmadoEn: "2026-08-09T03:00:00Z", vinculadoEn: null, multiplicadorConfirmado: 14 };
  assert.equal(claveDeLaConfirmacion(fila, LECTURAS), null);
});

test("sin lecturas no hay nada que señalar", () => {
  const fila = { confirmadoEn: "2026-08-09T03:00:00Z", vinculadoEn: null, multiplicadorConfirmado: 16 };
  assert.equal(claveDeLaConfirmacion(fila, []), null);
});
