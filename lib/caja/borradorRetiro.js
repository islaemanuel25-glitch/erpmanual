// lib/caja/borradorRetiro.js
//
// Borrador del CONTEO de un retiro en preparación.
//
// QUÉ CAMBIÓ Y POR QUÉ LA CLAVE AHORA ES EL TOKEN
//
// Hasta la v3 el retiro no tenía ninguna fila en la base: el borrador era todo
// lo que existía, y por eso se guardaba por TURNO y USUARIO —lo único que había
// para identificarlo—. Desde que el retiro toma un corte persistido, el corte
// tiene su propio token y ES la identidad de la operación: el esperado, el
// cambio separado y la frontera viven en `RetiroPreparacion`, y el borrador
// pasa a guardar solamente lo que la persona está contando con las manos.
//
// La clave por token, además, arregla lo mismo que ya había arreglado el cierre:
// el conteo pertenece AL RETIRO, así que quien llegue a esa pantalla —en la
// misma máquina— encuentra lo que se había contado, aunque no sea quien empezó.
//
// QUÉ SE GUARDA Y QUÉ NO
//
// Se guarda el conteo del dinero retirado, la observación y la hora en que
// empezó a contarse. NO se guarda ninguna cifra monetaria del servidor: el
// esperado y el retiro esperado están congelados en la fila y son la única
// fuente. Una copia en el navegador podría contradecirla y no habría forma de
// saber cuál manda.
//
// Las funciones reciben el `storage` por parámetro para poder probarlas sin
// navegador.

import { DENOMINACIONES, CLAVE_MONEDAS, normalizarCantidad, normalizarMonedas } from "./conteoBilletes.js";

const PREFIJO = "erpazul.retiro.borrador";

/**
 * Historia de versiones, porque cada salto cambió QUÉ significa lo guardado y no
 * solo qué campos hay:
 *
 *   v1 — `modoRetiro`, `importeRetiro` y `desgloseRetiro`: los billetes que
 *        SALÍAN, elegidos a mano.
 *   v2 — `desgloseCambio`: los que QUEDAN. Concepto inverso.
 *   v3 — desaparece el conteo por monto total; todo sale del desglose. Seguía
 *        guardando el cajón COMPLETO más el cambio, y la clave era turno+usuario.
 *   v4 — clave por TOKEN y un solo desglose: `desgloseRetiroContado`. El cambio
 *        ya no se elige acá —se separó y se congeló antes del corte— así que ya
 *        no está en la pila que se cuenta.
 *
 * NINGUNA versión anterior se migra. Traducir un conteo del cajón entero a un
 * conteo del retiro exigiría restarle el cambio, y eso afirmaría una separación
 * de billetes que la persona nunca hizo. Se descarta y se avisa.
 */
export const VERSION_BORRADOR = 4;

/** Vencimiento: un borrador de ayer no describe la caja de hoy. */
export const VENCIMIENTO_HORAS = 12;

/** Mensaje al encontrar un borrador de un flujo anterior. */
export const AVISO_FLUJO_CAMBIADO =
  "El proceso de conteo cambió. Volvé a separar el cambio para iniciar un corte nuevo.";

/** Clave por TOKEN: el conteo pertenece al corte, no a quien lo empezó. */
export function claveBorrador(token) {
  return `${PREFIJO}.${String(token ?? "")}`;
}

/**
 * Normaliza un desglose leído del borrador.
 *
 * Lo que vuelve de `localStorage` lo pudo tocar cualquiera: se sanea antes de
 * que entre a la aritmética.
 */
export function sanearDesglose(desglose = {}) {
  const salida = {};
  for (const { valor } of DENOMINACIONES) {
    const n = normalizarCantidad(desglose?.[valor]);
    if (n > 0) salida[valor] = n;
  }
  const monedas = normalizarMonedas(desglose?.[CLAVE_MONEDAS]);
  if (monedas > 0) salida[CLAVE_MONEDAS] = monedas;
  return salida;
}

