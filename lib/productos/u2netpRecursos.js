// DE DÓNDE SALEN EL MODELO Y EL RUNTIME, Y CÓMO SE GUARDAN.
//
// Este archivo no sabe nada de fotos ni de recortes: solo consigue los dos
// bloques de bytes que hacen falta para poder inferir, y se ocupa de que la
// segunda vez no haya que bajarlos de nuevo.
//
// ── LOS DOS ARCHIVOS, CON SU PESO MEDIDO ──────────────────────────────────
//
// No son estimaciones: son los tamaños de los archivos que están en el repo,
// medidos con `stat`, y lo que ocupan comprimidos con gzip -9, que es lo que
// viaja de verdad por la red.
//
//   u2netp.onnx                    4.574.861 B crudo  ·  4.237.634 B gzip
//   ort-wasm-simd-threaded.wasm   13.479.978 B crudo  ·  3.428.070 B gzip
//                                 ─────────────       ─────────────
//                                 18.054.839 B        7.665.704 B
//
// O sea **unos 7,7 MB la primera vez** en un teléfono, y 17,2 MiB de disco en la
// imagen. El modelo casi no comprime porque los pesos ya son entropía alta; el
// runtime sí, baja a la cuarta parte.
//
// Esto es bastante más de lo que se había estimado cuando se decidió posponer
// u2netp —se habló de "unos 8 MB de descarga" contando solo el modelo y una
// idea vieja del tamaño del runtime—. El número real es el de arriba.
//
// ── POR QUÉ SE SIRVEN DESDE ACÁ Y NO DESDE UN CDN ─────────────────────────
//
// Es un requisito del encargo y coincide con lo que ya estaba decidido: la foto
// no sale del teléfono y el modelo no viene de un tercero. Los dos archivos
// viven en `public/modelos/u2netp/` y los sirve el mismo dominio.
//
// Que estén COMMITEADOS y no copiados en el build es a propósito: el Dockerfile
// ya copia `public/` a la imagen, así que no hace falta ninguna maquinaria de
// build que pueda fallar en silencio y dejar la aplicación sin modelo.
//
// El costo de esa decisión es que el `.wasm` tiene que corresponderse con la
// versión de `onnxruntime-web` del `package.json`. Si alguien actualiza la
// dependencia y no vuelve a copiar el archivo, ORT levanta con un runtime de
// otra versión. Eso NO se detecta leyendo: hay un candado que compara la versión
// declarada en `MANIFIESTO.json` contra la del `package.json`.

/** Dónde viven los dos archivos, servidos por el propio dominio. */
export const RUTA_MODELO = "/modelos/u2netp/u2netp.onnx";
export const RUTA_WASM = "/modelos/u2netp/ort-wasm-simd-threaded.wasm";

/**
 * El nombre del almacén de la Cache API.
 *
 * ── POR QUÉ CACHE API Y NO CONFIAR EN LAS CABECERAS ───────────────────────
 *
 * Porque Next sirve lo de `public/` con `max-age=0` y un ETag: en la segunda
 * visita el navegador igual sale a preguntar, y aunque conteste 304 son dos
 * viajes de ida y vuelta antes de poder recortar nada. Con la Cache API los
 * bytes quedan guardados por nosotros y la segunda vez no hay ni pregunta.
 *
 * Lleva la versión adentro del nombre: cuando cambie el modelo o el runtime, el
 * almacén viejo deja de usarse solo y no hay que acordarse de invalidarlo.
 */
export const ALMACEN = "u2netp-v1";

/**
 * Trae un archivo, usando la copia guardada si está.
 *
 * ── FALLA HACIA ADELANTE, NUNCA HACIA ATRÁS ───────────────────────────────
 *
 * Si la Cache API no existe —un navegador viejo, una pestaña privada, un
 * contexto sin https— esto NO puede romper: se baja el archivo y listo. Guardar
 * es una mejora, no un requisito. Por eso cada uso del caché va en su propio
 * `try` y el camino sin caché es el mismo camino.
 *
 * @param {string} ruta
 * @param {(cargados:number, total:number)=>void} [alAvanzar]
 * @returns {Promise<ArrayBuffer>}
 */
export async function traerConCache(ruta, alAvanzar = null) {
  const almacen = await abrirAlmacen();

  if (almacen) {
    try {
      const guardado = await almacen.match(ruta);
      if (guardado) return await guardado.arrayBuffer();
    } catch {
      // Una caché que no se puede leer se ignora: se baja de nuevo.
    }
  }

  const res = await fetch(ruta, { credentials: "same-origin" });
  if (!res.ok) {
    throw new Error(`No se pudo bajar ${ruta} (${res.status}).`);
  }

  // Se guarda ANTES de consumir el cuerpo, con un clon: un `Response` se lee una
  // sola vez, y si se guarda el original después de leerlo la caché queda con un
  // cuerpo vacío. Es el error clásico de la Cache API y no da ningún aviso.
  if (almacen) {
    try {
      await almacen.put(ruta, res.clone());
    } catch {
      // Sin espacio, o modo privado. Se sigue sin guardar.
    }
  }

  return await leerConAvance(res, alAvanzar);
}

/** El almacén, o `null` si este navegador no tiene Cache API. */
async function abrirAlmacen() {
  try {
    if (typeof caches === "undefined") return null;
    return await caches.open(ALMACEN);
  } catch {
    return null;
  }
}

/**
 * Lee el cuerpo informando cuánto lleva.
 *
 * Sirve para poder decir "bajando el modelo, 3 de 18 MB" en vez de dejar la
 * pantalla quieta durante varios segundos la primera vez. Si el navegador no
 * expone el cuerpo como stream, se lee de una y no se informa avance — que es
 * peor pero funciona.
 */
async function leerConAvance(res, alAvanzar) {
  const total = Number(res.headers.get("content-length")) || 0;
  if (!alAvanzar || !res.body || typeof res.body.getReader !== "function") {
    return await res.arrayBuffer();
  }

  const lector = res.body.getReader();
  const trozos = [];
  let cargados = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    trozos.push(value);
    cargados += value.length;
    try {
      alAvanzar(cargados, total);
    } catch {
      // Un informe de avance que tira NO puede tumbar la descarga.
    }
  }

  const junto = new Uint8Array(cargados);
  let o = 0;
  for (const t of trozos) {
    junto.set(t, o);
    o += t.length;
  }
  return junto.buffer;
}

/** ¿Ya están los dos archivos guardados? Para poder decirlo sin bajarlos. */
export async function yaEstaGuardado() {
  const almacen = await abrirAlmacen();
  if (!almacen) return false;
  try {
    const a = await almacen.match(RUTA_MODELO);
    const b = await almacen.match(RUTA_WASM);
    return Boolean(a && b);
  } catch {
    return false;
  }
}
