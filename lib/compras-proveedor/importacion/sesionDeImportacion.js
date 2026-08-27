// LA IMPORTACIÓN A MEDIO HACER, GUARDADA EN EL DISPOSITIVO.
//
// ── EL CASO, QUE ES DE TODOS LOS DÍAS ─────────────────────────────────────
//
// En Android: se carga la foto, se analiza, se abre "Explicar cómo leer este
// documento", se escribe la explicación, se cambia de aplicación para mandar una
// captura — y al volver Android descartó la pestaña. Se perdió todo: la foto,
// los resultados, las decisiones y lo escrito.
//
// No es un caso raro. Es lo que pasa cada vez que suena el teléfono.
//
// ── POR QUÉ NO ES UN PEDIDO BORRADOR ──────────────────────────────────────
//
// Sería lo fácil: crear el pedido en la base y guardar ahí. Está descartado a
// propósito. Un borrador es un HECHO del negocio —aparece en las listas, alguien
// lo puede confirmar, cuenta como pedido— y esto no es un hecho: es una pantalla
// a mitad de camino. Crear filas de producción para no perder trabajo de
// interfaz mezcla dos cosas que después no se pueden separar.
//
// ── POR QUÉ IndexedDB Y NO localStorage ───────────────────────────────────
//
// Porque hay que conservar el ARCHIVO. `localStorage` guarda texto: meter una
// foto de 3 MB ahí exige pasarla a base64 —que la agranda un tercio— y compite
// con el tope de 5 MB del origen entero. IndexedDB guarda un Blob tal cual.
//
// El proyecto ya tiene dos borradores en `localStorage` —`lib/caja/borradorCierre.js`
// y `borradorRetiro.js`— y de ahí sale la FORMA de este módulo: un prefijo, una
// versión explícita, y la regla de que lo incompatible se DESCARTA en vez de
// migrarse. Lo que no se pudo reusar es el mecanismo, porque aquéllos guardan
// números y éste guarda un archivo.
//
// ── LO PURO Y LO QUE TOCA EL NAVEGADOR, SEPARADOS ─────────────────────────
//
// Todo lo que DECIDE —si una sesión sirve, de quién es, si venció, si la versión
// es compatible— son funciones puras y tienen candados. Lo que abre IndexedDB
// está abajo, en funciones finas, y lo ejerce la sonda en un navegador de verdad.
// Es la misma división de siempre: los candados prueban piezas y la pantalla
// prueba el camino.

/**
 * Historia de versiones. Se sube cuando cambia QUÉ se guarda, no cuándo cambia
 * un detalle interno: una sesión de otra versión se DESCARTA, y descartar el
 * trabajo de alguien por un cambio cosmético sería peor que no guardar nada.
 *
 *   v1 — archivo, lectura cruda, líneas, decisiones, explicación, receta
 *        temporal, paso, panel y posición.
 */
export const VERSION_SESION = 1;

/** El nombre de la base y del almacén. Un solo lugar. */
export const BASE_DATOS = "erpazul.importacion";
export const ALMACEN = "sesiones";

/** La clave: hay UNA sesión de importación por dispositivo. */
export const CLAVE_UNICA = "actual";

/**
 * CUÁNTO VIVE UNA SESIÓN, EN UN SOLO LUGAR.
 *
 * Está acá y no repartida entre el que guarda, el que lee y el que limpia. Tres
 * copias de un número son tres oportunidades de que uno quede viejo, y el
 * síntoma sería una sesión que se restaura cuando ya no debería o al revés.
 *
 * Tres días: cubre el fin de semana largo de quien empieza una importación un
 * viernes. Más que eso ya no es "seguir donde estaba", es un archivo olvidado.
 */
export const CADUCIDAD_MS = 3 * 24 * 60 * 60 * 1000;

/** Por qué una sesión guardada no se puede usar. La pantalla decide con esto. */
export const MOTIVO_DESCARTE = Object.freeze({
  NO_HAY: "NO_HAY",
  OTRA_VERSION: "OTRA_VERSION",
  OTRO_USUARIO: "OTRO_USUARIO",
  OTRO_LOCAL: "OTRO_LOCAL",
  OTRO_PEDIDO: "OTRO_PEDIDO",
  VENCIDA: "VENCIDA",
  INCOMPLETA: "INCOMPLETA",
});

/**
 * ARMA LO QUE SE VA A GUARDAR.
 *
 * Recibe el estado de la pantalla y devuelve el objeto a persistir. Es pura para
 * que un candado pueda mirar exactamente qué se guarda — y sobre todo, qué NO.
 *
 * @param archivo  el `File` original. Se guarda tal cual: IndexedDB conserva
 *   Blobs, y sin el archivo no se puede volver a transcribir.
 */
