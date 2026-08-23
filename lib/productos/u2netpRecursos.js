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
// Esos son los BINARIOS y nada más. El total de la primera carga es mayor,
// porque el import dinámico de `onnxruntime-web` también trae JavaScript que el
// navegador tiene que bajar. El número completo, medido en un navegador con
// perfil limpio, está en `DEC-0010` y lo produce `scripts/sonda-u2netp-peso.mjs`.
//
// ── POR QUÉ SE SIRVEN DESDE ACÁ Y NO DESDE UN SERVIDOR AJENO ──────────────
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
// declarada en `MANIFIESTO.json` contra la del `package.json` y contra la que
// `package-lock.json` resuelve de verdad.
//
// Junto a los binarios van las licencias upstream, copiadas exactas:
// `LICENSE-u2net-Apache-2.0.txt` y `LICENSE-onnxruntime-web-MIT.txt`. No es
// prolijidad: Apache-2.0 pide que la copia de la licencia viaje con la obra, y
// nosotros distribuimos el modelo a cada navegador.

/** Dónde viven los dos archivos, servidos por el propio dominio. */
export const RUTA_MODELO = "/modelos/u2netp/u2netp.onnx";
export const RUTA_WASM = "/modelos/u2netp/ort-wasm-simd-threaded.wasm";

/**
 * LA HUELLA DE LOS RECURSOS, Y POR QUÉ NO ES UN NÚMERO DE VERSIÓN A MANO.
 *
 * Antes acá decía `u2netp-v1`, y el comentario prometía que "cuando cambie el
 * modelo o el runtime el almacén viejo deja de usarse solo". **Era falso.** Un
 * `v1` escrito a mano no está atado a nada: cambiar el `.onnx` y olvidarse de
 * tocar esta línea deja a cada teléfono leyendo del almacén los bytes VIEJOS,
 * para siempre y en silencio. El modelo nuevo se despliega y nadie lo usa.
 *
 * Ahora la identidad del almacén ES el contenido. Esta huella son los primeros
 * 16 hex del sha256 de:
 *
 *   u2netp|onnxruntime-web|<version>|<sha256 del wasm>|<sha256 del modelo>
 *
 * con los tres datos sacados de `MANIFIESTO.json`. Si cambia cualquiera de los
 * tres, la huella cambia, el nombre del almacén cambia, y lo guardado bajo el
 * nombre anterior deja de encontrarse. No hay forma de cambiar un binario y
 * seguir sirviendo el caché viejo sin que se note.
 *
 * Va escrita a mano a propósito: calcularla en el navegador querría decir bajar
 * los binarios para poder decidir si hace falta bajarlos. El candado U13 la
 * recalcula desde el manifiesto y se pone rojo si no coincide — y el mensaje del
 * rojo trae el valor que hay que escribir, así que no se saca de memoria.
 */
export const HUELLA_RECURSOS = "2f0522c45b463c6b";

/** Todos los almacenes de este motor empiezan así. Lo de afuera no se toca. */
export const PREFIJO_ALMACEN = "u2netp-";

/**
 * El nombre del almacén de la Cache API.
 *
 * ── POR QUÉ CACHE API Y NO CONFIAR EN LAS CABECERAS ───────────────────────
 *
 * Porque Next sirve lo de `public/` con `max-age=0` y un ETag: en la segunda
 * visita el navegador igual sale a preguntar, y aunque conteste 304 son dos
 * viajes de ida y vuelta antes de poder recortar nada. Con la Cache API los
 * bytes quedan guardados por nosotros y la segunda vez no hay ni pregunta.
 */
export const ALMACEN = `${PREFIJO_ALMACEN}${HUELLA_RECURSOS}`;

