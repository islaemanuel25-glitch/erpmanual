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
  /** No es el archivo: es el servidor, que no pudo cargar el lector de PDF. */
  LECTOR_NO_DISPONIBLE: "LECTOR_NO_DISPONIBLE",
};

export const TEXTO_MOTIVO_PDF = {
  SIN_TEXTO:
    "Este PDF no tiene texto: es una foto o un escaneo de la lista. El sistema no puede leer los precios de una imagen. Pedile al proveedor el archivo original, en Excel o en un PDF que se pueda copiar.",
  ILEGIBLE:
    "El archivo no se pudo abrir como PDF. Puede estar dañado o protegido con contraseña.",
  // ── POR QUÉ ESTE MOTIVO EXISTE APARTE ─────────────────────────────────────
  //
  // Porque los dos se veían igual y mandaban al usuario a hacer lo que no era.
  // La primera versión atrapaba las dos fallas en el mismo `catch` y contestaba
  // "el archivo está dañado" cuando el archivo estaba perfecto y lo que no
  // cargaba era `pdfjs-dist` en el servidor. Con ese mensaje, el usuario le pide
  // otro archivo al proveedor y el problema sigue: nadie mira el servidor, que es
  // donde está. Apareció en la primera llamada real al endpoint.
  LECTOR_NO_DISPONIBLE:
    "El sistema no pudo abrir su lector de PDF. No es problema del archivo: avisá para que lo revisen en el servidor.",
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
  } catch (e) {
    // El motivo se registra: el texto que ve el usuario no puede traer un rastro
    // de pila, y sin este renglón nadie sabría por qué no cargó.
    console.error("[listas/lectura] no se pudo cargar pdfjs-dist:", e?.message ?? e);
    return { ok: false, motivo: MOTIVO_PDF.LECTOR_NO_DISPONIBLE };
  }
  if (typeof pdfjs?.getDocument !== "function") {
    console.error("[listas/lectura] pdfjs-dist cargó sin getDocument:", Object.keys(pdfjs ?? {}).slice(0, 10));
    return { ok: false, motivo: MOTIVO_PDF.LECTOR_NO_DISPONIBLE };
  }

  let doc;
  try {
    doc = await pdfjs.getDocument({
      // ── UN BUFFER DE NODE NO SIRVE, AUNQUE SEA UN Uint8Array ────────────
      //
      // `Buffer` HEREDA de `Uint8Array`, así que `instanceof` da true y un
      // guardián escrito así lo dejaba pasar tal cual. pdfjs lo rechaza con
      // "Please provide binary data as `Uint8Array`, rather than `Buffer`", y ese
      // error caía en el catch de abajo y volvía como "el archivo está dañado o
      // protegido" sobre un PDF perfecto.
      //
      // Lo peligroso fue dónde no apareció: el endpoint que propone las columnas
      // lee con `new Uint8Array(await archivo.arrayBuffer())` y anda perfecto,
      // así que la lectura se veía probada. La ruta de importar usa
      // `Buffer.from(...)` —porque necesita el buffer para hashear el archivo— y
      // ahí toda lista en PDF era ilegible.
      //
      // Se copia la vista SIEMPRE: es una línea y saca la clase entera de error.
      data: nuevaVista(bytes),
      // Sin fuentes del sistema y sin `eval`: esto corre en el servidor con un
      // archivo que sube un usuario, y no hace falta dibujar nada para leer el
      // texto.
      useSystemFonts: false,
      isEvalSupported: false,
      // Los avisos de fuentes rotas son ruido: una lista se lee igual con una
      // fuente que pdfjs no reconoce.
      verbosity: 0,
    }).promise;
  } catch (e) {
    // Igual que arriba: el usuario recibe un texto y el servidor, el motivo.
    console.error("[listas/lectura] pdfjs no pudo abrir el archivo:", e?.message ?? e);
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
/**
 * Una vista `Uint8Array` limpia sobre los mismos bytes.
 *
 * No copia el contenido: construye una vista nueva sobre el búfer subyacente,
 * respetando el desplazamiento y el largo. Un `Buffer` de Node suele ser una
 * ventana dentro de un búfer compartido más grande, así que ignorar
 * `byteOffset` leería basura de otro archivo.
 */
function nuevaVista(bytes) {
  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  return new Uint8Array(bytes ?? []);
}

async function cargarPdfjsPorDefecto() {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}
