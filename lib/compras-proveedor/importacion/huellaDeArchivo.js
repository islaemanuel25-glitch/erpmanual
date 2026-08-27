// LA HUELLA DE UN ARCHIVO, PARA NO LEERLO DOS VECES.
//
// ── QUÉ PROBLEMA RESUELVE ─────────────────────────────────────────────────
//
// Con VEINTE consultas por día, volver a abrir la misma foto no puede costar
// otra consulta. Y volver a abrirla es lo normal: se recarga la página, se
// vuelve desde otra pantalla, el teléfono descarta la pestaña.
//
// La huella dice si el archivo que hay delante es EL MISMO que ya se leyó. Si
// lo es, se reusa la lectura guardada y no se llama a nadie.
//
// ── POR QUÉ NO ALCANZA CON EL NOMBRE ──────────────────────────────────────
//
// Dos fotos distintas del mismo remito se llaman igual —`IMG_20260827.jpg`— y
// la misma foto puede llegar con otro nombre desde otra aplicación. El nombre
// no dice nada sobre el contenido.
//
// Se usa SHA-256 del contenido, que es lo que el navegador ya trae en
// `crypto.subtle`. No se agrega ninguna dependencia.
//
// ── LA HUELLA NO ALCANZA SOLA ─────────────────────────────────────────────
//
// La lectura sirve si coinciden TRES cosas: el archivo, el proveedor y la
// versión del lector. El proveedor porque el catálogo con el que se machea es
// otro; la versión porque una lectura vieja puede no traer campos que la
// interpretación de hoy espera —la tabla cruda es exactamente ese caso—.
//
// Reusar mirando solo el archivo sería peor que no reusar: mostraría datos
// viejos con cara de nuevos.

/**
 * La versión del LECTOR. Se sube cuando cambia qué devuelve una lectura.
 *
 *   v1 — líneas, encabezados y tabla cruda.
 *
 * Al subirla, todas las lecturas guardadas dejan de reusarse y el próximo
 * archivo se vuelve a leer. Es a propósito: es preferible gastar una consulta a
 * mostrar una lectura a la que le falta la mitad de los campos nuevos.
 */
export const VERSION_LECTURA = 1;

/**
 * SHA-256 del contenido, en hexadecimal.
 *
 * Devuelve `null` si el navegador no ofrece `crypto.subtle` —pasa en contextos
 * no seguros— en vez de lanzar. Sin huella no se reusa nada, que es el
 * comportamiento de antes: se pierde una optimización, no se rompe nada.
 */
export async function huellaDeArchivo(archivo, entorno = typeof globalThis === "undefined" ? null : globalThis) {
  const subtle = entorno?.crypto?.subtle;
  if (!archivo || typeof archivo.arrayBuffer !== "function" || !subtle) return null;
  try {
    const bytes = await archivo.arrayBuffer();
    const resumen = await subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/**
 * ¿LA LECTURA GUARDADA SIRVE PARA ESTE ARCHIVO?
 *
 * Puro, para que se pueda ejercer sin navegador. Devuelve el motivo cuando no
 * sirve: la pantalla dice distinto "es otro archivo" que "la lectura es vieja",
 * y las dos cosas se resuelven distinto.
 */
export function lecturaReutilizable({ guardada, huella, proveedorId, version = VERSION_LECTURA } = {}) {
  if (!guardada) return { sirve: false, porque: "NO_HAY" };
  // Sin huella no se reusa: no se puede afirmar que sea el mismo archivo, y
  // afirmarlo de más mostraría la lectura de OTRO papel.
  if (!huella || !guardada.huella) return { sirve: false, porque: "SIN_HUELLA" };
  if (guardada.huella !== huella) return { sirve: false, porque: "OTRO_ARCHIVO" };
  // El proveedor se compara como texto: viaja como número desde el estado y
  // como cadena desde la URL.
  if (String(guardada.proveedorId ?? "") !== String(proveedorId ?? "")) {
    return { sirve: false, porque: "OTRO_PROVEEDOR" };
  }
  if (Number(guardada.version) !== Number(version)) return { sirve: false, porque: "OTRA_VERSION" };
  if (!guardada.documento) return { sirve: false, porque: "SIN_LECTURA" };
  return { sirve: true };
}

/** Lo que se guarda junto a la lectura para poder reusarla después. */
export function marcaDeLectura({ huella, proveedorId, documento, version = VERSION_LECTURA } = {}) {
  return { huella: huella ?? null, proveedorId: proveedorId ?? null, version, documento: documento ?? null };
}
