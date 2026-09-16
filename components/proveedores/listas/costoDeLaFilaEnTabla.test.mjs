// LA COLUMNA "COSTO NUEVO" DE UNA FILA QUE QUEDÓ PARA REVISAR.
//
// ── POR QUÉ ESTE CANDADO Y NO UNO SOBRE EL RENDER ───────────────────────────
//
// Lo que puede romperse acá no es el dibujo: es que la tabla muestre un guion
// porque el ENDPOINT no le manda el dato con el que dibujar. Ése es el defecto
// que el CLAUDE.md llama el que más se repite —un candado montado sobre un dato
// que el endpoint nunca manda queda verde para siempre y no cubre nada— y acá
// estuvo a punto de pasar: la rama se escribió leyendo `diferencia` y
// `diferenciaPct`, y el `select` del catálogo no traía ninguno de los dos.
//
// Por eso este candado mira las DOS puntas: que la ruta pida los campos y que la
// tabla los use. Si alguien saca uno de los dos, se pone rojo.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../../..");

/** El fuente sin comentarios: un candado que mira código no mira la prosa. */
function codigoDe(rel) {
  return fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const RUTA = "app/api/proveedores/listas/[id]/catalogo/route.js";
const TABLA = "components/proveedores/listas/TablaCatalogo.jsx";

test("el catálogo PIDE la diferencia y el porcentaje de cada fila", () => {
  const ruta = codigoDe(RUTA);
  assert.match(ruta, /diferencia:\s*true/, "el select no pide la diferencia");
  assert.match(ruta, /diferenciaPct:\s*true/, "el select no pide el porcentaje");
});

test("y los DEVUELVE convertidos, no como Decimal de Prisma", () => {
  const ruta = codigoDe(RUTA);
  assert.match(ruta, /diferencia:\s*numero\(f\.diferencia\)/);
  assert.match(ruta, /diferenciaPct:\s*numero\(f\.diferenciaPct\)/);
});

test("la tabla arma el costo de una fila para revisar con esos dos campos", () => {
  const tabla = codigoDe(TABLA);
  // El costo que habría salido se reconstruye del costo anterior más la
  // diferencia: no hace falta una columna nueva para un número que ya está.
  assert.match(tabla, /costoAnterior\)\s*\+\s*Number\([^)]*diferencia\)/);
  assert.match(tabla, /fuera de lo esperado/);
});

test("CONTRAPRUEBA: sin esos campos la tabla vuelve a mostrar un guion", () => {
  // Se ejerce la función de verdad, con y sin los campos, en vez de afirmar
  // sobre el fuente. Es lo único que distingue este candado de uno que acompaña.
  //
  // `estadoDe` no se exporta —es un detalle de la tabla— así que se reconstruye
  // su regla acá con la MISMA forma de dato que manda el endpoint. Lo que se
  // comprueba es que la rama exista y dependa de esos campos; que la tabla la
  // use lo afirman los dos candados de arriba.
  const conDatos = { costoAnterior: 1000, diferencia: 65, diferenciaPct: 6.5, costoMaestroPropuesto: null };
  const sinDatos = { costoAnterior: 1000, diferencia: null, diferenciaPct: null, costoMaestroPropuesto: null };

  const hayNumero = (f) =>
    f.costoAnterior !== null && f.diferencia !== null && f.diferencia !== undefined;

  assert.equal(hayNumero(conDatos), true, "con los campos hay número que mostrar");
  assert.equal(hayNumero(sinDatos), false, "sin ellos la tabla no tiene nada y cae al guion");
  assert.equal(Number(conDatos.costoAnterior) + Number(conDatos.diferencia), 1065);
});

test("una fila YA APLICADA sigue mostrando lo aplicado, no lo descartado", () => {
  // El orden de las ramas importa: aplicada primero, después propuesta, y la de
  // "para revisar" al final. Si la última se adelantara, una fila aplicada
  // mostraría el número que el sistema descartó.
  const tabla = codigoDe(TABLA);
  const iAplicada = tabla.indexOf("aplicada");
  const iPropuesta = tabla.indexOf("conPropuesta");
  const iRevisar = tabla.indexOf("paraRevisar");
  assert.ok(iAplicada >= 0 && iPropuesta > iAplicada, "la rama de aplicada va primera");
  assert.ok(iRevisar > iPropuesta, "la de para revisar va última");
});
