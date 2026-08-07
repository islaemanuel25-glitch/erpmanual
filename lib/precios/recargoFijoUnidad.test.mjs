// Regla RECARGO FIJO POR UNIDAD: pesos sobre el costo unitario, no un porcentaje.
//
// Lo que se protege acá:
//   · el caso del pedido: bulto 100.000, factor 10, recargo 100 → venta 101.000;
//   · que al subir el costo el recargo GUARDADO no se mueva (el efectivo puede
//     crecer por el redondeo, pero eso no se persiste);
//   · que el redondeo se aplique al UNITARIO y recién después se multiplique;
//   · que una edición manual del precio sí recalcule el recargo.

import test from "node:test";
import assert from "node:assert/strict";
import {
  precioDesdeRecargoUnidad,
  recargoDesdePrecio,
  costoUnitarioDesde,
  factorDeUnidad,
  tienePack,
} from "./recargoFijoUnidad.js";

// ── Costo unitario: la misma cuenta que muestra la ficha ────────────────────

test("costo unitario de un pack es el costo dividido el factor", () => {
  assert.equal(costoUnitarioDesde(100000, "pack", 10), 10000);
  assert.equal(costoUnitarioDesde(36420, "pack", 10), 3642);
  assert.equal(costoUnitarioDesde(11601.86, "pack", 450), 25.78);
});

test("sin pack, el costo unitario es el costo", () => {
  assert.equal(costoUnitarioDesde(5000, "unidad", 1), 5000);
  assert.equal(costoUnitarioDesde(5000, "unidad", null), 5000);
  assert.equal(costoUnitarioDesde(5000, "kg", 12), 5000, "kg no es bulto");
  assert.equal(factorDeUnidad("unidad", 10), 1);
  assert.equal(tienePack("pack", 1), false, "factor 1 no es bulto");
});

// ── El caso del pedido ──────────────────────────────────────────────────────

test("caso base: bulto 100.000, factor 10, recargo 100 → unitario 10.100", () => {
  const r = precioDesdeRecargoUnidad({
    costo: 100000, recargoFijoUnidad: 100, unidadMedida: "pack", factorPack: 10,
  });
  assert.equal(r.aplica, true);
  assert.equal(r.costoUnitario, 10000);
  assert.equal(r.unitarioFinal, 10100);
  assert.equal(r.precioVenta, 101000, "se guarda en escala de bulto");
  assert.equal(r.recargoConfigurado, 100, "entra y sale idéntico");
});

test("sube el costo a 150.000: el recargo sigue siendo 100 y el unitario da 15.100", () => {
  const r = precioDesdeRecargoUnidad({
    costo: 150000, recargoFijoUnidad: 100, unidadMedida: "pack", factorPack: 10,
  });
  assert.equal(r.costoUnitario, 15000);
  assert.equal(r.unitarioFinal, 15100);
  assert.equal(r.precioVenta, 151000);
  assert.equal(r.recargoConfigurado, 100, "el recargo NO se reconstruye");
});

test("otro local con recargo 200 sobre el mismo costo → 15.200, independiente", () => {
  const a = precioDesdeRecargoUnidad({ costo: 150000, recargoFijoUnidad: 100, unidadMedida: "pack", factorPack: 10 });
  const b = precioDesdeRecargoUnidad({ costo: 150000, recargoFijoUnidad: 200, unidadMedida: "pack", factorPack: 10 });
  assert.equal(a.unitarioFinal, 15100);
  assert.equal(b.unitarioFinal, 15200);
  assert.equal(b.precioVenta, 152000);
  assert.equal(a.recargoConfigurado, 100, "el cálculo de B no toca a A");
});

// ── Redondeo: se aplica al UNITARIO ─────────────────────────────────────────

test("con redondeo, sube el unitario y recién después multiplica", () => {
  // 36.420 / 10 = 3.642 + 100 = 3.742 → 3.800 → × 10 = 38.000
  const r = precioDesdeRecargoUnidad({
    costo: 36420, recargoFijoUnidad: 100, unidadMedida: "pack", factorPack: 10, redondeo100: true,
  });
  assert.equal(r.unitarioBase, 3742);
  assert.equal(r.unitarioFinal, 3800);
  assert.equal(r.precioVenta, 38000);
  assert.equal(r.recargoConfigurado, 100, "el redondeo no infla el recargo guardado");
  assert.equal(r.recargoEfectivo, 158, "el efectivo es mayor, pero es solo informativo");
});

