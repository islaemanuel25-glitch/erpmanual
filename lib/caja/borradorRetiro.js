// lib/caja/borradorRetiro.js
//
// Borrador de un retiro en preparación.
//
// El cajero puede seguir vendiendo mientras cuenta y volver sin perder lo hecho.
// El borrador vive SOLO en el navegador: no crea filas, no crea CajaMovimiento y
// no reserva nada. Hasta la confirmación no pasó absolutamente nada.
//
// QUÉ SE GUARDA Y QUÉ NO
//
// Se guarda lo que el usuario HIZO CON LAS MANOS: cómo contó, cuánto contó, qué
// billetes deja como cambio, la observación y la hora en que empezó a contar.
//
// NO se guardan el efectivo esperado, la diferencia ni el total a retirar. Los
// dos primeros son estado del servidor y envejecen: si entran ventas mientras el
// borrador está guardado, el esperado cambió y reusar el viejo mostraría una
// diferencia inventada. El tercero es una resta que se recalcula sola. Se
// releen o se recalculan siempre.
//
// Las funciones reciben el `storage` por parámetro para poder probarlas sin
// navegador.

import { DENOMINACIONES, CLAVE_MONEDAS, normalizarCantidad, normalizarMonedas } from "./conteoBilletes.js";

const PREFIJO = "erpazul.retiro.borrador";

/**
 * Historia de versiones, porque cada salto cambió QUÉ significa lo guardado y no
 * solo qué campos hay:
 *
 *   v1 — guardaba `modoRetiro`, `importeRetiro` y `desgloseRetiro`: los billetes
 *        que SALÍAN.
 *   v2 — pasó a `desgloseCambio`: los que QUEDAN. Concepto inverso, no
 *        intercambiable con el anterior.
 *   v3 — desaparece el conteo por monto total. El efectivo contado sale SOLO del
 *        desglose por denominaciones, así que `modoConteo` y `montoContado` ya
 *        no existen.
 */
export const VERSION_BORRADOR = 3;
/** Versiones que se saben leer para migrar. */
export const VERSIONES_ANTERIORES = [1, 2];

/** Vencimiento: un borrador de ayer no describe la caja de hoy. */
export const VENCIMIENTO_HORAS = 12;

/**
 * Clave por TURNO y USUARIO.
 *
 * Los dos importan: en un mismo local pueden operar dos cajeros con turnos
 * distintos en el mismo navegador, y el borrador de uno no puede aparecerle al
 * otro. Sin el turnoId, además, un borrador sobreviviría al cierre de caja y se
 * ofrecería en el turno siguiente con números de otra jornada.
 */
export function claveBorrador({ turnoId, usuarioId }) {
  return `${PREFIJO}.t${Number(turnoId)}.u${Number(usuarioId)}`;
}

/** Lo que se persiste. Solo entrada del usuario, nunca estado del servidor. */
export function armarBorrador({
  turnoId,
  usuarioId,
  desgloseContado,
  desgloseCambio,
  observacion,
  conteoIniciadoEn,
  ahora,
}) {
  return {
    version: VERSION_BORRADOR,
    turnoId: Number(turnoId),
    usuarioId: Number(usuarioId),
    desgloseContado: desgloseContado ?? {},
    desgloseCambio: desgloseCambio ?? {},
    observacion: observacion ?? "",
    // La hora del conteo es parte del dato: si entraron ventas después, importa
    // saber a qué momento corresponde la plata que se contó.
    conteoIniciadoEn: conteoIniciadoEn ?? new Date(ahora ?? Date.now()).toISOString(),
    guardadoEn: new Date(ahora ?? Date.now()).toISOString(),
  };
}

export function guardarBorrador(storage, borrador) {
  if (!storage) return false;
  try {
    storage.setItem(
      claveBorrador({ turnoId: borrador.turnoId, usuarioId: borrador.usuarioId }),
      JSON.stringify(borrador)
    );
    return true;
  } catch {
    // Sin storage (modo privado, cuota llena) el flujo sigue funcionando: se
    // pierde la comodidad de volver, no la operación.
    return false;
  }
}

/**
 * Recupera el borrador del turno y usuario indicados.
 *
 * Devuelve `null` —y lo BORRA— si está vencido, si es de otro turno o de otro
 * usuario, o si el formato no se puede interpretar. Ante la duda, no se ofrece:
 * mostrar números de otra caja es peor que hacer contar de nuevo.
 *
 * Cuando el borrador venía en el formato anterior, devuelve lo que se pudo
 * rescatar junto con `avisoCompat`, para que la pantalla lo diga en vez de
 * simular que estaba todo.
 */