export function armarSesion({
  version = VERSION_SESION,
  usuarioId,
  localId,
  // A QUÉ TRABAJO PERTENECE. Armar un pedido nuevo y sumarle líneas al borrador
  // #999001 son dos importaciones distintas: restaurar una sobre la otra le
  // metería a alguien un archivo y unas decisiones que no son de lo que está
  // haciendo. `null` significa "pedido nuevo", que también es un valor.
  pedidoId = null,
  archivo = null,
  proveedorId = null,
  proveedorNombre = null,
  documento = null,
  lineas = [],
  explicacion = "",
  recetaEnUso = null,
  recetaSoloEstaVez = false,
  paso = "elegir",
  panelAbierto = false,
  desplazamiento = 0,
  peticionInterrumpida = null,
  // La lectura ya hecha, con la huella del archivo. Viaja con la sesión para
  // que volver a abrir el MISMO archivo después de recargar cueste CERO
  // consultas. Sin esto, la sesión salvaba el trabajo pero no la cuota.
  lecturaGuardada = null,
  ahora = Date.now,
} = {}) {
  return {
    version,
    // La propiedad de la sesión. Sin esto, en un dispositivo compartido —que es
    // el caso normal en un mostrador— el siguiente que entra ve el trabajo del
    // anterior, con los productos y los precios de un proveedor que no eligió.
    usuarioId: usuarioId ?? null,
    localId: localId ?? null,
    pedidoId: pedidoId ?? null,

    // El archivo y sus datos. El nombre y el tipo van aparte del Blob porque un
    // Blob recuperado de IndexedDB no siempre conserva el nombre.
    archivo: archivo || null,
    archivoNombre: archivo?.name ?? null,
    archivoTipo: archivo?.type ?? null,
    archivoFecha: archivo?.lastModified ?? null,

    proveedorId: proveedorId ?? null,
    proveedorNombre: proveedorNombre ?? null,

    // La lectura CRUDA y las líneas normalizadas van las dos. La cruda es lo que
    // permite reinterpretar sin volver a leer el archivo; las líneas son las
    // decisiones que ya se tomaron encima.
    documento,
    lineas: Array.isArray(lineas) ? lineas : [],

    explicacion: String(explicacion ?? ""),
    recetaEnUso,
    recetaSoloEstaVez: recetaSoloEstaVez === true,

    paso,
    panelAbierto: panelAbierto === true,
    desplazamiento: Number(desplazamiento) || 0,

    // Si algo quedó a mitad de camino, se anota QUÉ era. Al volver, la pantalla
    // lo dice en vez de reintentarlo sola: reintentar solo gastaría una consulta
    // al modelo que nadie pidió.
    peticionInterrumpida: peticionInterrumpida || null,
    lecturaGuardada: lecturaGuardada || null,

    actualizadaEn: ahora(),
  };
}

/**
 * ¿ESTA SESIÓN GUARDADA SE PUEDE USAR?
 *
 * Devuelve `{ ok }` o `{ ok:false, motivo }`. Nunca lanza: una sesión ilegible
 * es un caso normal —cambió la versión, la escribió otro usuario— y no un error.
 *
 * El orden de los chequeos NO es arbitrario: primero la versión, porque una
 * sesión de otro esquema puede no tener siquiera los campos con los que se
 * comprueban los demás.
 */
export function sesionUtilizable({ sesion, usuarioId, localId, pedidoId = null, ahora = Date.now } = {}) {
  if (!sesion || typeof sesion !== "object") return { ok: false, motivo: MOTIVO_DESCARTE.NO_HAY };
  if (sesion.version !== VERSION_SESION) return { ok: false, motivo: MOTIVO_DESCARTE.OTRA_VERSION };

  // `!=` con null a propósito NO: se comparan como texto para que un id que
  // viaje como número y otro como cadena no den un falso "otro usuario". Lo que
  // sí importa es que un null NO machee con nada.
  const mismo = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
  if (!mismo(sesion.usuarioId, usuarioId)) return { ok: false, motivo: MOTIVO_DESCARTE.OTRO_USUARIO };
  if (!mismo(sesion.localId, localId)) return { ok: false, motivo: MOTIVO_DESCARTE.OTRO_LOCAL };

  // El pedido se compara distinto que el dueño: acá `null` es un valor legítimo
  // —"pedido nuevo"— y tiene que machear con `null`. Usar `mismo` lo trataría
  // como ausente y ninguna sesión de pedido nuevo se recuperaría jamás.
  const pedidoDeLaSesion = sesion.pedidoId ?? null;
  const pedidoPedido = pedidoId ?? null;
  const igualPedido =
    pedidoDeLaSesion === null && pedidoPedido === null
      ? true
      : String(pedidoDeLaSesion) === String(pedidoPedido);
  if (!igualPedido) return { ok: false, motivo: MOTIVO_DESCARTE.OTRO_PEDIDO };

  const edad = ahora() - Number(sesion.actualizadaEn || 0);
  if (!Number.isFinite(edad) || edad > CADUCIDAD_MS) return { ok: false, motivo: MOTIVO_DESCARTE.VENCIDA };

  // Una sesión sin archivo Y sin líneas no tiene nada que restaurar. Restaurarla
  // mostraría "Importación recuperada" sobre una pantalla vacía, que es peor que
  // no decir nada.
  const hayAlgo = Boolean(sesion.archivo) || (Array.isArray(sesion.lineas) && sesion.lineas.length > 0);
  if (!hayAlgo) return { ok: false, motivo: MOTIVO_DESCARTE.INCOMPLETA };

  return { ok: true };
}

