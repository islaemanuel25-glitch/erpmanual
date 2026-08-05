// Clasificación de una línea de lista de proveedor.
//
// Lo que importa acá no es que cada estado exista, sino que cuando una línea
// tiene DOS problemas siempre gane el mismo, sin importar el orden en que se
// descubrieron. Sin eso, la misma lista clasifica distinto según por dónde entró.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ESTADO_LINEA,
  PRIORIDAD_ESTADO,
  ESTADOS_APLICABLES,
  esAplicable,
  esEstadoValido,
  estadoMasPrioritario,
  clasificarLinea,
  resumirEstados,
  bloqueoPorUnidad,
  MOTIVO_BLOQUEO,
} from "./estados.js";

// Los mismos productos que en calculoCosto.test.mjs, con la forma del ERP.
const KG = { unidad_medida: "kg", factor_pack: null, modoCompraProveedor: "BULTO" };
const FIAMBRE = { unidad_medida: "kg", factor_pack: null, modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 3 };
const PACK12 = { unidad_medida: "pack", factor_pack: 12, modoCompraProveedor: "BULTO" };
const UNIDAD_SUELTA = { unidad_medida: "unidad", factor_pack: null, modoCompraProveedor: "BULTO" };

/** Clasifica una línea sana de ese producto, con el bloqueo por unidad ya resuelto. */
const clasificarProducto = (base, extra = {}) =>
  clasificarLinea({
    error: null, duplicado: false, macheado: true, bloqueado: false,
    motivoBloqueo: bloqueoPorUnidad(base),
    factorDudoso: false, excluido: false,
    costoActual: 1000, costoNuevo: 1200,
    ...extra,
  });

/** Una línea sana: macheada, sin problemas, con un costo distinto al actual. */
const SANA = {
  error: null,
  duplicado: false,
  macheado: true,
  bloqueado: false,
  factorDudoso: false,
  excluido: false,
  costoActual: 1000,
  costoNuevo: 1200,
};

// ── Los ocho estados ────────────────────────────────────────────────────────

test("1. existen exactamente los ocho estados admitidos", () => {
  assert.deepEqual(Object.keys(ESTADO_LINEA).sort(), [
    "BLOQUEADO", "CODIGO_DUPLICADO", "ERROR", "EXCLUIDO",
    "FACTOR_DUDOSO", "LISTO_PARA_ACTUALIZAR", "NO_MACHEADO", "SIN_CAMBIOS",
  ]);
});

