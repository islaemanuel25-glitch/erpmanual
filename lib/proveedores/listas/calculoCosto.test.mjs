// Cálculo del costo propuesto por una lista de proveedor.
//
// Lo que se persigue acá es el error de plata: que el unitario del proveedor
// termine guardado en la unidad equivocada, o que redondear antes de tiempo
// convierta $1.480 en $1.479,96 y el usuario vea una diferencia que no existe.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  UMBRAL_VARIACION_ARCOR,
  ERROR_COSTO,
  MOTIVO_BLOQUEO,
  TEXTO_BLOQUEO,
  bloqueoPorUnidad,
  aCentavos,
  desdeCentavos,
  round2,
  mismoCosto,
  requiereConversionABulto,
  factorValido,
  factorDudoso,
  aplicarRecargo,
  calcularCostoPropuesto,
  calcularVariacion,
} from "./calculoCosto.js";

// Productos con la forma que tienen en el ERP.
const PACK12 = { unidad_medida: "pack", factor_pack: 12, modoCompraProveedor: "BULTO" };
const UNIDAD_SUELTA = { unidad_medida: "unidad", factor_pack: null, modoCompraProveedor: "BULTO" };
const KG = { unidad_medida: "kg", factor_pack: null, modoCompraProveedor: "BULTO" };
const FIAMBRE = { unidad_medida: "kg", factor_pack: null, modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 3 };
const PACK_SIN_FACTOR = { unidad_medida: "pack", factor_pack: null, modoCompraProveedor: "BULTO" };

// ── El caso obligatorio ─────────────────────────────────────────────────────

test("1. 1000 + 5% con factor 12 → unitario 1050 y maestro 12600", () => {
  const r = calcularCostoPropuesto({ base: PACK12, precioLista: 1000, recargoPct: 5 });
  assert.equal(r.error, null);
  assert.equal(r.costoUnitarioCalculado, 1050);
  assert.equal(r.costoNuevoPropuesto, 12600);
  assert.equal(r.costoNuevoPropuestoCentavos, 1260000);
  assert.equal(r.factorAplicado, 12);
});

test("2. las dos cifras se devuelven por separado, no una sola", () => {
  const r = calcularCostoPropuesto({ base: PACK12, precioLista: 1000, recargoPct: 5 });
  assert.notEqual(r.costoUnitarioCalculado, r.costoNuevoPropuesto);
  assert.equal(r.costoNuevoPropuesto, r.costoUnitarioCalculado * 12);
});

// ── Redondeo al final, no antes ─────────────────────────────────────────────

test("3. el redondeo ocurre AL FINAL: 82,222222 × 18 da 1.480, no 1.479,96", () => {
  // 1480/18 = 82,2222… Es el caso que documenta costoLineaAMaestro.
  const base = { unidad_medida: "pack", factor_pack: 18, modoCompraProveedor: "BULTO" };
  const r = calcularCostoPropuesto({ base, precioLista: 1480 / 18, recargoPct: 0 });
  assert.equal(r.costoNuevoPropuesto, 1480);
  // Si se hubiera redondeado el unitario antes de multiplicar:
  assert.notEqual(round2(1480 / 18) * 18, 1480);
});

test("4. el unitario que se muestra sí viene redondeado a dos decimales", () => {
  const base = { unidad_medida: "pack", factor_pack: 18, modoCompraProveedor: "BULTO" };
  const r = calcularCostoPropuesto({ base, precioLista: 1480 / 18, recargoPct: 0 });
  assert.equal(r.costoUnitarioCalculado, 82.22);
  // …y el exacto se conserva aparte, que es lo que se multiplica.
  assert.ok(Math.abs(r.costoUnitarioExacto - 82.22222222) < 1e-6);
});

test("5. decimales del recargo: 123,45 + 7,5% con factor 6", () => {
  const base = { unidad_medida: "pack", factor_pack: 6, modoCompraProveedor: "BULTO" };
  const r = calcularCostoPropuesto({ base, precioLista: 123.45, recargoPct: 7.5 });
  // 123,45 × 1,075 = 132,70875 → unitario 132,71 · maestro 796,2525 → 796,25
  assert.equal(r.costoUnitarioCalculado, 132.71);
  assert.equal(r.costoNuevoPropuesto, 796.25);
});