test("sin redondeo el unitario queda exacto", () => {
  const r = precioDesdeRecargoUnidad({
    costo: 36420, recargoFijoUnidad: 100, unidadMedida: "pack", factorPack: 10, redondeo100: false,
  });
  assert.equal(r.unitarioFinal, 3742);
  assert.equal(r.precioVenta, 37420);
});

test("un valor ya redondo no se mueve", () => {
  const r = precioDesdeRecargoUnidad({
    costo: 100000, recargoFijoUnidad: 100, unidadMedida: "pack", factorPack: 10, redondeo100: true,
  });
  assert.equal(r.unitarioFinal, 10100, "10.100 ya es múltiplo de 100");
  assert.equal(r.precioVenta, 101000);
});

// ── Estabilidad: repetir el cálculo no deforma nada ─────────────────────────

test("cambios sucesivos de costo siempre parten del recargo configurado", () => {
  const costos = [100000, 120000, 145000, 98000];
  const esperados = [10100, 12100, 14600, 9900];
  costos.forEach((c, i) => {
    const r = precioDesdeRecargoUnidad({
      costo: c, recargoFijoUnidad: 100, unidadMedida: "pack", factorPack: 10, redondeo100: true,
    });
    assert.equal(r.recargoConfigurado, 100, `costo ${c}`);
    assert.equal(r.unitarioFinal, esperados[i], `costo ${c}`);
  });
});

test("realimentar el recargo efectivo daría precios más altos: por eso no se persiste", () => {
  let recargo = 100;
  const anclado = [];
  const trinquete = [];
  for (const c of [36420, 41000, 47000]) {
    anclado.push(precioDesdeRecargoUnidad({ costo: c, recargoFijoUnidad: 100, unidadMedida: "pack", factorPack: 10, redondeo100: true }).unitarioFinal);
    const r = precioDesdeRecargoUnidad({ costo: c, recargoFijoUnidad: recargo, unidadMedida: "pack", factorPack: 10, redondeo100: true });
    recargo = r.recargoEfectivo;
    trinquete.push(r.unitarioFinal);
  }
  assert.ok(recargo > 100, "el efectivo realimentado escala");
  assert.ok(trinquete.some((p, i) => p > anclado[i]), "y produciría precios más altos");
});

// ── Edición manual del precio: el único camino que cambia el recargo ────────

test("un precio escrito a mano define el recargo", () => {
  // 38.000 de bulto → 3.800 la unidad, sobre un costo unitario de 3.642 → 158.
  const r = recargoDesdePrecio({ precioVenta: 38000, costo: 36420, unidadMedida: "pack", factorPack: 10 });
  assert.equal(r, 158);
});

test("sin pack, el recargo manual es la diferencia directa", () => {
  assert.equal(recargoDesdePrecio({ precioVenta: 5300, costo: 5000, unidadMedida: "unidad", factorPack: 1 }), 300);
});

test("ida y vuelta: recargo → precio → recargo devuelve el mismo monto sin redondeo", () => {
  const p = precioDesdeRecargoUnidad({ costo: 100000, recargoFijoUnidad: 250, unidadMedida: "pack", factorPack: 10 });
  const r = recargoDesdePrecio({ precioVenta: p.precioVenta, costo: 100000, unidadMedida: "pack", factorPack: 10 });
  assert.equal(r, 250);
});

// ── Bordes ──────────────────────────────────────────────────────────────────

test("recargo 0 es válido: vender al costo", () => {
  const r = precioDesdeRecargoUnidad({ costo: 100000, recargoFijoUnidad: 0, unidadMedida: "pack", factorPack: 10 });
  assert.equal(r.aplica, true);
  assert.equal(r.precioVenta, 100000);
});

test("sin recargo configurado no hay regla y no se calcula nada", () => {
  for (const v of [null, undefined, ""]) {
    const r = precioDesdeRecargoUnidad({ costo: 100000, recargoFijoUnidad: v, unidadMedida: "pack", factorPack: 10 });
    assert.equal(r.aplica, false, `recargo ${JSON.stringify(v)}`);
    assert.equal(r.precioVenta, null);
  }
});

test("costo inválido no produce precio", () => {
  const r = precioDesdeRecargoUnidad({ costo: null, recargoFijoUnidad: 100, unidadMedida: "pack", factorPack: 10 });
  assert.equal(r.aplica, false);
});
