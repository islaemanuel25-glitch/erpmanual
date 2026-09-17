// QUÉ COLUMNA DE PRECIO ELIGE LA LISTA DE ARCOR, Y POR QUÉ ANTES ELEGÍA MAL.
//
// ── EL CASO, CON SUS NÚMEROS ───────────────────────────────────────────────
//
// Emanuel subió `DOC-20260917-WA0021.pdf`, una lista de Arcor, con el rango en
// 0 % a 0 % A PROPÓSITO: no quería actualizar nada, quería ver si la lista
// coincidía con sus costos. El archivo trae DOS columnas de precio, sin IVA y
// con IVA —3113 MOGUL x1 Kg CONITOS sale 9,131.73 y 11,049.39— y el sistema se
// quedó con la de SIN IVA. Quedaron 213 filas para revisar, todas diciendo
// "entre 0,0 % y 0,0 %".
//
// ── POR QUÉ ELIGIÓ LA EQUIVOCADA ───────────────────────────────────────────
//
// No la eligió: se rindió, y la de sin IVA es la primera candidata.
//
// `rangoValido({minPct:0, maxPct:0})` da true —0 ≤ 0— así que el motor siguió
// como si fuera una lista normal. Para elegir la columna de toda la lista, cada
// opción se puntúa contando cuántas filas "explica", y con el rango en 0 una
// fila solo cuenta si el precio da EXACTAMENTE el costo de hoy, al centavo:
// `SIN_AUMENTO` compara `aCentavos(a) === aCentavos(b)`.
//
// Con redondeo eso no pasa casi nunca. Las DOS columnas sacaron cero, ninguna
// llegó a la mayoría mínima, y el motor devolvió NINGUNA_OPCION_CLARA — que en
// la pantalla es "elegí vos", con "coincide en 0 de cada 100 productos" en las
// dos opciones. Le pidió que eligiera sin darle con qué.
//
// ── DE DÓNDE SALEN ESTOS NÚMEROS ───────────────────────────────────────────
//
// Del PDF armado con la forma de la lista de Arcor —dos columnas de precio,
// U.M. de UN/DI/BU, cantidad, títulos de rubro con "$0.00" y formato de número
// inglés— leído con la cadena de verdad: `leerArchivoDeLista` sobre el PDF y
// `proponerMapeo` sobre sus títulos. Las filas de abajo son las que ese lector
// devolvió, no unas escritas a mano que parecieran razonables. El generador
// vive en el scratchpad de la tanda y su salida está transcripta acá con los
// mismos valores que imprimió.
//
//   node --experimental-loader ./scripts/alias-loader.mjs --test lib/proveedores/listas/columnaDeLaListaDeArcor.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { MOTIVO_LISTA, decidirLista } from "./decisionDeLista.js";
import { MODO_LISTA } from "./modoDeLaLista.js";

// Las dos columnas de precio, tal como las numeró el mapeo del lector sobre
// este archivo: 4 es "S/IVA" y 5 es "C/IVA".
const SIN_IVA = 4;
const CON_IVA = 5;
const COLUMNAS = [SIN_IVA, CON_IVA];

/**
 * Las filas que devolvió el lector, con el costo del catálogo agregado.
 *
 * `factorPack` va cargado SOLO donde el producto se guarda por bulto, que es la
 * condición con la que la ruta lo pasa: multiplicar el precio por el factor de
 * un producto que se guarda suelto daría el costo de una caja escrito como si
 * fuera el de una unidad.
 */
const LISTA = [
  { clave: 0, codigo: "3113", sinIva: 9131.73, conIva: 11049.39, factorPack: null },
  { clave: 1, codigo: "3096", sinIva: 8742.15, conIva: 10578.0, factorPack: null },
  { clave: 2, codigo: "13113", sinIva: 4416.48, conIva: 5343.94, factorPack: null },
  { clave: 3, codigo: "3120", sinIva: 9450.0, conIva: 11434.5, factorPack: null },
  { clave: 4, codigo: "7742", sinIva: 1684.03, conIva: 2037.68, factorPack: 20 },
  { clave: 5, codigo: "7740", sinIva: 1684.03, conIva: 2037.68, factorPack: 20 },
  { clave: 6, codigo: "7801", sinIva: 5120.44, conIva: 6195.73, factorPack: null },
  { clave: 7, codigo: "7810", sinIva: 3980.12, conIva: 4815.95, factorPack: null },
  { clave: 8, codigo: "9101", sinIva: 966.94, conIva: 1170.0, factorPack: 24 },
  { clave: 9, codigo: "9140", sinIva: 742.3, conIva: 898.18, factorPack: 24 },
  { clave: 10, codigo: "9155", sinIva: 2210.55, conIva: 2674.77, factorPack: null },
  { clave: 11, codigo: "9160", sinIva: 3055.8, conIva: 3697.52, factorPack: 12 },
];

/** La lectura del con IVA que corresponde a cómo está cargado el producto. */
const conIvaDelProducto = (f) => (f.factorPack ? f.conIva * f.factorPack : f.conIva);

