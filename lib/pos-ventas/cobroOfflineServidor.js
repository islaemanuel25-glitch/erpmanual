// lib/pos-ventas/cobroOfflineServidor.js
//
// REGISTRAR UN COBRO OFFLINE, Y ATARLO A SU VENTA.
//
// Un cobro registrado es EVIDENCIA de lo que declara el POS, no una venta:
// registrarlo escribe solo `CobroOffline`. La venta la crea, o no,
// `/api/pos-ventas/crear` con sus reglas de siempre (DEC-0012).
//
// ── LAS TRES PIEZAS Y EL CANDADO QUE LAS ORDENA ────────────────────────────
//
//   · registrarCobroOffline — el endpoint de registro, un cobro por vez.
//   · verificarCobroOfflineNoDescartado + sincronizarCobroOfflineEnTransaccion
//     — dentro de la transacción de `crear`.
//   · reconciliarCobroOfflineConVenta — en los caminos de reintento de `crear`.
//
// Registro y `crear` toman el MISMO candado de transacción del local
// (tomarCandadoDelLocal). Así no se intercalan: si el registro corre primero,
// `crear` encuentra el cobro confirmado y lo sincroniza en su transacción; si
// `crear` corre primero, el registro encuentra la venta confirmada y nace
// reconciliado. No queda ninguna ventana con una venta creada y su cobro
// PENDIENTE.
//
// ── DECLARADO Y VERIFICADO ─────────────────────────────────────────────────
//
// Del ámbito de la sesión salen el local y el grupo; de la sesión, quién
// registra; del PIN activo validado, el operador que registra; del voucher
// —verificado y descartado antes de sanear—, el operador que lo firmó. Todo lo
// demás (cuenta, operador y turno de la cola, horas, ítems, precios) es
// declarado: se guarda como evidencia y no autoriza nada.

import { tomarCandadoDelLocal, LIMITES_TRANSACCION_DEL_LOCAL } from "@/lib/pos-ventas/candadoDelLocal";
import { esMismoDestino } from "@/lib/pos-ventas/idempotenciaVenta";
import {
  ESTADO_COBRO_OFFLINE,
  RESULTADO_REGISTRO,
  CODIGO_RECHAZO_REGISTRO,
  MOTIVO_REVISION,
  sanearCobro,
  hashDePayload,
  idPositivo,
  horaDeDispositivo,
  totalDeclarado,
} from "@/lib/pos-ventas/cobroOffline";

const SIN_RESOLVER = [ESTADO_COBRO_OFFLINE.PENDIENTE, ESTADO_COBRO_OFFLINE.REQUIERE_REVISION];

/** El error con que `crear` corta una venta cuyo cobro offline se descartó. */
export class ErrorCobroOfflineDescartado extends Error {
  constructor() {
    super("Este cobro offline fue descartado: no se puede registrar como venta.");
    this.esCobroOfflineDescartado = true;
  }
}

const rechazado = (clientTxnId, codigo) => ({ clientTxnId, resultado: RESULTADO_REGISTRO.RECHAZADO, codigo });

/** ¿La venta es la de la caja de este cobro? Mismo local y mismo turno. */
function ventaDeSuCaja(venta, cobro) {
  return Boolean(venta) && cobro.turnoId != null && esMismoDestino(venta, { localId: cobro.localId, turnoId: cobro.turnoId });
}

/**
 * Registra UN cobro de la cola.
 *
 * @param {object} prisma
 * @param {{ localId: number, grupoId: number, usuarioId: number, operadorActivoId: number|null,
 *           operadorVerificadoId: number|null, relojDispositivo: unknown }} ctx
 *   `operadorVerificadoId` lo resuelve quien llama verificando el voucher del
 *   cobro; acá el voucher ya no existe.
 * @param {object} cobro el ítem de la cola, tal como llega
 */
export async function registrarCobroOffline(prisma, ctx, cobro) {
  const saneado = sanearCobro(cobro);
  const clientTxnId = typeof cobro?.clientVentaId === "string" ? cobro.clientVentaId : null;
  if (!saneado.ok) {
    return { ...rechazado(clientTxnId, CODIGO_RECHAZO_REGISTRO.INVALIDO), error: saneado.error };
  }
  const { payload } = saneado;
  if (idPositivo(payload.localId) !== ctx.localId) {
    return rechazado(clientTxnId, CODIGO_RECHAZO_REGISTRO.LOCAL_DECLARADO_DISTINTO);
  }
  const payloadHash = hashDePayload(payload);

  try {
    return await registrarEnTransaccion(prisma, ctx, { clientTxnId, payload, payloadHash });
  } catch (err) {
    // Dos registros del mismo id desde DOS locales a la vez toman candados
    // distintos y uno choca contra el índice único. Se vuelve a evaluar: ahora
    // el otro ya está y la respuesta sale de las reglas de arriba.
    if (err?.code === "P2002") {
      return registrarEnTransaccion(prisma, ctx, { clientTxnId, payload, payloadHash });
    }
    throw err;
  }
}

