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

import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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
