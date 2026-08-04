// lib/caja/borradorRetiro.js
//
// Borrador de un retiro en preparación.
//
// El cajero puede irse al POS a cobrar y volver sin perder lo que ya contó. El
// borrador vive SOLO en el navegador: no crea filas, no crea CajaMovimiento y no
// reserva nada. Hasta la confirmación no pasó absolutamente nada.
//
// QUÉ SE GUARDA Y QUÉ NO
//
// Se guarda lo que el usuario TIPEÓ: modo de conteo, monto, cantidades de
// billetes, modo de retiro, importe, billetes a retirar, observación.
//
// NO se guardan el efectivo esperado, la diferencia, la recaudación esperada ni
// el fondo objetivo. Esos son estado del servidor y envejecen: si el cajero
// cobra tres ventas mientras el borrador está guardado, el esperado cambió.
// Reusar el valor viejo mostraría una diferencia inventada. Se releen siempre.
//
// Las funciones reciben el `storage` por parámetro para poder probarlas sin
// navegador.

const PREFIJO = "erpazul.retiro.borrador";
export const VERSION_BORRADOR = 1;

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
  modoConteo,
  montoContado,
  desgloseContado,
  modoRetiro,
  importeRetiro,
  desgloseRetiro,
  observacion,
  ahora,
}) {
  return {
    version: VERSION_BORRADOR,
    turnoId: Number(turnoId),
    usuarioId: Number(usuarioId),
    modoConteo,
    montoContado: montoContado ?? "",
    desgloseContado: desgloseContado ?? {},
    modoRetiro,
    importeRetiro: importeRetiro ?? "",
    desgloseRetiro: desgloseRetiro ?? {},
    observacion: observacion ?? "",
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
 * usuario, o si el formato cambió. Ante la duda, no se ofrece: mostrar números
 * de otra caja es peor que hacer contar de nuevo.
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

  const invalido =
    b?.version !== VERSION_BORRADOR ||
    Number(b.turnoId) !== Number(turnoId) ||
    Number(b.usuarioId) !== Number(usuarioId);
  if (invalido) {
    descartarBorrador(storage, { turnoId, usuarioId });
    return null;
  }

  if (borradorVencido(b, ahora)) {
    descartarBorrador(storage, { turnoId, usuarioId });
    return null;
  }

  return b;
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
 * ¿El efectivo esperado cambió entre que se abrió la pantalla y ahora?
 *
 * Entre que el cajero cuenta y confirma pueden entrar ventas. Confirmar con el
 * esperado viejo produciría una diferencia que no es real. No se corrige solo:
 * se muestra y se pide confirmar de nuevo.
 */
export function detectarEsperadoCambiado({ esperadoAlAbrir, esperadoAhora }) {
  const a = Math.round(Number(esperadoAlAbrir) * 100);
  const b = Math.round(Number(esperadoAhora) * 100);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
    return { cambio: false, anterior: esperadoAlAbrir, actual: esperadoAhora, diferencia: 0 };
  }
  return {
    cambio: true,
    anterior: esperadoAlAbrir,
    actual: esperadoAhora,
    diferencia: (b - a) / 100,
  };
}