/**
 * UN COSTO REAL NO ES IGUAL AL PRECIO DE LA LISTA AL CENTAVO, Y ESO ES TODO.
 *
 * El primer intento de este candado ponía el costo EXACTAMENTE igual al precio
 * con IVA, y por eso no reproducía nada: con costos exactos, `SIN_AUMENTO` —que
 * compara al centavo— se encendía igual con el puntaje viejo, el motor elegía
 * bien, y la corrida "vieja" daba lo mismo que la nueva. Un fixture más prolijo
 * que la realidad apaga justo el defecto que se quiere mostrar.
 *
 * El costo de un producto viene de una compra anterior, con su redondeo y sus
 * centavos propios: se parece al precio de la lista, no es idéntico. Acá se le
 * pone una diferencia chica y determinista —entre 0,08 % y 0,32 %, distinta por
 * fila y nunca cero— que es exactamente el tamaño de diferencia para el que la
 * tolerancia existe.
 */
const comoLoGuardaElSistema = (valor, clave) =>
  Math.round(valor * (1 + ((clave % 4) + 1) * 0.0008) * 100) / 100;

/**
 * El catálogo de Emanuel, en la hipótesis que se quiere probar.
 *
 * @param factor  1 → los costos son los de la columna con IVA salvo redondeo
 *                (la lista no aumentó nada: es el caso de controlar).
 *                1/1.15 → los costos están un 15 % por debajo (la lista trae un
 *                aumento del 15 %: es el caso de actualizar).
 * @param salvo   claves que no siguen la regla, con su costo propio.
 */
function filasConCosto(factor, salvo = {}) {
  return LISTA.map((f) => ({
    clave: f.clave,
    codigo: f.codigo,
    precios: { [SIN_IVA]: f.sinIva, [CON_IVA]: f.conIva },
    descuentoPct: null,
    cantidadDelArchivo: null,
    factorPack: f.factorPack,
    costoActual:
      f.clave in salvo
        ? salvo[f.clave]
        : comoLoGuardaElSistema(conIvaDelProducto(f) * factor, f.clave),
  }));
}

test("EL CATÁLOGO DE PRUEBA TIENE LA FORMA DEL REAL: ningún costo cae al centavo", () => {
  // CONTRA EL FIXTURE DEMASIADO PROLIJO. Si algún costo quedara idéntico al
  // precio de la lista, esa fila se explicaría sola con el puntaje viejo y la
  // reproducción del defecto de abajo se debilitaría sin avisar.
  for (const f of filasConCosto(1)) {
    const conIva = LISTA[f.clave].factorPack
      ? LISTA[f.clave].conIva * LISTA[f.clave].factorPack
      : LISTA[f.clave].conIva;
    assert.notEqual(
      Math.round(f.costoActual * 100),
      Math.round(conIva * 100),
      `la fila ${f.codigo} tiene el costo idéntico al precio: el fixture es más prolijo que la realidad`
    );
    // Y la diferencia tiene que ser de redondeo, no un aumento disfrazado.
    assert.ok(Math.abs(f.costoActual - conIva) / conIva < 0.005, `la fila ${f.codigo} difiere demasiado`);
  }
});

// EL CASO REAL DE EMANUEL, y va como excepción en los dos escenarios: Cofler Air
// Blanco 27 g está cargado por caja de 20 y hoy cuesta $35.364,59. Ninguna de
// las lecturas del con IVA da eso —2.037,68 la unidad, 40.753,60 la caja— así
// que es la fila que NO coincide, y es exactamente la que él vio informada como
// "la lista dice $1.684,03", que es el precio sin IVA de la unidad.
const COFLER = 4;
const COSTO_COFLER = 35364.59;

// ── LO QUE PASABA ANTES ───────────────────────────────────────────────────

test("REPRODUCE EL DEFECTO: con 0 a 0 en modo actualizar, el motor no elige", () => {
  // Es la corrida que produjo las 213 filas. Se deja escrita porque es lo que
  // le da sentido al arreglo: sin esto, el candado de abajo podría estar
  // afirmando que algo que ya andaba sigue andando.
  const r = decidirLista({
    filas: filasConCosto(1, { [COFLER]: COSTO_COFLER }),
    columnasDePrecio: COLUMNAS,
    config: { rango: { minPct: 0, maxPct: 0 }, modo: MODO_LISTA.ACTUALIZAR },
  });

  assert.equal(r.eleccion, null, "con 0 a 0 el motor no debería poder elegir");
  assert.equal(r.motivoLista, MOTIVO_LISTA.NINGUNA_OPCION_CLARA);

  // Y lo que hace que la pantalla sea inservible: las dos opciones con cero.
  for (const o of r.opciones) {
    assert.equal(o.explicadas, 0, `la opción de la columna ${o.columna} explicaba ${o.explicadas}`);
  }
});

// ── CONTROLAR ─────────────────────────────────────────────────────────────

