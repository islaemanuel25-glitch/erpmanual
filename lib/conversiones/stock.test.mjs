// Candados de las conversiones de stock.
//
// No existía ninguno: `fromUnidades`, `esFiambreFijo` y el formateo de stock
// estaban sin cobertura, y por eso los dos defectos de presentación vivieron
// meses sin que nada los marcara. Los valores que se usan acá NO son inventados:
// salen de medir erpazul_al, incluidos los negativos grandes de Mogul.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  fromUnidades,
  toUnidades,
  esFiambreFijo,
  esFiambreFijoEnUbicacion,
  esProductoFiambre,
} from "./stock.js";

// ── fromUnidades: la basura de coma flotante ───────────────────────────────

test("NO fabrica basura de coma flotante en las sueltas", () => {
  // El caso exacto que se veía en pantalla: 18.35 con pack 10 salía como
  // "1 bulto + 8.350000000000001 sueltas". El módulo arrastra el error binario.
  const r = fromUnidades({ unidades: 18.35, factorPack: 10 });
  assert.equal(r.bultos, 1);
  assert.equal(r.sueltas, 8.35, "tiene que ser 8.35 exacto, no 8.350000000000001");
});

test("valores REALES de erpazul_al, sin un solo dígito de más", () => {
  const casos = [
    { unidades: 18.35, factorPack: 10, bultos: 1, sueltas: 8.35 },
    { unidades: 10.8, factorPack: 10, bultos: 1, sueltas: 0.8 },
    { unidades: 9.65, factorPack: 10, bultos: 0, sueltas: 9.65 },
    { unidades: 11.5, factorPack: 12, bultos: 0, sueltas: 11.5 },
    { unidades: 10.01, factorPack: 12, bultos: 0, sueltas: 10.01 },
    { unidades: 4.375, factorPack: 12, bultos: 0, sueltas: 4.375 },
    { unidades: 0.375, factorPack: 12, bultos: 0, sueltas: 0.375 },
  ];
  for (const c of casos) {
    const r = fromUnidades({ unidades: c.unidades, factorPack: c.factorPack });
    assert.equal(r.bultos, c.bultos, `${c.unidades}/${c.factorPack} bultos`);
    assert.equal(r.sueltas, c.sueltas, `${c.unidades}/${c.factorPack} sueltas`);
    // Y que no se haya colado un dígito más allá de la escala física.
    assert.equal(String(r.sueltas), String(Math.round(r.sueltas * 1000) / 1000));
  }
});

// ── fromUnidades: el signo ─────────────────────────────────────────────────

test("EL NEGATIVO SE DESGLOSA IGUAL QUE EL POSITIVO, con el signo adelante", () => {
  // Los dos negativos grandes que hay hoy en el depósito.
  const mogulTwist = fromUnidades({ unidades: -551.5, factorPack: 185 });
  assert.equal(mogulTwist.bultos, -2);
  assert.equal(mogulTwist.sueltas, -181.5);

  const mogulTubito = fromUnidades({ unidades: -344.62, factorPack: 70 });
  assert.equal(mogulTubito.bultos, -4);
  assert.equal(mogulTubito.sueltas, -64.62);

  const dover = fromUnidades({ unidades: -1.05, factorPack: 10 });
  assert.equal(dover.bultos, 0);
  assert.equal(dover.sueltas, -1.05);
});

test("EL PAR RECONSTRUYE EL TOTAL, que antes no pasaba con negativos", () => {
  // Era el defecto de fondo: Math.floor redondea hacia abajo y % conserva el
  // signo del dividendo, así que no son operaciones compañeras. Con -13 y
  // factor 12 daba -2 bultos y -1 sueltas, que suman -25.
  for (const [unidades, factorPack] of [
    [-13, 12], [-5, 12], [-24, 12], [-551.5, 185], [-344.62, 70], [-3.5, 78],
    [30, 24], [18.35, 10], [0, 12], [-0.001, 12],
  ]) {
    const { bultos, sueltas } = fromUnidades({ unidades, factorPack });
    const reconstruido = Math.round((bultos * factorPack + sueltas) * 1000) / 1000;
    assert.equal(reconstruido, unidades, `${unidades} con factor ${factorPack}`);
  }
});

