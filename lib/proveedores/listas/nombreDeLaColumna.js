// CÓMO SE NOMBRA LA COLUMNA DE PRECIO CON LA QUE SE LEYÓ UNA LISTA.
//
// ── DE DÓNDE SALE (Emanuel, 2026-10-24, lista de Dab) ─────────────────────
//
// El aviso decía "Los precios salieron de la columna «», que coincide con tus
// costos en 57 de cada 141 productos". Un PDF sin encabezado no trae título de
// columna, `decisionDeLectura.titulo` queda en "", y las comillas quedaban
// vacías justo en el aviso que pide elegir otra.
//
// Sin título, la columna se DESCRIBE con lo que se ve en el papel: en qué lugar
// está entre las de precio, y qué dice en un renglón concreto —"la 3.ª columna
// de precios, la que dice $ 955,00 en 9 DE ORO AGRIDULCE"—. Con eso se la
// encuentra en el PDF sin adivinar.
//
// Devuelve la frase entera, con el artículo: "la columna «Precio»" o la
// descripción. Así ningún consumidor arma las comillas y ninguno puede volver
// a dejarlas vacías.

import { money } from "./explicarLectura.js";

/** Cuántos renglones se miran, en orden, para encontrar el del ejemplo. */
const RENGLONES_PARA_EL_EJEMPLO = 200;

/**
 * @param titulo            el título de la columna en el archivo ("" si no tiene)
 * @param columna           la columna usada (`decisionDeLectura.columna`)
 * @param columnasDePrecio  las candidatas a precio, en orden (`mapeo.precios`)
 * @param ejemplo           `{ precio, descripcion }` de un renglón (`ejemploDeLaColumna`)
 */
export function nombreDeLaColumna({ titulo = null, columna = null, columnasDePrecio = [], ejemplo = null } = {}) {
  const t = String(titulo ?? "").trim();
  if (t) return `la columna «${t}»`;

  const lugar = (Array.isArray(columnasDePrecio) ? columnasDePrecio : []).map(String).indexOf(String(columna));
  const n = Number(columna);
  let base = "una columna sin título";
  if (lugar >= 0) base = `la ${lugar + 1}.ª columna de precios`;
  else if (columna !== null && columna !== "" && Number.isInteger(n) && n >= 0) base = `la ${n + 1}.ª columna del archivo`;

  const precio = Number(ejemplo?.precio);
  const descripcion = String(ejemplo?.descripcion ?? "").trim();
  if (Number.isFinite(precio) && precio > 0 && descripcion) {
    return `${base}, la que dice ${money(precio)} en ${descripcion}`;
  }
  return base;
}

/**
 * Lo que dicen los avisos de la pantalla: el nombre que armó el servidor, con
 * el ejemplo; si no vino (un servidor viejo), el mismo nombre sin ejemplo.
 */
export function nombreDeLaColumnaLeida(lectura) {
  if (!lectura) return null;
  return (
    lectura.nombreColumna ||
    nombreDeLaColumna({ titulo: lectura.titulo, columna: lectura.columna, columnasDePrecio: lectura.mapeo?.precios })
  );
}

/**
 * El primer renglón que tiene un precio en esa columna y una descripción.
 *
 * @param filas  `[{ descripcionProveedor, preciosPorColumna }]`, en el orden del archivo
 */
export function ejemploDeLaColumna(filas, columna) {
  if (columna === null || columna === undefined) return null;
  for (const f of Array.isArray(filas) ? filas : []) {
    const precio = Number(f?.preciosPorColumna?.[columna]);
    const descripcion = String(f?.descripcionProveedor ?? "").trim();
    if (Number.isFinite(precio) && precio > 0 && descripcion) return { precio, descripcion };
  }
  return null;
}

/**
 * El nombre de la columna de una lista guardada. Solo va a la base cuando la
 * columna no tiene título: con título, el nombre es el título.
 *
 * @param db         el cliente de Prisma
 * @param lectura    `decisionDeLectura` de la importación
 */
export async function nombreDeLaColumnaDeLaLista(db, { importacionId, lectura }) {
  if (!lectura) return null;
  const comun = { titulo: lectura.titulo, columna: lectura.columna, columnasDePrecio: lectura.mapeo?.precios };
  if (String(lectura.titulo ?? "").trim()) return nombreDeLaColumna(comun);
  const filas = await db.importacionListaFila.findMany({
    where: { importacionId },
    orderBy: { filaExcel: "asc" },
    take: RENGLONES_PARA_EL_EJEMPLO,
    select: { descripcionProveedor: true, preciosPorColumna: true },
  });
  return nombreDeLaColumna({ ...comun, ejemplo: ejemploDeLaColumna(filas, lectura.columna) });
}
