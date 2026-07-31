// El fix del margen se validó sobre todo con 30%, que es el caso que se
// reportó. Estas pruebas confirman que la implementación es GENÉRICA: el 30 es
// un dato de prueba más, no un supuesto del cálculo.
//
// Se recorren cinco márgenes (20, 30, 40, 50 y 75) con costos que obligan a
// redondear, y para cada uno se verifica que:
//   · el margen efectivo puede quedar por encima del configurado;
//   · `margenConfigurado` sale idéntico al que entró;
//   · al cambiar el costo varias veces cada precio vuelve a salir del margen
//     configurado ORIGINAL y nunca del efectivo anterior.
//
// Se cubren además las tres formas en que un producto obtiene su margen:
// base propia, override del local, y local con `margen = null` que hereda.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { precioDesdeMargen, hayReglaAutomatica } from "./precioDesdeMargen.js";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const cerca = (a, b, tol = 0.01) =>
  assert.ok(Math.abs(a - b) <= tol, `esperaba ~${b}, obtuve ${a}`);

// Costo base común: 1050 obliga a redondear con los cinco márgenes.
// Secuencia de costos para simular actualizaciones sucesivas (compras, depósito).
const COSTOS = [1050, 1200, 1400, 1650];

// Tabla esperada, calculada a mano. Si alguien cambia la fórmula, esto falla.
//   precioBase  = costo × (1 + margen/100)
//   precioFinal = ceil(precioBase / 100) × 100
const CASOS = [
  {
    margen: 20,
    primerCosto: { base: 1260, final: 1300, efectivo: 23.81 },
    finales: [1300, 1500, 1700, 2000],
  },
  {
    margen: 30,
    primerCosto: { base: 1365, final: 1400, efectivo: 33.33 },
    finales: [1400, 1600, 1900, 2200],
  },
  {
    margen: 40,
    primerCosto: { base: 1470, final: 1500, efectivo: 42.86 },
    finales: [1500, 1700, 2000, 2400],
  },
  {
    margen: 50,
    primerCosto: { base: 1575, final: 1600, efectivo: 52.38 },
    finales: [1600, 1800, 2100, 2500],
  },
  {
    margen: 75,
    primerCosto: { base: 1837.5, final: 1900, efectivo: 80.95 },
    finales: [1900, 2100, 2500, 2900],
  },
];

// ── 1. Cada margen, con un costo que obliga a redondear ─────────────────────

for (const { margen, primerCosto } of CASOS) {
  test(`1. margen ${margen}%: costo 1050 → base ${primerCosto.base}, final ${primerCosto.final}`, () => {
    const r = precioDesdeMargen({ costo: 1050, margenConfigurado: margen, redondeo100: true });

    cerca(r.precioBase, primerCosto.base);
    assert.equal(r.precioFinal, primerCosto.final);

    // El redondeo efectivamente movió el precio: si no, el caso no probaría nada.
    assert.notEqual(r.precioFinal, r.precioBase, `margen ${margen} no forzó redondeo`);

    // El efectivo queda POR ENCIMA del configurado…
    cerca(r.margenEfectivo, primerCosto.efectivo);
    assert.ok(r.margenEfectivo > margen, `efectivo ${r.margenEfectivo} no supera a ${margen}`);

    // …y el configurado sale idéntico al que entró.
    assert.equal(r.margenConfigurado, margen);
  });
}

// ── 2. Varios cambios de costo: siempre desde el margen configurado ─────────

for (const { margen, finales } of CASOS) {
  test(`2. margen ${margen}%: ${COSTOS.length} cambios de costo parten siempre de ${margen}`, () => {
    const obtenidos = COSTOS.map((costo) => {
      const r = precioDesdeMargen({ costo, margenConfigurado: margen, redondeo100: true });
      // El configurado no se mueve en NINGUNA de las iteraciones.
      assert.equal(r.margenConfigurado, margen, `costo ${costo}`);
      return r.precioFinal;
    });
    assert.deepEqual(obtenidos, finales);
  });
}

// ── 3. Nunca parte del margen efectivo anterior ─────────────────────────────

for (const { margen, finales } of CASOS) {
  test(`3. margen ${margen}%: realimentar el efectivo daría precios más altos`, () => {
    // Simulación del defecto: el efectivo de cada vuelta se usa como configurado
    // de la siguiente (lo que hacía el formulario al persistirlo).
    let realimentado = margen;
    const conTrinquete = COSTOS.map((costo) => {
      const r = precioDesdeMargen({ costo, margenConfigurado: realimentado, redondeo100: true });
      realimentado = r.margenEfectivo;
      return r.precioFinal;
    });

    // El trinquete nunca da un precio MENOR…
    for (let i = 0; i < finales.length; i++) {
      assert.ok(
        conTrinquete[i] >= finales[i],
        `margen ${margen}, costo ${COSTOS[i]}: trinquete ${conTrinquete[i]} < anclado ${finales[i]}`
      );
    }
    // …y en algún punto da uno MAYOR: es la deformación que el fix elimina.
    assert.ok(
      conTrinquete.some((p, i) => p > finales[i]),
      `margen ${margen}: la simulación del trinquete no se separó del anclado`
    );
    // El margen realimentado terminó por encima del configurado original.
    assert.ok(realimentado > margen, `margen ${margen}: el realimentado no escaló`);
  });
}

