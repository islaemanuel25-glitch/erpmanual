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

import { LADO_MAXIMO, TIPOS_ACEPTADOS } from "@/lib/productos/fotoProducto";

// La extensión sale del MISMO mapa que el servidor usa para aceptar el archivo.
// Escribirla acá con un ternario —"webp" o "jpg"— era correcto mientras había
// dos formatos; con PNG en el medio, un tercer caso olvidado sube un archivo
// llamado `.jpg` que adentro es un PNG.
const EXTENSION_POR_TIPO = TIPOS_ACEPTADOS;

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

/**
 * El tipo de salida que este navegador sabe producir de verdad.
 *
 * ── SE PREGUNTA PRODUCIENDO, NO MIRANDO EL NAVEGADOR ────────────────────
 *
 * `toDataURL("image/webp")` en un navegador que no sabe webp devuelve un PNG
 * sin avisar. Así que se mira lo que DEVOLVIÓ: si no empieza con el prefijo de
 * webp, no hay webp. Preguntar por el nombre del navegador sería una lista que
 * se queda vieja.
 *
 * ── Y SI LA IMAGEN TIENE TRANSPARENCIA, JPEG NO ES UNA OPCIÓN ───────────
 *
 * Es la regla que no se negocia desde que existe el quitado de fondo. JPEG no
 * tiene canal alfa: guardar ahí un recorte no da un error — rellena el fondo de
 * NEGRO y lo guarda tan campante. O sea que el trabajo de quitar el fondo se
 * destruye en el último paso, en silencio, y recién se ve en la tarjeta.
 *
 * El respaldo cuando no hay webp pasa a ser PNG, que sí tiene alfa y está en
 * todos los navegadores desde siempre. Pesa más, y por eso solo se usa cuando
 * hace falta: una foto CON fondo sigue yendo a jpeg si no hay webp.
 */
export function tipoDeSalida(
  crear = (t) => document.createElement("canvas").toDataURL(t),
  { conTransparencia = false } = {}
) {
  let hayWebp = false;
  try {
    hayWebp = String(crear("image/webp")).startsWith("data:image/webp");
  } catch {
    hayWebp = false;
  }
  if (hayWebp) return "image/webp";
  return conTransparencia ? "image/png" : "image/jpeg";
}

/**
 * Achica y comprime una foto.
 *
 * @param {File} archivo
 * @returns {Promise<File>} otro `File`, listo para subir
 */
export async function achicarFoto(
  archivo,
  { lado = LADO_MAXIMO, calidad = 0.82, conTransparencia = false } = {}
) {
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

  const tipo = tipoDeSalida(undefined, { conTransparencia });
  const blob = await new Promise((resolve, reject) => {
    lienzo.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("El navegador no pudo comprimir la imagen."))),
      tipo,
      calidad
    );
  });

  return new File([blob], `foto.${EXTENSION_POR_TIPO[tipo]}`, { type: tipo });
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
