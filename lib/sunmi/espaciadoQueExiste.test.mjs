// UNA CLASE DE ESPACIADO QUE NO EXISTE NO SEPARA NADA, Y NO AVISA.
//
// ── EL DEFECTO QUE TRAJO ESTE CANDADO ─────────────────────────────────────
//
// La hoja de corregir una línea de factura separaba su cuerpo con `gap-hoja` y
// sus bloques con `pt-hoja`. **Ninguno de los dos existe**: no están en
// `tailwind.config.js`, así que Tailwind no genera ninguna regla y el atributo
// `class` queda con una palabra que el navegador ignora.
//
// El resultado fue "todo amontonado, los bloques se apoyan uno sobre otro" — y
// nadie podía ver por qué: el build compila, los candados pasan, la clase está
// escrita en el archivo y se lee perfectamente razonable. Comprobado sobre el
// CSS que servía producción: cero apariciones de `.gap-hoja{` y de `.pt-hoja{`,
// contra una de `.gap-renglon{`.
//
// Es la misma familia que `sunmi-btn-accent` dejando botones invisibles y que
// `w-cajaStepper` cuando vivía en el grupo equivocado del config: **algo que no
// falla donde se rompe.**
//
// ── QUÉ AFIRMA, Y QUÉ NO ──────────────────────────────────────────────────
//
// Que toda clase de ESPACIADO con nombre —`gap-`, `p*-`, `m*-`, `space-*-`
// seguido de letras— use un nombre que esté en `theme.extend.spacing`. No mira
// anchos ni altos: esos tienen sus propios grupos y su propio candado sería
// otro. Y no mira las clases con número, que son la escala que Tailwind genera
// sola.
//
// Los COMENTARIOS se sacan antes de mirar. Este mismo archivo y el encabezado
// de la hoja nombran `gap-hoja` para explicar el defecto, y un candado que
// cuente eso se pone rojo por la explicación de lo que arregló — que es el
// falso positivo que CLAUDE.md ya tiene anotado tres veces.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Las claves con nombre de `theme.extend.spacing`. */
function clavesDeEspaciado() {
  const cfg = fs.readFileSync(path.join(RAIZ, "tailwind.config.js"), "utf8");
  const desde = cfg.indexOf("spacing: {");
  assert.notEqual(desde, -1, "el config dejó de tener un bloque `spacing`");
  // Hasta el cierre del bloque, que está al mismo nivel de indentación.
  const hasta = cfg.indexOf("\n      },", desde);
  const bloque = cfg.slice(desde, hasta === -1 ? undefined : hasta);
  return new Set([...bloque.matchAll(/^\s{6,}"?([A-Za-z][A-Za-z0-9]*)"?:/gm)].map((m) => m[1]));
}

/** Sin comentarios de línea, de bloque, ni de JSX. */
export function sinComentarios(txt) {
  return txt.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
}

/**
 * Las clases de espaciado con nombre que aparecen en un texto.
 *
 * El `(?!-)` es lo que separa `gap-x-2` —la escala normal, con la x del eje— de
 * `gap-hoja`: sin él, la primera se leería como el nombre "x".
 */
export function espaciadosConNombre(txt) {
  const patron =
    /\b(?:gap|gap-x|gap-y|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|space-x|space-y)-([a-zA-Z][a-zA-Z0-9]*)\b(?!-)/g;
  return [...sinComentarios(txt).matchAll(patron)];
}

/** `px` y `auto` son de la escala de Tailwind, no nombres del proyecto. */
const DE_TAILWIND = new Set(["px", "auto", "full", "screen", "min", "max", "fit", "reverse"]);

test("ninguna pantalla usa una clase de espaciado que no existe", () => {
  const claves = clavesDeEspaciado();
  // `--cached --others --exclude-standard`: un archivo recién escrito y todavía
  // sin commitear existe para el navegador, así que tiene que existir para el
  // candado. Es la regla 10 de CLAUDE.md.
  const archivos = execSync(
    'git ls-files --cached --others --exclude-standard "app/**/*.jsx" "components/**/*.jsx"',
    { cwd: RAIZ, encoding: "utf8" }
  )
    .trim()
    .split("\n")
    .filter(Boolean);

  assert.ok(archivos.length > 100, `se enumeraron ${archivos.length} pantallas: la lista no puede ser esa`);

  const rotas = [];
  for (const rel of archivos) {
    const txt = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    for (const m of espaciadosConNombre(txt)) {
      const nombre = m[1];
      if (claves.has(nombre) || DE_TAILWIND.has(nombre)) continue;
      rotas.push(`${rel}: ${m[0]}`);
    }
  }

  assert.deepEqual(
    rotas,
    [],
    `estas clases no están en \`theme.extend.spacing\`, así que Tailwind no genera nada y no separan nada:\n  ${rotas.join(
      "\n  "
    )}`
  );
});

test("CONTRAPRUEBA: el patrón encuentra la clase que no existe y deja pasar la que sí", () => {
  const claves = clavesDeEspaciado();
  const rota = espaciadosConNombre('<div className="flex flex-col gap-hoja pt-hoja">');
  assert.equal(rota.length, 2, "el patrón tiene que ver las dos");
  assert.equal(claves.has("hoja"), false, "si `hoja` existiera, este candado no afirmaría nada");

  const buena = espaciadosConNombre('<div className="gap-renglon px-filtro py-entreFiltros mt-3 gap-x-2">');
  const nombres = buena.map((m) => m[1]);
  assert.deepEqual(nombres, ["renglon", "filtro", "entreFiltros"], "la escala con número no se cuenta");
  for (const n of nombres) assert.equal(claves.has(n), true, `\`${n}\` tiene que estar en el config`);
});

test("los comentarios no cuentan", () => {
  // El encabezado de la hoja de corregir NOMBRA `gap-hoja` para explicar por
  // qué se fue. Sin esta regla, el candado se pondría rojo por la explicación.
  const conComentario = `
    // El cuerpo usaba gap-hoja y los bloques pt-hoja.
    /* gap-hoja otra vez */
    <div className="gap-renglon">
  `;
  assert.deepEqual(
    espaciadosConNombre(conComentario).map((m) => m[1]),
    ["renglon"]
  );
});