async function registrarEnTransaccion(prisma, ctx, { clientTxnId, payload, payloadHash }) {
  // Con los límites de `crear`: el registro espera su candado, y una venta
  // legítima puede tenerlo más que los 5 s del default de Prisma.
  return prisma.$transaction(async (tx) => {
    await tomarCandadoDelLocal(tx, ctx.localId);

    const existente = await tx.cobroOffline.findUnique({ where: { clientTxnId } });
    if (existente) return yaExistente(tx, ctx, existente, payloadHash);

    // El turno declarado se guarda en la columna solo si existe y es de este
    // local. El crudo queda en el payload, para investigar.
    const turnoDeclarado = idPositivo(payload.turnoId);
    const turno = turnoDeclarado
      ? await tx.turno.findUnique({ where: { id: turnoDeclarado }, select: { localId: true } })
      : null;
    const turnoId = turno && turno.localId === ctx.localId ? turnoDeclarado : null;

    // ¿Ya hay una venta con este id? Pasa cuando el cobro online se creó, se
    // perdió la respuesta y la pantalla lo guardó offline con el mismo id.
    const venta = await tx.venta.findUnique({
      where: { clientTxnId },
      select: { id: true, localId: true, turnoId: true },
    });
    if (venta && venta.localId !== ctx.localId) {
      return rechazado(clientTxnId, CODIGO_RECHAZO_REGISTRO.ID_DE_OTRO_LOCAL);
    }

    let estado = ESTADO_COBRO_OFFLINE.PENDIENTE;
    let revisionMotivo = null;
    let ventaId = null;
    let resultado = RESULTADO_REGISTRO.CREADO;
    if (venta && turnoId != null && esMismoDestino(venta, { localId: ctx.localId, turnoId })) {
      estado = ESTADO_COBRO_OFFLINE.SINCRONIZADA;
      ventaId = venta.id;
      resultado = RESULTADO_REGISTRO.RECONCILIADO;
    } else if (venta) {
      estado = ESTADO_COBRO_OFFLINE.REQUIERE_REVISION;
      revisionMotivo = MOTIVO_REVISION.ID_EN_OTRA_VENTA;
    } else if (turnoDeclarado == null) {
      estado = ESTADO_COBRO_OFFLINE.REQUIERE_REVISION;
      revisionMotivo = MOTIVO_REVISION.SIN_TURNO;
    } else if (turnoId == null) {
      estado = ESTADO_COBRO_OFFLINE.REQUIERE_REVISION;
      revisionMotivo = MOTIVO_REVISION.TURNO_AJENO;
    }

    const ahora = new Date();
    await tx.cobroOffline.create({
      data: {
        clientTxnId,
        localId: ctx.localId,
        grupoId: ctx.grupoId,
        registradoPorUsuarioId: ctx.usuarioId,
        registradoPorOperadorId: ctx.operadorActivoId ?? null,
        cuentaDeclaradaId: idPositivo(payload.userId),
        operadorDeclaradoId: idPositivo(payload.operadorId),
        operadorVerificadoId: ctx.operadorVerificadoId ?? null,
        turnoId,
        cobradoEnDispositivo: horaDeDispositivo(payload.createdAt, ahora.getTime()),
        relojDispositivoAlRegistrar: horaDeDispositivo(ctx.relojDispositivo, ahora.getTime()),
        registradoEn: ahora,
        ultimoRegistroEn: ahora,
        totalDeclarado: totalDeclarado(payload),
        formaPagoDeclarada: payload.formaPago,
        payload,
        payloadHash,
        estado,
        revisionMotivo,
        ventaId,
        sincronizadaEn: ventaId ? ahora : null,
      },
    });
    return { clientTxnId, resultado, estado, ...(ventaId ? { ventaId } : {}) };
  }, LIMITES_TRANSACCION_DEL_LOCAL);
}

