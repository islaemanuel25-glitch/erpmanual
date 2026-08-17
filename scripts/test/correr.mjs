// scripts/test/correr.mjs
//
// EL COMANDO DE LA SUITE. Es lo que corre `npm test`.
//
// ── LO QUE HACE, Y LO POCO QUE ES ─────────────────────────────────────────
//
// Enumera los archivos de candados y se los pasa a `node --test` con
// `scripts/alias-loader.mjs`, que es el cargador que YA EXISTÍA en el repo y que
// resuelve el alias `@/…`, transforma el JSX con el SWC que Next ya trae, y
// sustituye `next/link` por un doble. Acá no se resuelve nada: sólo se enumera y
// se invoca.
//
// Existe porque el comando que documenta `docs/PROJECT.md` usa
// `$(git ls-files "*.test.mjs")`, que es una expansión de shell y no funciona en
// el `cmd.exe` con el que npm corre los scripts en Windows. Esto la hace portable
// y nada más.
//
// ── POR QUÉ `git ls-files` Y NO UNOS GLOBS ────────────────────────────────
//
// Un glob hay que acordarse de ampliarlo. La primera versión de este comando
// listaba `lib/**`, `components/**` y `scripts/**`, y ya había nacido incompleta:
// se escribió mirando dónde estaban los archivos ese día. `git ls-files` los trae
// todos sin que nadie tenga que acordarse.
//
// ── Y `--others`, QUE ES LA MITAD QUE FALTABA ─────────────────────────────
//
// `git ls-files` a secas ve sólo lo trackeado. Un candado recién escrito y sin
// commitear no aparecería: nacería mudo por otra puerta, y encima la peor —justo
// mientras alguien lo está escribiendo y esperando que corra—. Con
// `--cached --others --exclude-standard` entran los dos.

// ── EL `.env`, PARA QUE UN FIXTURE CONFIGURADO NO DEPENDA DE ACORDARSE ────
//
// Los 21 candados del parser de listas leen `ARCOR_FIXTURE` y `ARCOR_FIXTURE_B`,
// que apuntan a dos Excel reales que viven FUERA del repo porque llevan precios y
// nombres de proveedores y este repositorio es público.
//
// Hasta el 2026-08-17 esas variables sólo llegaban si alguien las exportaba a mano
// antes de `npm test`. O sea que el fixture estaba configurado y los candados se
// salteaban igual: **volvían a ser mudos apenas nadie se acordaba**, que es
// exactamente el estado del que se los quería sacar.
//
// ── POR QUÉ `process.loadEnvFile` Y NO UN LECTOR PROPIO ───────────────────
//
// Es nativo de Node, así que no agrega dependencia ni una cuarta manera de
// parsear un `.env` — en el repo ya hay tres lectores escritos a mano
// (`setup-db-test.js`, `precisionStock.test.mjs`, y el que `@prisma/client` trae
// adentro), y sumar otro es justo lo que la regla 1 prohíbe.
//
// LAS DOS CONDICIONES SE COMPROBARON CORRIÉNDOLAS, no leyendo la documentación:
//
//   · **lo que ya está en el entorno GANA** sobre lo del archivo — medido con una
//     variable puesta antes de cargar, que sobrevivió con su valor del entorno;
//   · si el archivo NO existe, `loadEnvFile` **lanza ENOENT**, así que va envuelto:
//     sin `.env` el corredor sigue exactamente como hoy y no falla.
//
// Esto no mete a la suite en una base: `precisionStock.test.mjs` ya cargaba el
// `.env` por su cuenta para decidir si conectar, con esta misma precedencia. Lo
// que cambia es que ahora lo hace el corredor una vez, para todos.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Carga el `.env` de la raíz si existe. El entorno gana; la ausencia no falla.
 * Devuelve la ruta cargada, o null si no había nada que cargar.
 */
export function cargarEnv(raiz = RAIZ) {
  const archivo = path.join(raiz, ".env");
  if (!fs.existsSync(archivo)) return null;
  try {
    process.loadEnvFile(archivo);
    return archivo;
  } catch {
    // Un `.env` ilegible o con una línea rota no puede voltear la suite entera:
    // lo que se pierde es el fixture, y de eso avisa el candado del inventario.
    return null;
  }
}

/** Los archivos de candados: trackeados y sin trackear, sin los ignorados. */
export function archivosDeCandado() {
  const salida = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "*.test.mjs"],
    { cwd: RAIZ, encoding: "utf8" }
  );
  return [...new Set(salida.split("\n").map((s) => s.trim()).filter(Boolean))].sort();
}

// Guardia de ejecución directa: `todosLosCandadosCorren.test.mjs` importa
// `archivosDeCandado` para comprobar que el comando no se quedó corto, y sin esto
// importarlo lanzaría la suite entera adentro de la suite.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Antes de enumerar: las variables tienen que estar puestas cuando arranque el
  // proceso hijo, que es quien las lee.
  cargarEnv();
  const archivos = archivosDeCandado();
  if (archivos.length === 0) {
    console.error("No se encontró ningún archivo *.test.mjs. La corrida no vale.");
    process.exit(2);
  }
  const extra = process.argv.slice(2);
  const r = spawnSync(
    process.execPath,
    ["--import", "./scripts/alias-loader.mjs", "--test", ...extra, ...archivos],
    { cwd: RAIZ, stdio: "inherit" }
  );
  process.exit(r.status ?? 1);
}
