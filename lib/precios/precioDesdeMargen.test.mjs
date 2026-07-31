// Pruebas de la única fórmula de precio del ERP.
//
// El caso que originó este módulo: el margen configurado se deformaba porque el
// margen EFECTIVO del precio redondeado se persistía encima del configurado, y
// cada recálculo posterior partía del efectivo. Las pruebas 2 y 3 son las que
// cierran esa puerta: idempotencia del configurado y ausencia de trinquete.

import test from "node:test";
import assert from "node:assert/strict";
import {
  precioDesdeMargen,
  redondearA100Arriba,
  margenEfectivoDe,
  hayReglaAutomatica,
} from "./precioDesdeMargen.js";

const cerca = (a, b, tol = 0.01) =>
  assert.ok(Math.abs(a - b) <= tol, `esperaba ~${b}, obtuve ${a}`);

// ── 1. El caso reportado ─────────────────────────────────────────────────────

test("1. costo 1050, margen 30%, con redondeo → base 1365, final 1400, efectivo 33,33", () => {
  const r = precioDesdeMargen({ costo: 1050, margenConfigurado: 30, redondeo100: true });
  assert.equal(r.aplica, true);
  cerca(r.precioBase, 1365);
  assert.equal(r.precioFinal, 1400);
  assert.equal(r.margenConfigurado, 30);
  cerca(r.margenEfectivo, 33.33);
});

test("1b. el margen configurado NO es el efectivo (son campos distintos)", () => {
  const r = precioDesdeMargen({ costo: 1050, margenConfigurado: 30, redondeo100: true });
  assert.notEqual(r.margenConfigurado, r.margenEfectivo);
  assert.equal(r.margenConfigurado, 30);
});

// ── 2. Idempotencia ──────────────────────────────────────────────────────────

test("2. repetir el cálculo N veces no mueve el margen configurado", () => {
  let entrada = 30;
  for (let i = 0; i < 25; i++) {
    const r = precioDesdeMargen({ costo: 1050, margenConfigurado: entrada, redondeo100: true });
    assert.equal(r.margenConfigurado, 30, `iteración ${i}`);
    assert.equal(r.precioFinal, 1400, `iteración ${i}`);
    entrada = r.margenConfigurado; // realimentar el configurado es inofensivo
  }
});

test("2b. realimentar el EFECTIVO sí escala — por eso nunca debe persistirse", () => {
  // Prueba de contraste: documenta el defecto corregido. Con el costo QUIETO el
  // redondeo es idempotente y no pasa nada; el trinquete aparece cuando el costo
  // se mueve entre una realimentación y la siguiente, que es exactamente lo que
  // ocurría al editar la ficha después de una compra.
  const costos = [1050, 1150, 1250];

  let margenRealimentado = 30;
  const efectivos = [];
  const preciosMalos = [];
  for (const costo of costos) {
    const r = precioDesdeMargen({ costo, margenConfigurado: margenRealimentado, redondeo100: true });
    efectivos.push(r.margenEfectivo);
    preciosMalos.push(r.precioFinal);
    margenRealimentado = r.margenEfectivo; // ← lo que hacía el formulario
  }

  cerca(efectivos[0], 33.33);
  cerca(efectivos[1], 39.13);
  cerca(efectivos[2], 44.0);
  assert.ok(efectivos[1] > efectivos[0] && efectivos[2] > efectivos[1], "el margen escala");
  assert.deepEqual(preciosMalos, [1400, 1600, 1800]);

  // Con el margen configurado intacto, los mismos costos dan precios más bajos y
  // estables: 30% siempre.
  const preciosBuenos = costos.map(
    (costo) => precioDesdeMargen({ costo, margenConfigurado: 30, redondeo100: true }).precioFinal
  );
  assert.deepEqual(preciosBuenos, [1400, 1500, 1700]);
});

// ── 3. Sin trinquete ─────────────────────────────────────────────────────────

