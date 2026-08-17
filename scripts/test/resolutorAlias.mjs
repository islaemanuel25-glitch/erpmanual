// scripts/test/resolutorAlias.mjs
//
// EL RESOLUTOR DE ALIAS DE LA SUITE.
//
// ── QUÉ PROBLEMA RESUELVE, Y CUÁNTO COSTÓ NO TENERLO ──────────────────────
//
// Los candados del proyecto importan como importa la aplicación: `@/lib/…` y
// `@/components/…`, que son los alias que resuelve Next. `node --test` pelado NO
// los resuelve, así que esos archivos fallaban al importar y NO LLEGABAN A
// EJECUTARSE.
//
// Eso no se ve. Un archivo que no corre no aparece en rojo con el nombre de sus
// candados: aparece una sola línea diciendo que el archivo falló, y el total se
// lee como ruido conocido. **Un candado que no corre se ve igual que uno que
// pasa.**
//
// Medido el 2026-08-17, antes de escribir esto: **44 archivos no corrían**. Con
// sólo resolver el alias arrancan 37, y traen **739 candados que jamás se habían
// ejecutado**. Ninguno en rojo — estaban todos bien, y mudos.
//
// ── LO QUE NO HACE ────────────────────────────────────────────────────────
//
// No transforma JSX ni resuelve los paquetes de Next. Los 7 archivos que siguen
// sin correr por eso están declarados uno por uno en
// `lib/sunmi/todosLosCandadosCorren.test.mjs`, que es el candado que impide que
// esta lista crezca sola.
//
// ── POR QUÉ LA RESOLUCIÓN SE EXPORTA ──────────────────────────────────────
//
// Porque el candado de arriba necesita hacer la MISMA pregunta —"¿este import se
// puede resolver?"— y dos funciones que responden lo mismo no se rompen el día
// que se escriben, se rompen el día que una cambia. Acá hay una sola.
//
// Uso: `npm test`, que es `node --import ./scripts/test/registrar.mjs --test …`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** La raíz del proyecto, deducida de dónde vive este archivo. */
export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const EXTENSIONES = [".js", ".mjs", ".jsx", ".ts", ".tsx"];
const INDICES = ["index.js", "index.mjs", "index.jsx"];

/**
 * La ruta con su extensión, o el `index` de un directorio.
 *
 * ── EL ARCHIVO GANA SOBRE EL DIRECTORIO, Y NO ES UN DETALLE ────────────────
 *
 * La primera versión de esto miraba el directorio primero, y por eso `./auth`
 * desde `lib/authorize.js` resolvía a la CARPETA `lib/auth/` —que sólo tiene un
 * test adentro, sin `index`— en vez de a `lib/auth.js`, que existe. Salía un
 * `EISDIR` y estuvo a punto de anotarse como "un candado que no se puede correr".
 * Era un defecto de esto, no del candado.
 *
 * Node y Next resuelven el archivo primero. Acá igual.
 *
 * @returns {string|null} la ruta absoluta, o null si no existe nada.
 */
export function rutaResuelta(rutaAbs) {
  if (fs.existsSync(rutaAbs) && fs.statSync(rutaAbs).isFile()) return rutaAbs;
  for (const ext of EXTENSIONES) {
    if (fs.existsSync(rutaAbs + ext)) return rutaAbs + ext;
  }
  if (fs.existsSync(rutaAbs) && fs.statSync(rutaAbs).isDirectory()) {
    for (const ind of INDICES) {
      const p = path.join(rutaAbs, ind);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * ¿A qué archivo apunta este import, visto desde `desdeArchivo`?
 *
 * @param {string} especificador  lo que está escrito en el `from "…"`.
 * @param {string} desdeArchivo   ruta absoluta del archivo que lo importa.
 * @returns {{tipo: "alias"|"relativo"|"paquete"|"node", ruta: string|null}}
 */
export function resolverEspecificador(especificador, desdeArchivo) {
  if (especificador.startsWith("node:")) return { tipo: "node", ruta: null };
  if (especificador.startsWith("@/")) {
    return { tipo: "alias", ruta: rutaResuelta(path.join(RAIZ, especificador.slice(2))) };
  }
  if (especificador.startsWith(".")) {
    const base = path.dirname(desdeArchivo);
    return { tipo: "relativo", ruta: rutaResuelta(path.resolve(base, especificador)) };
  }
  return { tipo: "paquete", ruta: null };
}

// ── EL ENGANCHE DE NODE ────────────────────────────────────────────────────

export async function resolve(especificador, contexto, siguiente) {
  const desde = contexto.parentURL && contexto.parentURL.startsWith("file:")
    ? fileURLToPath(contexto.parentURL)
    : path.join(RAIZ, "x.mjs");

  if (especificador.startsWith("@/")) {
    const r = resolverEspecificador(especificador, desde);
    if (r.ruta) return { url: pathToFileURL(r.ruta).href, shortCircuit: true };
  }
  // Un import RELATIVO de un directorio: node en ESM no lo resuelve a su index y
  // Next sí. Sólo se interviene en ese caso; el resto sigue el camino normal.
  if (especificador.startsWith(".")) {
    const abs = path.resolve(path.dirname(desde), especificador);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      const r = rutaResuelta(abs);
      if (r) return { url: pathToFileURL(r).href, shortCircuit: true };
    }
  }
  return siguiente(especificador, contexto);
}