// ── 4. Anclaje: el resultado no depende del historial ───────────────────────

test("4. el precio depende solo de (costo, margen configurado), no del orden", () => {
  for (const { margen } of CASOS) {
    const ascendente = COSTOS.map(
      (c) => precioDesdeMargen({ costo: c, margenConfigurado: margen, redondeo100: true }).precioFinal
    );
    const descendente = [...COSTOS]
      .reverse()
      .map((c) => precioDesdeMargen({ costo: c, margenConfigurado: margen, redondeo100: true }).precioFinal)
      .reverse();
    assert.deepEqual(ascendente, descendente, `margen ${margen}`);
  }
});

test("4b. volver al costo original devuelve el precio original", () => {
  for (const { margen, finales } of CASOS) {
    for (const costo of COSTOS) {
      precioDesdeMargen({ costo, margenConfigurado: margen, redondeo100: true });
    }
    const vuelta = precioDesdeMargen({ costo: COSTOS[0], margenConfigurado: margen, redondeo100: true });
    assert.equal(vuelta.precioFinal, finales[0], `margen ${margen}`);
    assert.equal(vuelta.margenConfigurado, margen);
  }
});

// ── 5. De dónde sale el margen: base, override y herencia ───────────────────
//
// La resolución vive inline en los dos consumidores que escriben precios:
//   costoMaestro.actualizarCostoRealProducto → pl.margen != null ? pl.margen : base.margen
//   syncFromBaseToLocales                    → local.margen != null ? local.margen : base.margen
// Acá se prueba la REGLA; más abajo, pruebas estructurales confirman que los dos
// consumidores usan exactamente esa expresión y le pasan el resultado al helper.

const resolverMargen = (margenLocal, margenBase) =>
  margenLocal !== null && margenLocal !== undefined ? margenLocal : margenBase;

test("5. ProductoBase con margen propio: el depósito calcula con ese margen", () => {
  const margenBase = 40;
  const r = precioDesdeMargen({
    costo: 1050,
    margenConfigurado: resolverMargen(null, margenBase),
    redondeo100: true,
  });
  assert.equal(r.margenConfigurado, 40);
  assert.equal(r.precioFinal, 1500);
});

test("5b. ProductoLocal con override distinto: gana el del local", () => {
  const margenBase = 40;
  const margenLocal = 20;
  const enBase = precioDesdeMargen({
    costo: 1050,
    margenConfigurado: resolverMargen(null, margenBase),
    redondeo100: true,
  });
  const enLocal = precioDesdeMargen({
    costo: 1050,
    margenConfigurado: resolverMargen(margenLocal, margenBase),
    redondeo100: true,
  });

  assert.equal(enBase.margenConfigurado, 40);
  assert.equal(enBase.precioFinal, 1500);
  assert.equal(enLocal.margenConfigurado, 20);
  assert.equal(enLocal.precioFinal, 1300);
  assert.notEqual(enBase.precioFinal, enLocal.precioFinal);
});

test("5c. ProductoLocal con margen null: hereda el de la base", () => {
  const margenBase = 75;
  const r = precioDesdeMargen({
    costo: 1050,
    margenConfigurado: resolverMargen(null, margenBase),
    redondeo100: true,
  });
  assert.equal(r.margenConfigurado, 75);
  assert.equal(r.precioFinal, 1900);
});

test("5d. override 0 o negativo NO se considera regla automática, pero tampoco hereda", () => {
  // `margen = 0` en el local es un valor presente: gana sobre la base. Y como no
  // es regla automática, el consumidor no recalcula (deja el precio manual).
  assert.equal(resolverMargen(0, 40), 0);
  assert.equal(hayReglaAutomatica(resolverMargen(0, 40)), false);
  // `null` sí hereda, y ahí la base sí manda.
  assert.equal(resolverMargen(null, 40), 40);
  assert.equal(hayReglaAutomatica(resolverMargen(null, 40)), true);
});

test("5e. base sin margen y local sin override: no hay regla automática", () => {
  const resuelto = resolverMargen(null, null);
  assert.equal(resuelto, null);
  assert.equal(hayReglaAutomatica(resuelto), false);
  const r = precioDesdeMargen({ costo: 1050, margenConfigurado: resuelto, redondeo100: true });
  assert.equal(r.aplica, false);
  assert.equal(r.precioFinal, null);
});

