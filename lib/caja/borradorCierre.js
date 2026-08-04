// lib/caja/borradorCierre.js
//
// Borrador del CONTEO de un cierre en preparación.
//
// Es el mismo concepto que borradorRetiro.js —solo entrada del usuario, vive en
// el navegador, no crea ninguna fila— con una diferencia que obliga a que sea un
// módulo aparte: LA CLAVE ES EL TOKEN, no el turno más el usuario.
//
// POR QUÉ EL TOKEN Y NO EL TURNO
//
// El cierre lo puede terminar alguien que no es quien lo empezó: el cajero se
// fue, el encargado lo recupera desde la bandeja de pendientes. Con la clave por
// usuario, ese trabajo quedaría escondido en el navegador de quien ya no está.
// Con la clave por token, el conteo pertenece AL CIERRE, y cualquiera que llegue
// a esa pantalla —en la misma máquina— encuentra lo que se había contado.
//
// El token no es un secreto adicional acá: quien puede leer este localStorage ya
// tiene la pantalla abierta con el token en la URL.
//
// QUÉ SE GUARDA Y QUÉ NO
//
// Se guarda lo que la persona hizo con las manos: el conteo, el cambio que deja,
// la observación y la hora en que empezó a contar.
//
// NO se guarda ninguna cifra monetaria del servidor. Y acá hay un matiz respecto
// del retiro: el efectivo esperado del cierre está CONGELADO y no envejece, así
// que guardarlo sería inocuo. Igual no se guarda. Si alguna vez hubiera que
// corregir un corte, la copia del navegador contradiría a la fila y no habría
// forma de saber cuál manda. La fuente del esperado es siempre CierrePreparacion.

import { DENOMINACIONES, CLAVE_MONEDAS, normalizarCantidad, normalizarMonedas } from "./conteoBilletes.js";

const PREFIJO = "erpazul.cierre.borrador";

/**
 * Historia de versiones, porque el salto cambió QUÉ se cuenta y no sólo qué
 * campos hay:
 *
 *   v1 — `desgloseContado` (todo el cajón) + `desgloseCambio` (lo que queda).
 *        El cambio se elegía al final, sobre la pila ya contada.
 *   v2 — `desgloseRetiroContado`: SOLO el dinero retirado. El cambio se separó
 *        y se congeló antes del corte, así que ya no está en la pila que se
 *        cuenta ni se puede volver a elegir.
 *
 * Las dos siguen siendo legibles a propósito, y no es indecisión: un borrador v1
 * pertenece a un corte tomado con el orden anterior, y ese corte se confirma por
 * el camino de compatibilidad, que sí necesita esos dos desgloses. Cuál aplica
 * lo decide el CORTE, no el borrador. La pantalla descarta el que no corresponde.
 */
export const VERSION_BORRADOR_CIERRE = 2;

/** Versión del orden anterior. Sólo válida para cortes sin cambio separado. */
export const VERSION_BORRADOR_CIERRE_LEGADO = 1;

/**
 * Mensaje cuando el borrador guardado no corresponde al orden del corte.
 *
 * Se descarta en vez de migrarse: traducir un conteo del cajón entero a un
 * conteo del retiro exigiría restarle el cambio, y eso afirmaría una separación
 * de billetes que la persona nunca hizo con las manos.
 */
export const AVISO_BORRADOR_INCOMPATIBLE =
  "El proceso de conteo cambió. Contá de nuevo únicamente el dinero retirado.";

/**
 * Vencimiento del borrador.
 *
 * Más largo que el del retiro (12 h) y a propósito: un cierre atrasado sigue
 * siendo válido y confirmable —vencer no libera nada—, así que descartarle el
 * conteo a las doce horas obligaría a contar de nuevo una caja que ya se contó.
 * A las 48 h el borrador ya no describe nada, pero para entonces el cierre es un
 * problema administrativo, no operativo.
 */
export const VENCIMIENTO_HORAS_CIERRE = 48;

/** Clave por TOKEN: el conteo pertenece al cierre, no a quien lo empezó. */
export function claveBorradorCierre(token) {
  return `${PREFIJO}.${String(token ?? "")}`;
}

/** Deja solo denominaciones conocidas y cantidades válidas. */
export function sanearDesglose(desglose) {
  const limpio = {};
  if (!desglose || typeof desglose !== "object") return limpio;
  for (const { valor } of DENOMINACIONES) {
    const n = normalizarCantidad(desglose[valor]);
    if (n > 0) limpio[valor] = n;
  }
  const monedas = normalizarMonedas(desglose[CLAVE_MONEDAS]);
  if (monedas > 0) limpio[CLAVE_MONEDAS] = monedas;
  return limpio;
}

