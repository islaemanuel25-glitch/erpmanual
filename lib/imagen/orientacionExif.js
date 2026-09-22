// LA ORIENTACIÓN QUE EL CELULAR GRABÓ EN LA FOTO.
//
// ── POR QUÉ HACE FALTA LEERLA ─────────────────────────────────────────────
//
// Un celular no rota los píxeles al sacar una foto: los guarda siempre en la
// misma orientación del sensor y anota aparte, en el EXIF, cómo hay que girar
// la imagen para verla derecha. Quien la muestra tiene que respetar esa marca.
//
// El papel de Paty se veía DADO VUELTA y apaisado, en una franja en el medio de
// una pantalla negra: la foto está de costado en el archivo y su EXIF dice cómo
// ponerla, y nadie lo estaba mirando.
//
// ── POR QUÉ SE LEE Y NO SE REESCRIBE LA FOTO ──────────────────────────────
//
// Porque la foto original NO SE TOCA. Es el documento: es lo que se mira cuando
// un número no cierra, y volver a comprimirla para dejarla derecha le baja
// calidad justo donde hay que leer dígitos chicos. Se lee la marca y se gira al
// mostrarla, que además es gratis.
//
// ── LO QUE ESTA FUNCIÓN NO HACE ───────────────────────────────────────────
//
// No decodifica la imagen ni mira un solo píxel: recorre los marcadores del
// JPEG hasta el bloque EXIF y saca UN número. Si no lo encuentra —una foto sin
// EXIF, un PNG, un archivo cortado— devuelve 0 grados, que es lo que ya pasaba
// antes y no empeora nada.
//
// Módulo puro: sin red, sin disco y sin Prisma. Recibe bytes.

/** Los ocho valores del estándar, y cuántos grados hay que girar para cada uno. */
export const GRADOS_POR_ORIENTACION = Object.freeze({
  1: 0, // derecha
  2: 0, // espejada en horizontal — el giro es cero
  3: 180,
  4: 180, // espejada y de cabeza
  5: 90, // espejada y de costado
  6: 90, // de costado, el caso típico del celular en vertical
  7: 270, // espejada y de costado al otro lado
  8: 270,
});

const MARCA_EXIF = [0x45, 0x78, 0x69, 0x66]; // "Exif"
const TAG_ORIENTACION = 0x0112;

/**
 * La orientación EXIF de un JPEG, o `null` si no la trae.
 *
 * @param {Uint8Array|Buffer} bytes
 * @returns {number|null} 1..8
 */
export function orientacionExif(bytes) {
  const b = bytes;
  if (!b || b.length < 4) return null;
  // Todo JPEG empieza con SOI. Si no, no hay nada que recorrer.
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;

  let i = 2;
  // Se recorren los marcadores hasta encontrar el APP1 con la marca "Exif".
  // No se busca la firma suelta por el archivo: aparecería también adentro de
  // los píxeles y ahí el desplazamiento no significaría nada.
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marcador = b[i + 1];
    // SOS: a partir de acá vienen los datos comprimidos. Si el EXIF no apareció
    // antes, no está.
    if (marcador === 0xda || marcador === 0xd9) return null;
    const largo = (b[i + 2] << 8) | b[i + 3];
    if (largo < 2) return null;

    if (marcador === 0xe1 && i + 4 + 4 <= b.length && MARCA_EXIF.every((c, k) => b[i + 4 + k] === c)) {
      // Salta "Exif\0\0" y arranca el bloque TIFF.
      return leerOrientacionTiff(b, i + 10);
    }
    i += 2 + largo;
  }
  return null;
}

/** El bloque TIFF que hay adentro del APP1: cabecera, IFD0 y sus etiquetas. */
function leerOrientacionTiff(b, base) {
  if (base + 8 > b.length) return null;
  // El orden de los bytes lo dice la propia cabecera: "II" intel o "MM" motorola.
  const intel = b[base] === 0x49 && b[base + 1] === 0x49;
  const motorola = b[base] === 0x4d && b[base + 1] === 0x4d;
  if (!intel && !motorola) return null;

  const u16 = (p) => (intel ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]);
  const u32 = (p) =>
    intel
      ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0
      : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;

  if (u16(base + 2) !== 0x002a) return null;
  const primerIfd = u32(base + 4);
  const ifd = base + primerIfd;
  if (ifd + 2 > b.length) return null;

  const cuantas = u16(ifd);
  for (let k = 0; k < cuantas; k++) {
    const entrada = ifd + 2 + k * 12;
    if (entrada + 12 > b.length) return null;
    if (u16(entrada) === TAG_ORIENTACION) {
      // El valor de una etiqueta corta vive en los primeros dos bytes del campo.
      const v = u16(entrada + 8);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}

/**
 * CUÁNTOS GRADOS HAY QUE GIRAR ESTA FOTO PARA VERLA DERECHA.
 *
 * Siempre 0, 90, 180 o 270. Un archivo sin EXIF da 0, que es lo que se venía
 * haciendo: no se rompe nada y se arregla lo que se puede.
 */
export function giroDeLaFoto(bytes) {
  const o = orientacionExif(bytes);
  return o === null ? 0 : GRADOS_POR_ORIENTACION[o] ?? 0;
}

/**
 * EL GIRO FINAL: el del archivo más el que la persona eligió.
 *
 * Se suman y se normalizan a una vuelta. La persona gira sobre lo que VE, así
 * que su giro es relativo a la foto ya enderezada por el EXIF — sumar es lo que
 * hace que tocar "Girar" cuatro veces devuelva la foto a donde estaba.
 */
export function giroTotal({ exif = 0, elegido = 0 } = {}) {
  const suma = (Number(exif) || 0) + (Number(elegido) || 0);
  return ((suma % 360) + 360) % 360;
}
