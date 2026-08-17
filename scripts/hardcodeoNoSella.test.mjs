// CONSULTAR LA LÍNEA DE BASE NO PUEDE SELLARLA.
//
// ── QUÉ DEFECTO CIERRA ESTE CANDADO ────────────────────────────────────────
//
// Hasta el 2026-08-17 `node scripts/hardcodeo.mjs --linea-base` **escribía** el
// archivo. Era el comando con nombre de sustantivo, el que uno tipea para MIRAR
// los siete contadores, y de paso sellaba la base en lo que hubiera en ese
// momento.
//
// Ese día se corrió así, para leer los números en un informe. Los siete estaban
// idénticos, así que lo único que se movió fue la fecha y el commit del
// encabezado, y se revirtió. **Pero si alguno hubiera subido, ese mismo comando
// lo habría fijado como base nueva sin que nadie lo decidiera**, y el trinquete
// habría vuelto a contestar "sin cambios" para siempre sobre un terreno recién
// perdido. Sin dejar rastro: el archivo queda igual de bien formado que antes.
//
// Un trinquete cuyo comando de consulta sella la base deja de ser un trinquete
// el día que alguien lo corre distraído.
//
// ── POR QUÉ ESTE CANDADO CORRE EL SCRIPT DE VERDAD ─────────────────────────
//
// Comprobar `debeSellar` sola no alcanza: es una función pura y podría estar
// perfecta mientras el script escribe por otro camino. Lo que hay que afirmar es
// que **el archivo no se mueve**, y eso solo lo contesta ejercer el comando y
// mirar los bytes.
//
// Y se ejerce en el caso que importa, que NO es el que pasó: con los números
// ARRIBA de la base. Un sellado accidental sobre números iguales es inocuo —fue
// lo que pasó y por eso se pudo revertir—; el que hace daño es el que ocurre
// justo cuando algo subió. Así que el candado deja la base con los números por
// debajo de los de hoy y comprueba que el modo de consulta no la toque igual.
//
// La costura es `HARDCODEO_LINEA_BASE`, que le cambia la ruta al script. Sin
// ella habría que ensuciar el archivo real del repo y confiar en restaurarlo
// desde el propio test — y un test que rompe el repo cuando falla es peor que el
// defecto que cuida.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { debeSellar } from "./hardcodeo.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(RAIZ, "scripts", "hardcodeo.mjs");
const REAL = path.join(RAIZ, "docs", "hardcodeo-linea-base.json");

/** Corre el script con la línea de base apuntada a `archivo`. */
function correr(args, archivo) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: RAIZ,
    encoding: "utf8",
    env: { ...process.env, HARDCODEO_LINEA_BASE: archivo },
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * Una copia de la línea de base real con TODOS los contadores bajados.
 *
 * Bajarlos es lo que hace que el escaneo de hoy dé "subió", que es el estado en
 * el que un sellado accidental hace daño. Con la copia intacta el candado
 * probaría el caso inofensivo.
 */
function baseDeflactada() {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "hardcodeo-candado-"));
  const archivo = path.join(carpeta, "linea-base.json");
  const doc = JSON.parse(fs.readFileSync(REAL, "utf8"));
  for (const k of Object.keys(doc.total)) doc.total[k] = Math.max(0, doc.total[k] - 5);
  fs.writeFileSync(archivo, JSON.stringify(doc, null, 2) + "\n");
  return { carpeta, archivo };
}

const limpiar = (carpeta) => fs.rmSync(carpeta, { recursive: true, force: true });

// ── LA CONTRAPRUEBA, QUE ES EL CANDADO ─────────────────────────────────────

test("CONSULTAR NO SELLA: con los números ARRIBA, --linea-base no toca el archivo", () => {
  const { carpeta, archivo } = baseDeflactada();
  try {
    const antes = fs.readFileSync(archivo);
    const r = correr(["--linea-base"], archivo);
    const despues = fs.readFileSync(archivo);

    assert.equal(r.status, 0, `el modo de consulta salió con ${r.status}:\n${r.stderr}`);
    assert.ok(
      antes.equals(despues),
      "EL MODO DE CONSULTA ESCRIBIÓ LA LÍNEA DE BASE. Es el defecto entero: " +
        "alguien que corre el comando para mirar deja sellado un aumento que nadie decidió."
    );
    // Que además haya MIRADO: si no informa la subida, no escribir es fácil
    // —también no escribe un script que no hace nada— y el candado no distingue.
    assert.match(
      r.stdout,
      /subió/,
      "no informó que los números están por encima de la base: puede no estar escaneando nada"
    );
  } finally {
    limpiar(carpeta);
  }
});