/** El id ya estaba registrado: mismo cobro, otro local, u otro contenido. */
async function yaExistente(tx, ctx, existente, payloadHash) {
  const { clientTxnId } = existente;
  if (existente.localId !== ctx.localId) {
    return rechazado(clientTxnId, CODIGO_RECHAZO_REGISTRO.ID_DE_OTRO_LOCAL);
  }
  if (existente.payloadHash !== payloadHash) {
    return rechazado(clientTxnId, CODIGO_RECHAZO_REGISTRO.CONTENIDO_DISTINTO);
  }

  // El mismo cobro, registrado otra vez (otro intento, otra pestaña, otra
  // cuenta del mismo local). Se anota solo cuándo; quién lo registró primero,
  // el contenido y el hash quedan como estaban.
  const ahora = new Date();
  const data = { ultimoRegistroEn: ahora };
  let resultado = RESULTADO_REGISTRO.YA_REGISTRADO;
  let estado = existente.estado;
  let ventaId = existente.ventaId ?? null;

  if (SIN_RESOLVER.includes(existente.estado)) {
    const venta = await tx.venta.findUnique({
      where: { clientTxnId },
      select: { id: true, localId: true, turnoId: true },
    });
    if (ventaDeSuCaja(venta, existente)) {
      Object.assign(data, { estado: ESTADO_COBRO_OFFLINE.SINCRONIZADA, ventaId: venta.id, sincronizadaEn: ahora });
      resultado = RESULTADO_REGISTRO.RECONCILIADO;
      estado = ESTADO_COBRO_OFFLINE.SINCRONIZADA;
      ventaId = venta.id;
    }
  }
  await tx.cobroOffline.update({ where: { id: existente.id }, data });
  return { clientTxnId, resultado, estado, ...(ventaId && estado === ESTADO_COBRO_OFFLINE.SINCRONIZADA ? { ventaId } : {}) };
}

/**
 * Dentro de la transacción de `crear`, con el candado del local ya tomado:
 * si el cobro offline con este id fue DESCARTADO, la venta no se crea. Se lee
 * con FOR UPDATE: un descarte que corra a la vez espera a esta transacción.
 * El id es único en todo el sistema, así que un descarte vale en cualquier local.
 */
export async function verificarCobroOfflineNoDescartado(tx, clientTxnId) {
  const filas = await tx.$queryRaw`
    SELECT "estado"::text AS estado
      FROM "CobroOffline"
     WHERE "clientTxnId" = ${clientTxnId}
     FOR UPDATE`;
  if (filas[0]?.estado === ESTADO_COBRO_OFFLINE.DESCARTADA) {
    throw new ErrorCobroOfflineDescartado();
  }
}

/**
 * Dentro de la transacción de `crear`, recién creada la venta: el cobro con ese
 * id, si es de la caja de la venta, pasa a SINCRONIZADA apuntando a ella. Si es
 * del mismo local pero de OTRA caja, no se le atribuye esta venta: pasa a
 * revisión, para que no quede un cobro "pendiente" de algo que ya tiene venta.
 */
export async function sincronizarCobroOfflineEnTransaccion(tx, { clientTxnId, ventaId, localId, turnoId }) {
  // Toda venta del POS tiene turno; sin él no hay caja con qué comparar.
  if (!clientTxnId || turnoId == null) return 0;
  const ahora = new Date();
  const sincronizados = await tx.cobroOffline.updateMany({
    where: { clientTxnId, localId, turnoId, estado: { in: SIN_RESOLVER } },
    data: { estado: ESTADO_COBRO_OFFLINE.SINCRONIZADA, ventaId, sincronizadaEn: ahora },
  });
  if (sincronizados.count === 0) {
    await tx.cobroOffline.updateMany({
      where: { clientTxnId, localId, estado: ESTADO_COBRO_OFFLINE.PENDIENTE },
      data: { estado: ESTADO_COBRO_OFFLINE.REQUIERE_REVISION, revisionMotivo: MOTIVO_REVISION.ID_EN_OTRA_VENTA },
    });
  }
  return sincronizados.count;
}

/**
 * En los caminos de reintento de `crear` (la venta ya existía): el cobro con
 * ese id, si es de la caja de esa venta y sigue sin resolver, pasa a
 * SINCRONIZADA. Condicional, idempotente y sin efecto económico.
 */
export async function reconciliarCobroOfflineConVenta(db, { clientTxnId, ventaId, localId, turnoId }) {
  if (!clientTxnId || turnoId == null) return 0;
  const r = await db.cobroOffline.updateMany({
    where: { clientTxnId, localId, turnoId, estado: { in: SIN_RESOLVER } },
    data: { estado: ESTADO_COBRO_OFFLINE.SINCRONIZADA, ventaId, sincronizadaEn: new Date() },
  });
  return r.count;
}
