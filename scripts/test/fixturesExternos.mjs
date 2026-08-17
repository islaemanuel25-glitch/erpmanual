// LOS ARCHIVOS REALES DE PROVEEDOR, QUE VIVEN AL LADO DEL REPO Y NO ADENTRO.
//
// ── POR QUÉ AFUERA ─────────────────────────────────────────────────────────
//
// Este repositorio es público. Un Excel de lista de proveedor lleva precios de
// compra y nombres de proveedores: es información comercial del negocio, no un
// fixture de prueba. No puede entrar al árbol, ni recortado, ni anonimizado a
// medias — un recorte con los precios reales sigue teniendo los precios reales.
//
// ── POR QUÉ POR RUTA RELATIVA Y NO POR VARIABLE DE ENTORNO ────────────────
//
// Una variable hay que acordarse de exportarla, o hay que escribirla en un
// archivo que alguien tiene que editar a mano. Las dos cosas devuelven los
// candados al estado de mudos apenas nadie se acuerda, que es exactamente el
// estado del que se los quiere sacar.
//
// La carpeta vive AL LADO del repo, como hermana. Si está, los candados corren
// solos; si no está, se saltean con su motivo. Nadie configura nada.
//
//     …/programas/
//       ├── erpmanual/                 ← este repo
//       └── erpazul-fixtures-dev/      ← los Excel reales
//
// ── CÓMO SE ELIGE CADA ARCHIVO: POR EL NOMBRE, NORMALIZADO ────────────────
//
// Los dos nombres son incómodos y de maneras distintas: uno llegó con un prefijo
// que le puso el sistema de subidas (`1c7370a6-…`) y el otro tiene espacios y un
// punto en "cod. de barras". Comparar el nombre crudo sería frágil con los dos.
//
// Así que se normaliza —minúsculas, sin acentos, y fuera todo lo que no sea
// letra o número— y recién ahí se buscan las marcas. El prefijo y los espacios
// dejan de importar porque desaparecen en la normalización.
//
// LO QUE NO SE USA PARA ELEGIR, Y ES DELIBERADO: el parser. Sería lo más
// elegante —él ya distingue el formato A del B— pero es circular de la peor
// manera: si el parser se rompe clasificando, los dos archivos podrían caer en la
// misma categoría, el otro no se encontraría, y sus candados SE SALTEARÍAN EN
// VERDE. El defecto se taparía solo, justo donde más falta hace que se vea. Es la
// misma forma que el `total` derivado del lector de comprobantes.
//
// Tampoco se elige por hash: identifica un archivo exacto y nada más, así que el
// día que Emanuel baje la lista del mes siguiente dejaría de encontrarla sin
// decir por qué.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** La carpeta hermana. Relativa a la raíz del repo, sin ninguna variable. */
export const CARPETA_FIXTURES = path.resolve(RAIZ, "..", "erpazul-fixtures-dev");

const normalizar = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Las marcas de cada formato, sobre el nombre YA normalizado.
 *
 * `B` es la exportación con códigos de barras. `A` es la lista común, y se
 * define por exclusión a propósito: es la que NO trae códigos de barras, que es
 * la diferencia que el parser realmente ve entre las dos.
 */
const FORMATOS = {
  A: (n) => n.includes("listadeprecios") && !n.includes("barras"),
  B: (n) => n.includes("barras"),
};

/**
 * Qué hay en la carpeta, clasificado. No lanza nunca: devuelve el motivo.
 *
 * @returns {{carpeta: string, existe: boolean, archivos: string[], elegidos: Record<string,string|null>, ambiguos: Record<string,string[]>}}
 */
export function inspeccionarFixtures(carpeta = CARPETA_FIXTURES) {
  const existe = fs.existsSync(carpeta) && fs.statSync(carpeta).isDirectory();
  if (!existe) {
    return { carpeta, existe: false, archivos: [], elegidos: { A: null, B: null }, ambiguos: {} };
  }

  const archivos = fs
    .readdirSync(carpeta, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.xlsx?$/i.test(e.name))
    .map((e) => e.name)
    .sort();

  const elegidos = {};
  const ambiguos = {};
  for (const [clave, marca] of Object.entries(FORMATOS)) {
    const candidatos = archivos.filter((a) => marca(normalizar(a)));
    if (candidatos.length === 1) {
      elegidos[clave] = path.join(carpeta, candidatos[0]);
    } else {
      // NI CERO NI DOS SE ELIGEN. Con dos candidatos, tomar el primero sería
      // decidir por orden alfabético cuál es el papel de verdad, y el candado
      // pasaría o fallaría por eso sin que nadie lo sepa. Mejor saltear y decirlo.
      elegidos[clave] = null;
      if (candidatos.length > 1) ambiguos[clave] = candidatos;
    }
  }

  return { carpeta, existe: true, archivos, elegidos, ambiguos };
}

/**
 * La ruta del fixture pedido, o null si no se puede elegir.
 *
 * `null` es una respuesta legítima: significa "acá no está", y el candado que lo
 * pide se saltea con su motivo. No es un error.
 */
export function rutaFixture(clave, carpeta = CARPETA_FIXTURES) {
  return inspeccionarFixtures(carpeta).elegidos[clave] ?? null;
}

/** Por qué no se pudo elegir, en una frase que sirva en la salida de la suite. */
export function motivoFaltante(clave, carpeta = CARPETA_FIXTURES) {
  const r = inspeccionarFixtures(carpeta);
  if (!r.existe) {
    return `sin la carpeta ${path.basename(r.carpeta)} al lado del repo: los Excel reales no están en el repositorio`;
  }
  if (r.ambiguos[clave]) {
    return `hay ${r.ambiguos[clave].length} archivos que podrían ser el formato ${clave} (${r.ambiguos[clave].join(", ")}): no se elige por orden alfabético`;
  }
  return `no hay ningún archivo de formato ${clave} en ${path.basename(r.carpeta)} (hay: ${r.archivos.join(", ") || "ninguno"})`;
}
