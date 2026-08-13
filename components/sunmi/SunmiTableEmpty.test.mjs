// EL TEXTO DE LA TABLA VACÍA NO SE PUEDE PERDER EN SILENCIO.
//
// `SunmiTableEmpty` recibe `message`. Diez lugares del repo le pasaban `label`,
// que el componente ignora, así que en todos salía el texto por defecto —"Sin
// datos disponibles"— en vez del que alguien había escrito. Estuvo así el tiempo
// suficiente como para que nadie recordara qué debía decir cada pantalla.
//
// Es la peor forma de fallar: no rompe, no avisa, y el que escribió el texto se
// va convencido de que lo puso. Un prop que no existe se ignora sin ruido.
//
// Este candado no valida el texto: valida que llegue. Enumera con `git ls-files`
// —incluyendo lo no trackeado, para que un archivo nuevo no lo esquive— y falla
// si alguien vuelve a escribir `label=` sobre este componente.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function archivosDeInterfaz() {
  const salida = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "app/**/*.jsx", "components/**/*.jsx"],
    { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  return [...new Set(salida.split("\n").map((s) => s.trim()).filter(Boolean))];
}

/** Las etiquetas de apertura de `<SunmiTableEmpty …>` de un archivo. */
function aperturas(texto) {
  const encontradas = [];
  for (const m of texto.matchAll(/<SunmiTableEmpty\b/g)) {
    let i = m.index;
    let prof = 0;
    for (; i < texto.length; i++) {
      if (texto[i] === "{") prof++;
      else if (texto[i] === "}") prof--;
      else if (texto[i] === ">" && prof === 0) break;
    }
    encontradas.push(texto.slice(m.index, i + 1));
  }
  return encontradas;
}

test("EL PROP SE LLAMA `message`, y `label` NO EXISTE", () => {
  const comp = fs.readFileSync(path.join(RAIZ, "components/sunmi/SunmiTableEmpty.jsx"), "utf8");
  assert.match(comp, /message\s*=\s*"Sin datos disponibles"/, "cambió el prop o su default");
  assert.doesNotMatch(comp, /\blabel\b/, "si algún día acepta `label`, este candado sobra");
});

test("NINGUNA PANTALLA LE PASA `label`: el texto se perdería sin avisar", () => {
  const culpables = [];
  for (const ruta of archivosDeInterfaz()) {
    if (ruta === "components/sunmi/SunmiTableEmpty.jsx") continue;
    const texto = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
    for (const etiqueta of aperturas(texto)) {
      if (/\blabel\s*=/.test(etiqueta)) culpables.push(`${ruta}: ${etiqueta.replace(/\s+/g, " ")}`);
    }
  }
  assert.deepEqual(culpables, [], `el texto de estas tablas vacías no llega:\n  ${culpables.join("\n  ")}`);
});

test("y el que sí lo usa le pasa `message`", () => {
  // La contracara: si mañana nadie usara el componente, el candado de arriba
  // pasaría en verde sin haber mirado nada.
  let conMessage = 0;
  for (const ruta of archivosDeInterfaz()) {
    if (ruta === "components/sunmi/SunmiTableEmpty.jsx") continue;
    for (const etiqueta of aperturas(fs.readFileSync(path.join(RAIZ, ruta), "utf8"))) {
      if (/\bmessage\s*=/.test(etiqueta)) conMessage++;
    }
  }
  assert.ok(conMessage >= 20, `solo ${conMessage} usos con message: ¿se dejó de usar?`);
});

test("el lector de etiquetas no se corta en un `>` que está adentro de una llave", () => {
  // `message={a > b ? "x" : "y"}` tiene un `>` que no cierra la etiqueta. Sin
  // contar llaves, el candado leería media etiqueta y no vería el `label` que
  // viniera después.
  const [etiqueta] = aperturas('<SunmiTableEmpty message={a > b ? "x" : "y"} label="z" />');
  assert.match(etiqueta, /label="z"/);
});
