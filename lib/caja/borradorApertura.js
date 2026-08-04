// lib/caja/borradorApertura.js
//
// Borrador del conteo de APERTURA, mientras hay una reserva viva.
//
// POR QUÉ LA CLAVE LLEVA TRES COSAS
//
// El cierre se identifica por token porque lo puede terminar cualquiera. Acá es
// al revés: la reserva es de UNA persona concreta, y el conteo de apertura es la
// declaración de esa persona sobre lo que recibió en las manos. Si la reserva
// vence y otro operador toma el mismo sobre, el conteo del primero NO puede
// aparecerle: estaría firmando un conteo que no hizo.
//
// Por eso la clave es cambioId + usuarioId + operadorId. El operadorId también
// importa: en un mismo dispositivo y con el mismo usuario del sistema pueden
// rotar dos operarios distintos.
//
// QUÉ SE GUARDA Y QUÉ NO
//
// Denominaciones, monedas y motivo. NUNCA el total: es la suma de las filas y lo
// calcula el servidor. Guardarlo crearía una segunda versión del mismo número
// que podría contradecir al desglose.
//
// Guardar un borrador NO crea el turno ni toca la reserva. Hasta "Confirmar" no
// pasó nada en la base.

import { DENOMINACIONES, CLAVE_MONEDAS, normalizarCantidad, normalizarMonedas } from "./conteoBilletes.js";

const PREFIJO = "erpazul.apertura.borrador";

export const VERSION_BORRADOR_APERTURA = 1;

/**
 * Vencimiento del borrador.
 *
 * Corto, porque la reserva también lo es: un borrador que sobreviviera a su
 * reserva describiría un sobre que ya tomó otro. Se le da margen sobre la
 * reserva para cubrir el caso de volver justo cuando está por vencer.
 */
export const VENCIMIENTO_HORAS_APERTURA = 2;

export function claveBorradorApertura({ cambioId, usuarioId, operadorId }) {
  return `${PREFIJO}.c${Number(cambioId) || 0}.u${Number(usuarioId) || 0}.o${Number(operadorId) || 0}`;
}

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

export function armarBorradorApertura({
  cambioId,
  usuarioId,
  operadorId,
  desgloseRecibido,
  motivo,
  guardadoEn = new Date().toISOString(),
}) {
  return {
    version: VERSION_BORRADOR_APERTURA,
    cambioId: Number(cambioId) || 0,
    usuarioId: Number(usuarioId) || 0,
    operadorId: Number(operadorId) || 0,
    desgloseRecibido: sanearDesglose(desgloseRecibido),
    motivo: String(motivo ?? "").slice(0, 500),
    guardadoEn,
  };
}

export function guardarBorradorApertura(storage, borrador) {
  if (!storage || !borrador?.cambioId) return false;
  try {
    storage.setItem(claveBorradorApertura(borrador), JSON.stringify(borrador));
    return true;
  } catch {
    // Cuota llena o modo privado: el conteo sigue en memoria y se puede
    // confirmar igual. No se rompe la apertura por no poder guardar un borrador.
    return false;
  }
}

export function leerBorradorApertura(storage, ident, ahora = Date.now()) {
  if (!storage || !ident?.cambioId) return null;
  const clave = claveBorradorApertura(ident);
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
    try { storage.removeItem(clave); } catch { /* nada */ }
    return null;
  }

  // La identidad completa tiene que coincidir. Un borrador con otro usuario u
  // otro operario NO se recupera aunque la clave calzara por accidente.
  const mismo =
    b?.version === VERSION_BORRADOR_APERTURA &&
    Number(b.cambioId) === Number(ident.cambioId) &&
    Number(b.usuarioId) === Number(ident.usuarioId) &&
    Number(b.operadorId) === Number(ident.operadorId);
  if (!mismo) {
    try { storage.removeItem(clave); } catch { /* nada */ }
    return null;
  }

  const t = new Date(b.guardadoEn).getTime();
  if (!Number.isFinite(t) || ahora - t > VENCIMIENTO_HORAS_APERTURA * 3600 * 1000) {
    try { storage.removeItem(clave); } catch { /* nada */ }
    return null;
  }

  return { ...b, desgloseRecibido: sanearDesglose(b.desgloseRecibido) };
}

/**
 * Borra el borrador. Se llama cuando la reserva se libera, vence o se consume:
 * en los tres casos el conteo dejó de describir algo que exista.
 */
export function descartarBorradorApertura(storage, ident) {
  if (!storage || !ident?.cambioId) return;
  try {
    storage.removeItem(claveBorradorApertura(ident));
  } catch {
    /* nada que hacer */
  }
}

/** Barre borradores de aperturas vencidas, para no acumular basura. */
export function limpiarBorradoresAperturaViejos(storage, ahora = Date.now()) {
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
        if (!Number.isFinite(t) || ahora - t > VENCIMIENTO_HORAS_APERTURA * 3600 * 1000) {
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
