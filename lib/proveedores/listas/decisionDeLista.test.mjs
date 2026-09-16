// El cuadrado: que el sistema no pueda aplicar un precio mal leído.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decidirLista,
  precioDeFila,
  lecturasDeFila,
  MOTIVO_FILA,
  MOTIVO_LISTA,
  TEXTO_MOTIVO_FILA,
  TEXTO_MOTIVO_LISTA,
  MAYORIA_MINIMA,
  VENTAJA_MINIMA,
} from "@/lib/proveedores/listas/decisionDeLista";

const RANGO = { minPct: 5, maxPct: 15 };
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const CONFIG = { rango: RANGO, recargoPct: 0, impuestoAdicionalPct: 0, pisoPrecioCreible: 1 };

/** Una fila como la arma el lector: precios por índice de columna. */
const fila = (clave, extra = {}) => ({
  clave,
  codigo: `C${clave}`,
  precios: {},
  descuentoPct: null,
  cantidadDelArchivo: null,
  costoActual: null,
  factorPack: null,
  ...extra,
});

/** Una lista de n filas coherentes con un aumento dado, en la columna 1. */
function listaCoherente({ n = 20, aumentoPct = 10, columnaBuena = 1, columnaMala = 0 } = {}) {
  const filas = [];
  for (let i = 0; i < n; i++) {
    const costo = 1000 + i * 137;
    const bueno = costo * (1 + aumentoPct / 100);
    filas.push(
      fila(i, {
        costoActual: costo,
        precios: { [columnaMala]: bueno / 1.21, [columnaBuena]: bueno },
      })
    );
  }
  return filas;
}

// ── EL EJEMPLO DE EMANUEL ───────────────────────────────────────────────────

test("12.000 con bulto de 12: 13.200 se toma como el precio del bulto y 158.400 nunca", () => {
  // El producto tiene bulto de 12 y hoy cuesta 12.000. La lista dice 13.200.
  // Leído como el precio de la presentación cargada da +10 %, que entra en el
  // rango. Leído como el precio de la unidad daría 158.400, un 1.220 %.
  const f = fila("A", { costoActual: 12000, factorPack: 12, precios: { 0: 13200 } });
  const lecturas = lecturasDeFila({ fila: f, precio: 13200 });
  assert.deepEqual(lecturas.map((l) => l.costoNuevo), [13200, 158400]);

  const r = decidirLista({
    filas: [f, ...listaCoherente({ n: 10, columnaBuena: 0, columnaMala: 9 })],
    columnasDePrecio: [0],
    config: CONFIG,
  });
  const decidida = r.filas.find((x) => x.clave === "A");
  assert.equal(decidida.estado, "APLICABLE");
  assert.equal(decidida.costoPropuesto, 13200);
  assert.equal(decidida.multiplicador, 1);
  assert.notEqual(decidida.costoPropuesto, 158400);
});

test("el mismo precio contra un costo de unidad se lee por bulto", () => {
  // La cara opuesta del mismo caso, y la que prueba que el motor no está
  // eligiendo siempre "sin multiplicar": si el producto cuesta 1.000 la unidad y
  // el archivo dice 1.100 por unidad, el costo del bulto de 12 sería 13.200.
  // Con el costo de hoy en 12.000, la lectura por bulto es la única que entra.
  const f = fila("B", { costoActual: 12000, factorPack: 12, precios: { 0: 1100 } });
  const r = decidirLista({
    filas: [f, ...listaCoherente({ n: 10, columnaBuena: 0, columnaMala: 9 })],
    columnasDePrecio: [0],
    config: CONFIG,
  });
  const decidida = r.filas.find((x) => x.clave === "B");
  assert.equal(decidida.estado, "APLICABLE");
  assert.equal(decidida.costoPropuesto, 13200);
  assert.equal(decidida.multiplicador, 12);
});

// ── REGLA (a): LA COLUMNA ES DE LA LISTA ENTERA ────────────────────────────

test("la columna de precio se elige para toda la lista, no fila por fila", () => {
  // Las veinte filas tienen la columna 0 con el precio neto (÷1,21) y la 1 con
  // el final. Solo la 1 da el aumento esperado.
  const r = decidirLista({ filas: listaCoherente(), columnasDePrecio: [0, 1], config: CONFIG });
  assert.equal(r.eleccion.columna, 1);
  assert.equal(r.resumen.aplicables, 20);
  assert.equal(r.resumen.paraRevisar, 0);
});