test("6. el resultado monetario final es un entero de centavos", () => {
  const r = calcularCostoPropuesto({ base: PACK12, precioLista: 1000, recargoPct: 5 });
  assert.ok(Number.isInteger(r.costoNuevoPropuestoCentavos));
  assert.equal(r.costoNuevoPropuesto, desdeCentavos(r.costoNuevoPropuestoCentavos));
});

// ── Cada naturaleza de producto ─────────────────────────────────────────────

test("7. producto normal sin factor: el maestro es el unitario", () => {
  const r = calcularCostoPropuesto({ base: UNIDAD_SUELTA, precioLista: 500, recargoPct: 10 });
  assert.equal(r.error, null);
  assert.equal(r.costoUnitarioCalculado, 550);
  assert.equal(r.costoNuevoPropuesto, 550);
  assert.equal(r.factorAplicado, 1);
});

test("8. producto kg: sin factor, aunque tuviera uno cargado", () => {
  const kgConFactor = { ...KG, factor_pack: 10 };
  const r = calcularCostoPropuesto({ base: kgConFactor, precioLista: 800, recargoPct: 0 });
  assert.equal(r.naturaleza, "KG");
  assert.equal(r.costoNuevoPropuesto, 800);
  assert.equal(r.factorAplicado, 1);
});

test("9. excepción modoCompraProveedor UNIDAD (fiambre): sin factor", () => {
  const fiambreConFactor = { ...FIAMBRE, factor_pack: 4 };
  const r = calcularCostoPropuesto({ base: fiambreConFactor, precioLista: 9000, recargoPct: 0 });
  assert.equal(r.naturaleza, "FIAMBRE");
  assert.equal(r.costoNuevoPropuesto, 9000);
  assert.equal(r.factorAplicado, 1);
});

test("10. fiambre y kg quedan marcados: la lista informa por unidad y el ERP guarda por kg", () => {
  assert.equal(calcularCostoPropuesto({ base: FIAMBRE, precioLista: 100 }).unidadDistintaDeLaLista, true);
  assert.equal(calcularCostoPropuesto({ base: KG, precioLista: 100 }).unidadDistintaDeLaLista, true);
  assert.equal(calcularCostoPropuesto({ base: PACK12, precioLista: 100 }).unidadDistintaDeLaLista, false);
  assert.equal(calcularCostoPropuesto({ base: UNIDAD_SUELTA, precioLista: 100 }).unidadDistintaDeLaLista, false);
});

// ── Bloqueo por unidad incompatible ─────────────────────────────────────────
//
// Con un fiambre de 3 kg, escribir el precio de la pieza en el campo del precio
// por kilo es un error del 200 % que después se propaga al precio de venta.

test("10b. producto kg con lista por unidad: motivo de bloqueo explícito", () => {
  assert.equal(bloqueoPorUnidad(KG), MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE);
  assert.equal(bloqueoPorUnidad(KG), "UNIDAD_INCOMPATIBLE_CON_LISTA");
});

test("10c. fiambre comprado por unidad con costo maestro por kg: mismo motivo", () => {
  assert.equal(bloqueoPorUnidad(FIAMBRE), MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE);
});

test("10d. pack con factor válido y unidad suelta: sin bloqueo", () => {
  assert.equal(bloqueoPorUnidad(PACK12), null);
  assert.equal(bloqueoPorUnidad(UNIDAD_SUELTA), null);
  // Un pack sin factor tampoco se bloquea por unidad: su problema es otro.
  assert.equal(bloqueoPorUnidad(PACK_SIN_FACTOR), null);
});

test("10e. el motivo viaja en el resultado del cálculo, no solo como bandera", () => {
  assert.equal(
    calcularCostoPropuesto({ base: KG, precioLista: 800 }).motivoBloqueo,
    MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE
  );
  assert.equal(
    calcularCostoPropuesto({ base: FIAMBRE, precioLista: 9000 }).motivoBloqueo,
    MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE
  );
  assert.equal(calcularCostoPropuesto({ base: PACK12, precioLista: 1000 }).motivoBloqueo, null);
  assert.equal(calcularCostoPropuesto({ base: UNIDAD_SUELTA, precioLista: 1000 }).motivoBloqueo, null);
});

test("10f. el motivo tiene texto para la pantalla", () => {
  const texto = TEXTO_BLOQUEO[MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE];
  assert.equal(typeof texto, "string");
  assert.match(texto, /por unidad/);
  assert.match(texto, /por kilo/);
  // Dice qué hacer, no solo qué pasó.
  assert.match(texto, /a mano/);
});