/** Hace cuánto se guardó, en castellano y sin biblioteca de fechas. */
export function hace(cuando, ahora = Date.now) {
  const ms = ahora() - Number(cuando || 0);
  if (!Number.isFinite(ms) || ms < 0) return "recién";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "recién";
  if (min === 1) return "hace 1 minuto";
  if (min < 60) return `hace ${min} minutos`;
  const horas = Math.floor(min / 60);
  if (horas === 1) return "hace 1 hora";
  if (horas < 24) return `hace ${horas} horas`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "ayer" : `hace ${dias} días`;
}

// ══════════════════════════════════════════════════════════════════════════
// LO QUE TOCA EL NAVEGADOR
// ══════════════════════════════════════════════════════════════════════════
//
// Todo lo de abajo devuelve `{ ok }` y NUNCA lanza. Un navegador puede negar el
// almacenamiento —modo privado, permisos, disco lleno— y eso no puede tumbar la
// pantalla: tiene que poder seguir trabajando sin red de contención, sabiendo
// que no la tiene.

/** ¿Hay IndexedDB en este navegador? */
export function hayAlmacenamiento(ventana = typeof window === "undefined" ? null : window) {
  try {
    return Boolean(ventana && ventana.indexedDB);
  } catch {
    return false;
  }
}

function abrir(ventana) {
  return new Promise((resolver, rechazar) => {
    let pedido;
    try {
      pedido = ventana.indexedDB.open(BASE_DATOS, 1);
    } catch (e) {
      rechazar(e);
      return;
    }
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN);
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rechazar(pedido.error || new Error("no se pudo abrir"));
    pedido.onblocked = () => rechazar(new Error("bloqueada por otra pestaña"));
  });
}

/**
 * GUARDA, Y RECIÉN CONTESTA CUANDO LA ESCRITURA TERMINÓ.
 *
 * Se espera al evento `oncomplete` de la TRANSACCIÓN y no al del pedido: el
 * pedido puede decir que salió bien y la transacción abortar después, por
 * ejemplo por falta de espacio. Es la diferencia entre decir "guardado en este
 * dispositivo" y que sea verdad.
 */
export async function guardarSesion(sesion, ventana = typeof window === "undefined" ? null : window) {
  if (!hayAlmacenamiento(ventana)) return { ok: false, motivo: "SIN_ALMACENAMIENTO" };
  let db;
  try {
    db = await abrir(ventana);
  } catch (e) {
    return { ok: false, motivo: "NO_SE_PUDO_ABRIR", detalle: e?.name || null };
  }
  try {
    return await new Promise((resolver) => {
      const tx = db.transaction(ALMACEN, "readwrite");
      tx.objectStore(ALMACEN).put(sesion, CLAVE_UNICA);
      tx.oncomplete = () => resolver({ ok: true, en: sesion.actualizadaEn });
      tx.onabort = () => resolver({ ok: false, motivo: "SIN_ESPACIO", detalle: tx.error?.name || null });
      tx.onerror = () => resolver({ ok: false, motivo: "ERROR_AL_ESCRIBIR", detalle: tx.error?.name || null });
    });
  } finally {
    db.close();
  }
}

/** Lee la sesión cruda. Decidir si sirve es de `sesionUtilizable`, no de acá. */
export async function leerSesion(ventana = typeof window === "undefined" ? null : window) {
  if (!hayAlmacenamiento(ventana)) return { ok: false, motivo: "SIN_ALMACENAMIENTO" };
  let db;
  try {
    db = await abrir(ventana);
  } catch (e) {
    return { ok: false, motivo: "NO_SE_PUDO_ABRIR", detalle: e?.name || null };
  }
  try {
    return await new Promise((resolver) => {
      const tx = db.transaction(ALMACEN, "readonly");
      const pedido = tx.objectStore(ALMACEN).get(CLAVE_UNICA);
      pedido.onsuccess = () => resolver({ ok: true, sesion: pedido.result ?? null });
      pedido.onerror = () => resolver({ ok: false, motivo: "ERROR_AL_LEER" });
    });
  } finally {
    db.close();
  }
}

/** Borra la sesión. Se usa al cancelar y al crear el borrador con éxito. */
export async function borrarSesion(ventana = typeof window === "undefined" ? null : window) {
  if (!hayAlmacenamiento(ventana)) return { ok: false, motivo: "SIN_ALMACENAMIENTO" };
  let db;
  try {
    db = await abrir(ventana);
  } catch {
    return { ok: false, motivo: "NO_SE_PUDO_ABRIR" };
  }
  try {
    return await new Promise((resolver) => {
      const tx = db.transaction(ALMACEN, "readwrite");
      tx.objectStore(ALMACEN).delete(CLAVE_UNICA);
      tx.oncomplete = () => resolver({ ok: true });
      tx.onerror = () => resolver({ ok: false, motivo: "ERROR_AL_BORRAR" });
      tx.onabort = () => resolver({ ok: false, motivo: "ERROR_AL_BORRAR" });
    });
  } finally {
    db.close();
  }
}
