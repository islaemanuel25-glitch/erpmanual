// lib/compras-proveedor/comprobante/almacenDisco.js
//
// LA CÁSCARA QUE TOCA EL DISCO. El criterio no está acá: está en
// `almacenImagenes.js`, que es puro y tiene los candados. Este archivo solo
// mira el sistema de archivos y le pasa lo que encontró.
//
// La separación no es estética. Un criterio que necesita un volumen montado
// para poder ejercerse no se prueba nunca, y este es justamente el criterio que
// más falta que se pruebe: decide si una foto se guarda o se pierde.
//
// ── LOS DOS CHEQUEOS, Y POR QUÉ FALLAN DISTINTO ────────────────────────────
//
// `verificarAlArrancar()` — corre una vez al levantar el servidor y GRITA en el
// log, pero NO tumba la aplicación. Es deliberado: si el proceso se negara a
// arrancar, un volumen de fotos sin montar dejaría sin POS a los cinco locales.
// El daño de no vender es mucho mayor que el de no poder subir una foto, y esa
// desproporción no la puede decidir el módulo de comprobantes por su cuenta.
//
// `exigirAlmacen()` — corre ANTES DE CADA ESCRITURA y sí frena, tirando un
// error con el motivo adentro. Este es el que protege de verdad: el del
// arranque avisa a tiempo, pero un montaje se puede caer después y ahí ya pasó.
//
// Dicho de otra forma: el del arranque es para que se vea, el de la escritura
// es para que no se pierda.

import { access, stat, readdir, constants } from "node:fs/promises";
import { join } from "node:path";

import {
  evaluarAlmacen,
  nombreDeArchivo,
  esFaltaDeEspacio,
  NOMBRE_CENTINELA,
  MOTIVO_ALMACEN,
} from "./almacenImagenes.js";

/** El nombre de la variable, una sola vez, para que nadie la escriba a mano. */
export const VARIABLE_RUTA = "COMPROBANTES_VOLUMEN_PATH";

async function existe(ruta) {
  try {
    const s = await stat(ruta);
    return s.isDirectory() || s.isFile();
  } catch {
    return false;
  }
}

/**
 * Mira el disco y devuelve el veredicto de `evaluarAlmacen`.
 *
 * No escribe nada de prueba: pregunta por el permiso con `access(W_OK)`. Una
 * escritura de prueba tiene el problema que este módulo existe para evitar —
 * con el volumen sin montar funciona igual, sobre el disco del contenedor.
 */
/**
 * ── EL CENTINELA ES UN PARÁMETRO, Y ESO ES NUEVO ──────────────────────────
 *
 * Las fotos de PRODUCTO necesitan exactamente esta inspección —el centinela es
 * lo único que distingue un volumen montado de una carpeta vacía— pero en otro
 * volumen y con otro archivo adentro.
 *
 * Se agrega el parámetro acá en vez de copiar la función al lado. La copia no la
 * atrapa ningún candado: las dos andarían, y el día que una se arregle la otra
 * se queda con el defecto. El default deja a los comprobantes exactamente como
 * estaban.
 */
export async function inspeccionarAlmacen({
  ruta = process.env[VARIABLE_RUTA],
  centinela = NOMBRE_CENTINELA,
} = {}) {
  const limpia = typeof ruta === "string" ? ruta.trim() : "";
  if (!limpia) return { ...evaluarAlmacen({ ruta: null }), ruta: null };

  const existeDirectorio = await existe(limpia);
  // Solo se pregunta lo que corresponde según lo ya averiguado: sin directorio,
  // el centinela y el permiso no informan nada útil y su ausencia confundiría
  // el motivo.
  const existeCentinela = existeDirectorio ? await existe(join(limpia, centinela)) : false;
  let esEscribible = false;
  if (existeDirectorio) {
    try {
      await access(limpia, constants.W_OK);
      esEscribible = true;
    } catch {
      esEscribible = false;
    }
  }

  return {
    ...evaluarAlmacen({ ruta: limpia, existeDirectorio, existeCentinela, esEscribible }),
    ruta: limpia,
  };
}

/**
 * El chequeo del ARRANQUE. Avisa fuerte y sigue.
 *
 * Devuelve el veredicto para que quien lo llame pueda hacer otra cosa si algún
 * día hace falta, pero por sí solo no interrumpe nada.
 */
