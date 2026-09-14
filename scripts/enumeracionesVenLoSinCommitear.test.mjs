// TODA ENUMERACIÓN DE UN CANDADO TIENE QUE VER LO QUE TODAVÍA NO SE COMMITEÓ.
//
//   node --import ./scripts/alias-loader.mjs --test scripts/enumeracionesVenLoSinCommitear.test.mjs
//
// ── EL DEFECTO QUE ESTO CIERRA, CON SU FECHA ──────────────────────────────
//
// El 2026-09-14, revisando por qué dos censos se habían puesto rojos "de la
// nada", apareció esto: `lib/layout/accionDePagina.test.mjs` enumeraba sus
// consumidores con `git grep -l`, que mira SOLO LO TRACKEADO.
//
// La tanda anterior había agregado una pantalla nueva que consume el slot. La
// suite se corrió con el archivo todavía sin commitear, así que los dos censos
// no lo vieron y dieron VERDE. Se pusieron rojos en la tanda siguiente, con el
// archivo ya trackeado — o sea después de empujar y después de desplegar.
//
// El candado no falló: NO PUDO MIRAR. Y ésa es la forma peligrosa, porque es
// indistinguible de un verde bueno: no avisa, no tarda más, no deja rastro.
//
// Es la misma familia que la nota de `git ls-files` en `CLAUDE.md` —la corrida
// del 2026-08-10 que informó 2575 candados con nueve recién escritos sin
// commitear— pero sobre otro comando y en otro lugar. Por eso no alcanzaba con
// arreglar los que se encontraron: hace falta algo que lo impida.
//
// ── QUÉ AFIRMA, EXACTAMENTE ───────────────────────────────────────────────
//
// Que ningún `*.test.mjs` enumere con `git ls-files` sin
// `--others --exclude-standard`, ni con `git grep` sin `--untracked`.
//
// ── LO QUE ESTE CANDADO NO CUBRE, Y HAY QUE SABERLO ───────────────────────
//
// Es análisis de TEXTO, igual que el clasificador de migraciones, y tiene los
// mismos límites:
//
//   · un comando armado dinámicamente —el nombre del flag en una variable, la
//     línea partida en tres— le pasa por al lado;
//   · no mira `readdirSync`, que es OTRO agujero de enumeración: ése SÍ ve los
//     archivos sin commitear, pero mira un solo nivel. Está documentado en la
//     regla 10 de `CLAUDE.md` y no se cubre acá porque son preguntas distintas;
//   · y no dice si la enumeración es la CORRECTA para lo que el candado afirma.
//     Un `git ls-files` sobre la carpeta equivocada pasa esto y no prueba nada.
//
// Frena de más, que es la dirección correcta: si un caso legítimo aparece, se
// agrega a `EXENTOS` con su motivo escrito, no se afloja el patrón.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const YO = "scripts/enumeracionesVenLoSinCommitear.test.mjs";

/**
 * ── LAS EXENCIONES SON UNA LISTA CON MOTIVO, NO UN `if` ──────────────────
 *
 * Una sola, y está mirada. `andamiosNoSeCommitean` pregunta literalmente
 * "¿quedó algún andamio COMMITEADO?", así que lo trackeado ES la pregunta. Un
 * andamio sin commitear es el caso bueno —alguien trabajando— y agregarle
 * `--others` pondría ese candado en rojo cada vez que alguien tiene uno abierto.
 *
 * Si mañana hay que sumar otra, va acá con su motivo. No se le pone una
 * excepción al patrón ni se recorta la red: mientras haya un solo lugar donde
 * mirar, el que audite ve las dos cosas juntas.
 */
const EXENTOS = new Map([
  [
    "scripts/andamiosNoSeCommitean.test.mjs",
    "la pregunta de ese candado ES qué está trackeado: un andamio sin commitear es el caso bueno",
  ],
]);

/** Los candados del repo, enumerados como este candado exige que se enumere. */
function candadosDelRepo() {
  const salida = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "*.test.mjs"],
    { cwd: RAIZ, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  return [...new Set(salida.split("\n").map((s) => s.trim()).filter(Boolean))].sort();
}

/**
 * El archivo sin comentarios.
 *
 * No es cosmético: este proyecto ya se comió tres veces el mismo problema —un
 * candado que busca texto encuentra los comentarios—, y acá pasaría seguro,
 * porque los archivos que se arreglaron llevan comentarios que NOMBRAN
 * `git ls-files` a secas para explicar por qué se le agregó la bandera.
 */
