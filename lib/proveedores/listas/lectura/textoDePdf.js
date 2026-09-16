// lib/proveedores/listas/lectura/textoDePdf.js
//
// SACAR EL TEXTO DE UN PDF, CON LA POSICIÓN DE CADA PEDAZO.
//
// Es el ÚNICO archivo de la lectura que no es puro: carga `pdfjs-dist`. Todo lo
// que decide algo —qué es una fila, qué es una columna, qué es un precio— vive en
// módulos puros que reciben fragmentos y se pueden probar sin un PDF.
//
// ── LA POSICIÓN NO ES UN LUJO ───────────────────────────────────────────────
//
// Copiar el texto de un PDF y trabajar con eso no alcanza para estas listas. Dos
// de las cuatro reales quedan con las filas pegadas —una termina y la siguiente
// arranca sin separador— y una imprime DOS TABLAS POR HOJA, con las filas de la
// izquierda y la derecha intercaladas. Las dos cosas se resuelven con la
// coordenada y ninguna se resuelve con el texto plano.
//
// ── EL PDF ESCANEADO SE RECHAZA, NO SE ADIVINA ──────────────────────────────
//
// Un PDF de fotos no tiene texto: tiene imágenes de letras. Devuelve cero
// fragmentos y acá se corta con un motivo que lo dice. Mandarlo a un lector de
// imágenes sería inventar los precios de una lista, que es exactamente lo que
// este módulo no puede hacer.

/** Por qué un PDF no se pudo leer. */
export const MOTIVO_PDF = {
  SIN_TEXTO: "SIN_TEXTO",
  ILEGIBLE: "ILEGIBLE",
};

export const TEXTO_MOTIVO_PDF = {
  SIN_TEXTO:
    "Este PDF no tiene texto: es una foto o un escaneo de la lista. El sistema no puede leer los precios de una imagen. Pedile al proveedor el archivo original, en Excel o en un PDF que se pueda copiar.",
  ILEGIBLE:
    "El archivo no se pudo abrir como PDF. Puede estar dañado o protegido con contraseña.",
};

/**
 * Cuántos fragmentos con texto tiene que haber para considerar que el PDF tiene
 * texto de verdad.
 *
 * No es cero: un escaneo suele traer igual alguna marca de agua o el nombre del
 * programa que lo generó, y con un solo fragmento el archivo seguiría siendo
 * ilegible. Veinte es holgado para cualquier lista real —la más chica de las
 * cuatro tiene más de mil en la primera página— y deja afuera al escaneo con
 * membrete.
 */
const MINIMO_FRAGMENTOS = 20;

/**
 * Las páginas de un PDF, cada una con sus fragmentos posicionados.
 *
 * @param bytes  Uint8Array o Buffer
 * @returns { ok: true, paginas: [{ ancho, alto, fragmentos: [{x,y,texto}] }] }
 *        | { ok: false, motivo }
 */
export async function paginasDePdf(bytes, { cargarPdfjs = cargarPdfjsPorDefecto } = {}) {
  let pdfjs;
  try {
    pdfjs = await cargarPdfjs();
  } catch {
    return { ok: false, motivo: MOTIVO_PDF.ILEGIBLE };
  }

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
      // Sin fuentes del sistema y sin `eval`: esto corre en el servidor con un
      // archivo que sube un usuario, y no hace falta dibujar nada para leer el
      // texto.
      useSystemFonts: false,
      isEvalSupported: false,
      // Los avisos de fuentes rotas son ruido: una lista se lee igual con una
      // fuente que pdfjs no reconoce.
      verbosity: 0,
    }).promise;
  } catch {
    return { ok: false, motivo: MOTIVO_PDF.ILEGIBLE };
  }

  const paginas = [];
  let total = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    const pg = await doc.getPage(n);
    const vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent();
    const fragmentos = [];
    for (const it of tc.items) {
      const texto = String(it.str ?? "");
      if (!texto.trim()) continue;
      fragmentos.push({
        x: Math.round(it.transform[4] * 100) / 100,
        y: Math.round(it.transform[5] * 100) / 100,
        // EL ANCHO REAL, NO UNO ESTIMADO POR CANTIDAD DE LETRAS.
        //
        // La primera versión no lo pasaba y el módulo de abajo estimaba 4,2
        // puntos por carácter. Con eso, la lista de bebidas detectó TRES columnas
        // en vez de nueve: la estimación se pasaba tanto que los huecos entre
        // columnas quedaban por debajo del umbral y todo se fusionaba. pdfjs lo
        // informa medido; estimarlo era inventar un dato que ya estaba.
        ancho: Math.round((it.width ?? 0) * 100) / 100,
        texto,
      });
    }
    total += fragmentos.length;
    paginas.push({ ancho: vp.width, alto: vp.height, fragmentos });
  }

  if (total < MINIMO_FRAGMENTOS) return { ok: false, motivo: MOTIVO_PDF.SIN_TEXTO };
  return { ok: true, paginas };
}

/**
 * La carga de pdfjs, inyectable.
 *
 * Se inyecta para que los candados puedan ejercer el camino de error sin tener
 * que fabricar un PDF roto, y para que un cambio de build de pdfjs se toque en
 * un solo lugar.
 */
async function cargarPdfjsPorDefecto() {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}