test("la fila que TAMBIÉN encajaría con otra columna usa la de la lista igual", () => {
  // Es el candado que distingue decidir por lista de decidir por fila, y el otro
  // no lo distingue: ahí la columna equivocada no encaja en NINGUNA fila, así que
  // las dos reglas dan el mismo resultado.
  //
  // Acá tres filas tienen la columna 0 justo en rango por casualidad. Decidiendo
  // por fila, esas tres se leerían con una columna distinta que el resto de la
  // lista —o quedarían trabadas por ambiguas—; decidiendo por lista, se leen con
  // la columna que explica a las veinte.
  const filas = [];
  for (let i = 0; i < 20; i++) {
    const costo = 1000 + i * 137;
    const coincide = i < 3;
    filas.push(
      fila(i, {
        costoActual: costo,
        precios: { 0: coincide ? costo * 1.07 : costo * 0.5, 1: costo * 1.1 },
      })
    );
  }
  const r = decidirLista({ filas, columnasDePrecio: [0, 1], config: CONFIG });
  assert.equal(r.eleccion.columna, 1);
  for (let i = 0; i < 3; i++) {
    const f = r.filas.find((x) => x.clave === i);
    assert.equal(f.estado, "APLICABLE");
    assert.equal(f.costoPropuesto, Math.round((1000 + i * 137) * 1.1 * 100) / 100);
  }
});

test("si ninguna columna explica a la mayoría, la lista ENTERA queda para revisar", () => {
  // CONTRAPRUEBA DE LA REGLA: sin este corte, el motor toma la columna "menos
  // mala" y escribe una lista entera de costos que nadie controló.
  const filas = listaCoherente({ aumentoPct: 80 }); // muy por encima del rango
  const r = decidirLista({ filas, columnasDePrecio: [0, 1], config: CONFIG });
  assert.equal(r.eleccion, null);
  assert.equal(r.motivoLista, MOTIVO_LISTA.NINGUNA_OPCION_CLARA);
  assert.equal(r.resumen.aplicables, 0);
  assert.equal(r.resumen.paraRevisar, filas.length);
  for (const f of r.filas) assert.equal(f.motivo, MOTIVO_FILA.SIN_ELECCION_DE_LISTA);
});

test("dos columnas que explican casi lo mismo se preguntan, no se sortean", () => {
  // Las dos columnas difieren un 5 % y el rango es ancho: las dos entran. Es el
  // caso de "px unidad" contra "px caja" de la lista de DREAMCO.
  const filas = [];
  for (let i = 0; i < 20; i++) {
    const costo = 1000 + i * 137;
    filas.push(fila(i, { costoActual: costo, precios: { 0: costo * 1.08, 1: costo * 1.13 } }));
  }
  const r = decidirLista({ filas, columnasDePrecio: [0, 1], config: { ...CONFIG, rango: { minPct: 5, maxPct: 15 } } });
  assert.equal(r.eleccion, null);
  assert.equal(r.motivoLista, MOTIVO_LISTA.EMPATE);
});

test("dos opciones que escriben el mismo costo NO son un empate", () => {
  // Es el caso de la lista de DREAMCO: el proveedor imprime "Px.U Final" con su
  // "%dsc" y además la columna "px caja" ya calculada, y las dos dan el mismo
  // número. Sin esta regla el motor veía un empate al 94 %, se negaba a elegir y
  // mandaba las 232 filas a revisar a mano. No había nada que preguntar.
  //
  // Y el centavo importa: en 35 de esas 232 filas las dos cuentas difieren en un
  // centavo por redondeo. Comparando exacto, esas 35 alcanzaban para el empate.
  const filas = [];
  for (let i = 0; i < 20; i++) {
    const costo = 1000 + i * 137;
    const caja = round2(costo * 1.1);
    const unitario = round2(caja / 0.61);
    filas.push(fila(i, { costoActual: costo, descuentoPct: 39, precios: { 0: unitario, 1: caja } }));
  }
  const r = decidirLista({ filas, columnasDePrecio: [0, 1], config: CONFIG });
  assert.notEqual(r.eleccion, null, `se negó a elegir: ${r.motivoLista}`);
  // Gana la columna tomada tal cual: es la que el usuario puede verificar
  // mirando el papel.
  assert.equal(r.eleccion.columna, 1);
  assert.equal(r.eleccion.conDescuento, false);
  assert.equal(r.resumen.aplicables, 20);
});

test("el tratamiento del descuento también es de la lista entera", () => {
  // El aumento real es del 10 % sobre el precio CON el descuento aplicado.
  const filas = [];
  for (let i = 0; i < 20; i++) {
    const costo = 1000 + i * 137;
    filas.push(
      fila(i, { costoActual: costo, descuentoPct: 12, precios: { 0: (costo * 1.1) / 0.88 } })
    );
  }
  const r = decidirLista({ filas, columnasDePrecio: [0], config: CONFIG });
  assert.equal(r.eleccion.conDescuento, true);
  assert.equal(r.resumen.aplicables, 20);
});