test("2. LISTO_PARA_ACTUALIZAR", () => {
  assert.equal(clasificarLinea(SANA), ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

test("3. SIN_CAMBIOS", () => {
  assert.equal(
    clasificarLinea({ ...SANA, costoActual: 1200, costoNuevo: 1200 }),
    ESTADO_LINEA.SIN_CAMBIOS
  );
});

test("4. NO_MACHEADO", () => {
  assert.equal(clasificarLinea({ ...SANA, macheado: false }), ESTADO_LINEA.NO_MACHEADO);
});

test("5. CODIGO_DUPLICADO", () => {
  assert.equal(clasificarLinea({ ...SANA, duplicado: true }), ESTADO_LINEA.CODIGO_DUPLICADO);
});

test("6. FACTOR_DUDOSO", () => {
  assert.equal(clasificarLinea({ ...SANA, factorDudoso: true }), ESTADO_LINEA.FACTOR_DUDOSO);
});

test("7. EXCLUIDO", () => {
  assert.equal(clasificarLinea({ ...SANA, excluido: true }), ESTADO_LINEA.EXCLUIDO);
});

test("8. BLOQUEADO", () => {
  assert.equal(clasificarLinea({ ...SANA, bloqueado: true }), ESTADO_LINEA.BLOQUEADO);
});

test("9. ERROR", () => {
  assert.equal(clasificarLinea({ ...SANA, error: "PRECIO_CERO" }), ESTADO_LINEA.ERROR);
  assert.equal(clasificarLinea({ ...SANA, error: true }), ESTADO_LINEA.ERROR);
});

// ── Unidad incompatible: la lista informa por unidad, el ERP guarda por kilo ──

test("9a. producto kg con lista por unidad → BLOQUEADO", () => {
  assert.equal(clasificarProducto(KG), ESTADO_LINEA.BLOQUEADO);
});

test("9b. fiambre comprado por unidad con costo maestro por kg → BLOQUEADO", () => {
  assert.equal(clasificarProducto(FIAMBRE), ESTADO_LINEA.BLOQUEADO);
});

test("9c. pack normal con precio unitario y factor válido → NO queda bloqueado", () => {
  assert.equal(clasificarProducto(PACK12), ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

test("9d. producto unidad normal → NO queda bloqueado", () => {
  assert.equal(clasificarProducto(UNIDAD_SUELTA), ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

test("9e. el motivo bloquea por sí solo, sin encender también la bandera", () => {
  // Quien arma la línea no tiene que acordarse de las dos cosas.
  const estado = clasificarLinea({
    ...SANA, bloqueado: false, motivoBloqueo: MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE,
  });
  assert.equal(estado, ESTADO_LINEA.BLOQUEADO);
});

test("9f. una fila kg NUNCA puede terminar en LISTO_PARA_ACTUALIZAR", () => {
  // Ni con costo distinto, ni excluida, ni con factor dudoso, ni combinándolo.
  for (const extra of [
    {},
    { costoActual: 100, costoNuevo: 999999 },
    { excluido: true },
    { factorDudoso: true },
    { costoActual: null },
  ]) {
    const estado = clasificarProducto(KG, extra);
    assert.notEqual(estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, JSON.stringify(extra));
    assert.equal(esAplicable(estado), false);
  }
});

test("9g. una fila kg con costo igual tampoco pasa a SIN_CAMBIOS: gana BLOQUEADO", () => {
  const estado = clasificarProducto(KG, { costoActual: 1200, costoNuevo: 1200 });
  assert.equal(estado, ESTADO_LINEA.BLOQUEADO);
});

test("9h. un motivo vacío no bloquea nada", () => {
  assert.equal(clasificarLinea({ ...SANA, motivoBloqueo: null }), ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
  assert.equal(clasificarLinea({ ...SANA, motivoBloqueo: "" }), ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

// ── La variación alta NO es un estado ───────────────────────────────────────

test("10. una variación alta conserva LISTO_PARA_ACTUALIZAR", () => {
  // Un aumento del 45 % sigue siendo aplicable: la bandera advierte, no bloquea.
  const estado = clasificarLinea({ ...SANA, costoActual: 1000, costoNuevo: 1450 });
  assert.equal(estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

test("11. la clasificación ni siquiera recibe la variación", () => {
  // Pasarla no cambia nada: no es un dato que la decisión mire.
  const conBandera = clasificarLinea({ ...SANA, variacionAlta: true });
  assert.equal(conBandera, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

// ── Prioridad determinista ──────────────────────────────────────────────────

test("12. la tabla de prioridad tiene el orden pedido", () => {
  assert.deepEqual(PRIORIDAD_ESTADO, [
    "ERROR", "CODIGO_DUPLICADO", "NO_MACHEADO", "BLOQUEADO",
    "FACTOR_DUDOSO", "EXCLUIDO", "SIN_CAMBIOS", "LISTO_PARA_ACTUALIZAR",
  ]);
});

test("13. ERROR gana sobre todo lo demás", () => {
  const estado = clasificarLinea({
    error: "X", duplicado: true, macheado: false, bloqueado: true,
    factorDudoso: true, excluido: true, costoActual: 1, costoNuevo: 1,
  });
  assert.equal(estado, ESTADO_LINEA.ERROR);
});

test("14. CODIGO_DUPLICADO gana sobre NO_MACHEADO y todo lo posterior", () => {
  const estado = clasificarLinea({
    ...SANA, duplicado: true, macheado: false, bloqueado: true,
    factorDudoso: true, excluido: true,
  });
  assert.equal(estado, ESTADO_LINEA.CODIGO_DUPLICADO);
});

test("15. NO_MACHEADO gana sobre BLOQUEADO, FACTOR_DUDOSO y EXCLUIDO", () => {
  const estado = clasificarLinea({
    ...SANA, macheado: false, bloqueado: true, factorDudoso: true, excluido: true,
  });
  assert.equal(estado, ESTADO_LINEA.NO_MACHEADO);
});

test("16. BLOQUEADO gana sobre FACTOR_DUDOSO", () => {
  // No poder escribir el costo es más grave que no poder calcularlo: aunque se
  // arreglara el factor, la línea seguiría sin poder aplicarse.
  const estado = clasificarLinea({ ...SANA, bloqueado: true, factorDudoso: true });
  assert.equal(estado, ESTADO_LINEA.BLOQUEADO);
});

test("17. FACTOR_DUDOSO gana sobre EXCLUIDO", () => {
  const estado = clasificarLinea({ ...SANA, factorDudoso: true, excluido: true });
  assert.equal(estado, ESTADO_LINEA.FACTOR_DUDOSO);
});

test("18. EXCLUIDO gana sobre SIN_CAMBIOS", () => {
  const estado = clasificarLinea({ ...SANA, excluido: true, costoActual: 1200, costoNuevo: 1200 });
  assert.equal(estado, ESTADO_LINEA.EXCLUIDO);
});

test("19. SIN_CAMBIOS gana sobre LISTO_PARA_ACTUALIZAR", () => {
  // Es el único par que no compite: si los costos son iguales no hay nada listo.
  assert.equal(
    PRIORIDAD_ESTADO.indexOf(ESTADO_LINEA.SIN_CAMBIOS) <
      PRIORIDAD_ESTADO.indexOf(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR),
    true
  );
});

test("20. la clasificación es determinista: el mismo insumo, el mismo estado", () => {
  const entrada = { ...SANA, duplicado: true, factorDudoso: true, excluido: true };
  const corridas = Array.from({ length: 20 }, () => clasificarLinea(entrada));
  assert.equal(new Set(corridas).size, 1);
  assert.equal(corridas[0], ESTADO_LINEA.CODIGO_DUPLICADO);
});

test("21. cada estado de la tabla es alcanzable por clasificarLinea", () => {
  const casos = {
    ERROR: { ...SANA, error: "X" },
    CODIGO_DUPLICADO: { ...SANA, duplicado: true },
    NO_MACHEADO: { ...SANA, macheado: false },
    BLOQUEADO: { ...SANA, bloqueado: true },
    FACTOR_DUDOSO: { ...SANA, factorDudoso: true },
    EXCLUIDO: { ...SANA, excluido: true },
    SIN_CAMBIOS: { ...SANA, costoNuevo: 1000 },
    LISTO_PARA_ACTUALIZAR: SANA,
  };
  for (const estado of PRIORIDAD_ESTADO) {
    assert.equal(clasificarLinea(casos[estado]), estado, `no se alcanza ${estado}`);
  }
});

// ── Igualdad monetaria ──────────────────────────────────────────────────────

test("22. una diferencia de milésimas es SIN_CAMBIOS", () => {
  const estado = clasificarLinea({ ...SANA, costoActual: 12600, costoNuevo: 12600.004 });
  assert.equal(estado, ESTADO_LINEA.SIN_CAMBIOS);
});

test("23. un centavo de diferencia SÍ es un cambio", () => {
  const estado = clasificarLinea({ ...SANA, costoActual: 12600, costoNuevo: 12600.01 });
  assert.equal(estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

test("24. costo actual nulo con costo nuevo válido: hay algo que aplicar", () => {
  const estado = clasificarLinea({ ...SANA, costoActual: null, costoNuevo: 1200 });
  assert.equal(estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

test("25. sin costo nuevo y sin error declarado, la línea es ERROR", () => {
  // Llegar hasta acá sin costo significa que el cálculo falló en silencio. No se
  // propone un costo que no existe.
  assert.equal(clasificarLinea({ ...SANA, costoNuevo: null }), ESTADO_LINEA.ERROR);
  assert.equal(clasificarLinea({ ...SANA, costoNuevo: undefined }), ESTADO_LINEA.ERROR);
});

// ── Utilidades ──────────────────────────────────────────────────────────────

test("26. estadoMasPrioritario elige el más grave", () => {
  assert.equal(
    estadoMasPrioritario([ESTADO_LINEA.SIN_CAMBIOS, ESTADO_LINEA.NO_MACHEADO, ESTADO_LINEA.EXCLUIDO]),
    ESTADO_LINEA.NO_MACHEADO
  );
  assert.equal(estadoMasPrioritario([ESTADO_LINEA.LISTO_PARA_ACTUALIZAR]), ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

test("27. estadoMasPrioritario ignora lo desconocido en vez de romper", () => {
  assert.equal(estadoMasPrioritario(["INVENTADO", ESTADO_LINEA.EXCLUIDO]), ESTADO_LINEA.EXCLUIDO);
  assert.equal(estadoMasPrioritario(["INVENTADO"]), null);
  assert.equal(estadoMasPrioritario([]), null);
});

test("28. solo LISTO_PARA_ACTUALIZAR se aplica solo", () => {
  assert.equal(esAplicable(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR), true);
  for (const e of PRIORIDAD_ESTADO.filter((x) => x !== ESTADO_LINEA.LISTO_PARA_ACTUALIZAR)) {
    assert.equal(esAplicable(e), false, `${e} no debería aplicarse solo`);
  }
  assert.equal(ESTADOS_APLICABLES.size, 1);
});

test("29. esEstadoValido reconoce los ocho y rechaza el resto", () => {
  for (const e of PRIORIDAD_ESTADO) assert.equal(esEstadoValido(e), true);
  assert.equal(esEstadoValido("PENDIENTE"), false);
  assert.equal(esEstadoValido(""), false);
});

test("30. resumirEstados devuelve los ocho, incluso en cero", () => {
  const r = resumirEstados([
    ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    ESTADO_LINEA.NO_MACHEADO,
    "INVENTADO",
  ]);
  assert.equal(Object.keys(r).length, 8);
  assert.equal(r.LISTO_PARA_ACTUALIZAR, 2);
  assert.equal(r.NO_MACHEADO, 1);
  assert.equal(r.ERROR, 0);
  assert.equal(r.SIN_CAMBIOS, 0);
});
