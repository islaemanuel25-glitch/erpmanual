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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// ESM exige extensión explícita; el alias del proyecto se escribe sin ella.
const EXTENSIONES = ["", ".js", ".mjs", ".jsx", path.join("", "index.js")];

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
  return next(specifier, context);
}

// El hilo de hooks recibe una copia de process.env, así que la marca evita que
// el módulo se registre a sí mismo en cadena.
if (!process.env.__ERPAZUL_ALIAS_LOADER__) {
  process.env.__ERPAZUL_ALIAS_LOADER__ = "1";
  register(import.meta.url);
}
