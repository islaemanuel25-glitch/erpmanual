// scripts/alias-loader.mjs
//
// Hook de resolución para `node --test`: traduce el alias "@/..." de
// jsconfig.json a rutas reales del repo. Solo se usa al correr pruebas —Next
// resuelve el alias por su cuenta y este archivo no entra en el bundle.
//
// Existe para poder testear código de app/ (por ejemplo el reducer del POS) sin
// tener que degradar sus imports a rutas relativas.
//
// Uso:  node --import ./scripts/alias-loader.mjs --test "lib/**/*.test.mjs"

import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

// ── NINGUNA PRUEBA LLAMA A LA IA DE VERDAD ────────────────────────────────
//
// El plan de Gemini es de VEINTE consultas por día. Una suite que por descuido
// salga a la red se come la cuota de la jornada de trabajo: el 2026-08-27 una
// tanda de mediciones gastó dieciséis de veinte y el importador quedó
// inservible hasta la medianoche del huso de California.
//
// Se hace acá porque es el único lugar por el que pasan TODAS las pruebas. Un
// archivo que se acuerde de prohibirla cubre ese archivo; esto cubre la suite,
// incluida la que alguien escriba mañana sin leer esto.
//
// Dos candados, no uno:
//   · `IA_PROHIBIR_RED=1` hace que la puerta LANCE si nadie inyectó un doble.
//   · la clave se BORRA del entorno, así que aunque alguien esquive la puerta y
//     escriba su propio `fetch`, no tiene con qué autenticarse.
//
// Se pisan sin preguntar y sin permitir desactivarlas desde una prueba: una
// excepción que se pueda apagar desde el archivo que la molesta no es una
// excepción.
process.env.IA_PROHIBIR_RED = "1";
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// ESM exige extensión explícita; el alias del proyecto se escribe sin ella.
const EXTENSIONES = ["", ".js", ".mjs", ".jsx", path.join("", "index.js")];

// Subpaths de Next que el bundler resuelve solo y Node ESM no: al importarlos
// desde una ruta de app/ en una prueba, Node busca el directorio y falla.
const SUBPATHS_NEXT = ["next/server", "next/headers", "next/navigation"];

// `next/link` se sustituye por un stub que renderiza un <a>: el Link real
// arrastra el router del cliente y no se puede montar fuera de Next. Ver
// scripts/stub-next-link.mjs.
const STUB_LINK = path.join(ROOT, "scripts", "stub-next-link.mjs");

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = path.join(ROOT, specifier.slice(2));
    for (const ext of EXTENSIONES) {
      const candidato = base + ext;
      if (fs.existsSync(candidato) && fs.statSync(candidato).isFile()) {
        return next(pathToFileURL(candidato).href, context);
      }
    }
  }
  if (specifier === "next/link") {
    return next(pathToFileURL(STUB_LINK).href, context);
  }
  if (SUBPATHS_NEXT.includes(specifier)) {
    const archivo = path.join(ROOT, "node_modules", `${specifier}.js`);
    if (fs.existsSync(archivo)) return next(pathToFileURL(archivo).href, context);
  }
  // Import relativo SIN extensión: el bundler lo resuelve, Node ESM no. Aparece
  // en varios módulos de lib/ y hace fallar cualquier prueba que los alcance.
  if (specifier.startsWith(".") && !path.extname(specifier) && context.parentURL) {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    for (const ext of EXTENSIONES) {
      const candidato = base + ext;
      if (candidato !== base && fs.existsSync(candidato) && fs.statSync(candidato).isFile()) {
        return next(pathToFileURL(candidato).href, context);
      }
    }
  }
  return next(specifier, context);
}

/**
 * Carga de archivos .jsx para `node --test`.
 *
 * Node no sabe qué hacer con la extensión .jsx ni con la sintaxis JSX: falla con
 * ERR_UNKNOWN_FILE_EXTENSION. Eso dejaba a los componentes SIN posibilidad de
 * prueba, y por ese hueco se fue a producción un `etiquetaRegistro` sin
 * importar: el identificador quedó suelto en el bundle y la pantalla de detalle
 * de turno reventaba con ReferenceError.
 *
 * Se transforma con el SWC que Next YA trae (`next/dist/build/swc`), así que no
 * hace falta agregar esbuild, babel ni ningún transformador nuevo al proyecto.
 * Es la misma herramienta con la que Next compila el código real.
 */
export async function load(url, context, next) {
  if (!url.startsWith("file:") || !url.endsWith(".jsx")) return next(url, context);

  const archivo = fileURLToPath(url);
  const fuente = fs.readFileSync(archivo, "utf8");
  const swc = await import("next/dist/build/swc/index.js");
  // Los bindings nativos de SWC se cargan a demanda: sin esto, `transform` falla
  // con "bindings not loaded yet".
  await swc.loadBindings();
  const { code } = await swc.transform(fuente, {
    filename: archivo,
    jsc: {
      parser: { syntax: "ecmascript", jsx: true },
      target: "es2022",
      transform: { react: { runtime: "automatic" } },
    },
    module: { type: "es6" },
    isModule: true,
  });

  return { format: "module", shortCircuit: true, source: code };
}

// El hilo de hooks recibe una copia de process.env, así que la marca evita que
// el módulo se registre a sí mismo en cadena.
if (!process.env.__ERPAZUL_ALIAS_LOADER__) {
  process.env.__ERPAZUL_ALIAS_LOADER__ = "1";
  register(import.meta.url);
}