test("Y EL OTRO SENTIDO: con --sellar sí escribe", () => {
  // Sin esto, "no escribe" no se distingue de "el script está roto". Es la
  // segunda mitad de siempre: un vacío solo significa algo si la misma prueba
  // encuentra algo cuando tiene que encontrarlo.
  const { carpeta, archivo } = baseDeflactada();
  try {
    const antes = fs.readFileSync(archivo);
    const r = correr(["--linea-base", "--sellar"], archivo);
    const despues = fs.readFileSync(archivo);

    assert.equal(r.status, 0, `el sellado salió con ${r.status}:\n${r.stderr}`);
    assert.ok(
      !antes.equals(despues),
      "con --sellar el archivo NO cambió: entonces la prueba de arriba no prueba nada, " +
        "porque este script no escribiría en ningún caso"
    );
    const doc = JSON.parse(fs.readFileSync(archivo, "utf8"));
    assert.ok(doc.total && Object.keys(doc.total).length > 0, "el sellado dejó un archivo sin totales");
  } finally {
    limpiar(carpeta);
  }
});

test("LOS OTROS MODOS TAMPOCO ESCRIBEN, y --trinquete es el que más se corre", () => {
  const { carpeta, archivo } = baseDeflactada();
  try {
    const antes = fs.readFileSync(archivo);
    const r = correr(["--trinquete"], archivo);
    assert.ok(
      antes.equals(fs.readFileSync(archivo)),
      "el trinquete escribió la línea de base contra la que compara"
    );
    // Con los números arriba tiene que salir con 1. Si saliera 0, estaría
    // comparando contra otra cosa —o contra sí mismo— y el candado de arriba
    // estaría midiendo un escenario que no es el que dice.
    assert.equal(r.status, 1, `el trinquete no vio la subida: salió con ${r.status}`);
  } finally {
    limpiar(carpeta);
  }
});

// ── LA DECISIÓN, EJERCIDA APARTE ───────────────────────────────────────────
//
// Barata y no reemplaza a la de arriba: dice qué se decidió, no qué se hizo.

test("debeSellar: solo con las DOS palabras", () => {
  assert.equal(debeSellar(["--linea-base", "--sellar"]), true);
  assert.equal(debeSellar(["--sellar", "--linea-base"]), true, "el orden no puede importar");

  assert.equal(debeSellar(["--linea-base"]), false, "el nombre viejo tiene que ser el seguro");
  assert.equal(debeSellar(["--sellar"]), false, "`--sellar` suelto no sella nada");
  assert.equal(debeSellar(["--trinquete"]), false);
  assert.equal(debeSellar(["--ficha", "productos"]), false);
  assert.equal(debeSellar([]), false, "sin argumentos no se sella");
});

test("`--sellar` SUELTO no escribe y lo dice", () => {
  // Cae en su propia rama y no en el bloque de uso: ese mensaje no explicaría
  // por qué no pasó nada, y el que lo tipeó se iría creyendo que selló.
  const { carpeta, archivo } = baseDeflactada();
  try {
    const antes = fs.readFileSync(archivo);
    const r = correr(["--sellar"], archivo);
    assert.ok(antes.equals(fs.readFileSync(archivo)), "`--sellar` suelto escribió el archivo");
    assert.notEqual(r.status, 0, "`--sellar` suelto salió con 0, como si hubiera hecho algo");
    assert.match(r.stderr, /no va solo/, "no explicó por qué no pasó nada");
  } finally {
    limpiar(carpeta);
  }
});

// ── Y QUE NO HAYA OTRO CAMINO DE ESCRITURA ─────────────────────────────────

test("EL SCRIPT ESCRIBE LA LÍNEA DE BASE EN UN SOLO LUGAR", () => {
  // Las pruebas de arriba ejercen los modos que existen hoy. Ésta cuida el
  // futuro: un `writeFileSync` nuevo en otro modo no lo agarraría ninguna,
  // porque ninguna sabe que ese modo existe.
  const fuente = fs
    .readFileSync(SCRIPT, "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  const escrituras = [...fuente.matchAll(/writeFileSync\s*\(/g)].length;
  assert.equal(
    escrituras,
    1,
    `hay ${escrituras} llamadas a writeFileSync en hardcodeo.mjs. Si se agregó una, ` +
      "comprobá que esté detrás de --sellar y sumale su caso a este archivo."
  );
  assert.match(fuente, /function sellarLineaBase\(\)/, "se renombró la única función que escribe");
});
