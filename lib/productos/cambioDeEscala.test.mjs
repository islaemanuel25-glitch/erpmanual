// CANDADOS DE LA ACTIVACIÓN DEL TERCER NIVEL DE EMPAQUE (tanda 9 —
// docs/roadmap/tercer-nivel-empaque.md).
//
//   node --import ./scripts/alias-loader.mjs --test lib/productos/cambioDeEscala.test.mjs
//
// Lo puro: qué acepta el dato, el plan de reinterpretación (multiplicar al
// cargar, dividir al vaciar, frenar si algo no da entero), la devolución de un
// combo vendido antes de cargar el dato y el mapeo de la ficha. El ciclo contra
// la base —cargar, vender, vaciar bloqueado— está en
// `scripts/pruebas-db/tercerNivelEmpaque.mjs`, sección I.

import test from "node:test";
import assert from "node:assert/strict";

import { TEXTO_CAMBIO_DE_ESCALA, interpretarSueltosPorUnidad, planDeReinterpretacion } from "./cambioDeEscala.js";
import { deltaDeDevolucion } from "../pos-ventas/reversionVenta.js";
import { reconstruirConsumoOriginal } from "../pos-ventas/motorCorreccion.js";
import { mergeBaseLocalToUi, splitUiToDb } from "../mappers/producto.js";

test("I1. el dato: vacío o 1 es sin sueltos, un entero mayor que 1 es el dato, lo demás se rechaza, y sin el campo no se toca", () => {
  assert.deepEqual(interpretarSueltosPorUnidad(undefined), { sinCambio: true });
  for (const vacio of [null, "", "  ", 1, "1"]) assert.deepEqual(interpretarSueltosPorUnidad(vacio), { ok: true, valor: null }, String(vacio));
  assert.deepEqual(interpretarSueltosPorUnidad(20), { ok: true, valor: 20 });
  assert.deepEqual(interpretarSueltosPorUnidad("20"), { ok: true, valor: 20 });
  for (const malo of [0, -3, 2.5, "veinte"]) {
    assert.deepEqual(interpretarSueltosPorUnidad(malo), { ok: false, error: TEXTO_CAMBIO_DE_ESCALA.INVALIDO }, String(malo));
  }
});

const STOCK = { id: 1, local: "Local", cantidad: "10.000", enTransito: "0.000", stockMin: "2.00", stockMax: "20.00" };

test("I2. cargar 20: stock, tránsito, mínimo y máximo × 20, y los combos que lo usan también", () => {
  const plan = planDeReinterpretacion({ anterior: null, nuevo: 20, stocks: [STOCK], componentes: [{ id: 7, cantidad: "1.000" }] });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.stocks, [{ id: 1, data: { cantidad: 200, enTransito: 0, stockMin: 40, stockMax: 400 } }]);
  assert.deepEqual(plan.componentes, [{ id: 7, cantidad: 20 }], "el combo pasaría a llevar 1 cigarrillo donde llevaba 1 atado");
});

test("I3. vaciar (volver a 1) es la inversa, y un límite sin cargar sigue sin cargar", () => {
  const plan = planDeReinterpretacion({
    anterior: 20, nuevo: null,
    stocks: [{ ...STOCK, cantidad: "200.000", stockMin: null, stockMax: "400.00" }],
    componentes: [{ id: 7, cantidad: "20.000" }],
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.stocks[0].data, { cantidad: 10, enTransito: 0, stockMin: null, stockMax: 20 });
  assert.deepEqual(plan.componentes, [{ id: 7, cantidad: 1 }]);
});

test("I4. si algo no da entero no se redondea en silencio: se dice qué y dónde", () => {
  const abierto = planDeReinterpretacion({ anterior: 20, nuevo: null, stocks: [{ ...STOCK, cantidad: "195.000" }] });
  assert.equal(abierto.ok, false);
  assert.match(abierto.error, /el stock de Local no da un número entero/);
  const combo = planDeReinterpretacion({ anterior: 20, nuevo: null, stocks: [], componentes: [{ id: 3, local: "Local", cantidad: "1.000" }] });
  assert.equal(combo.ok, false);
  assert.match(combo.error, /la cantidad que lleva un combo de Local/);
  // Cambiar de 20 a 10 divide por dos: 200 → 100.
  const cambio = planDeReinterpretacion({ anterior: 20, nuevo: 10, stocks: [{ ...STOCK, cantidad: "200.000", stockMin: null, stockMax: null }] });
  assert.equal(cambio.stocks[0].data.cantidad, 100);
});

test("I5. anular un combo vendido ANTES de cargar el dato devuelve en la escala de hoy; sin el dato, tal cual", () => {
  const combo = (sueltosHoy, congelado = null) => [{
    componentes: [{ productoLocalId: 9, cantidad: "2.000", sueltosPorUnidadCongelado: congelado, productoBase: { sueltos_por_unidad: sueltosHoy } }],
  }];
  assert.deepEqual(deltaDeDevolucion(combo(20)), [{ productoLocalId: 9, delta: 40 }], "se devolvió 2 donde el stock ya cuenta 40");
  assert.deepEqual(deltaDeDevolucion(combo(20, 20)), [{ productoLocalId: 9, delta: 2 }], "vendido con el dato: tal cual");
  assert.deepEqual(deltaDeDevolucion(combo(null)), [{ productoLocalId: 9, delta: 2 }]);
  // Sin los campos nuevos —un llamador que no los pide— va tal cual, como siempre.
  assert.deepEqual(deltaDeDevolucion([{ componentes: [{ productoLocalId: 9, cantidad: "2.000" }] }]), [{ productoLocalId: 9, delta: 2 }]);
});

test("I6. corregir un combo vendido antes del dato reconstruye su consumo en la escala de hoy", () => {
  const det = (sueltosHoy) => ({
    componentes: [{ productoBaseId: 1, productoLocalId: 9, cantidad: 2, sueltosPorUnidadCongelado: null, sueltosHoy }],
  });
  assert.deepEqual(reconstruirConsumoOriginal(det(20)).consumo, [{ productoLocalId: 9, cantidad: 40 }]);
  assert.deepEqual(reconstruirConsumoOriginal(det(null)).consumo, [{ productoLocalId: 9, cantidad: 2 }]);
});

test("I7. la ficha: el mapeo lee y manda el dato, los nombres y el precio del suelto; sin ellos no toca nada", () => {
  const ui = mergeBaseLocalToUi(
    { id: 1, sueltos_por_unidad: 20, nombre_unidad: "atado", nombre_bulto: "cartón" },
    { id: 2, precio_venta_suelto: "100.00" }
  );
  assert.deepEqual([ui.sueltosPorUnidad, ui.nombreUnidad, ui.nombreBulto, ui.precioVentaSuelto], [20, "atado", "cartón", 100]);

  const { baseData, localData } = splitUiToDb({ nombre_unidad: " atado ", nombre_bulto: "", precio_venta_suelto: "100" });
  assert.deepEqual([baseData.nombre_unidad, baseData.nombre_bulto, localData.precio_venta_suelto], ["atado", null, 100]);
  assert.equal("sueltos_por_unidad" in baseData, false, "los sueltos no se guardan como un campo más: van con su reinterpretación");

  const viejo = splitUiToDb({});
  assert.deepEqual([viejo.baseData.nombre_unidad, viejo.baseData.nombre_bulto, viejo.localData.precio_venta_suelto], [undefined, undefined, undefined]);
});
