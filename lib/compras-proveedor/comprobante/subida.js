// lib/compras-proveedor/comprobante/subida.js
//
// QUÉ ARCHIVOS ENTRAN, Y QUÉ SE LE DICE AL QUE SUBE CUANDO NO ENTRAN.
//
// ── SE REUSA `validarArchivo`, NO SE ESCRIBE UNA PARECIDA ──────────────────
//
// Las cinco validaciones —hay archivo, extensión, vacío, tamaño, MIME— ya viven
// en `lib/proveedores/listas/persistencia.js` y las usa la importación de
// listas. Acá se les pasan otras listas por parámetro; la firma se amplió allá
// conservando sus defaults, y sus 77 candados siguen en verde.
//
// El motivo es el de siempre: dos funciones que deciden lo mismo no se rompen
// el día que se escriben, se rompen el día que una cambia. Esta decide qué
// archivos entran al sistema.
//
// ── VARIOS ARCHIVOS DE UNA, Y UNO MALO NO HUNDE LA TANDA ───────────────────
//
// El que recibe la mercadería sube lo que tiene en la mano: tres fotos, un PDF
// del proveedor, a veces un Excel. Si un archivo de los cinco está mal, los
// otros cuatro entran igual y se le dice cuál falló y por qué. Rechazar la
// tanda entera obligaría a repetir todo por un archivo, con el proveedor
// esperando en el mostrador.

import {
  ERROR_UPLOAD,
  validarArchivo,
} from "@/lib/proveedores/listas/persistencia";

export { ERROR_UPLOAD };

export const LIMITES_COMPROBANTE = Object.freeze({
  /**
   * 15 MB. Más que los 10 de las listas a propósito: una foto de comprobante
   * sacada con un celular moderno, sin comprimir, pasa los 10 con facilidad, y
   * rechazarla obligaría a quien está recibiendo a pelearse con la galería.
   */
  tamanoMaxBytes: 15 * 1024 * 1024,
  /**
   * Cuántos archivos por tanda.
   *
   * CUATRO, y este número tiene que hablar el mismo idioma que nginx. El tope
   * del proxy es 60 MiB (`client_max_body_size`), y 4 x 15 MB entra justo. Si
   * alguien sube este número sin subir el del proxy, las tandas grandes vuelven
   * a fallar con 413 ANTES de llegar acá — sin pasar por ninguna validación de
   * este archivo y sin dejar rastro en el log de la aplicación, que fue
   * exactamente lo que pasó el 2026-08-11.
   *
   * Con fotos de celular, cuatro hojas alcanzan para la factura más larga.
   */
  archivosMax: 4,
  extensiones: [".jpg", ".jpeg", ".png", ".webp", ".heic", ".pdf", ".xlsx", ".xls"],
  /**
   * Igual que en listas, el MIME se valida de forma DEFENSIVA: lo elige el
   * cliente y se puede falsificar, así que sirve para rechazar lo obvio y no
   * para autorizar. Se incluye el vacío y `application/octet-stream` porque
   * varios navegadores mandan eso para .heic.
   */
  mimes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/octet-stream",
    "",
  ],
});

/** Códigos propios de la tanda, que no son del archivo sino del conjunto. */
export const ERROR_TANDA = Object.freeze({
  SIN_ARCHIVOS: "SIN_ARCHIVOS",
  DEMASIADOS_ARCHIVOS: "DEMASIADOS_ARCHIVOS",
  DUPLICADO_EN_LA_TANDA: "DUPLICADO_EN_LA_TANDA",
});

/**
 * QUÉ PASÓ Y QUÉ HACER, para cada código.
 *
 * Un "Error al subir el archivo" no le sirve a nadie: el que lo lee está parado
 * en el mostrador y necesita saber si tiene que sacar la foto de nuevo, achicar
 * el archivo o llamar a alguien. Cada mensaje termina en una acción.
 */
