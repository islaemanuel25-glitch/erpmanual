// LOS TRES GRUPOS DE UNA LISTA CONTROLADA.
//
// ── DE DÓNDE SALEN LAS FILAS DE PRUEBA ─────────────────────────────────────
//
// Del `select` de la ruta del resultado, campo por campo, y no de lo que
// parecería razonable escribir. Es la regla que este repo pagó tres veces: un
// candado montado sobre una fila que el endpoint nunca manda queda verde para
// siempre y no cubre nada.
//
// Las dos columnas que importan son `costoAnterior` y `costoMaestroPropuesto`,
// las dos ya persistidas, y el grupo se DEDUCE de las dos. Por eso `contarControl`
// no recibe ningún campo nuevo: si recibiera uno, habría que preguntarse quién
// lo escribe.
//
//   node --experimental-loader ./scripts/alias-loader.mjs --test lib/proveedores/listas/contarControl.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { contarControl } from "./resultadoDeLaLista.js";
import { ESTADO_LINEA } from "./estados.js";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const RUTA_RESULTADO = "app/api/proveedores/listas/[id]/resultado/route.js";

/** Una fila como la trae el `select` de la ruta del resultado. */
const fila = (costoAnterior, costoMaestroPropuesto, extra = {}) => ({
  id: 1,
  estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
  motivo: null,
  costoAnterior,
  costoMaestroPropuesto,
  productoBaseId: 7,
  excluidaManual: false,
  aplicada: false,
  ...extra,
});

test("cada fila cae en uno solo de los tres grupos", () => {
  const r = contarControl([
    fila(1000, 1000),
    fila(1000, 1200),
    fila(1000, 800),
  ]);
  assert.equal(r.coinciden, 1);
  assert.equal(r.tuCostoMasBajo, 1);
  assert.equal(r.tuCostoMasAlto, 1);
  assert.equal(r.sinComparar, 0);
  assert.equal(r.total, 3);
});

test("LAS CUENTAS CIERRAN: los cuatro grupos suman el total", () => {
  // Sin esto, una fila podría no caer en ninguno y el resumen mostraría menos
  // productos de los que la lista tiene, sin que nada avise.
  const filas = [
    fila(1000, 1000),
    fila(1000, 1000.4),
    fila(1000, 1500),
    fila(1000, 700),
    fila(null, 900),
    fila(1000, null),
  ];
  const r = contarControl(filas);
  assert.equal(
    r.coinciden + r.tuCostoMasBajo + r.tuCostoMasAlto + r.sinComparar,
    r.total,
    `los grupos suman ${r.coinciden + r.tuCostoMasBajo + r.tuCostoMasAlto + r.sinComparar} y el total es ${r.total}`
  );
});

test("el redondeo NO cuenta como diferencia, que es todo el punto del modo", () => {
  // Es la diferencia entre este contador y un rango en cero: con 0 a 0, medio
  // peso sobre mil ya era "aumento". Acá es el mismo costo.
  const r = contarControl([fila(1000, 1000.4), fila(1000, 999.6), fila(35364.59, 35400)]);
  assert.equal(r.coinciden, 3, "el redondeo se está contando como diferencia");
});

test("SIN COSTO NO SE INVENTA UN VEREDICTO", () => {
  // Una fila sin producto vinculado no tiene contra qué compararse. Decir "la
  // lista dice más" sobre ella sería afirmar algo que nadie midió; va a su
  // propio grupo, que es el mismo "de la lista que no tenés" que ya existe.
  const r = contarControl([fila(null, 900), fila(0, 900), fila(1000, null)]);
  assert.equal(r.sinComparar, 3);
  assert.equal(r.coinciden + r.tuCostoMasBajo + r.tuCostoMasAlto, 0);
});