test("10g. si la lista informara POR KILO, no habría incompatibilidad", () => {
  // El bloqueo depende de la unidad de la lista, no del producto solo.
  assert.equal(bloqueoPorUnidad(KG, "KG"), null);
  assert.equal(bloqueoPorUnidad(FIAMBRE, "KG"), null);
  // Y el default sigue siendo el de Arcor.
  assert.equal(bloqueoPorUnidad(KG), MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE);
});

test("10h. el costo se sigue calculando: sirve para mostrar de dónde salía", () => {
  // Bloquear no es no calcular. El número se muestra, pero no se aplica.
  const r = calcularCostoPropuesto({ base: KG, precioLista: 800, recargoPct: 10 });
  assert.equal(r.error, null);
  assert.equal(r.costoNuevoPropuesto, 880);
  assert.equal(r.motivoBloqueo, MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE);
});

test("10i. el bloqueo NO usa pesoReferenciaKg ni convierte por peso", () => {
  const conPeso = { ...FIAMBRE, pesoReferenciaKg: 3 };
  const sinPeso = { ...FIAMBRE, pesoReferenciaKg: null };
  // El mismo motivo con y sin peso: el peso no participa de la decisión.
  assert.equal(bloqueoPorUnidad(conPeso), MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE);
  assert.equal(bloqueoPorUnidad(sinPeso), MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE);
  // Y el costo propuesto no se multiplica ni se divide por el peso.
  const r = calcularCostoPropuesto({ base: conPeso, precioLista: 9000 });
  assert.equal(r.costoNuevoPropuesto, 9000);
});

// ── Recargo ─────────────────────────────────────────────────────────────────

test("11. recargo 0 deja el precio como está", () => {
  const r = calcularCostoPropuesto({ base: UNIDAD_SUELTA, precioLista: 777.77, recargoPct: 0 });
  assert.equal(r.costoUnitarioCalculado, 777.77);
  assert.equal(r.costoNuevoPropuesto, 777.77);
});

test("12. recargo decimal", () => {
  assert.ok(Math.abs(aplicarRecargo(1000, 5.5) - 1055) < 1e-9);
  assert.ok(Math.abs(aplicarRecargo(1000, 0.1) - 1001) < 1e-9);
});

test("13. el recargo se aplica sobre el UNITARIO, no sobre el bulto", () => {
  const sinRecargo = calcularCostoPropuesto({ base: PACK12, precioLista: 1000, recargoPct: 0 });
  const conRecargo = calcularCostoPropuesto({ base: PACK12, precioLista: 1000, recargoPct: 5 });
  assert.equal(sinRecargo.costoUnitarioCalculado, 1000);
  assert.equal(conRecargo.costoUnitarioCalculado, 1050);
  // Que el maestro también quede ×1,05 es consecuencia, no la operación.
  assert.equal(conRecargo.costoNuevoPropuesto, sinRecargo.costoNuevoPropuesto * 1.05);
});

test("14. recargo no numérico es un error explícito", () => {
  const r = calcularCostoPropuesto({ base: UNIDAD_SUELTA, precioLista: 100, recargoPct: "mucho" });
  assert.equal(r.error, ERROR_COSTO.RECARGO_INVALIDO);
  assert.equal(r.costoNuevoPropuesto, null);
});

// ── Precios inválidos ───────────────────────────────────────────────────────

test("15. precio cero: no se calcula nada y se dice por qué", () => {
  const r = calcularCostoPropuesto({ base: PACK12, precioLista: 0, recargoPct: 5 });
  assert.equal(r.error, ERROR_COSTO.PRECIO_CERO);
  assert.equal(r.costoNuevoPropuesto, null);
  assert.equal(r.costoNuevoPropuestoCentavos, null);
});

test("16. precio negativo: error, no un costo negativo", () => {
  const r = calcularCostoPropuesto({ base: PACK12, precioLista: -100, recargoPct: 0 });
  assert.equal(r.error, ERROR_COSTO.PRECIO_NEGATIVO);
  assert.equal(r.costoNuevoPropuesto, null);
});

test("17. precio ausente o vacío", () => {
  for (const v of [null, undefined, ""]) {
    assert.equal(calcularCostoPropuesto({ base: PACK12, precioLista: v }).error, ERROR_COSTO.PRECIO_AUSENTE);
  }
});