test("el signo de las dos partes es el mismo, nunca cruzado", () => {
  for (const [unidades, factorPack] of [[-551.5, 185], [-13, 12], [-1.05, 10]]) {
    const { bultos, sueltas } = fromUnidades({ unidades, factorPack });
    if (bultos !== 0 && sueltas !== 0) {
      assert.equal(Math.sign(bultos), Math.sign(sueltas), `${unidades}/${factorPack}`);
    }
  }
});

test("sin factor de pack, todo es sueltas y tampoco se ensucia", () => {
  assert.deepEqual(fromUnidades({ unidades: 11.55, factorPack: 1 }), {
    bultos: 0, sueltas: 11.55, totalUnidades: 11.55,
  });
});

test("el viaje de ida y vuelta: 1 caja + 6 sueltas de un pack de 24", () => {
  const total = toUnidades({ cantidad: 1, unidad: "BULTO", factorPack: 24 }) +
                toUnidades({ cantidad: 6, unidad: "UNIDAD", factorPack: 24 });
  assert.equal(total, 30);
  const v = fromUnidades({ unidades: total, factorPack: 24 });
  assert.equal(v.bultos, 1);
  assert.equal(v.sueltas, 6);
});

// ── El predicado, y la ubicación ───────────────────────────────────────────

const MORTADELA = {
  unidad_medida: "kg",
  modoCompraProveedor: "UNIDAD",
  pesoReferenciaKg: 4.5,
  modoVentaDeposito: "PIEZA",
  pesoEsFijo: true,
};

test("EN EL DEPÓSITO SE CUENTA EN PIEZAS; EN UN LOCAL, NO", () => {
  // La regla de negocio entera, en un candado. Es el arreglo de fondo: la
  // recepción preguntaba por el producto y no por dónde entraba el stock.
  assert.equal(esFiambreFijoEnUbicacion(MORTADELA, true), true, "depósito → piezas");
  assert.equal(esFiambreFijoEnUbicacion(MORTADELA, false), false, "local → kilos");
});

test("la ubicación tiene que venir explícita: nada de asumir depósito", () => {
  for (const v of [undefined, null, 0, "", "true", 1]) {
    assert.equal(esFiambreFijoEnUbicacion(MORTADELA, v), false, `esDeposito=${JSON.stringify(v)}`);
  }
});

test("en el depósito, un producto que no es fiambre tampoco se cuenta en piezas", () => {
  assert.equal(esFiambreFijoEnUbicacion({ ...MORTADELA, unidad_medida: "pack" }, true), false);
  assert.equal(esFiambreFijoEnUbicacion({ ...MORTADELA, modoCompraProveedor: "BULTO" }, true), false);
  assert.equal(esFiambreFijoEnUbicacion({ ...MORTADELA, pesoReferenciaKg: 0 }, true), false);
  assert.equal(esFiambreFijoEnUbicacion(null, true), false);
});

test("EL BORDE: modoVentaDeposito manda y pesoEsFijo es solo respaldo", () => {
  // El producto real de erpazul_al donde las dos definiciones diferían:
  // "Albondigas Caseras x Caja", con PESO y pesoEsFijo=true a la vez.
  const albondigas = { ...MORTADELA, modoVentaDeposito: "PESO", pesoEsFijo: true };
  assert.equal(esFiambreFijo(albondigas), false, "si dice PESO, es peso, aunque pesoEsFijo sea true");
  // El respaldo sigue valiendo cuando el campo nuevo no está cargado.
  const sinCampoNuevo = { ...MORTADELA, modoVentaDeposito: null, pesoEsFijo: true };
  assert.equal(esFiambreFijo(sinCampoNuevo), true, "sin modoVentaDeposito, decide pesoEsFijo");
});

test("esProductoFiambre exige las tres condiciones, no dos", () => {
  assert.equal(esProductoFiambre(MORTADELA), true);
  assert.equal(esProductoFiambre({ ...MORTADELA, unidad_medida: "unidad" }), false);
  assert.equal(esProductoFiambre({ ...MORTADELA, modoCompraProveedor: "BULTO" }), false);
  assert.equal(esProductoFiambre({ ...MORTADELA, pesoReferenciaKg: null }), false);
});