function sinComentarios(rel) {
  return fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

/**
 * Las enumeraciones de un archivo que NO ven lo sin commitear.
 *
 * Se mira una ventana DESPUÉS del comando y no la línea, porque las dos formas
 * que el repo usa reparten los argumentos distinto: `execSync` los trae en una
 * plantilla de una línea y `execFileSync` en un array que el formateador parte
 * en varias.
 */
function enumeracionesCiegas(rel) {
  const codigo = sinComentarios(rel);
  const fallas = [];
  const re = /git\s+ls-files|["']ls-files["']|git\s+grep|["']grep["']/g;
  let m;
  while ((m = re.exec(codigo))) {
    const esLsFiles = /ls-files/.test(m[0]);
    const bandera = esLsFiles ? "--others" : "--untracked";
    const ventana = codigo.slice(m.index, m.index + 320);
    if (ventana.includes(bandera)) continue;
    fallas.push({
      comando: esLsFiles ? "git ls-files" : "git grep",
      bandera: esLsFiles ? "--others --exclude-standard" : "--untracked",
      linea: codigo.slice(0, m.index).split("\n").length,
    });
  }
  return fallas;
}

test("ningún candado enumera con git sin ver lo que todavía no se commiteó", () => {
  const rotos = [];
  for (const rel of candadosDelRepo()) {
    if (rel === YO) continue; // se nombra a sí mismo en los patrones de arriba
    if (EXENTOS.has(rel)) continue;
    for (const f of enumeracionesCiegas(rel)) {
      rotos.push(`${rel}:${f.linea} · ${f.comando} sin ${f.bandera}`);
    }
  }

  assert.deepEqual(
    rotos,
    [],
    `Hay enumeraciones que no ven los archivos sin commitear.\n` +
      `Un candado así da VERDE sin haber podido mirar, y se pone rojo recién\n` +
      `cuando el archivo se commitea — o sea después de empujar.\n\n` +
      rotos.map((r) => "  " + r).join("\n")
  );
});

test("la lista de exentos no crece sin que se note, y cada uno tiene motivo", () => {
  // Mismo criterio que la lista de rechazo de la guardia de migraciones: el día
  // que alguien agregue una excepción, que sea una decisión visible y no un
  // `if` escondido adentro del recorrido.
  assert.equal(EXENTOS.size, 1, "apareció o desapareció una exención: revisar por qué");
  for (const [rel, motivo] of EXENTOS) {
    assert.ok(
      fs.existsSync(path.join(RAIZ, rel)),
      `el exento ${rel} ya no existe: sacarlo de la lista`
    );
    assert.ok(motivo && motivo.length > 40, `el exento ${rel} no explica por qué lo es`);
  }
});

test("CONTRAPRUEBA · el detector encuentra una enumeración ciega de verdad", () => {
  // Sin esto, el candado de arriba podría estar en verde porque el detector no
  // detecta nada. Es la diferencia entre un candado que afirma y uno que
  // acompaña, y en este proyecto ya hubo uno que daba verde con el chequeo
  // sacado.
  //
  // El fixture es el archivo de este mismo candado... al revés: se le pasa un
  // texto, no una ruta. Por eso `enumeracionesCiegas` se ejerce a través de un
  // archivo temporal NO: se prueba el predicado con las dos formas reales que el
  // repo usa, escritas acá.
  const temp = path.join(RAIZ, "scripts", ".enumeracion-contraprueba.test.mjs");
  const CASOS = [
    ['execSync("git ls-files app components")', "git ls-files"],
    ['execFileSync("git", ["ls-files", "app"])', "git ls-files"],
    ['execSync(`git grep -l "x" -- app`)', "git grep"],
    ['execFileSync("git", ["grep", "-l", "x", "--", "app"])', "git grep"],
  ];
  try {
    for (const [fuente, comando] of CASOS) {
      fs.writeFileSync(temp, fuente, "utf8");
      const fallas = enumeracionesCiegas(path.relative(RAIZ, temp));
      assert.equal(fallas.length, 1, `no detectó la enumeración ciega en: ${fuente}`);
      assert.equal(fallas[0].comando, comando);
    }

    // Y el otro lado: con la bandera puesta, NO acusa. Sin esto, un detector que
    // marque todo pasaría el bloque de arriba y pondría el repo entero en rojo.
    for (const buena of [
      'execSync("git ls-files --cached --others --exclude-standard app")',
      'execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "app"])',
      'execSync(`git grep --untracked -l "x" -- app`)',
      'execFileSync("git", ["grep", "--untracked", "-l", "x", "--", "app"])',
    ]) {
      fs.writeFileSync(temp, buena, "utf8");
      assert.deepEqual(
        enumeracionesCiegas(path.relative(RAIZ, temp)),
        [],
        `acusó una enumeración que SÍ mira lo sin commitear: ${buena}`
      );
    }

    // Y no acusa lo que está adentro de un comentario, que es el defecto que
    // este proyecto ya se comió tres veces.
    fs.writeFileSync(temp, '// execSync("git ls-files app")\n', "utf8");
    assert.deepEqual(
      enumeracionesCiegas(path.relative(RAIZ, temp)),
      [],
      "acusó una mención en un comentario"
    );
  } finally {
    fs.rmSync(temp, { force: true });
  }
});
