// El armado de una verificación de efectivo — candados de la función pura.
//
//   node --import ./scripts/alias-loader.mjs --test lib/tesoreria/verificacionEfectivo.test.mjs
//
// Lo que la base sostiene sola (exclusividad, foto fiel, suma, locales, nada se
// borra) lo ejerce scripts/pruebas-db/verificacionEfectivo.mjs contra
// PostgreSQL. Acá: que el armado no pase por flotante, que la foto copie la
// entrega TAL COMO la devuelve la lectura canónica, que no arrastre identidad de
// turno comercial, y que diga con palabras lo que la base rechazaría.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  armarVerificacionEfectivo,
  datosDeAnulacion,
  entregaDesactualizada,
  ErrorVerificacionEfectivo,
  ESTADO_VERIFICACION,
} from "./verificacionEfectivo.js";

// La forma de una entrega es la de `armarLecturaTesoreria` (lecturaTesoreria.js,
// el objeto `entrega`): cajaMovimientoId, clase, montoDeclarado, instante,
// turnoId, operadorId, grupo.
const entrega = (cajaMovimientoId, clase, montoDeclarado, extra = {}) => ({
  cajaMovimientoId,
  clase,
  montoDeclarado,
  instante: new Date("2026-10-04T15:00:00.123Z"),
  turnoId: 70,
  operadorId: 9,
  grupo: "3|2026-10-04",
  ...extra,
});
const base = (extra = {}) => ({
  localId: 3,
  entregas: [entrega(101, "RECAUDACION", 1234.56), entrega(102, "CIERRE", 0.1), entrega(103, "CIERRE", 0.2)],
  importeVerificado: 1234.8,
  verificadaPorUsuarioId: 5,
  idempotencyKey: "  clave-1  ",
  ...extra,
});

test("declarado, verificado y diferencia salen exactos, sin flotante", () => {
  const { verificacion } = armarVerificacionEfectivo(base());
  assert.equal(verificacion.importeDeclarado, "1234.86");
  assert.equal(verificacion.importeVerificado, "1234.80");
  assert.equal(verificacion.diferencia, "-0.06");
  assert.equal(verificacion.idempotencyKey, "clave-1");
  assert.equal(verificacion.verificadaPorOperadorId, null);
  assert.equal(verificacion.observacion, null);
});

test("una diferencia positiva y una nula también", () => {
  assert.equal(armarVerificacionEfectivo(base({ importeVerificado: "1300" })).verificacion.diferencia, "65.14");
  assert.equal(armarVerificacionEfectivo(base({ importeVerificado: 1234.86 })).verificacion.diferencia, "0.00");
});

test("la foto copia la entrega de la lectura, con el local de la verificación y sin el grupo", () => {
  const { entregas } = armarVerificacionEfectivo(base());
  assert.deepEqual(entregas[0], {
    cajaMovimientoId: 101,
    montoDeclaradoSnapshot: "1234.56",
    localIdSnapshot: 3,
    turnoIdSnapshot: 70,
    operadorIdSnapshot: 9,
    claseSnapshot: "RECAUDACION",
    instanteEntregaSnapshot: new Date("2026-10-04T15:00:00.123Z"),
  });
  for (const fila of entregas) {
    assert.deepEqual(Object.keys(fila).filter((k) => /grupo|comercial|franja|fecha/i.test(k)), []);
  }
});

test("una caja sin operador deja la foto con operador null", () => {
  const { entregas } = armarVerificacionEfectivo(base({ entregas: [entrega(101, "CIERRE", 10, { operadorId: null })], importeVerificado: 10 }));
  assert.equal(entregas[0].operadorIdSnapshot, null);
});

test("lo que la base rechazaría, se rechaza antes y con palabras", () => {
  const casos = [
    [{ entregas: [] }, /al menos una entrega/],
    [{ entregas: [entrega(101, "INGRESO", 10)] }, /no es una entrega de efectivo/],
    [{ entregas: [entrega(101, "CIERRE", 10), entrega(101, "CIERRE", 10)] }, /está dos veces/],
    [{ entregas: [entrega(101, "CIERRE", 0)] }, /no tiene importe/],
    [{ entregas: [entrega(101, "CIERRE", null)] }, /no tiene importe/],
    [{ importeVerificado: null }, /no es válido/],
    [{ importeVerificado: "" }, /no es válido/],
    [{ importeVerificado: "abc" }, /no es válido/],
    [{ importeVerificado: -1 }, /no es válido/],
    [{ idempotencyKey: "   " }, /idempotencia/],
    [{ localId: 0 }, /local/],
    [{ verificadaPorUsuarioId: null }, /quién verifica/],
  ];
  for (const [extra, mensaje] of casos) {
    assert.throws(() => armarVerificacionEfectivo(base(extra)), (e) => e instanceof ErrorVerificacionEfectivo && mensaje.test(e.message), JSON.stringify(extra));
  }
});

test("contar cero es un dato, no un error", () => {
  const { verificacion } = armarVerificacionEfectivo(base({ importeVerificado: 0 }));
  assert.equal(verificacion.importeVerificado, "0.00");
  assert.equal(verificacion.diferencia, "-1234.86");
});

test("la anulación es completa y exige motivo y autor", () => {
  const ahora = new Date("2026-10-04T18:00:00Z");
  assert.deepEqual(datosDeAnulacion({ anuladaPorUsuarioId: 5, motivo: "  Sobre equivocado ", ahora }), {
    estado: ESTADO_VERIFICACION.ANULADA,
    vigente: false,
    anuladaEn: ahora,
    anuladaPorUsuarioId: 5,
    motivoAnulacion: "Sobre equivocado",
  });
  assert.throws(() => datosDeAnulacion({ anuladaPorUsuarioId: 5, motivo: "  " }), /motivo/);
  assert.throws(() => datosDeAnulacion({ motivo: "x" }), /quién anula/);
});

test("una entrega corregida después de verificarla se detecta, sin recalcular la verificación", () => {
  assert.equal(entregaDesactualizada("30000.00", 29000), true);
  assert.equal(entregaDesactualizada("30000.00", 30000), false);
  assert.equal(entregaDesactualizada("0.30", 0.1 + 0.2), false);
});