/**
 * Trae un archivo, usando la copia guardada si está.
 *
 * ── LO QUE DEVUELVE, Y POR QUÉ NO ES SOLO LOS BYTES ───────────────────────
 *
 * Devuelve tres cosas: los bytes, si salieron del almacén, y cómo guardarlos.
 *
 * `desdeCache` existe porque es lo único que distingue "el modelo está roto" de
 * "la copia guardada se corrompió". Sin ese dato, reintentar sería adivinar.
 *
 * Y `guardar` es una función y no algo que pase acá adentro porque **guardar
 * antes de saber si los bytes sirven es exactamente el defecto que había**: la
 * versión anterior hacía `put` apenas bajaba el archivo, sin haber visto todavía
 * si ORT podía crear una sesión con eso. Bytes truncados por una red que se
 * cortó quedaban guardados como buenos, y a partir de ahí ese teléfono usaba el
 * respaldo por bordes en cada foto, para siempre, sin un solo error visible.
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
 * @param {{sinCache?:boolean}} [opciones]
 * @returns {Promise<{bytes: ArrayBuffer, desdeCache: boolean, guardar: () => Promise<boolean>}>}
 */
export async function traerRecurso(ruta, alAvanzar = null, { sinCache = false } = {}) {
  if (!sinCache) {
    const almacen = await abrirAlmacen();
    if (almacen) {
      try {
        const guardado = await almacen.match(ruta);
        if (guardado) {
          return {
            bytes: await guardado.arrayBuffer(),
            desdeCache: true,
            // Ya está guardado: volver a guardarlo no agrega nada.
            guardar: async () => true,
          };
        }
      } catch {
        // Una caché que no se puede leer se ignora: se baja de nuevo.
      }
    }
  }

  // `reload` solo en el reintento: además del almacén hay que saltear la caché
  // HTTP del navegador, que podría estar sirviendo los mismos bytes rotos.
  const res = await fetch(ruta, {
    credentials: "same-origin",
    cache: sinCache ? "reload" : "default",
  });
  if (!res.ok) {
    throw new Error(`No se pudo bajar ${ruta} (${res.status}).`);
  }

  // EL CLON SE SACA ANTES DE LEER, y es el error clásico de la Cache API: un
  // `Response` se lee UNA sola vez, así que guardar el original después de
  // leerlo deja la caché con un cuerpo vacío — y no avisa. Lo que cambió no es
  // el clon sino CUÁNDO se usa: se queda esperando hasta que alguien confirme
  // que con estos bytes se pudo crear la sesión.
  const clon = res.clone();
  const bytes = await leerConAvance(res, alAvanzar);

  return {
    bytes,
    desdeCache: false,
    guardar: async () => {
      const almacen = await abrirAlmacen();
      if (!almacen) return false;
      try {
        await almacen.put(ruta, clon);
        return true;
      } catch {
        // Sin espacio, o modo privado. Se sigue sin guardar.
        return false;
      }
    },
  };
}

/**
 * Los dos recursos juntos, que es como los pide el motor.
 *
 * @returns {Promise<{wasm: ArrayBuffer, modelo: ArrayBuffer, desdeCache: boolean,
 *                    guardar: () => Promise<boolean>}>}
 */
export async function traerRecursos({ alAvanzar = null, sinCache = false } = {}) {
  const wasm = await traerRecurso(RUTA_WASM, alAvanzar, { sinCache });
  const modelo = await traerRecurso(RUTA_MODELO, alAvanzar, { sinCache });

  return {
    wasm: wasm.bytes,
    modelo: modelo.bytes,
    // Alcanza con que UNO haya salido del almacén para que valga la pena
    // reintentar: el corrupto puede ser cualquiera de los dos.
    desdeCache: wasm.desdeCache || modelo.desdeCache,
    guardar: async () => {
      const a = await wasm.guardar();
      const b = await modelo.guardar();
      return a && b;
    },
  };
}

/**
 * Borra las entradas de ESTA versión, y nada más.
 *
 * No borra el almacén entero ni toca ningún otro: se sacan las dos rutas que
 * este motor guardó. Lo de otras versiones lo limpia `limpiarAlmacenesViejos`,
 * y lo que no empiece con el prefijo no es nuestro y no se toca.
 */