test("18. precio no numérico", () => {
  const r = calcularCostoPropuesto({ base: PACK12, precioLista: "s/d" });
  assert.equal(r.error, ERROR_COSTO.PRECIO_INVALIDO);
});

// ── Factor ──────────────────────────────────────────────────────────────────

test("19. factor cero o negativo en un pack: falta el factor", () => {
  for (const f of [0, -12]) {
    const r = calcularCostoPropuesto({ base: { ...PACK12, factor_pack: f }, precioLista: 1000 });
    assert.equal(r.error, ERROR_COSTO.FACTOR_FALTANTE, `factor ${f}`);
    assert.equal(r.costoNuevoPropuesto, null);
    // El unitario sí se informa: es lo único que se pudo calcular.
    assert.equal(r.costoUnitarioCalculado, 1000);
  }
});

test("20. factor ausente cuando es obligatorio: no se asume 1", () => {
  const r = calcularCostoPropuesto({ base: PACK_SIN_FACTOR, precioLista: 1000, recargoPct: 0 });
  assert.equal(r.error, ERROR_COSTO.FACTOR_FALTANTE);
  assert.equal(r.costoNuevoPropuesto, null);
  assert.equal(r.requiereFactor, true);
  assert.equal(r.factorValido, false);
});

test("21. factor 1 en un pack tampoco sirve: no convierte nada", () => {
  const r = calcularCostoPropuesto({ base: { ...PACK12, factor_pack: 1 }, precioLista: 1000 });
  assert.equal(r.error, ERROR_COSTO.FACTOR_FALTANTE);
});

test("22. un producto por UNIDAD con factor nulo NO es dudoso", () => {
  assert.equal(factorDudoso(UNIDAD_SUELTA), false);
  assert.equal(requiereConversionABulto(UNIDAD_SUELTA), false);
  const r = calcularCostoPropuesto({ base: UNIDAD_SUELTA, precioLista: 1000 });
  assert.equal(r.error, null);
  assert.equal(r.costoNuevoPropuesto, 1000);
});

test("23. kg y fiambre con factor nulo tampoco son dudosos", () => {
  assert.equal(factorDudoso(KG), false);
  assert.equal(factorDudoso(FIAMBRE), false);
  // Ni siquiera con unidad_medida kg y modoCompra UNIDAD a la vez.
  assert.equal(requiereConversionABulto(FIAMBRE), false);
});

test("24. un pack sin factor SÍ es dudoso", () => {
  assert.equal(factorDudoso(PACK_SIN_FACTOR), true);
  assert.equal(factorDudoso({ unidad_medida: "cajon", factor_pack: 0 }), true);
});

test("25. factorValido exige mayor que 1", () => {
  assert.equal(factorValido(12), true);
  assert.equal(factorValido(2), true);
  assert.equal(factorValido(1), false);
  assert.equal(factorValido(0), false);
  assert.equal(factorValido(-3), false);
  assert.equal(factorValido(null), false);
  assert.equal(factorValido("doce"), false);
});

// ── Variación ───────────────────────────────────────────────────────────────

test("26. diferencia positiva", () => {
  const v = calcularVariacion({ costoAnterior: 1000, costoNuevo: 1200, umbralPct: 30 });
  assert.equal(v.diferencia, 200);
  assert.ok(Math.abs(v.diferenciaPct - 20) < 1e-9);
  assert.equal(v.variacionAlta, false);
});

test("27. diferencia negativa", () => {
  const v = calcularVariacion({ costoAnterior: 1000, costoNuevo: 800, umbralPct: 30 });
  assert.equal(v.diferencia, -200);
  assert.ok(Math.abs(v.diferenciaPct + 20) < 1e-9);
  assert.equal(v.variacionAlta, false);
});

test("28. 29,99% NO es variación alta con umbral 30", () => {
  const v = calcularVariacion({ costoAnterior: 10000, costoNuevo: 12999, umbralPct: 30 });
  assert.ok(Math.abs(v.diferenciaPct - 29.99) < 1e-9);
  assert.equal(v.variacionAlta, false);
});

test("29. 30% exacto SÍ es variación alta: el umbral es inclusivo", () => {
  const v = calcularVariacion({ costoAnterior: 1000, costoNuevo: 1300, umbralPct: 30 });
  assert.ok(Math.abs(v.diferenciaPct - 30) < 1e-9);
  assert.equal(v.variacionAlta, true);
});

