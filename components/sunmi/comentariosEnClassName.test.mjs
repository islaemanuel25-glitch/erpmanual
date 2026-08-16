// NINGÚN `className` PUEDE LLEVAR UN COMENTARIO ADENTRO DE LA CADENA.
//
// ── QUÉ DEFECTO CIERRA ESTE CANDADO ────────────────────────────────────────
//
// Un comentario escrito DENTRO de la cadena del `className` no es un comentario
// para el navegador. `/*`, las palabras de adentro y `*/` entran al atributo
// como clases sueltas, y las que casualmente son clases de Tailwind se aplican.
// Como tienen la misma especificidad que la clase real, decide el orden de la
// hoja de estilos y no el del atributo: gana cualquiera.
//
// Aparecieron CINCO casos y los cinco dibujaban algo distinto de lo escrito:
//
//   · `SunmiCard`      `p-3 /* antes p-4 / p-6 */`   ganaba `p-6`: 21 px y no 12.
//   · `SunmiSeparator` `my-2 /* antes my-4 o my-6 */` ganaba `my-6`: 21 px y no 7.
//   · `SunmiToggle` ×2 `w-8 h-4 /* antes w-10 h-5 */` y `w-4 h-4 /* antes w-5
//     h-5 */`. Acá el ancho lo ganaba el código y el alto el comentario, en la
//     MISMA cadena — por eso esto no se deduce leyendo, hay que medirlo.
//   · `SunmiLoader`    `${borderColor} /* antes border-2 */`. Éste es el peor:
//     el código no declaraba ancho de borde, así que el anillo del spinner
//     existía SOLO por el comentario. Limpiarlo sin reponer `border-2` lo
//     dejaba invisible en las 37 pantallas que lo usan.
//
// Van cinco. El sexto lo tiene que frenar la suite, no una lectura.
//
// ── POR QUÉ NO ALCANZA CON BUSCAR "className" Y "/*" ───────────────────────
//
// Lo que distingue el caso malo del inocente es DÓNDE vive el comentario:
//
//   className={`p-3 /* antes p-6 */`}     ← ADENTRO de la cadena: entra al DOM
//   className={/* nota */ "p-3"}          ← afuera: se lo come el compilador
//   <div>{/* nota */}</div>               ← comentario JSX: tampoco entra
//
// Así que hay que aislar el valor del atributo —contando llaves, porque adentro
// puede haber ternarios y plantillas— y recién ahí aislar las CADENAS.
//
// Y este candado NO saca los comentarios antes de mirar, que es lo que hacen los
// demás candados de texto del proyecto: acá los comentarios SON el objeto de la
// pregunta. Lo que sí hace es no confundir uno de adentro con uno de afuera.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const RAIZ = process.cwd();