test("3. costos 1050/1200/1400/1650 siempre calculan desde el margen 30", () => {
  const esperados = [
    { costo: 1050, base: 1365, final: 1400 },
    { costo: 1200, base: 1560, final: 1600 },
    { costo: 1400, base: 1820, final: 1900 },
    { costo: 1650, base: 2145, final: 2200 },
  ];
  for (const e of esperados) {
    const r = precioDesdeMargen({ costo: e.costo, margenConfigurado: 30, redondeo100: true });
    cerca(r.precioBase, e.base);
    assert.equal(r.precioFinal, e.final, `costo ${e.costo}`);
    assert.equal(r.margenConfigurado, 30, `costo ${e.costo}`);
  }
});

test("3b. el precio final nunca sale del efectivo anterior", () => {
  // Muchos costos dan el mismo precio con 30% y con 33,33% porque el redondeo
  // los aplasta al mismo múltiplo; hay que elegir uno que separe las hipótesis.
  // Con costo 1600: 30% → 2080 → 2100, y 33,33% → 2133,28 → 2200.
  const conConfigurado = precioDesdeMargen({ costo: 1600, margenConfigurado: 30, redondeo100: true });
  const conEfectivo = precioDesdeMargen({ costo: 1600, margenConfigurado: 33.33, redondeo100: true });
  assert.equal(conConfigurado.precioFinal, 2100);
  assert.equal(conEfectivo.precioFinal, 2200);
  assert.notEqual(conConfigurado.precioFinal, conEfectivo.precioFinal);
});

// ── 4. Sin redondeo ──────────────────────────────────────────────────────────

test("4. sin redondeo: final = base y efectivo = configurado", () => {
  const r = precioDesdeMargen({ costo: 1050, margenConfigurado: 30, redondeo100: false });
  assert.equal(r.precioFinal, r.precioBase);
  cerca(r.margenEfectivo, 30, 1e-9);
  assert.equal(r.margenConfigurado, 30);
});

test("4b. sin redondeo, con margen de decimales feos", () => {
  const r = precioDesdeMargen({ costo: 733.33, margenConfigurado: 17.5, redondeo100: false });
  cerca(r.margenEfectivo, 17.5, 1e-9);
});

// ── 5. Precio ya múltiplo de 100 ─────────────────────────────────────────────

test("5. precio ya múltiplo de 100 no sube otros 100", () => {
  // 1000 × 1,4 = 1400 exacto.
  const r = precioDesdeMargen({ costo: 1000, margenConfigurado: 40, redondeo100: true });
  assert.equal(r.precioBase, 1400);
  assert.equal(r.precioFinal, 1400);
  cerca(r.margenEfectivo, 40, 1e-9);
});

test("5b. el residuo binario no empuja al siguiente múltiplo", () => {
  // 1050 × 1,3 da 1365,0000000000002 en punto flotante; el caso peligroso es un
  // producto exacto que quede apenas por encima del múltiplo.
  assert.equal(redondearA100Arriba(1400.0000000000002), 1400);
  assert.equal(redondearA100Arriba(700 * 1.0), 700);
  assert.equal(redondearA100Arriba(0.29 * 100 * 100), 2900);
});

test("5c. redondear dos veces es idempotente", () => {
  const a = redondearA100Arriba(1365);
  assert.equal(redondearA100Arriba(a), a);
  assert.equal(a, 1400);
});

// ── 6. Costo cero ────────────────────────────────────────────────────────────

test("6. costo 0: sin división por cero, margen efectivo null", () => {
  const r = precioDesdeMargen({ costo: 0, margenConfigurado: 30, redondeo100: true });
  assert.equal(r.aplica, true);
  assert.equal(r.precioBase, 0);
  assert.equal(r.margenEfectivo, null);
  assert.equal(r.margenConfigurado, 30);
  assert.ok(Number.isFinite(r.precioFinal));
});

test("6b. margenEfectivoDe con costo 0 o inválido devuelve null", () => {
  assert.equal(margenEfectivoDe(0, 1400), null);
  assert.equal(margenEfectivoDe(-5, 1400), null);
  assert.equal(margenEfectivoDe(null, 1400), null);
  assert.equal(margenEfectivoDe(1050, NaN), null);
});

