// CANDADO: EL TRINQUETE PUEDE CARGAR LO QUE IMPORTA, EN CUALQUIER NODE.
//
//   node --import ./scripts/alias-loader.mjs --test scripts/hardcodeoArranca.test.mjs
//
// ── EL DEFECTO QUE FIJA ─────────────────────────────────────────────────────
//
// `lib/hardcodeo/contador.js` era ESM —`export function …`— con extensión `.js`,
// y el `package.json` de la raíz no declara `"type": "module"`. Node resuelve el
// formato por la extensión más el `type` del paquete, así que ese archivo era
// **CommonJS para Node**, y el import del script explotaba antes de ejecutar una
// sola línea:
//
//   SyntaxError: Named export 'ETIQUETAS' not found. The requested module
//   '../lib/hardcodeo/contador.js' is a CommonJS module…
//
// Node 22 adivina el formato leyendo la sintaxis y tapa el problema; Node 18 no.
// O sea que el mismo archivo andaba en CI y reventaba en el VPS, que es donde se
// escribe el código. Resultado: **el trinquete no midió nada durante días
// mientras parecía estar midiendo**, y cada edición de un `.jsx` producía el
// aviso de que no se pudo revisar.
//
// ── POR QUÉ NO ALCANZA CON CORRERLO Y VER QUE ANDA ──────────────────────────
//
// Porque "anda" depende del intérprete. Un candado que solo ejecute el script se
// pone verde en Node 22 aunque el defecto esté puesto de nuevo, y ahí no afirma
// nada: sería el candado que acompaña en vez del que prueba.
//
// Por eso hay dos mitades y las dos hacen falta:
//
//   · La ESTRUCTURAL —`importsAmbiguos`— no ejecuta nada y no depende de la
//     versión: un `.js` con sintaxis ESM en un paquete sin `type: module` es
//     ambiguo, y punto. Se pone roja en cualquier Node.
//   · La de EJECUCIÓN comprueba que el script de verdad arranca y llega a un
//     veredicto, que es la otra pregunta y no la contesta leer.
//
// `scripts/scriptsCompilan.test.mjs` no podía atrapar esto y lo dice él mismo:
// `node --check` parsea y no resuelve imports. El archivo parseaba perfecto.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// `fileURLToPath(import.meta.url)` y no `import.meta.dirname`: el segundo existe
// desde Node 20.11, y este candado tiene que poder correr en el intérprete viejo
// justamente porque el defecto que fija aparece ahí.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(RAIZ, "scripts", "hardcodeo.mjs");

// ══════════════════════════════════════════════════════════════════════════
// LA REGLA, COMO FUNCIÓN PURA SOBRE EL DISCO
// ══════════════════════════════════════════════════════════════════════════

/** Un archivo tiene sintaxis ESM si declara `export` o importa arriba de todo. */
function tieneSintaxisESM(contenido) {
  const sinComentarios = contenido
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return /^\s*export\s/m.test(sinComentarios) || /^\s*import\s/m.test(sinComentarios);
}

/**
 * Los imports LOCALES de un archivo, resueltos a rutas del disco.
 *
 * Solo interesan los del repo: un `node:fs` o un paquete de `node_modules` no
 * tienen este problema porque declaran su formato.
 */
function importsLocales(rutaAbs) {
  const contenido = fs.readFileSync(rutaAbs, "utf8");
  const dir = path.dirname(rutaAbs);
  const specs = [...contenido.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]);

  return specs
    .filter((s) => s.startsWith(".") || s.startsWith("@/"))
    .map((s) => (s.startsWith("@/") ? path.join(RAIZ, s.slice(2)) : path.resolve(dir, s)));
}

/**
 * Cuáles de esos imports son AMBIGUOS para Node.
 *
 * Ambiguo = termina en `.js`, existe, y tiene sintaxis ESM, mientras el paquete
 * que lo contiene no declara `"type": "module"`. Es exactamente la combinación
 * que Node 18 rechaza y Node 22 adivina.
 */
function importsAmbiguos(rutaAbs) {
  return importsLocales(rutaAbs).filter((destino) => {
    if (!destino.endsWith(".js")) return false;
    if (!fs.existsSync(destino)) return false;
    return tieneSintaxisESM(fs.readFileSync(destino, "utf8"));
  });
}

/** El `package.json` de la raíz sigue SIN declarar tipo de módulo. */
function raizDeclaraTypeModule() {
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  return pkg.type === "module";
}

// ══════════════════════════════════════════════════════════════════════════
// D · LA GARANTÍA ESTRUCTURAL, QUE NO DEPENDE DE LA VERSIÓN DE NODE
// ══════════════════════════════════════════════════════════════════════════

test("la premisa sigue en pie: la raíz NO declara type module", () => {
  // Si algún día se declarara, un `.js` con `export` dejaría de ser ambiguo y
  // este candado estaría prohibiendo algo que ya no hace daño. Se pondría rojo
  // acá, que es donde hay que enterarse, en vez de seguir pidiendo de más en
  // silencio.
  assert.equal(
    raizDeclaraTypeModule(),
    false,
    "package.json ahora declara type:module — revisar si esta regla sigue haciendo falta"
  );
});

test("NINGÚN import del trinquete apunta a un .js con sintaxis ESM", () => {
  const ambiguos = importsAmbiguos(SCRIPT).map((p) => path.relative(RAIZ, p));
  assert.deepEqual(
    ambiguos,
    [],
    "un import del trinquete volvió a ser ambiguo: en Node 18 explota antes de contar nada"
  );
});