test("CONTROLANDO, LA LISTA SE QUEDA CON LA COLUMNA CON IVA", () => {
  const r = decidirLista({
    filas: filasConCosto(1, { [COFLER]: COSTO_COFLER }),
    columnasDePrecio: COLUMNAS,
    config: { modo: MODO_LISTA.CONTROLAR },
  });

  assert.ok(r.eleccion, `no eligió ninguna columna: ${r.motivoLista}`);
  assert.equal(r.eleccion.columna, CON_IVA, "se quedó con la columna equivocada");

  // La separación tiene que ser GRANDE, no de un voto: es lo que hace que la
  // elección sea una elección y no una moneda.
  const porColumna = Object.fromEntries(r.opciones.map((o) => [o.columna, o.explicadas]));
  assert.equal(porColumna[SIN_IVA], 0, "la columna sin IVA no tendría que explicar ninguna");
  assert.ok(porColumna[CON_IVA] >= 11, `la con IVA explicó solo ${porColumna[CON_IVA]} de 12`);
});

test("CONTROLAR NO NECESITA RANGO CARGADO", () => {
  // La pantalla de subir no lo pregunta cuando se elige controlar. Si el motor
  // lo exigiera igual, la lista entera caería en SIN_RANGO mandando a cargar un
  // dato que este modo no usa para nada.
  const r = decidirLista({
    filas: filasConCosto(1, { [COFLER]: COSTO_COFLER }),
    columnasDePrecio: COLUMNAS,
    config: { modo: MODO_LISTA.CONTROLAR, rango: {} },
  });
  assert.notEqual(r.motivoLista, MOTIVO_LISTA.SIN_RANGO);
  assert.equal(r.eleccion?.columna, CON_IVA);
});

test("el control informa las tres situaciones, y el caso de Emanuel cae en la suya", () => {
  const r = decidirLista({
    filas: filasConCosto(1, { [COFLER]: COSTO_COFLER }),
    columnasDePrecio: COLUMNAS,
    config: { modo: MODO_LISTA.CONTROLAR },
  });

  assert.equal(r.resumen.coinciden, 11, `coincidieron ${r.resumen.coinciden}`);

  // Cofler: su costo ($35.364,59) está POR DEBAJO de lo que dice la lista leída
  // por caja ($40.753,60), así que la lista dice más.
  const cofler = r.filas.find((f) => f.codigo === "7742");
  assert.equal(cofler.estado, "CONTROL");
  assert.equal(cofler.control, "TU_COSTO_MAS_BAJO");
  assert.equal(r.resumen.tuCostoMasBajo, 1);

  // Y ninguna fila queda como aplicable: controlar no propone escribir nada.
  assert.equal(r.resumen.aplicables, 0);
});

// ── ACTUALIZAR ────────────────────────────────────────────────────────────

test("ACTUALIZANDO CON 10 A 20, TAMBIÉN SE QUEDA CON LA COLUMNA CON IVA", () => {
  // Los costos, un 15 % por debajo del precio con IVA: la lista trae un aumento
  // normal de este proveedor. Leída por la columna con IVA da +15 %, que cae en
  // el rango; leída por la de sin IVA da −5 %, que no.
  const r = decidirLista({
    filas: filasConCosto(1 / 1.15, { [COFLER]: COSTO_COFLER }),
    columnasDePrecio: COLUMNAS,
    config: { rango: { minPct: 10, maxPct: 20 }, modo: MODO_LISTA.ACTUALIZAR },
  });

  assert.ok(r.eleccion, `no eligió ninguna columna: ${r.motivoLista}`);
  assert.equal(r.eleccion.columna, CON_IVA);

  const porColumna = Object.fromEntries(r.opciones.map((o) => [o.columna, o.explicadas]));
  assert.equal(porColumna[SIN_IVA], 0, "la columna sin IVA no tendría que explicar ninguna");
  assert.ok(porColumna[CON_IVA] >= 11, `la con IVA explicó solo ${porColumna[CON_IVA]} de 12`);
});

test("CONTRAPRUEBA: sin el puntaje por coincidencia, controlar vuelve a no elegir", () => {
  // Lo que se afirma es que el arreglo ES el cambio de objetivo del puntaje, y
  // no otra cosa que se movió de paso. Con los MISMOS datos y el MISMO catálogo,
  // pedidos en modo actualizar con el rango en cero —que es el puntaje viejo—,
  // el motor se sigue rindiendo.
  const datos = {
    filas: filasConCosto(1, { [COFLER]: COSTO_COFLER }),
    columnasDePrecio: COLUMNAS,
  };
  const viejo = decidirLista({ ...datos, config: { rango: { minPct: 0, maxPct: 0 }, modo: MODO_LISTA.ACTUALIZAR } });
  const nuevo = decidirLista({ ...datos, config: { modo: MODO_LISTA.CONTROLAR } });

  assert.equal(viejo.eleccion, null);
  assert.equal(nuevo.eleccion?.columna, CON_IVA);
});
