// PROCESOS PENDIENTES — lectura desde la base.
//
// Vive aparte de `procesoPendiente.js` porque ese módulo es puro y lo importan
// también las pantallas; este toca Prisma y solo corre en el servidor.
//
// Lo único que hace es BUSCAR el proceso vigente de un turno y devolverlo con la
// forma única del aviso. No decide nada, no escribe nada y no cambia ninguna
// regla de exclusión: las reglas siguen donde estaban, adentro de las
// transacciones que toman el corte.
import prisma from "@/lib/prisma";
import { ESTADO_CIERRE } from "@/lib/caja/cierreRelevo";
import { ESTADO_RETIRO } from "@/lib/caja/retiroRelevo";
import {
  procesoPendienteDeRetiro,
  procesoPendienteDeCierre,
} from "@/lib/caja/procesoPendiente";

/** El operario que inició el proceso, tal como quedó grabado en la fila.
 *  No se lee el operador ACTIVO: para cuando aparece el aviso puede ser otro. */
export async function nombreDeOperador(id, cliente = prisma) {
  if (!id) return null;
  const fila = await cliente.operadorLocal.findUnique({
    where: { id },
    select: { nombre: true },
  });
  return fila?.nombre ?? null;
}

/**
 * El retiro en preparación de un turno, con forma de aviso. `null` si no hay.
 *
 * Acepta un `tx` para poder usarse adentro de la misma transacción que detectó
 * el conflicto, y así informar exactamente el proceso que bloqueó.
 */
export async function retiroPendienteDeTurno(turnoId, cliente = prisma) {
  if (!turnoId) return null;
  const retiro = await cliente.retiroPreparacion.findFirst({
    where: { turnoId, estado: ESTADO_RETIRO.PREPARANDO },
    select: {
      token: true, estado: true, corteEn: true, totalCambio: true,
      efectivoRetiradoEsperado: true, iniciadoPorOperadorId: true,
    },
  });
  if (!retiro) return null;
  return procesoPendienteDeRetiro(retiro, {
    operadorNombre: await nombreDeOperador(retiro.iniciadoPorOperadorId, cliente),
  });
}

/**
 * El cierre en preparación de un turno, con forma de aviso. `null` si no hay.
 *
 * Incluye VENCIDO: un corte vencido sigue congelando la caja y sigue siendo el
 * que hay que terminar. Vencer marca atraso, no libera nada.
 */
export async function cierrePendienteDeTurno(turnoId, cliente = prisma) {
  if (!turnoId) return null;
  const cierre = await cliente.cierrePreparacion.findFirst({
    where: {
      turnoId,
      estado: { in: [ESTADO_CIERRE.PREPARANDO, ESTADO_CIERRE.VENCIDO] },
    },
    select: {
      token: true, estado: true, corteEn: true, totalCambio: true,
      efectivoRetiradoEsperado: true, iniciadoPorOperadorId: true,
      cambioPendiente: { select: { estado: true, turnoDestinoId: true } },
    },
  });
  if (!cierre) return null;
  return procesoPendienteDeCierre(cierre, cierre.cambioPendiente ?? null, {
    operadorNombre: await nombreDeOperador(cierre.iniciadoPorOperadorId, cliente),
  });
}