/** Borrador del orden nuevo: sólo el conteo del dinero retirado. */
export function armarBorradorCierre({
  token,
  desgloseRetiroContado,
  observacion,
  conteoIniciadoEn,
  guardadoEn = new Date().toISOString(),
}) {
  return {
    version: VERSION_BORRADOR_CIERRE,
    token: String(token ?? ""),
    desgloseRetiroContado: sanearDesglose(desgloseRetiroContado),
    observacion: String(observacion ?? "").slice(0, 500),
    conteoIniciadoEn: conteoIniciadoEn || null,
    guardadoEn,
  };
}

/**
 * Borrador del orden anterior. Se conserva para los cortes que se tomaron con el
 * flujo viejo y todavía no se confirmaron: esos siguen contando el cajón entero
 * y eligiendo el cambio al final, y su conteo tiene que poder guardarse igual.
 */
export function armarBorradorCierreLegado({
  token,
  desgloseContado,
  desgloseCambio,
  observacion,
  conteoIniciadoEn,
  guardadoEn = new Date().toISOString(),
}) {
  return {
    version: VERSION_BORRADOR_CIERRE_LEGADO,
    token: String(token ?? ""),
    desgloseContado: sanearDesglose(desgloseContado),
    desgloseCambio: sanearDesglose(desgloseCambio),
    observacion: String(observacion ?? "").slice(0, 500),
    conteoIniciadoEn: conteoIniciadoEn || null,
    guardadoEn,
  };
}

export function guardarBorradorCierre(storage, borrador) {
  if (!storage || !borrador?.token) return false;
  try {
    storage.setItem(claveBorradorCierre(borrador.token), JSON.stringify(borrador));
    return true;
  } catch {
    // Cuota llena o modo privado. No se rompe el cierre por no poder guardar un
    // borrador: el conteo sigue en memoria y se puede confirmar igual.
    return false;
  }
}

export function leerBorradorCierre(storage, token, ahora = Date.now()) {
  if (!storage || !token) return null;
  const clave = claveBorradorCierre(token);
  let crudo;
  try {
    crudo = storage.getItem(clave);
  } catch {
    return null;
  }
  if (!crudo) return null;

  let b;
  try {
    b = JSON.parse(crudo);
  } catch {
    // Un valor corrupto se descarta en vez de arrastrarse.
    try { storage.removeItem(clave); } catch { /* nada */ }
    return null;
  }

  const versionConocida =
    b?.version === VERSION_BORRADOR_CIERRE || b?.version === VERSION_BORRADOR_CIERRE_LEGADO;
  if (!versionConocida || b.token !== token) {
    try { storage.removeItem(clave); } catch { /* nada */ }
    return null;
  }

  const t = new Date(b.guardadoEn).getTime();
  if (!Number.isFinite(t) || ahora - t > VENCIMIENTO_HORAS_CIERRE * 3600 * 1000) {
    try { storage.removeItem(clave); } catch { /* nada */ }
    return null;
  }

  // Se devuelve con su versión: quien llama decide si corresponde al orden de
  // ESTE corte. Acá no se puede saber — el borrador no conoce el corte.
  return {
    ...b,
    desgloseRetiroContado: sanearDesglose(b.desgloseRetiroContado),
    desgloseContado: sanearDesglose(b.desgloseContado),
    desgloseCambio: sanearDesglose(b.desgloseCambio),
  };
}

/**
 * ¿Este borrador sirve para este corte?
 *
 * Un corte con el cambio ya separado necesita un borrador v2 —el conteo del
 * retiro— y uno del orden anterior necesita un v1. Cruzarlos mostraría cifras
 * que no corresponden: un conteo del cajón entero presentado como si fuera el
 * retiro es exactamente el error que este cambio vino a arreglar.
 */
export function borradorCompatible(borrador, { cambioSeparadoEnCorte } = {}) {
  if (!borrador) return false;
  return cambioSeparadoEnCorte
    ? borrador.version === VERSION_BORRADOR_CIERRE
    : borrador.version === VERSION_BORRADOR_CIERRE_LEGADO;
}

export function descartarBorradorCierre(storage, token) {
  if (!storage || !token) return;
  try {
    storage.removeItem(claveBorradorCierre(token));
  } catch {
    /* nada que hacer */
  }
}

/** Barre borradores de cierres vencidos, para no acumular basura en el navegador. */
export function limpiarBorradoresCierreViejos(storage, ahora = Date.now()) {
  if (!storage) return 0;
  let borrados = 0;
  try {
    const claves = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(PREFIJO)) claves.push(k);
    }
    for (const k of claves) {
      try {
        const b = JSON.parse(storage.getItem(k));
        const t = new Date(b?.guardadoEn).getTime();
        if (!Number.isFinite(t) || ahora - t > VENCIMIENTO_HORAS_CIERRE * 3600 * 1000) {
          storage.removeItem(k);
          borrados++;
        }
      } catch {
        storage.removeItem(k);
        borrados++;
      }
    }
  } catch {
    /* storage inaccesible */
  }
  return borrados;
}
