// lib/caja/senalCierre.js
//
// AVISARLE AL POS QUE SU TURNO ACABA DE CORTARSE.
//
// EL PROBLEMA
//
// El corte se confirma en la pestaña del CIERRE, pero quien tiene que reaccionar
// es la pestaña del POS: su turno dejó de operar y el mostrador tiene que quedar
// libre para el operador que releva. Sin aviso, el cajero de la pestaña principal
// seguiría viendo su caja abierta y descubriría el corte recién al intentar
// cobrar, con un error.
//
// POR QUÉ NO SE TOCA LA COOKIE DEL OPERADOR
//
// Podría parecer más simple que el cierre borre la cookie del operador y listo.
// No: la cookie es del NAVEGADOR ENTERO. Tocarla desde el cierre afectaría a
// todas las pestañas, incluida la del propio cierre, y la autoría del conteo
// pasaría a ser la de quien esté logueado en ese momento. Acá solo se manda un
// AVISO; cada pestaña decide qué hacer con él. El POS cierra su sesión de
// operario porque le corresponde; la pestaña del cierre lo ignora.
//
// DOS CANALES, A PROPÓSITO
//
// `BroadcastChannel` es el mecanismo correcto y llega al instante. El evento
// `storage` es la red: cubre el caso de una pestaña que quedó viva desde antes
// de que el canal existiera y, sobre todo, deja el aviso ESCRITO. Una pestaña que
// estaba dormida y despierta después no recibe ningún mensaje de canal —esos no
// se encolan— pero sí puede leer la marca al recuperar el foco.

export const CANAL_CIERRE = "erpazul_cierre_relevo";
export const CLAVE_SENAL = "erpazul_cierre_iniciado";

/** Vida útil de la marca escrita. Pasado ese rato ya no describe nada. */
export const VIGENCIA_SENAL_MS = 6 * 60 * 60 * 1000;

function normalizar(dato) {
  if (!dato || typeof dato !== "object") return null;
  const turnoId = Number(dato.turnoId);
  if (!Number.isInteger(turnoId) || turnoId <= 0) return null;
  return {
    tipo: "corte-iniciado",
    turnoId,
    localId: Number(dato.localId) || null,
    // `en` va SIEMPRE, y no es decorativo: sin un valor que cambie, escribir dos
    // veces lo mismo en localStorage no dispara el evento `storage` y el segundo
    // corte pasaría desapercibido.
    en: dato.en || new Date().toISOString(),
  };
}

/**
 * Avisa que un turno acaba de tomar su corte.
 *
 * NUNCA lleva el token. El aviso viaja por localStorage, que comparten todas las
 * pestañas del origen; el token es la llave del cierre y no tiene por qué estar
 * ahí. La pestaña principal no lo necesita: solo tiene que soltar el turno.
 */
export function emitirCorteIniciado(dato, ventana = typeof window !== "undefined" ? window : null) {
  const senal = normalizar(dato);
  if (!senal || !ventana) return false;

  try {
    ventana.localStorage?.setItem(CLAVE_SENAL, JSON.stringify(senal));
  } catch {
    // Modo privado o cuota llena: el canal de abajo sigue funcionando.
  }
  try {
    if (typeof ventana.BroadcastChannel === "function") {
      const canal = new ventana.BroadcastChannel(CANAL_CIERRE);
      canal.postMessage(senal);
      canal.close();
    }
  } catch {
    // Sin canal, queda la marca escrita.
  }
  return true;
}

/** Lee la marca escrita, si sigue vigente. Para la pestaña que estaba dormida. */
export function leerSenalVigente(ventana = typeof window !== "undefined" ? window : null, ahora = Date.now()) {
  try {
    const crudo = ventana?.localStorage?.getItem(CLAVE_SENAL);
    if (!crudo) return null;
    const senal = normalizar(JSON.parse(crudo));
    if (!senal) return null;
    const t = new Date(senal.en).getTime();
    if (!Number.isFinite(t) || ahora - t > VIGENCIA_SENAL_MS) return null;
    return senal;
  } catch {
    return null;
  }
}

/** Borra la marca. La llama quien ya reaccionó, para no reaccionar dos veces. */
export function limpiarSenal(ventana = typeof window !== "undefined" ? window : null) {
  try {
    ventana?.localStorage?.removeItem(CLAVE_SENAL);
  } catch {
    /* nada que hacer */
  }
}

/**
 * Se suscribe a los avisos. Devuelve la función de limpieza.
 *
 * Deduplica por turno + instante: los dos canales entregan el mismo aviso y el
 * POS no debe cerrar la sesión de operario dos veces.
 */
export function escucharCorteIniciado(manejar, ventana = typeof window !== "undefined" ? window : null) {
  if (!ventana || typeof manejar !== "function") return () => {};

  const vistos = new Set();
  const emitir = (senal) => {
    const s = normalizar(senal);
    if (!s) return;
    const huella = `${s.turnoId}:${s.en}`;
    if (vistos.has(huella)) return;
    vistos.add(huella);
    manejar(s);
  };

  const porCanal = (e) => emitir(e?.data);
  const porStorage = (e) => {
    if (e?.key !== CLAVE_SENAL || !e?.newValue) return;
    try {
      emitir(JSON.parse(e.newValue));
    } catch {
      /* valor corrupto: se ignora */
    }
  };

  let canal = null;
  try {
    if (typeof ventana.BroadcastChannel === "function") {
      canal = new ventana.BroadcastChannel(CANAL_CIERRE);
      canal.addEventListener("message", porCanal);
    }
  } catch {
    canal = null;
  }
  ventana.addEventListener?.("storage", porStorage);

  return () => {
    try {
      canal?.removeEventListener("message", porCanal);
      canal?.close();
    } catch {
      /* ya cerrado */
    }
    ventana.removeEventListener?.("storage", porStorage);
  };
}