test("5f. cada margen resuelto recorre los cambios de costo con su propio ancla", () => {
  // Dos productos que comparten costos pero no margen: sus precios no convergen
  // y ninguno arrastra el margen del otro.
  const conOverride = COSTOS.map(
    (c) => precioDesdeMargen({ costo: c, margenConfigurado: resolverMargen(20, 50), redondeo100: true }).precioFinal
  );
  const heredado = COSTOS.map(
    (c) => precioDesdeMargen({ costo: c, margenConfigurado: resolverMargen(null, 50), redondeo100: true }).precioFinal
  );
  assert.deepEqual(conOverride, [1300, 1500, 1700, 2000]);
  assert.deepEqual(heredado, [1600, 1800, 2100, 2500]);
});

// ── 6. Estructural: el 30 no vive en la lógica productiva ───────────────────

function leerSinComentarios(rel) {
  return fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const PRODUCTIVOS = [
  "lib/precios/precioDesdeMargen.js",
  "lib/compras-proveedor/costoMaestro.js",
  "app/api/productos/editar/[id]/route.js",
  "app/api/productos/precios/preview/route.js",
];

test("6. ningún margen hardcodeado (30 / 0.30 / 1.30) en la lógica productiva", () => {
  const ofensores = [];
  for (const rel of PRODUCTIVOS) {
    const src = leerSinComentarios(rel);
    // Literales de margen: 30 suelto, o los factores 0.30 / 1.30.
    if (/(^|[^\w.])(0\.30|1\.30)([^\w]|$)/.test(src)) ofensores.push(`${rel}: factor 0.30/1.30`);
    if (/margen\w*\s*[=:]\s*30\b/i.test(src)) ofensores.push(`${rel}: margen = 30`);
    if (/\(\s*1\s*\+\s*30\s*\/\s*100\s*\)/.test(src)) ofensores.push(`${rel}: (1 + 30/100)`);
  }
  assert.deepEqual(ofensores, [], ofensores.join(" | "));
});

test("6b. el helper no tiene ningún valor de margen por defecto", () => {
  const src = leerSinComentarios("lib/precios/precioDesdeMargen.js");
  // `redondeo100 = false` es el único default admitido en la firma.
  const defaults = [...src.matchAll(/margenConfigurado\s*=\s*([^,)\s]+)/g)].map((m) => m[1]);
  assert.deepEqual(defaults, [], `el helper define un margen por defecto: ${defaults.join(", ")}`);
});

test("6c. el margen llega SIEMPRE desde el producto, no desde una constante", () => {
  // costoMaestro: override del local con fallback a la base, y eso es lo que se
  // le pasa al helper.
  const costoMaestro = leerSinComentarios("lib/compras-proveedor/costoMaestro.js");
  assert.ok(
    /pl\.margen\s*!=\s*null\s*\?\s*pl\.margen\s*:\s*base\.margen/.test(costoMaestro),
    "costoMaestro ya no resuelve override → base"
  );
  assert.ok(
    /margenConfigurado:\s*margenRaw/.test(costoMaestro),
    "costoMaestro no le pasa el margen del producto al helper"
  );

  // syncFromBaseToLocales: misma resolución, mismo pase al helper.
  const editar = leerSinComentarios("app/api/productos/editar/[id]/route.js");
  assert.ok(
    /local\.margen\s*!==\s*null[\s\S]{0,80}\?\s*local\.margen\s*:\s*base\.margen/.test(editar),
    "syncFromBaseToLocales ya no resuelve override → base"
  );
  assert.ok(
    /precioDesdeMargen\(\{[\s\S]{0,120}margenConfigurado,/.test(editar),
    "syncFromBaseToLocales no le pasa el margen resuelto al helper"
  );

  // preview: el margen sale de la fila del producto (p.margen).
  const preview = leerSinComentarios("app/api/productos/precios/preview/route.js");
  assert.ok(
    /margenConfigurado:\s*hayReglaAutomatica\(p\.margen\)\s*\?\s*p\.margen\s*:\s*null/.test(preview),
    "preview no toma el margen de la fila del producto"
  );
});

test("6d. el margen efectivo no se reutiliza como entrada en producción", () => {
  for (const rel of [...PRODUCTIVOS, "components/productos/FormProducto.jsx"]) {
    const src = leerSinComentarios(rel);
    // Nadie debe alimentar margenConfigurado con un margen efectivo.
    assert.ok(
      !/margenConfigurado:\s*\w*[Ee]fectivo/.test(src),
      `${rel} alimenta el configurado con el efectivo`
    );
    // Ni escribir el campo `margen` a partir del efectivo.
    assert.ok(
      !/\bmargen\s*[:=]\s*\w*[Ee]fectivo/.test(src),
      `${rel} persiste el margen efectivo`
    );
  }
});
