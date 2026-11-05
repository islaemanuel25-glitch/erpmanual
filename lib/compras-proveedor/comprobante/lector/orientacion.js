// lib/compras-proveedor/comprobante/lector/orientacion.js
//
// LA FOTO SE ENDEREZA SOLA ANTES DE LEERLA.
//
// ── EL CASO (Emanuel, 2026-11-05) ─────────────────────────────────────────
//
// La factura de Terrabusi (pedido #509) llegó apaisada: el lector se comió un
// renglón y corrió los importes, hasta que Emanuel la giró a mano con «Girar».
// La de Ayala Gauna, lo mismo. Regla de Emanuel: no quiere girar a mano; el
// sistema tiene que darse cuenta solo.
//
// ── CÓMO ──────────────────────────────────────────────────────────────────
//
// Una pregunta al modelo más barato que tiene el proyecto, con una miniatura
// de la foto y una sola respuesta: cuántos grados hay que girarla en sentido
// horario para que el texto quede derecho —0, 90, 180 o 270—. Una prueba de
// píxeles distingue un papel acostado de uno parado, pero no uno al revés de
// uno derecho, y al revés es uno de los tres casos.
//
// ── CUÁNDO, Y CUÁNTAS VECES ───────────────────────────────────────────────
//
// Una vez por foto, en toda su vida: solo si nadie la miró todavía
// —`ComprobanteArchivo.giroGrados` vacío—. Lo detectado se guarda en esa misma
// columna, la que escribe «Girar», así que el visor la muestra derecha y una
// relectura no vuelve a preguntar. Y si Emanuel gira a mano, su número queda
// escrito y la detección no corre más: su giro manda.
//
// Si la pregunta falla —sin clave, sin cuota, sin respuesta—, la foto se lee
// como hoy y la columna queda vacía para intentarlo en la próxima lectura. Un
// problema para enderezar no puede convertirse en "no se pudo leer".
//
// Módulo sin red y sin base: el detector y sharp entran por parámetro.

/** Las cuatro posiciones. Las mismas que guarda «Girar». */
export const ORIENTACIONES = Object.freeze([0, 90, 180, 270]);

/**
 * El lado largo de la miniatura que se manda a preguntar. Alcanza para ver
 * para dónde corren los renglones, que es lo único que se pregunta, y cuesta
 * una fracción de la foto entera.
 */
export const LADO_MINIATURA = 768;

/** De dónde salió el giro con que se lee una foto. */
export const ORIGEN_DEL_GIRO = Object.freeze({
  /** Ya estaba escrito: lo eligió Emanuel con «Girar» o lo detectó una lectura anterior. */
  GUARDADO: "GUARDADO",
  /** Se detectó ahora: hay que guardarlo. */
  DETECTADO: "DETECTADO",
  /** No es una imagen: un PDF no se gira. */
  NO_ES_IMAGEN: "NO_ES_IMAGEN",
  /** Se preguntó y no hubo respuesta que sirva: se lee como está. */
  SIN_DETECTAR: "SIN_DETECTAR",
});

const IMAGENES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/** Una de las cuatro posiciones, o null si no es ninguna. */
export function orientacionValida(v) {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && ORIENTACIONES.includes(n) ? n : null;
}

/**
 * LA MINIATURA PARA PREGUNTAR: derecha según el EXIF —la misma base sobre la
 * que se aplica el giro, en el visor y en la lectura—, chica y en JPEG.
 */
export async function miniaturaParaOrientacion(archivo, sharp) {
  const salida = await sharp(archivo.bytes)
    .rotate()
    .resize({ width: LADO_MINIATURA, height: LADO_MINIATURA, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  return { bytes: salida, mime: "image/jpeg" };
}

/**
 * CON QUÉ GIRO SE LEE ESTA FOTO, Y SI HAY QUE GUARDARLO.
 *
 * @param archivo   `{ bytes, mime, orden, giroGrados }`
 * @param sharp     la fábrica de sharp
 * @param detectar  `async ({ bytes, mime }) => ({ ok, giro, ...llamada })`
 * @returns `{ giro, origen, guardar, llamada }` — `llamada` es lo que devolvió
 *          el detector, para la bitácora; null si no se preguntó.
 */
export async function giroParaLeer({ archivo, sharp, detectar }) {
  const guardado = orientacionValida(archivo?.giroGrados);
  if (guardado !== null) return { giro: guardado, origen: ORIGEN_DEL_GIRO.GUARDADO, guardar: false, llamada: null };
  if (!IMAGENES.has(String(archivo?.mime ?? "").toLowerCase())) {
    return { giro: 0, origen: ORIGEN_DEL_GIRO.NO_ES_IMAGEN, guardar: false, llamada: null };
  }
  const sinDetectar = (llamada = null) => ({ giro: 0, origen: ORIGEN_DEL_GIRO.SIN_DETECTAR, guardar: false, llamada });
  if (typeof sharp !== "function" || typeof detectar !== "function") return sinDetectar();
  let llamada;
  try {
    const miniatura = await miniaturaParaOrientacion(archivo, sharp);
    llamada = await detectar(miniatura);
  } catch {
    return sinDetectar();
  }
  const giro = llamada?.ok === true ? orientacionValida(llamada.giro) : null;
  if (giro === null) return sinDetectar(llamada ?? null);
  return { giro, origen: ORIGEN_DEL_GIRO.DETECTADO, guardar: true, llamada };
}

/**
 * LAS FOTOS DE UNA LECTURA, CADA UNA CON SU GIRO. En serie, como el achicado:
 * es una llamada por foto y no hay apuro en hacerlas a la vez.
 *
 * @returns las fotos con `giroGrados` puesto, y `aGuardar` —`[{ orden, giro }]`,
 *          lo detectado ahora— y `llamadas` para la bitácora.
 */
export async function orientarTodas(archivos, { sharp, detectar }) {
  const fotos = [];
  const aGuardar = [];
  const llamadas = [];
  for (const archivo of Array.isArray(archivos) ? archivos : []) {
    const r = await giroParaLeer({ archivo, sharp, detectar });
    fotos.push({ ...archivo, giroGrados: r.giro });
    if (r.guardar) aGuardar.push({ orden: archivo.orden, giro: r.giro });
    if (r.llamada) llamadas.push(r.llamada);
  }
  return { fotos, aGuardar, llamadas };
}