/** Lo que se persiste. Solo entrada del usuario, nunca estado del servidor. */
export function armarBorrador({
  token,
  desgloseRetiroContado,
  observacion,
  conteoIniciadoEn,
  ahora,
}) {
  return {
    version: VERSION_BORRADOR,
    token: String(token ?? ""),
    desgloseRetiroContado: sanearDesglose(desgloseRetiroContado),
    observacion: String(observacion ?? "").slice(0, 500),
    // La hora del conteo es parte del dato: si entraron ventas después, importa
    // saber a qué momento corresponde la plata que se contó.
    conteoIniciadoEn: conteoIniciadoEn ?? new Date(ahora ?? Date.now()).toISOString(),
    guardadoEn: new Date(ahora ?? Date.now()).toISOString(),
  };
}

export function guardarBorrador(storage, borrador) {
  if (!storage || !borrador?.token) return false;
  try {
    storage.setItem(claveBorrador(borrador.token), JSON.stringify(borrador));
    return true;
  } catch {
    // Sin storage (modo privado, cuota llena) el flujo sigue funcionando: se
    // pierde la comodidad de volver, no la operación.
    return false;
  }
}

/**
 * Recupera el borrador de este corte.
 *
 * Devuelve `null` —y lo BORRA— si está vencido, si es de otro token, o si el
 * formato no se puede interpretar. Ante la duda, no se ofrece: mostrar números
 * de otro conteo es peor que hacer contar de nuevo.
 */
export function leerBorrador(storage, token, ahora = Date.now()) {
  if (!storage || !token) return null;
  const clave = claveBorrador(token);
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
    descartarBorrador(storage, token);
    return null;
  }

  if (b?.version !== VERSION_BORRADOR || b.token !== token) {
    descartarBorrador(storage, token);
    return null;
  }

  const t = new Date(b.guardadoEn).getTime();
  if (!Number.isFinite(t) || ahora - t > VENCIMIENTO_HORAS * 3600 * 1000) {
    descartarBorrador(storage, token);
    return null;
  }

  return { ...b, desgloseRetiroContado: sanearDesglose(b.desgloseRetiroContado) };
}

export function descartarBorrador(storage, token) {
  if (!storage || !token) return;
  try {
    storage.removeItem(claveBorrador(token));
  } catch {
    // Nada que hacer: si no se puede borrar, el vencimiento lo resuelve solo.
  }
}

/**
 * Barre borradores de versiones anteriores y devuelve cuántos había.
 *
 * Se llama al abrir la pantalla de preparación. Que devuelva un número y no
 * `void` es lo que permite avisar: si había uno, la persona dejó un conteo a
 * medias en el flujo viejo y merece saber que no se perdió por un error suyo,
 * sino porque el proceso cambió.
 *
 * Los de la v3 y anteriores se reconocen porque su clave termina en `.uN` —eran
 * por turno y usuario— o porque su `version` no es la actual.
 */
export function purgarBorradoresViejos(storage) {
  if (!storage) return 0;
  let viejos = 0;
  try {
    const aBorrar = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k || !k.startsWith(PREFIJO)) continue;
      let version = null;
      try {
        version = JSON.parse(storage.getItem(k))?.version ?? null;
      } catch {
        version = null;
      }
      if (version !== VERSION_BORRADOR) aBorrar.push(k);
    }
    for (const k of aBorrar) {
      storage.removeItem(k);
      viejos++;
    }
  } catch {
    // Sin acceso al storage no hay nada que limpiar.
  }
  return viejos;
}

/**
 * Barre borradores vencidos de la versión actual, para no acumular basura.
 *
 * Separado de `purgarBorradoresViejos` a propósito: uno limpia formatos que ya
 * no se entienden y el otro conteos que caducaron. Mezclarlos haría que un
 * borrador vigente de hace una hora se perdiera junto con los de anteayer.
 */
export function limpiarBorradoresVencidos(storage, ahora = Date.now()) {
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
        if (!Number.isFinite(t) || ahora - t > VENCIMIENTO_HORAS * 3600 * 1000) {
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