export async function verificarAlArrancar() {
  const veredicto = await inspeccionarAlmacen();
  if (veredicto.ok) {
    console.log(`[comprobantes] almacén de imágenes verificado en ${veredicto.ruta}`);
    return veredicto;
  }
  // A stderr y con el prefijo repetido: es lo que se ve en `docker logs` y lo
  // que alguien va a grepear a las tres de la tarde con el mostrador abierto.
  console.error(
    `[comprobantes] ALMACÉN DE IMÁGENES NO DISPONIBLE — no se van a poder subir fotos de comprobantes.\n` +
      `[comprobantes] ${veredicto.motivo}\n` +
      `[comprobantes] Ruta configurada (${VARIABLE_RUTA}): ${veredicto.ruta ?? "(vacía)"}\n` +
      `[comprobantes] El procedimiento para dejarlo andando está en docs/RUNBOOK-VOLUMEN-COMPROBANTES.md.\n` +
      `[comprobantes] El resto de la aplicación sigue funcionando normalmente.`,
  );
  return veredicto;
}

/** El error que frena una escritura. Lleva el motivo adentro, no un código. */
export class AlmacenNoDisponible extends Error {
  constructor(veredicto) {
    super(veredicto.motivo);
    this.name = "AlmacenNoDisponible";
    this.motivo = veredicto.motivo;
    this.ruta = veredicto.ruta ?? null;
  }
}

/**
 * El chequeo de CADA ESCRITURA. Este sí frena.
 *
 * Se llama antes de guardar cada foto, no una vez por proceso: el costo es un
 * par de `stat`, y a cambio cubre el montaje que se cayó después de arrancar.
 *
 * Devuelve la ruta absoluta donde escribir, así el que llama no tiene ninguna
 * razón para armarla por su cuenta ni para llegar hasta acá sin haber
 * preguntado.
 */
export async function exigirAlmacen(datosDelArchivo) {
  const veredicto = await inspeccionarAlmacen();
  if (!veredicto.ok) throw new AlmacenNoDisponible(veredicto);
  return {
    directorio: veredicto.ruta,
    nombre: nombreDeArchivo(datosDelArchivo),
    rutaAbsoluta: join(veredicto.ruta, nombreDeArchivo(datosDelArchivo)),
  };
}

/**
 * Traduce un error de escritura a algo que el que sube pueda leer.
 *
 * Se usa así: se intenta escribir, y si tira, se pasa el error por acá antes de
 * devolverlo. El caso que importa es el volumen lleno — que NO se resuelve
 * borrando lo más viejo, ver `MOTIVO_ALMACEN.SIN_ESPACIO`.
 *
 * Lo que no reconoce lo devuelve tal cual: inventarle un mensaje amable a un
 * error desconocido es cómo se pierden las causas raíz.
 */
export function traducirErrorDeEscritura(error, ruta = null) {
  if (esFaltaDeEspacio(error)) {
    const traducido = new AlmacenNoDisponible({ motivo: MOTIVO_ALMACEN.SIN_ESPACIO, ruta });
    traducido.causa = error;
    return traducido;
  }
  return error;
}

/**
 * Cuánto está ocupando el volumen, en bytes.
 *
 * Es el dato que va en el aviso de la campana: no hay tope de tamaño —hoy sería
 * un número inventado— pero el ocupado tiene que aparecer solo, en algo que ya
 * se mira, para que cuando haya varias semanas de uso la medición ya esté hecha.
 *
 * Devuelve null si el almacén no está disponible: sin volumen no hay cuánto, y
 * un 0 ahí se leería como "no ocupa nada", que es otra cosa.
 */
export async function medirOcupacion() {
  const veredicto = await inspeccionarAlmacen();
  if (!veredicto.ok) return { bytes: null, archivos: null, motivo: veredicto.motivo };

  let bytes = 0;
  let archivos = 0;
  const entradas = await readdir(veredicto.ruta, { withFileTypes: true });
  for (const e of entradas) {
    if (!e.isFile() || e.name === NOMBRE_CENTINELA) continue;
    try {
      bytes += (await stat(join(veredicto.ruta, e.name))).size;
      archivos += 1;
    } catch {
      // Una foto borrada entre el listado y el stat no invalida la medición.
    }
  }
  return { bytes, archivos, motivo: null };
}
