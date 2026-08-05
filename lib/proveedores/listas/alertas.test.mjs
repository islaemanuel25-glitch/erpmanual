// Alertas de revisión: las señales que dirigen la atención antes de aplicar.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TIPO_ALERTA,
  gramajesDe,
  gramajeDiscrepa,
  presentacionDe,
  alertasDeFila,
  tieneAlerta,
} from "@/lib/proveedores/listas/alertas";

const fila = (extra = {}) => ({
  descripcionProveedor: "MERM. P.A. DURAZNO X 454g",
  factorErp: 12,
  variacionAlta: false,
  diferenciaPct: 5,
  ...extra,
});

const base = (extra = {}) => ({
  nombre: "ARCOR MERMELADA 454G DURAZNO",
  unidad_medida: "pack",
  factor_pack: 12,
  ...extra,
});

// ── Gramajes ────────────────────────────────────────────────────────────────

test("extrae los gramajes de un nombre comercial", () => {
  assert.deepEqual([...gramajesDe("MERM. P.A. DURAZNO X 454g")], ["454g"]);
  assert.deepEqual([...gramajesDe("ATUN AL NATURAL LC X300G")], ["300g"]);
  assert.deepEqual([...gramajesDe("Gaseosa 2L")], ["2000ml"]);
});

test("normaliza unidades equivalentes: medio kilo es 500 g", () => {
  assert.deepEqual([...gramajesDe("Producto 0,5 kg")], ["500g"]);
  assert.deepEqual([...gramajesDe("Producto 500 gr")], ["500g"]);
  assert.equal(gramajeDiscrepa("Producto 0,5kg", "Producto 500g"), false);
});

test("litros y mililitros comparan igual", () => {
  assert.equal(gramajeDiscrepa("Jugo 1L", "Jugo 1000ml"), false);
  assert.equal(gramajeDiscrepa("Jugo 1L", "Jugo 1000 cc"), false);
});

test("sin gramaje en alguno de los dos, no hay discrepancia", () => {
  // Falta de información no es contradicción. Alertar acá marcaría media lista.
  assert.equal(gramajeDiscrepa("PRODUCTO SIN PESO", "ARCOR ALGO 500G"), false);
  assert.equal(gramajeDiscrepa("ARCOR ALGO 500G", "PRODUCTO SIN PESO"), false);
  assert.equal(gramajeDiscrepa("", ""), false);
});

test("gramajes distintos discrepan", () => {
  assert.equal(gramajeDiscrepa("ATUN LC X300G", "LOMO ATUN AL NATURAL 170G"), true);
  assert.equal(gramajeDiscrepa("MERM X 454g", "MERMELADA 500G"), true);
});

test("si comparten alguno, no discrepan", () => {
  // Un nombre puede mencionar dos pesos: el del envase y el del contenido.
  assert.equal(gramajeDiscrepa("PACK 500G x 12 - 6kg", "ARCOR ALGO 500G"), false);
});

// ── Presentación ────────────────────────────────────────────────────────────

test("la presentación se lee del ERP", () => {
  assert.equal(presentacionDe({ unidadMedida: "pack", factorPack: 12 }), "pack de 12");
  assert.equal(presentacionDe({ unidadMedida: "cajon", factorPack: 8 }), "cajón de 8");
  assert.equal(presentacionDe({ unidadMedida: "unidad" }), "unidad");
  assert.equal(presentacionDe({ unidadMedida: "kg" }), "kg");
  assert.equal(presentacionDe({ unidadMedida: "pack", factorPack: null }), "pack sin factor");
  assert.equal(presentacionDe({}), "—");
});

// ── Alertas ─────────────────────────────────────────────────────────────────

test("una fila coherente no tiene alertas", () => {
  assert.deepEqual(alertasDeFila(fila(), base()), []);
  assert.equal(tieneAlerta(fila(), base()), false);
});

test("gramaje distinto genera alerta con los dos valores", () => {
  const a = alertasDeFila(fila(), base({ nombre: "ARCOR MERMELADA 500G DURAZNO" }));
  assert.equal(a.length, 1);
  assert.equal(a[0].tipo, TIPO_ALERTA.GRAMAJE);
  assert.match(a[0].detalle, /454g/);
  assert.match(a[0].detalle, /500g/);
});

test("el factor que cambió desde la conciliación genera alerta", () => {
  const a = alertasDeFila(fila(), base({ factor_pack: 24 }));
  assert.equal(a.length, 1);
  assert.equal(a[0].tipo, TIPO_ALERTA.FACTOR);
  assert.match(a[0].detalle, /12/);
  assert.match(a[0].detalle, /24/);
});

test("la variación alta genera alerta con su porcentaje", () => {
  const a = alertasDeFila(fila({ variacionAlta: true, diferenciaPct: 45.2 }), base());
  assert.equal(a[0].tipo, TIPO_ALERTA.VARIACION_ALTA);
  assert.equal(a[0].detalle, "+45.2 %");
});

test("la presentación que cambió genera alerta", () => {
  const f = fila({ presentacionConciliada: "pack de 12" });
  const a = alertasDeFila(f, base({ unidad_medida: "unidad", factor_pack: null }));
  const pres = a.find((x) => x.tipo === TIPO_ALERTA.PRESENTACION);
  assert.ok(pres);
  assert.equal(pres.detalle, "pack de 12 → unidad");
});

test("varias alertas conviven en la misma fila", () => {
  const a = alertasDeFila(
    fila({ variacionAlta: true, diferenciaPct: 60 }),
    base({ nombre: "ARCOR MERMELADA 500G DURAZNO", factor_pack: 6 })
  );
  const tipos = a.map((x) => x.tipo).sort();
  assert.deepEqual(tipos, ["FACTOR", "GRAMAJE", "VARIACION_ALTA"]);
});

test("sin producto, solo puede alertar la variación", () => {
  assert.deepEqual(alertasDeFila(fila(), null), []);
  const a = alertasDeFila(fila({ variacionAlta: true }), null);
  assert.equal(a.length, 1);
  assert.equal(a[0].tipo, TIPO_ALERTA.VARIACION_ALTA);
});

test("sin fila no revienta", () => {
  assert.deepEqual(alertasDeFila(null, base()), []);
  assert.equal(tieneAlerta(null, null), false);
});

test("el nombre parecido NO genera alerta", () => {
  // Decisión explícita: marcaba 50 de 86 filas y casi todas eran correctas.
  const a = alertasDeFila(
    fila({ descripcionProveedor: "SALSA BARBACOA LC x 250g" }),
    base({ nombre: "Salba barbacoa la campagnola 250gr" })
  );
  assert.deepEqual(a, []);
});