export function leerBorrador(storage, { turnoId, usuarioId, ahora } = {}) {
  if (!storage) return null;
  const clave = claveBorrador({ turnoId, usuarioId });
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
    descartarBorrador(storage, { turnoId, usuarioId });
    return null;
  }

  const deOtro =
    Number(b?.turnoId) !== Number(turnoId) || Number(b?.usuarioId) !== Number(usuarioId);
  if (deOtro) {
    descartarBorrador(storage, { turnoId, usuarioId });
    return null;
  }

  if (borradorVencido(b, ahora)) {
    descartarBorrador(storage, { turnoId, usuarioId });
    return null;
  }

  if (b?.version === VERSION_BORRADOR) return b;

  if (VERSIONES_ANTERIORES.includes(b?.version)) {
    const migrado = migrarBorradorViejo(b, ahora);
    if (migrado) {
      guardarBorrador(storage, migrado);
      return migrado;
    }
    // Migración imposible: se descarta con el aviso que la pantalla muestra.
    descartarBorrador(storage, { turnoId, usuarioId });
    return { descartado: true, avisoCompat: AVISO_SIN_DESGLOSE };
  }

  // Versión desconocida: no se adivina.
  descartarBorrador(storage, { turnoId, usuarioId });
  return null;
}

export const AVISO_SIN_DESGLOSE =
  "El borrador anterior no tenía detalle de billetes y no puede recuperarse.";

/**
 * Traduce un borrador de un formato anterior.
 *
 * SE RESCATA el conteo POR DENOMINACIONES: "cuántos billetes de cada uno había"
 * significa lo mismo en todas las versiones.
 *
 * NO SE RESCATA un conteo por monto total. Desde la v3 el efectivo contado sale
 * únicamente del desglose, y un total suelto no se puede repartir en billetes
 * sin inventar cuáles. Devuelve `null` y el llamador lo descarta avisando: es
 * preferible contar de nuevo a arrancar de un desglose fabricado, porque de ese
 * desglose depende el tope del cambio y, por lo tanto, el importe del retiro.
 *
 * TAMPOCO se traduce la parte del retiro de la v1: guardaba los billetes que el
 * cajero se LLEVABA y la v2 necesita los que DEJA. Restar uno del otro afirmaría
 * una decisión que la persona nunca tomó en esos términos.
 */
export function migrarBorradorViejo(b, ahora) {
  if (!b || !VERSIONES_ANTERIORES.includes(b.version)) return null;

  const desglose = sanearDesglose(b.desgloseContado);
  const hayDesglose = Object.keys(desglose).length > 0;
  const teniaMontoManual = b.montoContado != null && String(b.montoContado).trim() !== "";

  // Solo monto manual y sin billetes: no hay nada que rescatar.
  if (!hayDesglose && teniaMontoManual) return null;

  const teniaAlgoDelRetiro =
    (b.importeRetiro != null && b.importeRetiro !== "") ||
    (b.desgloseRetiro && Object.keys(b.desgloseRetiro).length > 0);

  const migrado = armarBorrador({
    turnoId: b.turnoId,
    usuarioId: b.usuarioId,
    desgloseContado: desglose,
    // La v1 no tiene equivalente: siempre vacío. La v2 sí lo trae.
    desgloseCambio: sanearDesglose(b.desgloseCambio),
    observacion: b.observacion,
    conteoIniciadoEn: b.conteoIniciadoEn ?? b.guardadoEn,
    ahora,
  });

  if (teniaAlgoDelRetiro) {
    migrado.avisoCompat =
      "Este borrador es de una versión anterior, que preguntaba cuánto retirar. " +
      "Se conservó el conteo; elegí de nuevo los billetes que quedan como cambio.";
  }
  return migrado;
}

export function borradorVencido(borrador, ahora) {
  const guardado = Date.parse(borrador?.guardadoEn ?? "");
  if (!Number.isFinite(guardado)) return true;
  const t = ahora ?? Date.now();
  return t - guardado > VENCIMIENTO_HORAS * 3600 * 1000;
}

export function descartarBorrador(storage, { turnoId, usuarioId }) {
  if (!storage) return;
  try {
    storage.removeItem(claveBorrador({ turnoId, usuarioId }));
  } catch {
    // Nada que hacer: si no se puede borrar, el vencimiento lo resuelve solo.
  }
}

/**
 * Limpia borradores de turnos que ya no son el activo.
 *
 * Se llama al abrir la pantalla con el turno vigente: cualquier borrador de otro
 * turno del mismo usuario ya no sirve —ese turno se cerró— y no debe quedar
 * ocupando espacio ni reaparecer.
 */
export function limpiarBorradoresViejos(storage, { turnoIdActivo, usuarioId } = {}) {
  if (!storage) return 0;
  let borrados = 0;
  try {
    const claveActiva = claveBorrador({ turnoId: turnoIdActivo, usuarioId });
    const sufijoUsuario = `.u${Number(usuarioId)}`;
    const aBorrar = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k || !k.startsWith(PREFIJO)) continue;
      if (k === claveActiva) continue;
      if (!k.endsWith(sufijoUsuario)) continue;
      aBorrar.push(k);
    }
    for (const k of aBorrar) {
      storage.removeItem(k);
      borrados++;
    }
  } catch {
    // Sin acceso al storage no hay nada que limpiar.
  }
  return borrados;
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