export const QUE_HACER = Object.freeze({
  [ERROR_UPLOAD.SIN_ARCHIVO]: "No llegó ningún archivo. Volvé a elegirlo y probá de nuevo.",
  [ERROR_UPLOAD.ARCHIVO_VACIO]:
    "El archivo llegó vacío, con cero bytes. Suele pasar cuando la foto todavía se " +
    "estaba guardando: esperá unos segundos y volvé a subirla.",
  [ERROR_UPLOAD.EXTENSION_INVALIDA]:
    "Ese tipo de archivo no se puede leer. Se aceptan fotos (JPG, PNG, WEBP, HEIC), " +
    "PDF y Excel. Si es una foto sacada con la cámara, subila directo desde la galería.",
  [ERROR_UPLOAD.MIME_INVALIDO]:
    "El contenido del archivo no coincide con su nombre. Sacá la foto de nuevo o " +
    "pedile el PDF al proveedor.",
  [ERROR_UPLOAD.DEMASIADO_GRANDE]:
    "La foto pesa más de 15 MB. Sacala de nuevo con menos resolución, o mandá el PDF " +
    "del proveedor si lo tenés.",
  [ERROR_TANDA.SIN_ARCHIVOS]: "No elegiste ningún archivo.",
  [ERROR_TANDA.DEMASIADOS_ARCHIVOS]:
    `Elegiste más de ${LIMITES_COMPROBANTE.archivosMax} archivos, que es el máximo por tanda. ` +
    "Subí los primeros cuatro, y después el resto.",
  [ERROR_TANDA.DUPLICADO_EN_LA_TANDA]:
    "Este archivo es idéntico a otro de la misma tanda, así que se subió una sola vez. " +
    "No hace falta que hagas nada. Si esperabas dos comprobantes distintos, revisá que " +
    "no hayas adjuntado la misma foto dos veces.",
});

/**
 * El mensaje de un código, o uno genérico si el código es nuevo.
 *
 * El genérico también DICE QUÉ PASÓ. La versión anterior era "No se pudo subir
 * el archivo. Probá de nuevo, y si sigue, avisá.", y tenía el mismo defecto que
 * los mensajes de la pantalla: sugería reintentar sin decir nada. El candado la
 * aprobaba porque solo pedía un verbo de acción — ver subida.test.mjs.
 */
export function queHacer(codigo) {
  return (
    QUE_HACER[codigo] ||
    "El servidor rechazó el archivo por un motivo que la pantalla no sabe explicar. " +
      "Avisá con la hora y qué estabas subiendo, que queda en el registro."
  );
}

// ── LO QUE FALLA ANTES DE LLEGAR AL SERVIDOR ───────────────────────────────
//
// El 2026-08-11 la subida fallaba en producción con "No se pudo subir. Probá de
// nuevo." y ese mensaje no decía nada. La causa real era el proxy: nginx cortaba
// el pedido con 413 por su tope de 1 MB, así que ni siquiera llegaba a la
// aplicación —el log de la app estaba limpio— y el componente caía en un
// `catch` genérico porque `r.json()` reventaba contra la página HTML de error.
//
// De ahí salen estas dos cosas: que el estado HTTP se mire ANTES de intentar
// leer JSON, y que cada estado tenga su propio texto diciendo QUÉ PASÓ.

export const FALLO_HTTP = Object.freeze({
  401: {
    codigo: "SESION_VENCIDA",
    texto:
      "Tu sesión venció mientras subías. No se subió nada. Entrá de nuevo y volvé a " +
      "intentarlo: las fotos siguen en el celular.",
  },
  403: {
    codigo: "SIN_PERMISO",
    texto:
      "No tenés permiso para subir comprobantes en esta ubicación. Pedile a un " +
      "administrador que te tilde el permiso de recibir compras.",
  },
  413: {
    codigo: "DEMASIADO_GRANDE_PROXY",
    texto:
      "Las fotos pesan demasiado juntas y el servidor las rechazó antes de recibirlas. " +
      "Subí menos fotos por vez, o sacalas con menos resolución.",
  },
  502: {
    codigo: "APLICACION_CAIDA",
    texto: "La aplicación no está respondiendo. No se subió nada. Esperá un momento y probá de nuevo.",
  },
  503: {
    codigo: "ALMACEN_NO_DISPONIBLE",
    texto:
      "El lugar donde se guardan las fotos no está disponible, así que no se guardó " +
      "ninguna. No es problema de tu foto: avisá para que lo revisen.",
  },
  504: {
    codigo: "TARDO_DEMASIADO",
    texto:
      "La subida tardó más de lo que el servidor espera y se cortó. Suele pasar con " +
      "conexión lenta: probá con menos fotos por vez.",
  },
});

