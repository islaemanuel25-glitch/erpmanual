// ACHICAR UNA FOTO ANTES DE SUBIRLA.
//
// ── POR QUÉ EN EL NAVEGADOR Y NO EN EL SERVIDOR ───────────────────────────
//
// Una foto de celular son entre 3 y 12 MB. Mandarla entera para que el servidor
// tire el 95 % gasta los datos de quien la sacó —parado en el depósito, con el
// teléfono— y tarda lo que tarda subir 12 MB por una red mala. Achicarla acá
// sube unos cientos de KB.
//
// De paso, el servidor no necesita una librería de imágenes: `canvas` ya está en
// el navegador.
//
// ── ES PURO Y SIN DOM PROPIO A PROPÓSITO ──────────────────────────────────
//
// Toma un `File` y devuelve un `File`. No toca el formulario, no sube nada y no
// sabe qué es un producto: por eso se puede probar y por eso lo puede usar otra
// pantalla el día que haga falta.

import { LADO_MAXIMO } from "@/lib/productos/fotoProducto";

/**
 * El tamaño de destino, dado el original y el lado máximo.
 *
 * ── SE EXPORTA APARTE PORQUE ES LO ÚNICO QUE SE PUEDE PROBAR SIN NAVEGADOR ─
 *
 * El resto —decodificar, dibujar, comprimir— necesita un canvas de verdad. Esta
 * cuenta no, y es donde están los dos errores posibles: agrandar una foto chica,
 * y deformar una que no es cuadrada.
 */
export function medidaDeDestino({ ancho, alto, lado = LADO_MAXIMO } = {}) {
  const a = Number(ancho);
  const b = Number(alto);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;

  const mayor = Math.max(a, b);
  // UNA FOTO MÁS CHICA QUE EL TOPE NO SE TOCA. Agrandarla no agrega detalle
  // —lo inventa— y encima pesa más. El tope es un máximo, no un objetivo.
  if (mayor <= lado) return { ancho: Math.round(a), alto: Math.round(b), achica: false };

  const factor = lado / mayor;
  return {
    // `max(1, ...)` para que una foto larguísima y finita no termine con un lado
    // en cero, que da un canvas inválido y una excepción sin sentido.
    ancho: Math.max(1, Math.round(a * factor)),
    alto: Math.max(1, Math.round(b * factor)),
    achica: true,
  };
}

/** El tipo de salida que este navegador sabe producir de verdad. */
export function tipoDeSalida(crear = (t) => document.createElement("canvas").toDataURL(t)) {
  // ── SE PREGUNTA PRODUCIENDO, NO MIRANDO EL NAVEGADOR ────────────────────
  //
  // `toDataURL("image/webp")` en un navegador que no sabe webp devuelve un PNG
  // sin avisar. Así que se mira lo que DEVOLVIÓ: si no empieza con el prefijo de
  // webp, no hay webp y se usa jpeg. Preguntar por el nombre del navegador sería
  // una lista que se queda vieja.
  try {
    return String(crear("image/webp")).startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
  } catch {
    return "image/jpeg";
  }
}

/**
 * Achica y comprime una foto.
 *
 * @param {File} archivo
 * @returns {Promise<File>} otro `File`, listo para subir
 */
export async function achicarFoto(archivo, { lado = LADO_MAXIMO, calidad = 0.82 } = {}) {
  if (!archivo) throw new Error("No hay archivo que achicar.");
  if (!String(archivo.type || "").startsWith("image/")) {
    throw new Error("Ese archivo no es una imagen.");
  }

  const mapa = await crearMapaDeBits(archivo);
  const destino = medidaDeDestino({ ancho: mapa.width, alto: mapa.height, lado });
  if (!destino) throw new Error("No se pudieron leer las medidas de la imagen.");

  const lienzo = document.createElement("canvas");
  lienzo.width = destino.ancho;
  lienzo.height = destino.alto;
  const ctx = lienzo.getContext("2d");
  ctx.drawImage(mapa, 0, 0, destino.ancho, destino.alto);
  if (typeof mapa.close === "function") mapa.close();

  const tipo = tipoDeSalida();
  const blob = await new Promise((resolve, reject) => {
    lienzo.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("El navegador no pudo comprimir la imagen."))),
      tipo,
      calidad
    );
  });

  const ext = tipo === "image/webp" ? "webp" : "jpg";
  return new File([blob], `foto.${ext}`, { type: tipo });
}

/**
 * Decodifica el archivo.
 *
 * `createImageBitmap` es el camino bueno y respeta la orientación EXIF con
 * `imageOrientation: "from-image"` — sin eso, una foto sacada en vertical se
 * guarda acostada, que es el defecto clásico de subir desde el celular.
 *
 * El `<img>` queda de respaldo para los navegadores que no lo tengan, y ahí la
 * orientación depende del navegador. Se prefiere el primero justamente por eso.
 */
async function crearMapaDeBits(archivo) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(archivo, { imageOrientation: "from-image" });
    } catch {
      // Sigue por el respaldo.
    }
  }
  const url = URL.createObjectURL(archivo);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo abrir la imagen."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