export async function invalidarRecursos() {
  const almacen = await abrirAlmacen();
  if (!almacen) return false;
  try {
    await almacen.delete(RUTA_WASM);
    await almacen.delete(RUTA_MODELO);
    return true;
  } catch {
    return false;
  }
}

/**
 * Saca los almacenes de versiones anteriores de ESTE motor.
 *
 * Sin esto, cambiar el modelo dejaría los 18 MB del anterior ocupando lugar en
 * cada teléfono para siempre — y el navegador, cuando le falta espacio, decide
 * solo qué tirar, que puede ser justo el almacén nuevo.
 *
 * Solo se miran los nombres que empiezan con el prefijo de este motor. Un
 * almacén de otra parte de la aplicación no se toca ni se enumera para decidir.
 */
export async function limpiarAlmacenesViejos() {
  try {
    if (typeof caches === "undefined") return 0;
    const nombres = await caches.keys();
    let borrados = 0;
    for (const nombre of nombres) {
      if (!nombre.startsWith(PREFIJO_ALMACEN)) continue;
      if (nombre === ALMACEN) continue;
      if (await caches.delete(nombre)) borrados++;
    }
    return borrados;
  } catch {
    return 0;
  }
}

/**
 * UN INTENTO, Y SI LOS BYTES ERAN DEL CACHÉ, UNO MÁS. NUNCA TRES.
 *
 * ── EL DEFECTO QUE ESTO IMPIDE ────────────────────────────────────────────
 *
 * Una copia guardada que se corrompió —la red se cortó a mitad de la descarga,
 * el disco del teléfono devolvió basura— no se cura sola. La sesión de ORT falla
 * al crearse, `quitarFondo` cae al motor por bordes, y como los dos motores
 * devuelven una imagen plausible, desde afuera se ve igual que funcionar. Ese
 * teléfono queda recortando por bordes para siempre, con el modelo sano en el
 * servidor y a un `delete` de distancia.
 *
 * ── POR QUÉ EL REINTENTO ESTÁ ATADO A `desdeCache` ────────────────────────
 *
 * Es lo único que lo hace terminar. Si los bytes vinieron de la red y la sesión
 * igual falló, el problema no es el caché: volver a bajarlos daría lo mismo, y
 * como el segundo intento también trae de la red, un reintento incondicional
 * podría no parar nunca. Con esta condición hay como mucho DOS llamadas a
 * `crear`, y la segunda solo existe si la primera usó bytes guardados.
 *
 * ── Y SI EL SEGUNDO TAMBIÉN FALLA ─────────────────────────────────────────
 *
 * Tira, que es lo correcto: el que llama es la cascada de `quitarFondo`, y su
 * `catch` es el motor por bordes. O sea que el respaldo sigue estando; lo que se
 * arregló es que ahora se llega a él después de haber intentado curarse, y no
 * antes.
 *
 * Los pasos entran por parámetro para que los candados puedan ejercer el caso
 * corrupto sin navegador: la contraprueba de esto no se puede leer, hay que
 * correrla.
 *
 * @param {{traer: (op:{sinCache:boolean}) => Promise<any>,
 *          crear: (recursos:any) => Promise<any>,
 *          invalidar: () => Promise<any>}} pasos
 */
export async function conRecuperacionDeCache({ traer, crear, invalidar }) {
  const primero = await traer({ sinCache: false });

  let creado;
  try {
    creado = await crear(primero);
  } catch (e) {
    // Bytes recién bajados que no sirven NO se guardan. Es la mitad del arreglo:
    // sin esto, el próximo intento los volvería a leer del almacén.
    if (!primero.desdeCache) throw e;

    await invalidar();
    const segundo = await traer({ sinCache: true });
    // Si esto tira, tira: no hay un tercer intento y la cascada cae a bordes.
    const recuperado = await crear(segundo);
    await segundo.guardar();
    return recuperado;
  }

  // Se guarda RECIÉN ACÁ, con la sesión ya creada: son bytes probados.
  await primero.guardar();
  return creado;
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