test("no se aplica un descuento que no hace falta", () => {
  // Con el precio ya neto de descuento, la opción "sin descuento" explica todo y
  // la "con descuento" no explica nada. Aplicarlo igual hundiría los costos un
  // 12 % sin que nadie lo pidiera.
  const filas = [];
  for (let i = 0; i < 20; i++) {
    const costo = 1000 + i * 137;
    filas.push(fila(i, { costoActual: costo, descuentoPct: 12, precios: { 0: costo * 1.1 } }));
  }
  const r = decidirLista({ filas, columnasDePrecio: [0], config: CONFIG });
  assert.equal(r.eleccion.conDescuento, false);
  assert.equal(r.resumen.aplicables, 20);
});

// ── REGLA (c): NINGUNA LECTURA EN RANGO ────────────────────────────────────

test("la fila cuyo precio no cae en rango queda para revisar, CON su costo y su porcentaje", () => {
  const filas = listaCoherente();
  filas.push(fila("rara", { costoActual: 1000, precios: { 0: 800, 1: 4000 } }));
  const r = decidirLista({ filas, columnasDePrecio: [0, 1], config: CONFIG });
  const rara = r.filas.find((f) => f.clave === "rara");
  assert.equal(rara.estado, "REVISAR");
  assert.equal(rara.motivo, MOTIVO_FILA.FUERA_DE_RANGO);
  assert.equal(rara.costoActual, 1000);
  assert.ok(rara.lecturas.length >= 1, "la fila para revisar tiene que mostrar sus lecturas");
  for (const l of rara.lecturas) {
    assert.ok(Number.isFinite(l.costoNuevo));
    assert.ok(Number.isFinite(l.variacionPct), "cada lectura muestra su porcentaje");
  }
  assert.equal(rara.costoPropuesto, undefined, "una fila para revisar NO propone costo");
});

// ── REGLA (d): CÓDIGO REPETIDO ─────────────────────────────────────────────

test("el código repetido con precios distintos no se decide solo", () => {
  const filas = listaCoherente();
  filas.push(fila("d1", { codigo: "DUP", costoActual: 1000, precios: { 0: 900, 1: 1100 } }));
  filas.push(fila("d2", { codigo: "DUP", costoActual: 1000, precios: { 0: 950, 1: 1150 } }));
  const r = decidirLista({ filas, columnasDePrecio: [0, 1], config: CONFIG });
  for (const clave of ["d1", "d2"]) {
    const f = r.filas.find((x) => x.clave === clave);
    assert.equal(f.estado, "REVISAR");
    assert.equal(f.motivo, MOTIVO_FILA.CODIGO_REPETIDO);
  }
});

test("el código repetido con el MISMO precio no es un conflicto", () => {
  // Es el mismo renglón dos veces: aplicarlo dos veces escribe lo mismo. Mandarlo
  // a revisar gastaría atención a cambio de nada.
  const filas = listaCoherente();
  filas.push(fila("i1", { codigo: "IGUAL", costoActual: 1000, precios: { 0: 1100 / 1.21, 1: 1100 } }));
  filas.push(fila("i2", { codigo: "IGUAL", costoActual: 1000, precios: { 0: 1100 / 1.21, 1: 1100 } }));
  const r = decidirLista({ filas, columnasDePrecio: [0, 1], config: CONFIG });
  for (const clave of ["i1", "i2"]) {
    assert.equal(r.filas.find((x) => x.clave === clave).estado, "APLICABLE");
  }
});

// ── REGLA (e): PRECIO QUE NO ES UN PRECIO ──────────────────────────────────

test("el precio cero, vacío o por debajo del piso se ignora y se cuenta", () => {
  const filas = listaCoherente();
  filas.push(fila("cero", { costoActual: 1000, precios: { 0: 0, 1: 0 } }));
  filas.push(fila("vacia", { costoActual: 1000, precios: {} }));
  filas.push(fila("centavo", { costoActual: 1000, precios: { 0: 0.4, 1: 0.5 } }));
  const r = decidirLista({ filas, columnasDePrecio: [0, 1], config: CONFIG });
  assert.equal(r.filas.find((f) => f.clave === "cero").motivo, MOTIVO_FILA.PRECIO_NO_CREIBLE);
  assert.equal(r.filas.find((f) => f.clave === "vacia").motivo, MOTIVO_FILA.SIN_PRECIO);
  assert.equal(r.filas.find((f) => f.clave === "centavo").motivo, MOTIVO_FILA.PRECIO_NO_CREIBLE);
  assert.equal(r.resumen.ignoradas, 3);
  // Y ninguna de las tres se aplica.
  for (const clave of ["cero", "vacia", "centavo"]) {
    assert.equal(r.filas.find((f) => f.clave === clave).estado, "IGNORADA");
  }
});

// ── REGLA (f): SIN COSTO ACTUAL NO SE APLICA NUNCA ─────────────────────────