// ── 7. Margen negativo ───────────────────────────────────────────────────────

test("7. margen negativo: se conserva y produce venta < costo", () => {
  const r = precioDesdeMargen({ costo: 1000, margenConfigurado: -20, redondeo100: false });
  assert.equal(r.aplica, true);
  assert.equal(r.margenConfigurado, -20);
  cerca(r.precioBase, 800);
  assert.equal(r.precioFinal, 800);
  cerca(r.margenEfectivo, -20, 1e-9);
});

test("7b. margen negativo NO es regla automática (el servidor no recalcula)", () => {
  assert.equal(hayReglaAutomatica(-20), false);
  assert.equal(hayReglaAutomatica(0), false);
  assert.equal(hayReglaAutomatica(30), true);
  assert.equal(hayReglaAutomatica(null), false);
  assert.equal(hayReglaAutomatica(undefined), false);
  assert.equal(hayReglaAutomatica("30"), true); // Decimal de Prisma llega como string
});

// ── 8. Margen nulo ───────────────────────────────────────────────────────────

test("8. margen null: no corresponde recalcular, sin precio calculado", () => {
  const r = precioDesdeMargen({ costo: 1050, margenConfigurado: null, redondeo100: true });
  assert.equal(r.aplica, false);
  assert.equal(r.precioFinal, null);
  assert.equal(r.precioBase, null);
  assert.equal(r.margenConfigurado, null);
});

test("8b. margen null NO se lee como 0 (eso daría venta = costo)", () => {
  const nulo = precioDesdeMargen({ costo: 1050, margenConfigurado: null, redondeo100: false });
  const cero = precioDesdeMargen({ costo: 1050, margenConfigurado: 0, redondeo100: false });
  assert.equal(nulo.precioFinal, null);
  assert.equal(cero.precioFinal, 1050); // margen 0 SÍ es un margen: venta = costo
  assert.notEqual(nulo.aplica, cero.aplica);
});

test("8c. undefined, cadena vacía y no-numérico se comportan como null", () => {
  for (const v of [undefined, "", "abc", NaN]) {
    const r = precioDesdeMargen({ costo: 1050, margenConfigurado: v, redondeo100: true });
    assert.equal(r.aplica, false, `valor ${String(v)}`);
    assert.equal(r.margenConfigurado, null, `valor ${String(v)}`);
  }
});

test("8d. costo inválido tampoco recalcula", () => {
  for (const c of [null, undefined, "abc", NaN, -1]) {
    const r = precioDesdeMargen({ costo: c, margenConfigurado: 30, redondeo100: true });
    assert.equal(r.aplica, false, `costo ${String(c)}`);
    assert.equal(r.precioFinal, null, `costo ${String(c)}`);
  }
});

test("8e. sin argumentos no explota", () => {
  const r = precioDesdeMargen();
  assert.equal(r.aplica, false);
});

// ── 9. Decimal de Prisma ─────────────────────────────────────────────────────

test("9. acepta strings (Decimal serializado) sin perder el configurado", () => {
  const r = precioDesdeMargen({ costo: "1050.00", margenConfigurado: "30.00", redondeo100: true });
  assert.equal(r.aplica, true);
  assert.equal(r.precioFinal, 1400);
  assert.equal(r.margenConfigurado, 30);
});

// ── 10. El redondeo nunca baja el precio ─────────────────────────────────────

test("10. con redondeo, el efectivo es siempre >= el configurado", () => {
  for (let costo = 100; costo <= 5000; costo += 137) {
    for (const margen of [5, 12.5, 30, 47, 80]) {
      const r = precioDesdeMargen({ costo, margenConfigurado: margen, redondeo100: true });
      assert.ok(
        r.precioFinal >= r.precioBase - 1e-9,
        `costo ${costo} margen ${margen}: el redondeo bajó el precio`
      );
      assert.ok(
        r.margenEfectivo >= margen - 1e-9,
        `costo ${costo} margen ${margen}: efectivo ${r.margenEfectivo} < configurado`
      );
      assert.equal(r.margenConfigurado, margen);
    }
  }
});
