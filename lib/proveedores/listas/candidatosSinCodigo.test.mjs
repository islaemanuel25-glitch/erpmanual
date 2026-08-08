// Candidatos para un producto sin código guardado.
//
// Lo que se protege es la regla de las DOS señales, que es la razón de ser del
// módulo: el nombre solo genera falsos positivos —por eso el motor se niega a
// machear por nombre— y el precio solo no identifica nada, porque muchos
// productos distintos comparten rango de aumento.

import test from "node:test";
import assert from "node:assert/strict";

import {
  candidatosParaProducto,
  sugerenciaUnica,
  precioCoherente,
  MIN_PARECIDO,
  MAX_CANDIDATOS,
  SENIAL,
} from "./candidatosSinCodigo.js";

const RANGO = { minPct: 10, maxPct: 20 };
const RECARGO = 5;

/** Un producto del ERP sin código del proveedor. Costo tal que 1050 cae en rango. */
const producto = (over = {}) => ({
  nombre: "KETCHUP DOYPACK 250G",
  precio_costo: 920,          // 1050 sobre 920 es +14,1 %: dentro de 10–20
  unidad_medida: "unidad",
  factor_pack: null,
  modoCompraProveedor: null,
  ...over,
});

/** Una fila del archivo que no macheó con nada. */
const fila = (over = {}) => ({
  id: 1,
  filaExcel: 10,
  codigoCrudo: "10301",
  descripcionProveedor: "KETCHUP DOYPACK 250G",
  unidadProveedor: "UN",
  unidadesPorBulto: 1,
  precioConIva: 1000,
  recargoPct: RECARGO,
  ...over,
});

const uno = (p, f) => candidatosParaProducto({ producto: p, filas: [f], recargoPct: RECARGO, rango: RANGO });

// ── Las cuatro combinaciones ────────────────────────────────────────────────

test("1. nombre alto y precio coherente: SE SUGIERE", () => {
  const c = uno(producto(), fila());
  assert.equal(c.length, 1);
  assert.equal(c[0].sugerido, true);
  assert.equal(c[0].nombreAlto, true);
  assert.equal(c[0].precioCoherente, true);
  assert.deepEqual(c[0].senales.sort(), [SENIAL.NOMBRE, SENIAL.PRECIO].sort());
});

test("2. nombre alto y precio absurdo: SE MUESTRA sin sugerir", () => {
  // Mismo nombre, costo actual ridículamente bajo: el aumento sería enorme.
  const c = uno(producto({ precio_costo: 5 }), fila());
  assert.equal(c.length, 1);
  assert.equal(c[0].nombreAlto, true);
  assert.equal(c[0].precioCoherente, false);
  assert.equal(c[0].sugerido, false, "una sola señal no propone");
});

test("3. nombre flojo y precio coherente: SE MUESTRA sin sugerir", () => {
  const c = uno(producto(), fila({ descripcionProveedor: "ARVEJAS EN LATA X 300" }));
  assert.equal(c.length, 1);
  assert.equal(c[0].nombreAlto, false);
  assert.equal(c[0].precioCoherente, true);
  assert.equal(c[0].sugerido, false, "que el precio cierre no identifica el producto");
});

test("4. ninguna de las dos: NO APARECE", () => {
  // De 625 filas, la mayoría cae acá. Mostrarlas sería llenar el panel de ruido.
  const c = uno(producto({ precio_costo: 5 }), fila({ descripcionProveedor: "ARVEJAS EN LATA X 300" }));
  assert.equal(c.length, 0);
});

// ── La sugerencia ───────────────────────────────────────────────────────────

test("5. dos sugeridos no sugieren ninguno", () => {
  // Mismo criterio que el empate técnico del motor: elegir uno sería adivinar a
  // qué producto se le va a escribir el costo.
  const c = candidatosParaProducto({
    producto: producto(),
    filas: [fila({ id: 1 }), fila({ id: 2, filaExcel: 11 })],
    recargoPct: RECARGO,
    rango: RANGO,
  });
  assert.equal(c.filter((x) => x.sugerido).length, 2);
  assert.equal(sugerenciaUnica(c), null);
});

test("6. con un solo sugerido, ése es la sugerencia", () => {
  const c = candidatosParaProducto({
    producto: producto(),
    filas: [fila({ id: 1 }), fila({ id: 2, filaExcel: 11, descripcionProveedor: "ARVEJAS EN LATA X 300" })],
    recargoPct: RECARGO,
    rango: RANGO,
  });
  const s = sugerenciaUnica(c);
  assert.equal(s?.filaId, 1);
});

test("7. los sugeridos van primero", () => {
  const c = candidatosParaProducto({
    producto: producto(),
    filas: [
      fila({ id: 2, descripcionProveedor: "ARVEJAS EN LATA X 300" }),
      fila({ id: 1 }),
    ],
    recargoPct: RECARGO,
    rango: RANGO,
  });
  assert.equal(c[0].filaId, 1);
  assert.equal(c[0].sugerido, true);
});

test("8. hay un techo de candidatos", () => {
  const filas = Array.from({ length: 12 }, (_, i) => fila({ id: i + 1, filaExcel: 10 + i }));
  const c = candidatosParaProducto({ producto: producto(), filas, recargoPct: RECARGO, rango: RANGO });
  assert.equal(c.length, MAX_CANDIDATOS);
});

// ── Los bordes ──────────────────────────────────────────────────────────────

test("9. el umbral del nombre es el MISMO del motor", () => {
  // Si acá se aflojara, la pantalla propondría vínculos que el motor no se anima
  // a proponer — y con el agravante de que éstos se confirman de un clic.
  assert.equal(MIN_PARECIDO, 0.6);
});

test("10. sin producto o sin filas no hay candidatos", () => {
  assert.deepEqual(candidatosParaProducto({ producto: null, filas: [fila()] }), []);
  assert.deepEqual(candidatosParaProducto({ producto: producto(), filas: [] }), []);
  assert.deepEqual(candidatosParaProducto({}), []);
});

test("11. una fila que el archivo no permite leer no rompe nada", () => {
  // Sin unidad no hay interpretación posible: no puede haber señal de precio.
  const c = uno(producto(), fila({ unidadProveedor: "" }));
  assert.equal(c.length, 1, "el nombre alto la sostiene");
  assert.equal(c[0].precioCoherente, false);
  assert.equal(c[0].sugerido, false);
});

test("12. la coherencia mira TODAS las lecturas, no una sola", () => {
  // Una fila que cotiza por unidad sobre un producto que agrupa tiene dos
  // lecturas: una puede ser absurda y la otra la correcta. Descartar por la
  // primera perdería el candidato bueno.
  assert.equal(precioCoherente({ evaluadas: [{ estado: "AUMENTO_ALTO" }, { estado: "ESPERADO" }] }), true);
  assert.equal(precioCoherente({ evaluadas: [{ estado: "AUMENTO_ALTO" }, { estado: "DISMINUCION" }] }), false);
  assert.equal(precioCoherente({ evaluadas: [] }), false);
  assert.equal(precioCoherente(null), false);
});