/** Los valores de `className=` de un archivo, con su línea. */
export function valoresDeClassName(texto) {
  const salida = [];
  let comilla = null;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comilla) {
      if (c === "\\") { i += 1; continue; }
      if (c === comilla) comilla = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { comilla = c; continue; }

    const m = texto.slice(i).match(/^className\s*=\s*(\{|"|')/);
    if (!m) continue;
    const linea = texto.slice(0, i).split("\n").length;

    if (m[1] === '"' || m[1] === "'") {
      const fin = texto.indexOf(m[1], i + m[0].length);
      if (fin === -1) break;
      salida.push({ linea, valor: texto.slice(i + m[0].length, fin) });
      i = fin;
      continue;
    }

    let j = i + m[0].length, prof = 1, q = null;
    for (; j < texto.length && prof > 0; j++) {
      const d = texto[j];
      if (q) { if (d === "\\") j += 1; else if (d === q) q = null; continue; }
      if (d === '"' || d === "'" || d === "`") { q = d; continue; }
      if (d === "{") prof += 1;
      else if (d === "}") prof -= 1;
    }
    salida.push({ linea, valor: texto.slice(i + m[0].length, j - 1) });
    i = j - 1;
  }
  return salida;
}

/** Las CADENAS que viven adentro de una expresión de className. */
export function cadenasDe(valor) {
  const out = [];
  let i = 0;
  while (i < valor.length) {
    const c = valor[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      for (; j < valor.length; j++) {
        if (valor[j] === "\\") { j += 1; continue; }
        if (valor[j] === c) break;
      }
      out.push(valor.slice(i + 1, j));
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out;
}

/** ¿Esta cadena de clases lleva un comentario adentro? */
export function llevaComentario(cadena) {
  return cadena.includes("/*") || cadena.includes("*/") || /(^|\s)\/\//.test(cadena);
}

function archivosDelRepo() {
  return execSync('git ls-files "*.jsx" "*.js"', { cwd: RAIZ, encoding: "utf8" })
    .split("\n").map((s) => s.trim())
    .filter((s) => s && (s.startsWith("app/") || s.startsWith("components/") || s.startsWith("lib/")));
}

function ofensores() {
  const out = [];
  for (const rel of archivosDelRepo()) {
    const texto = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    for (const { linea, valor } of valoresDeClassName(texto)) {
      for (const cadena of cadenasDe(valor)) {
        if (llevaComentario(cadena)) {
          out.push(`${rel}:${linea} -> ${JSON.stringify(cadena.replace(/\s+/g, " ").trim())}`);
        }
      }
    }
  }
  return out;
}

test("NINGÚN className DEL REPO LLEVA UN COMENTARIO ADENTRO DE LA CADENA", () => {
  assert.deepEqual(
    ofensores(),
    [],
    "un comentario adentro del className entra al DOM como clases sueltas y las de " +
      "Tailwind se aplican. Sacalo del template literal y ponelo arriba, como comentario " +
      "de JavaScript."
  );
});

// EL CANDADO SABE MIRAR, Y SABE NO MIRAR DE MÁS.
//
// Sin esto, un extractor roto devuelve la lista vacía y el candado queda en
// verde afirmando nada — que es exactamente el modo en que dos candados de esta
// misma tanda ya salieron mudos.
test("EL CANDADO SABE MIRAR: reconoce los cinco casos reales", () => {
  const REALES = [
    'className={`p-3          /* antes p-4 / p-6 */ ${className}`}',
    'className={`my-2          /* antes my-4 o my-6 */`}',
    'className={`w-8 h-4       /* antes w-10 h-5 */ rounded-full`}',
    'className={`w-4 h-4       /* antes w-5 h-5 */ bg-white`}',
    'className={`${borderColor}       /* antes border-2 */ ${spinnerColor}`}',
  ];
  for (const fuente of REALES) {
    const encontrados = valoresDeClassName(fuente)
      .flatMap(({ valor }) => cadenasDe(valor))
      .filter(llevaComentario);
    assert.ok(encontrados.length > 0, `no lo detectó: ${fuente}`);
  }
});

test("EL CANDADO NO MARCA DE MÁS: el comentario de AFUERA es legítimo", () => {
  const INOCENTES = [
    // Comentario en la expresión, fuera de la cadena: no llega al DOM.
    'className={/* el ancho lo pone la pantalla */ "p-3"}',
    // Cadena normal.
    'className="flex items-center gap-2"',
    // Plantilla con ternario y sin comentarios.
    'className={`p-3 ${activo ? "bg-amber-400" : "bg-slate-600"}`}',
    // Una URL en OTRO atributo no es asunto de este candado.
    'className={`p-3`} href="https://operix.cloud"',
  ];
  for (const fuente of INOCENTES) {
    const encontrados = valoresDeClassName(fuente)
      .flatMap(({ valor }) => cadenasDe(valor))
      .filter(llevaComentario);
    assert.deepEqual(encontrados, [], `marcó de más: ${fuente}`);
  }
});

test("EL CANDADO ENUMERA DE VERDAD: no mira tres archivos y dice que está limpio", () => {
  // `git ls-files` recorre el repo entero; `readdirSync` mira un nivel y ya dejó
  // un script peligroso afuera de tres auditorías.
  const archivos = archivosDelRepo();
  assert.ok(archivos.length > 500, `solo enumeró ${archivos.length} archivos: revisá el comando`);
  assert.ok(
    archivos.includes("components/sunmi/SunmiSeparator.jsx"),
    "no está mirando el kit"
  );
});

// ── LO QUE CADA PIEZA TIENE QUE SEGUIR DECLARANDO ──────────────────────────
//
// El candado de arriba impide que vuelva el comentario. Éstos impiden lo otro:
// que al limpiarlo se pierda lo que el comentario estaba sosteniendo. Son casos
// distintos y el primero no cubre al segundo.

const claseDe = (rel) => {
  const texto = fs.readFileSync(path.join(RAIZ, rel), "utf8");
  return valoresDeClassName(texto).flatMap(({ valor }) => cadenasDe(valor)).join(" ");
};

test("SunmiLoader: el `border-2` está DECLARADO, no filtrado de un comentario", () => {
  // Es el único de los cinco donde el comentario sostenía el dibujo: sin
  // `border-2` el ancho de borde cae a 0 y el anillo del spinner desaparece en
  // las 37 pantallas que lo usan. Medido: con la clase da 2px, sin ella 0px.
  const clases = claseDe("components/sunmi/SunmiLoader.jsx");
  assert.match(clases, /\bborder-2\b/, "el spinner se quedó sin anillo");
});

// SE MIRA LA FUENTE ENTERA, NO SOLO LA CADENA DEL `className`.
//
// Este candado se puso ROJO al negociar el margen del separador, y tenía razón
// en lo que preguntaba y no en dónde lo preguntaba: `my-2` dejó de estar DENTRO
// de la cadena del `className` y pasó a una expresión —`declaraMargenVertical(…)
// ? "" : "my-2"`—. La pieza sigue poniéndolo; lo que cambió es el lugar.
//
// Lo que este candado defiende NO es que el token viva en la cadena: es que al
// sacar el comentario no se haya perdido lo que el comentario estaba
// sosteniendo. Eso sigue valiendo igual, así que se lee el archivo sin
// comentarios en vez del atributo.
//
// Que el margen se NEGOCIE bien es otra pregunta y tiene su propio candado, en
// `lib/sunmi/claseNegociada.test.mjs`.
test("SunmiSeparator: sigue poniendo `my-2` y ninguna de las que se filtraban", () => {
  const fuente = fs
    .readFileSync(path.join(RAIZ, "components/sunmi/SunmiSeparator.jsx"), "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(fuente, /\bmy-2\b/, "el separador perdió su margen");
  assert.doesNotMatch(fuente, /\bmy-4\b|\bmy-6\b/, "volvió a colarse el margen del comentario");
});

test("SunmiToggle: la pista y la perilla declaran lo suyo, sin las del comentario", () => {
  const clases = claseDe("components/sunmi/SunmiToggle.jsx");
  assert.match(clases, /\bw-8\b/, "la pista perdió el ancho");
  assert.match(clases, /\bh-4\b/, "la pista o la perilla perdieron el alto");
  assert.match(clases, /\bw-4\b/, "la perilla perdió el ancho");
  assert.doesNotMatch(clases, /\bw-10\b|\bh-5\b|\bw-5\b/, "volvieron las clases del comentario");
});
