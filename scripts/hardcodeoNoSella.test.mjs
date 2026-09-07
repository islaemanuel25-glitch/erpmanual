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
function correr(args, archivo, raizEscaneo) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: RAIZ,
    encoding: "utf8",
    env: {
      ...process.env,
      HARDCODEO_LINEA_BASE: archivo,
      ...(raizEscaneo ? { HARDCODEO_RAIZ: raizEscaneo } : {}),
    },
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * UN REPO DE JUGUETE, LIMPIO, PARA PODER EJERCER EL SELLADO.
 *
 * Desde el 2026-09-07 el sellado se NIEGA si el árbol escaneado tiene cambios
 * sin commitear: así fue como la base del 2026-08-22 quedó anotando un commit
 * que no describe sus números. Y el repo de verdad está sucio justo cuando se
 * corren los candados —hay una tanda en curso—, así que el caso "sí escribe" no
 * se puede ejercer contra él sin aflojar la guardia.
 *
 * Se ejerce contra un repo propio, con un commit y un `.jsx` adentro. Es la
 * situación real que el sellado exige, no una excepción para el test.
 */
function repoLimpioDeJuguete() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "hardcodeo-repo-"));
  fs.mkdirSync(path.join(raiz, "app", "modulos", "demo"), { recursive: true });
  fs.writeFileSync(
    path.join(raiz, "app", "modulos", "demo", "page.jsx"),
    'export default function P() {\n  return <div className="text-[13px] pos-text-muted">hola</div>;\n}\n'
  );
  const git = (...args) =>
    spawnSync("git", args, { cwd: raiz, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } });
  git("init", "-q");
  git("config", "user.email", "candado@local");
  git("config", "user.name", "candado");
  git("add", "-A");
  git("commit", "-q", "-m", "arbol de juguete");
  return raiz;
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
  const raizLimpia = repoLimpioDeJuguete();
  try {
    const antes = fs.readFileSync(archivo);
    const r = correr(["--linea-base", "--sellar"], archivo, raizLimpia);
    const despues = fs.readFileSync(archivo);

    assert.equal(r.status, 0, `el sellado salió con ${r.status}:\n${r.stderr}`);
    assert.ok(
      !antes.equals(despues),
      "con --sellar el archivo NO cambió: entonces la prueba de arriba no prueba nada, " +
        "porque este script no escribiría en ningún caso"
    );
    const doc = JSON.parse(fs.readFileSync(archivo, "utf8"));
    assert.ok(doc.total && Object.keys(doc.total).length > 0, "el sellado dejó un archivo sin totales");

    // Y lo que hace que la base sea reproducible: el commit anotado es el del
    // árbol que se escaneó, y el inventario viene con él. Sin esto se podría
    // sellar un archivo bien formado que describe otro árbol, que es el defecto
    // que esta tanda vino a cerrar.
    assert.match(doc.commit, /^[0-9a-f]{40}$/, "el sellado no anotó un commit completo");
    assert.ok(doc.inventario, "el sellado dejó la base sin inventario");
    assert.ok(
      doc.inventario["app/modulos/demo/page.jsx"],
      "el inventario no menciona el único archivo del árbol escaneado"
    );
  } finally {
    limpiar(carpeta);
    fs.rmSync(raizLimpia, { recursive: true, force: true });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// SELLAR DESDE OTRO ÁRBOL SELLA ESE ÁRBOL, NO EL DE TRABAJO
// ══════════════════════════════════════════════════════════════════════════
//
// Es lo que hace posible REEXPRESAR la base histórica cuando se corrige un falso
// positivo del contador: se escanea el árbol de entonces, no `main`. Si el
// escaneo se contaminara con el árbol actual, la reexpresión perdonaría toda la
// deuda que entró después —que es exactamente lo que no se puede hacer— y el
// archivo quedaría igual de bien formado, sin ninguna señal de que pasó.

test("A · LO SELLADO ES EL ÁRBOL ESCANEADO, y no se cuela el de trabajo", () => {
  const { carpeta, archivo } = baseDeflactada();
  const raizLimpia = repoLimpioDeJuguete();
  try {
    correr(["--linea-base", "--sellar"], archivo, raizLimpia);
    const doc = JSON.parse(fs.readFileSync(archivo, "utf8"));
    const archivos = Object.keys(doc.inventario);

    // El árbol de juguete tiene UN archivo. Si aparece cualquier otro, lo que se
    // selló no es lo que se pidió escanear.
    assert.deepEqual(archivos, ["app/modulos/demo/page.jsx"]);

    // Y dicho por el otro lado, que es el que atraparía una contaminación
    // parcial: ninguna ruta del repo real puede estar acá.
    assert.equal(
      archivos.some((a) => a.startsWith("components/sunmi/") || a.startsWith("components/pos-ventas/")),
      false,
      "el sellado arrastró archivos del árbol de trabajo"
    );
  } finally {
    limpiar(carpeta);
    fs.rmSync(raizLimpia, { recursive: true, force: true });
  }
});

test("C · EL COMMIT ANOTADO ES EL HEAD DEL ÁRBOL ESCANEADO", () => {
  // No el del repo desde el que se corre el comando. Es la diferencia entre una
  // base reproducible y un archivo que dice una cosa y describe otra: así se
  // rompió la del 2026-08-22, anotando el HEAD mientras escaneaba otra cosa.
  const { carpeta, archivo } = baseDeflactada();
  const raizLimpia = repoLimpioDeJuguete();
  try {
    const suyo = spawnSync("git", ["rev-parse", "HEAD"], { cwd: raizLimpia, encoding: "utf8" }).stdout.trim();
    const nuestro = spawnSync("git", ["rev-parse", "HEAD"], { cwd: RAIZ, encoding: "utf8" }).stdout.trim();

    correr(["--linea-base", "--sellar"], archivo, raizLimpia);
    const doc = JSON.parse(fs.readFileSync(archivo, "utf8"));

    assert.equal(doc.commit, suyo, "anotó un commit que no es el del árbol escaneado");
    assert.notEqual(doc.commit, nuestro, "anotó el HEAD de este repo en vez del escaneado");
  } finally {
    limpiar(carpeta);
    fs.rmSync(raizLimpia, { recursive: true, force: true });
  }
});

test("E · CONTRAPRUEBA: sellar SIN la costura no da lo mismo", () => {
  // La mitad que hace que A signifique algo. Si sellar desde acá y desde el
  // árbol de juguete dieran lo mismo, la costura no estaría separando nada y A
  // pasaría por casualidad.
  const a = baseDeflactada();
  const b = baseDeflactada();
  const raizLimpia = repoLimpioDeJuguete();
  try {
    correr(["--linea-base", "--sellar"], a.archivo, raizLimpia);
    // Sin `HARDCODEO_RAIZ` se escanea ESTE repo. Durante los candados suele
    // estar sucio, y entonces el sellado tiene que rechazarlo —que es la otra
    // forma de no contaminar—. Si estuviera limpio, el contenido igual sería
    // distinto. Se comprueban las dos salidas posibles porque las dos son
    // correctas y cuál ocurre depende del estado del árbol, no de la regla.
    const r = correr(["--linea-base", "--sellar"], b.archivo);
    if (r.status === 0) {
      const desdeJuguete = JSON.parse(fs.readFileSync(a.archivo, "utf8"));
      const desdeAca = JSON.parse(fs.readFileSync(b.archivo, "utf8"));
      assert.notDeepEqual(desdeJuguete.inventario, desdeAca.inventario);
    } else {
      assert.equal(r.status, 2, "sellar desde un árbol sucio tiene que ser un rechazo");
      assert.match(r.stderr, /sin commitear/);
    }
  } finally {
    limpiar(a.carpeta);
    limpiar(b.carpeta);
    fs.rmSync(raizLimpia, { recursive: true, force: true });
  }
});

test("Y SE NIEGA A SELLAR DESDE UN ÁRBOL SUCIO", () => {
  // El caso que rompió la base del 2026-08-22: se escanea el árbol de trabajo y
  // se anota el commit de HEAD, que describe otra cosa. Ahora es un rechazo.
  const { carpeta, archivo } = baseDeflactada();
  const raizSucia = repoLimpioDeJuguete();
  try {
    fs.writeFileSync(
      path.join(raizSucia, "app", "modulos", "demo", "page.jsx"),
      'export default function P() {\n  return <div className="text-[9px]">otra cosa</div>;\n}\n'
    );
    const antes = fs.readFileSync(archivo);
    const r = correr(["--linea-base", "--sellar"], archivo, raizSucia);

    assert.equal(r.status, 2, "sellar desde un árbol sucio tiene que fallar");
    assert.match(r.stderr, /sin commitear/);
    assert.ok(fs.readFileSync(archivo).equals(antes), "no tenía que escribir nada");
  } finally {
    limpiar(carpeta);
    fs.rmSync(raizSucia, { recursive: true, force: true });
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
