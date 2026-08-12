// TODA CLAVE DEL PIE EXISTE COMO COLUMNA. En rojo acá, en silencio en producción.
//
// ── POR QUÉ ESTE CANDADO Y NO OTRO ─────────────────────────────────────────
//
// `celdasDelPie` ignora una clave que no existe y la informa en `desconocidas`,
// en vez de lanzar. Esa decisión está bien y su motivo está escrito allá: corre
// dentro del render, y una fila de totales mal escrita no puede dejar una
// pantalla en blanco.
//
// Pero tiene un costo, y este candado es lo que lo cierra: un error de tipeo en
// la clave sale como UN NÚMERO QUE NO APARECE. Nadie lo ve hasta que alguien
// suma a mano y no le da. Acá sale en rojo al correr la suite.
//
// ── SE MIRA EL CÓDIGO FUENTE, Y ESO ES A PROPÓSITO ─────────────────────────
//
// Las columnas viven dentro del componente, en un `useMemo` que se cierra sobre
// el estado: no se pueden importar sin montar React. Lo que sí se puede leer es
// el archivo. El precio es que esto entiende la forma en que están escritas hoy
// —`clave: "x"` y `valores: { x: … }`— y hay que tocarlo si esa forma cambia.
//
// Se enumera con `git ls-files`, que recorre el repo entero. `readdirSync` mira
// un nivel y ya dejó afuera un script peligroso una vez.

import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";

const RAIZ = process.cwd();

/** Los archivos que declaran un pie, buscados en todo el repo. */
function archivosConPie() {
  const salida = execSync('git ls-files "*.jsx"', { cwd: RAIZ, encoding: "utf8" });
  return salida
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((f) => /(\n|^)\s*pie=\{/.test(fs.readFileSync(f, "utf8")));
}

/** Las claves de columna declaradas en un archivo. */
export function clavesDeColumnas(texto) {
  return new Set([...texto.matchAll(/\bclave:\s*"([^"]+)"/g)].map((m) => m[1]));
}

/** Las claves que el pie usa dentro de `valores: { … }`, contando llaves. */
export function clavesDelPie(texto) {
  const claves = [];
  for (const m of texto.matchAll(/\bvalores:\s*\{/g)) {
    let i = m.index + m[0].length;
    let prof = 1;
    const desde = i;
    while (i < texto.length && prof > 0) {
      if (texto[i] === "{") prof++;
      else if (texto[i] === "}") prof--;
      i++;
    }
    const bloque = texto.slice(desde, i - 1);
    // Solo las del primer nivel: una clave anidada es de otra cosa.
    let p = 0;
    for (const linea of bloque.split("\n")) {
      const nombre = p === 0 ? linea.match(/^\s*([A-Za-z_$][\w$]*)\s*:/) : null;
      if (nombre) claves.push(nombre[1]);
      for (const ch of linea) {
        if (ch === "{" || ch === "(" || ch === "[") p++;
        else if (ch === "}" || ch === ")" || ch === "]") p--;
      }
    }
  }
  return claves;
}

test("HAY AL MENOS UN PIE que mirar, o este candado no está probando nada", () => {
  // Sin esto, el día que el pie se deje de usar este archivo pasaría en verde
  // sin haber comprobado una sola clave.
  assert.ok(archivosConPie().length >= 1, "ningún archivo declara pie={");
});

test("TODA CLAVE DEL PIE EXISTE COMO COLUMNA, en todos los archivos que lo usan", () => {
  for (const f of archivosConPie()) {
    const texto = fs.readFileSync(f, "utf8");
    const columnas = clavesDeColumnas(texto);
    const delPie = clavesDelPie(texto);
    assert.ok(delPie.length > 0, `${f}: declara un pie sin ninguna clave`);
    for (const k of delPie) {
      assert.ok(
        columnas.has(k),
        `${f}: el pie usa la clave "${k}" y ninguna columna la declara. ` +
          `Columnas: ${[...columnas].join(", ")}`
      );
    }
  }
});

// ── EL CANDADO SE PRUEBA METIENDO EL ERROR ─────────────────────────────────
//
// Un candado escrito mirando el código puede aprobar justo el defecto que existe
// para atajar. Acá se le cambia una letra a una clave y se comprueba que lo ve.

test("LE CAMBIO UNA LETRA A LA CLAVE Y EL CANDADO LA ATRAPA", () => {
  const bueno = `
    const columnas = [{ clave: "producto" }, { clave: "subOrig" }, { clave: "subCorr" }];
    <SunmiTable pie={{ etiqueta: "TOTAL", valores: { subOrig: <span>1</span>, subCorr: <span>2</span> } }} />
  `;
  const malo = bueno.replace("valores: { subOrig", "valores: { subOrgi");

  const revisar = (texto) => {
    const cols = clavesDeColumnas(texto);
    return clavesDelPie(texto).filter((k) => !cols.has(k));
  };

  assert.deepEqual(revisar(bueno), [], "el bueno tiene que pasar limpio");
  assert.deepEqual(revisar(malo), ["subOrgi"], "el de la letra cambiada tiene que salir");
});

test("una clave anidada adentro de un valor NO se cuenta como clave del pie", () => {
  // `style={{ color: … }}` adentro de un valor no es una columna.
  const texto = `
    const columnas = [{ clave: "total" }];
    pie={{ valores: { total: <span style={{ color: "red" }}>1</span> } }}
  `;
  assert.deepEqual(clavesDelPie(texto), ["total"]);
});