test("30. -30% también es variación alta: se mira el valor absoluto", () => {
  const v = calcularVariacion({ costoAnterior: 1000, costoNuevo: 700, umbralPct: 30 });
  assert.ok(Math.abs(v.diferenciaPct + 30) < 1e-9);
  assert.equal(v.variacionAlta, true);
});

test("31. el umbral entra por parámetro, no está clavado en la función", () => {
  const suave = calcularVariacion({ costoAnterior: 1000, costoNuevo: 1200, umbralPct: 10 });
  const duro = calcularVariacion({ costoAnterior: 1000, costoNuevo: 1200, umbralPct: 50 });
  assert.equal(suave.variacionAlta, true);
  assert.equal(duro.variacionAlta, false);
  assert.equal(suave.umbralAplicado, 10);
  assert.equal(duro.umbralAplicado, 50);
});

test("32. sin umbral no hay variación alta: la función genérica no inventa 30", () => {
  const v = calcularVariacion({ costoAnterior: 1000, costoNuevo: 5000 });
  assert.equal(v.variacionAlta, false);
  assert.equal(v.umbralAplicado, null);
  // El 30 existe, pero como default de Arcor y con nombre propio.
  assert.equal(UMBRAL_VARIACION_ARCOR, 30);
});

test("33. costo anterior cero: no divide, lo dice explícitamente", () => {
  const v = calcularVariacion({ costoAnterior: 0, costoNuevo: 500, umbralPct: 30 });
  assert.equal(v.costoAnteriorCero, true);
  assert.equal(v.porcentajeIndefinido, true);
  assert.equal(v.diferenciaPct, null);
  assert.equal(v.diferencia, 500);
  assert.ok(Number.isFinite(v.diferencia));
  assert.equal(v.variacionAlta, true);
});

test("34. costo anterior cero y nuevo cero: no hay nada que avisar", () => {
  const v = calcularVariacion({ costoAnterior: 0, costoNuevo: 0, umbralPct: 30 });
  assert.equal(v.diferencia, 0);
  assert.equal(v.variacionAlta, false);
  assert.equal(v.porcentajeIndefinido, true);
});

test("35. costos no numéricos: todo en null, sin NaN sueltos", () => {
  for (const antes of [null, undefined, "", "s/d", NaN]) {
    const v = calcularVariacion({ costoAnterior: antes, costoNuevo: 100, umbralPct: 30 });
    assert.equal(v.diferencia, null, `anterior ${String(antes)}`);
    assert.equal(v.diferenciaPct, null);
    assert.equal(v.variacionAlta, false);
    assert.equal(v.costoAnteriorCero, false);
  }
});

test("35b. un costo AUSENTE no es un costo de cero", () => {
  // Number(null) da 0: si se dejara pasar, un producto sin costo cargado se
  // leería como uno que cuesta cero y la variación diría "de $0 a $1.200".
  assert.equal(aCentavos(null), null);
  assert.equal(aCentavos(undefined), null);
  assert.equal(aCentavos(""), null);
  assert.equal(aCentavos(0), 0);
  // Y el cero explícito sí entra por el camino de "costo anterior cero".
  assert.equal(calcularVariacion({ costoAnterior: 0, costoNuevo: 1 }).costoAnteriorCero, true);
  assert.equal(calcularVariacion({ costoAnterior: null, costoNuevo: 1 }).costoAnteriorCero, false);
});

// ── Igualdad monetaria ──────────────────────────────────────────────────────

test("36. la igualdad se mide a dos decimales", () => {
  assert.equal(mismoCosto(12600, 12600.004), true);
  assert.equal(mismoCosto(12600, 12600.01), false);
  assert.equal(mismoCosto(1479.999996, 1480), true);
});

test("37. la diferencia también se mide a dos decimales", () => {
  // Milésimas de diferencia no son un cambio de costo.
  const v = calcularVariacion({ costoAnterior: 1000, costoNuevo: 1000.004, umbralPct: 30 });
  assert.equal(v.diferencia, 0);
  assert.equal(v.diferenciaPct, 0);
});

test("38. aCentavos y round2 usan la misma regla que costoLineaAMaestro", () => {
  assert.equal(aCentavos(1479.999996), 148000);
  assert.equal(round2(1479.999996), 1480);
  assert.equal(round2(0.005), 0.01);
  assert.equal(aCentavos("no"), null);
});