test("el caso real de Emanuel, con los números de su captura", () => {
  // Cofler Air Blanco 27 g, cargado por caja de 20 y con costo $35.364,59. La
  // lista leída por la columna sin IVA daba $1.684,03 por unidad, o sea
  // $33.680,60 la caja: su costo es MÁS ALTO que lo que dice la lista.
  const r = contarControl([fila(35364.59, 1684.03 * 20)]);
  assert.equal(r.tuCostoMasAlto, 1);
  assert.equal(r.coinciden, 0);
});

test("CONTRAPRUEBA: sin tolerancia, los que coinciden se irían a los otros grupos", () => {
  // Lo que se afirma es que el agrupamiento usa la tolerancia y no una
  // comparación al centavo. Con la comparación exacta, estas tres filas —que son
  // el mismo costo con redondeo distinto— se repartirían entre "más bajo" y
  // "más alto" y el control informaría diferencias que no existen.
  const conRedondeo = [fila(1000, 1000.4), fila(1000, 999.6), fila(2000, 2000.5)];
  const r = contarControl(conRedondeo);
  assert.equal(r.coinciden, 3);

  const alCentavo = conRedondeo.filter(
    (f) => Math.round(f.costoAnterior * 100) === Math.round(f.costoMaestroPropuesto * 100)
  ).length;
  assert.equal(alCentavo, 0, "ninguna de las tres coincide al centavo: la tolerancia es lo que las junta");
});

test("una lista vacía no rompe y contesta todo en cero", () => {
  const r = contarControl([]);
  assert.deepEqual(r, { coinciden: 0, tuCostoMasBajo: 0, tuCostoMasAlto: 0, sinComparar: 0, total: 0 });
});

test("LA RUTA PIDE LAS DOS COLUMNAS QUE ESTE CONTADOR NECESITA", () => {
  // ── LA MITAD QUE NO SE PUEDE AFIRMAR CON UNA FUNCIÓN PURA ────────────────
  //
  // `contarControl` agrupa por `costoAnterior` y `costoMaestroPropuesto`. Si el
  // `select` de la ruta no pidiera una de las dos, llegaría en `undefined`,
  // `compararConLaLista` contestaría `null` para TODAS las filas, y el control
  // mostraría "0 coinciden · 0 más bajo · 0 más alto" sobre una lista entera.
  //
  // Eso no rompe nada ni pone nada en rojo: es un resumen prolijo y vacío, con
  // los siete candados de arriba en verde. Es exactamente la forma del defecto
  // que CLAUDE.md nombra como el que más se repite.
  const fuente = fs.readFileSync(path.join(RAIZ, RUTA_RESULTADO), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  const campos = fuente.match(/const CAMPOS_CONTEO = \{[\s\S]*?\n\};/);
  assert.ok(campos, `no se encontró CAMPOS_CONTEO en ${RUTA_RESULTADO}`);

  for (const columna of ["costoAnterior", "costoMaestroPropuesto"]) {
    assert.match(
      campos[0],
      new RegExp(`\\b${columna}:\\s*true\\b`),
      `${RUTA_RESULTADO} no pide \`${columna}\`, así que el control contaría todo en cero.`
    );
  }
});

test("CONTRAPRUEBA: el lector del select ve la falta de una columna", () => {
  // Un `match` sobre un recorte mal hecho pasa en verde sobre cualquier cosa.
  const conLas2 = "const CAMPOS_CONTEO = {\n  costoAnterior: true,\n  costoMaestroPropuesto: true,\n};";
  const conUna = "const CAMPOS_CONTEO = {\n  costoAnterior: true,\n};";
  const recortar = (t) => t.match(/const CAMPOS_CONTEO = \{[\s\S]*?\n\};/)?.[0] ?? "";

  assert.match(recortar(conLas2), /\bcostoMaestroPropuesto:\s*true\b/);
  assert.doesNotMatch(recortar(conUna), /\bcostoMaestroPropuesto:\s*true\b/);
  assert.ok(recortar(conUna).length > 0, "el recorte tiene que encontrar el bloque igual");
});