test("sin costo actual la fila queda para revisar aunque haya UNA sola lectura posible", () => {
  // CONTRAPRUEBA DE LA REGLA: es la fila que más tienta aplicar. El precio es
  // creíble, el producto está vinculado y no hay factor de bulto, así que hay una
  // sola forma de leerlo. Lo que falta es lo único que importa: el número contra
  // el cual se controla.
  const filas = listaCoherente();
  filas.push(fila("sincosto", { costoActual: null, factorPack: null, precios: { 0: 900, 1: 1100 } }));
  const r = decidirLista({ filas, columnasDePrecio: [0, 1], config: CONFIG });
  const f = r.filas.find((x) => x.clave === "sincosto");
  assert.equal(f.estado, "REVISAR");
  assert.equal(f.motivo, MOTIVO_FILA.SIN_COSTO_ACTUAL);
  assert.equal(f.costoPropuesto, undefined);
  assert.equal(f.precio, 1100, "el precio leído igual se muestra");
});

test("una lista donde NINGUNA fila tiene costo no se aplica entera", () => {
  const filas = Array.from({ length: 20 }, (_, i) => fila(i, { precios: { 0: 1000 + i } }));
  const r = decidirLista({ filas, columnasDePrecio: [0], config: CONFIG });
  assert.equal(r.eleccion, null);
  assert.equal(r.motivoLista, MOTIVO_LISTA.SIN_FILAS_COMPARABLES);
  assert.equal(r.resumen.aplicables, 0);
});

// ── SIN RANGO NO HAY CRITERIO ──────────────────────────────────────────────

test("sin rango cargado no se decide nada", () => {
  const r = decidirLista({
    filas: listaCoherente(),
    columnasDePrecio: [0, 1],
    config: { ...CONFIG, rango: { minPct: null, maxPct: null } },
  });
  assert.equal(r.eleccion, null);
  assert.equal(r.motivoLista, MOTIVO_LISTA.SIN_RANGO);
  assert.equal(r.resumen.aplicables, 0);
});

// ── EL COSTO QUE NO SE MUEVE ───────────────────────────────────────────────

test("la lectura que da exactamente el costo de hoy no va a la cola de revisión", () => {
  const filas = listaCoherente();
  filas.push(fila("igual", { costoActual: 1000, precios: { 0: 1000 / 1.21, 1: 1000 } }));
  const r = decidirLista({ filas, columnasDePrecio: [0, 1], config: CONFIG });
  const f = r.filas.find((x) => x.clave === "igual");
  assert.equal(f.estado, "SIN_CAMBIO");
  assert.equal(f.costoPropuesto, 1000);
  assert.equal(f.variacionPct, 0);
});

// ── EL RECARGO Y EL IMPUESTO ───────────────────────────────────────────────

test("el impuesto adicional va sobre el precio de la lista, que ya trae el IVA", () => {
  const p = precioDeFila({
    fila: { precios: { 0: 1000 } },
    columna: 0,
    conDescuento: false,
    recargoPct: 0,
    impuestoAdicionalPct: 5,
  });
  assert.equal(p, 1050);
});

test("el descuento del renglón se aplica ANTES del recargo", () => {
  // 1000 menos 10 % son 900; más un recargo del 5 % son 945. Al revés —recargo
  // primero y descuento después— daría lo mismo con porcentajes, y por eso el
  // candado afirma el número y no el orden de las líneas: lo que se defiende es
  // el resultado.
  const p = precioDeFila({
    fila: { precios: { 0: 1000 }, descuentoPct: 10 },
    columna: 0,
    conDescuento: true,
    recargoPct: 5,
  });
  assert.equal(p, 945);
});

// ── LOS TEXTOS ─────────────────────────────────────────────────────────────

test("cada motivo tiene un texto que dice qué pasó, no un código", () => {
  for (const m of Object.values(MOTIVO_FILA)) {
    const t = TEXTO_MOTIVO_FILA[m];
    assert.ok(t, `falta el texto de ${m}`);
    assert.ok(t.length > 40, `el texto de ${m} no explica nada`);
    assert.doesNotMatch(t, /Error interno/i);
  }
  for (const m of Object.values(MOTIVO_LISTA)) {
    const t = TEXTO_MOTIVO_LISTA[m];
    assert.ok(t, `falta el texto de ${m}`);
    assert.ok(t.length > 40, `el texto de ${m} no explica nada`);
  }
});

test("los dos umbrales de la elección son valores, no condiciones escondidas", () => {
  // Si alguno vuelve a quedar escrito dentro de un `if`, cambiarlo deja de ser
  // una decisión y pasa a ser un renglón que nadie encuentra.
  assert.ok(MAYORIA_MINIMA > 0.5 && MAYORIA_MINIMA < 1);
  assert.ok(VENTAJA_MINIMA > 1);
});