/** El mensaje de un fallo de transporte, por estado HTTP. */
export function queHacerHttp(status) {
  const conocido = FALLO_HTTP[Number(status)];
  if (conocido) return conocido;
  return {
    codigo: "RESPUESTA_INESPERADA",
    texto:
      `El servidor contestó ${status ?? "sin estado"} y la pantalla no sabe qué significa. ` +
      "No se subió nada. Avisá con la hora y ese número.",
  };
}

/** Cuando ni siquiera hubo respuesta: se cortó la red o el celular perdió señal. */
export const SIN_RESPUESTA = Object.freeze({
  codigo: "SIN_RESPUESTA",
  texto:
    "No se pudo llegar al servidor: se cortó la conexión mientras subías. No se subió " +
    "nada. Revisá la señal y volvé a intentarlo.",
});

/**
 * ¿Entra este archivo?
 *
 * Delega las cinco validaciones y le agrega el mensaje de qué hacer. No repite
 * ninguna regla.
 */
export function validarArchivoComprobante(archivo) {
  // NO se desestructura con `= {}`: ese default solo cubre `undefined`, y un
  // `null` explícito rompe. En una tanda de cinco archivos, un null —que llega
  // cuando el navegador adjunta una entrada vacía— tiraba TODA la subida, que es
  // justo lo que esta función existe para evitar.
  const { nombre, tamano, mime } = archivo || {};
  const r = validarArchivo({
    nombre,
    tamano,
    mime,
    extensionesPermitidas: LIMITES_COMPROBANTE.extensiones,
    mimesPermitidos: LIMITES_COMPROBANTE.mimes,
    tamanoMaxBytes: LIMITES_COMPROBANTE.tamanoMaxBytes,
    queSeEsperaba: "una foto, un PDF ni un Excel",
  });
  if (r.ok) return { ok: true };
  return { ok: false, codigo: r.codigo, error: r.error, queHacer: queHacer(r.codigo) };
}

/**
 * Evalúa una tanda entera y dice, archivo por archivo, cuál entra y cuál no.
 *
 * NO CORTA EN EL PRIMERO QUE FALLA. Devuelve el veredicto de todos, para que el
 * que subió cinco fotos vea de una cuáles cuatro entraron y qué le pasó a la
 * quinta — en vez de arreglar una, reintentar, y descubrir la siguiente.
 *
 * `hash` es opcional: si viene, dos archivos con el mismo contenido dentro de la
 * misma tanda se marcan como duplicados. Es la red contra el doble toque en el
 * celular, que adjunta la misma foto dos veces.
 */
export function evaluarTanda(archivos) {
  const lista = Array.isArray(archivos) ? archivos : [];
  if (!lista.length) {
    return {
      ok: false,
      codigo: ERROR_TANDA.SIN_ARCHIVOS,
      error: queHacer(ERROR_TANDA.SIN_ARCHIVOS),
      resultados: [],
    };
  }
  if (lista.length > LIMITES_COMPROBANTE.archivosMax) {
    return {
      ok: false,
      codigo: ERROR_TANDA.DEMASIADOS_ARCHIVOS,
      error: queHacer(ERROR_TANDA.DEMASIADOS_ARCHIVOS),
      resultados: [],
    };
  }

  const hashesVistos = new Set();
  const resultados = lista.map((a, indice) => {
    const base = { indice, nombre: a?.nombre ?? null };
    const v = validarArchivoComprobante(a);
    if (!v.ok) return { ...base, ok: false, codigo: v.codigo, error: v.error, queHacer: v.queHacer };

    // El duplicado se mira DESPUÉS de validar: decirle "está repetido" a un
    // archivo que además está vacío sería contestar la pregunta equivocada.
    if (a?.hash) {
      if (hashesVistos.has(a.hash)) {
        return {
          ...base,
          ok: false,
          codigo: ERROR_TANDA.DUPLICADO_EN_LA_TANDA,
          error: queHacer(ERROR_TANDA.DUPLICADO_EN_LA_TANDA),
          queHacer: queHacer(ERROR_TANDA.DUPLICADO_EN_LA_TANDA),
        };
      }
      hashesVistos.add(a.hash);
    }
    return { ...base, ok: true };
  });

  return {
    // La tanda es aceptable si AL MENOS UNO entra. Que cuatro de cinco pasen es
    // un éxito parcial y se informa como tal, no como fracaso.
    ok: resultados.some((r) => r.ok),
    codigo: null,
    error: null,
    resultados,
    aceptados: resultados.filter((r) => r.ok).length,
    rechazados: resultados.filter((r) => !r.ok).length,
  };
}