test("y el módulo del contador es .mjs, no .js", () => {
  // Dicho aparte y por su nombre, porque es LA pieza: el contador es lo único
  // que el trinquete importa del repo, y su extensión es lo que hace que la
  // carga funcione en cualquier intérprete.
  assert.equal(fs.existsSync(path.join(RAIZ, "lib/hardcodeo/contador.mjs")), true);
  assert.equal(
    fs.existsSync(path.join(RAIZ, "lib/hardcodeo/contador.js")),
    false,
    "volvió a existir el .js: dos módulos con el mismo nombre y distinto formato"
  );
});

// ── CONTRAPRUEBA DE LA REGLA ──────────────────────────────────────────────
//
// Sin esto no se sabe si `importsAmbiguos` detecta o simplemente devuelve vacío
// siempre. Se le da de comer el defecto exacto, en un directorio descartable, y
// después el caso bueno como control.

test("CONTRAPRUEBA: la regla MARCA un .js con export importado desde un .mjs", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trinquete-ambiguo-"));
  try {
    fs.writeFileSync(path.join(tmp, "modulo.js"), "export const A = 1;\n");
    fs.writeFileSync(path.join(tmp, "guion.mjs"), 'import { A } from "./modulo.js";\nexport default A;\n');

    const marcados = importsAmbiguos(path.join(tmp, "guion.mjs"));
    assert.equal(marcados.length, 1, "la regla no vio el .js con sintaxis ESM");
    assert.equal(path.basename(marcados[0]), "modulo.js");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("CONTROL: el mismo módulo en .mjs NO se marca", () => {
  // Es la mitad que evita el candado que marca todo. Si esto también saliera
  // marcado, la regla no distinguiría nada y el rojo de arriba no significaría.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trinquete-explicito-"));
  try {
    fs.writeFileSync(path.join(tmp, "modulo.mjs"), "export const A = 1;\n");
    fs.writeFileSync(path.join(tmp, "guion.mjs"), 'import { A } from "./modulo.mjs";\nexport default A;\n');

    assert.deepEqual(importsAmbiguos(path.join(tmp, "guion.mjs")), []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("CONTROL: un .js que es CommonJS de verdad tampoco se marca", () => {
  // `module.exports` en un `.js` no es ambiguo: es exactamente lo que Node
  // espera. Marcarlo sería pedirle al repo que renombre archivos que están bien.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trinquete-cjs-"));
  try {
    fs.writeFileSync(path.join(tmp, "modulo.js"), "module.exports = { A: 1 };\n");
    fs.writeFileSync(path.join(tmp, "guion.mjs"), 'import pkg from "./modulo.js";\nexport default pkg;\n');

    assert.deepEqual(importsAmbiguos(path.join(tmp, "guion.mjs")), []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("y la palabra `export` dentro de un comentario no cuenta", () => {
  // Es la trampa que este repo ya pagó tres veces: un candado que busca texto
  // encuentra la prosa. Acá haría renombrar un CommonJS legítimo que solo
  // MENCIONA la palabra.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trinquete-comentario-"));
  try {
    fs.writeFileSync(
      path.join(tmp, "modulo.js"),
      "// export const A = 1;  <- así se escribiría en ESM\nmodule.exports = { A: 1 };\n"
    );
    fs.writeFileSync(path.join(tmp, "guion.mjs"), 'import pkg from "./modulo.js";\nexport default pkg;\n');

    assert.deepEqual(importsAmbiguos(path.join(tmp, "guion.mjs")), []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// A · Y ADEMÁS ARRANCA: SE EJECUTA DE VERDAD Y LLEGA A UN VEREDICTO
// ══════════════════════════════════════════════════════════════════════════

test("EL TRINQUETE CORRE Y CONTESTA, en el Node que esté corriendo la suite", () => {
  // `--linea-base` sin `--sellar` solo MIRA: no escribe el archivo. Es el modo
  // seguro para ejercer la carga completa del script desde un candado.
  const r = spawnSync(process.execPath, [SCRIPT, "--linea-base"], {
    cwd: RAIZ,
    encoding: "utf8",
    timeout: 60_000,
  });

  const salida = `${r.stdout || ""}\n${r.stderr || ""}`;

  // El error de interoperabilidad, dicho con sus palabras: si vuelve, esto lo
  // nombra en vez de informar un fallo genérico.
  assert.equal(
    /Named export .* not found|is a CommonJS module/.test(salida),
    false,
    `el import del trinquete volvió a romperse:\n${salida.trim().slice(0, 400)}`
  );

  assert.equal(r.status, 0, `--linea-base tiene que salir con 0.\n${salida.trim().slice(0, 400)}`);
  assert.match(salida, /LÍNEA DE BASE/, "el script no llegó a imprimir la comparación");
  assert.match(salida, /clases del tema paralelo del POS/, "no llegó a contar las categorías");
});

test("y el modo que MIRA sigue sin escribir la línea de base", () => {
  // El script ya tiene su candado de esto —`scripts/hardcodeoNoSella.test.mjs`—
  // y no se repite acá la comprobación byte a byte. Lo que se afirma es lo
  // mínimo que este candado necesita para poder ejecutar el script sin miedo:
  // que el comando que usa arriba no sea el que sella.
  const fuente = fs.readFileSync(SCRIPT, "utf8");
  assert.match(fuente, /debeSellar\(args\)/, "el sellado dejó de decidirse con debeSellar");
});
