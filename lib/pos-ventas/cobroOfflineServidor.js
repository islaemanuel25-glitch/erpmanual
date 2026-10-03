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
//   · anotarRechazoDeVenta — después de un `crear` que no escribió la venta.
//   · descartarCobroOffline — la salida excepcional, de una persona autorizada.
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
  textoPersistible,
} from "@/lib/pos-ventas/cobroOffline";
import { DESTINO_RECHAZO, clasificarRechazo, estadoDeCajaOriginal } from "@/lib/pos-ventas/rechazoVenta";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";

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
 * Cuántos cobros offline de la caja `turnoId` siguen PENDIENTES: registrados y
 * sin venta, con su caja todavía en condiciones de recibirla. Mientras haya
 * alguno, la caja no se corta ni se cierra (`cierres/iniciar`, `turnos/cerrar`):
 * cerrarla los mandaría a revisión por una razón que no es de ellos. Los que
 * están en revisión no cuentan: ya no dependen de esa caja.
 */
export async function contarCobrosOfflinePendientesDelTurno(db, turnoId) {
  if (turnoId == null) return 0;
  return db.cobroOffline.count({ where: { turnoId, estado: ESTADO_COBRO_OFFLINE.PENDIENTE } });
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

// ── LO QUE PASA CUANDO LA VENTA NO SE PUDO ESCRIBIR (PR C) ──────────────────

/** Lee el cobro con su fila tomada. Con el candado del local ya tomado. */
async function cobroBloqueado(tx, where) {
  const filas = where.id != null
    ? await tx.$queryRaw`SELECT id, "clientTxnId", "localId", "turnoId", "estado"::text AS estado FROM "CobroOffline" WHERE id = ${where.id} FOR UPDATE`
    : await tx.$queryRaw`SELECT id, "clientTxnId", "localId", "turnoId", "estado"::text AS estado FROM "CobroOffline" WHERE "clientTxnId" = ${where.clientTxnId} FOR UPDATE`;
  return filas[0] ?? null;
}

const textoGuardable = (texto, largo) =>
  typeof texto === "string" && textoPersistible(texto) ? texto.slice(0, largo) : null;

/**
 * `crear` no escribió la venta de un id que es un cobro offline de este local:
 * se anota el intento y su rechazo, y se decide si el cobro sigue PENDIENTE o
 * pasa a REQUIERE_REVISION (clasificarRechazo).
 *
 * Corre DESPUÉS de la transacción de `crear`, en una propia, para que el
 * rechazo sobreviva a ese rollback; y con el MISMO candado del local, así que
 * ningún `crear` del local está a mitad de camino mientras corre: si la venta
 * existe, ya está confirmada, y se reconcilia en vez de anotar un rechazo. No
 * hay ventana con una venta escrita y su cobro marcado como rechazado.
 *
 * Solo toca un cobro sin resolver y de ESTE local. Un cobro de otro local con
 * ese id no se toca ni se informa.
 *
 * @returns {Promise<null | { resultado: "RECONCILIADO" | "ANOTADO", estado: string }>}
 */
export async function anotarRechazoDeVenta(prisma, { clientTxnId, localId, status, codigo, mensaje }) {
  if (typeof clientTxnId !== "string" || !clientTxnId) return null;
  // Casi todos los rechazos son de ventas sin cobro offline: se descartan con
  // una lectura, sin pasar por el candado del local.
  const previo = await prisma.cobroOffline.findUnique({ where: { clientTxnId }, select: { localId: true, estado: true } });
  if (!previo || previo.localId !== localId || !SIN_RESOLVER.includes(previo.estado)) return null;

  return prisma.$transaction(async (tx) => {
    await tomarCandadoDelLocal(tx, localId);
    const cobro = await cobroBloqueado(tx, { clientTxnId });
    if (!cobro || cobro.localId !== localId || !SIN_RESOLVER.includes(cobro.estado)) return null;

    const ahora = new Date();
    const venta = await tx.venta.findUnique({ where: { clientTxnId }, select: { id: true, localId: true, turnoId: true } });
    if (ventaDeSuCaja(venta, cobro)) {
      // Otro pedido del mismo cobro escribió la venta: no hay rechazo que anotar.
      await tx.cobroOffline.update({
        where: { id: cobro.id },
        data: { estado: ESTADO_COBRO_OFFLINE.SINCRONIZADA, ventaId: venta.id, sincronizadaEn: ahora },
      });
      return { resultado: "RECONCILIADO", estado: ESTADO_COBRO_OFFLINE.SINCRONIZADA };
    }

    let clasificacion;
    if (venta) {
      // El id ya es de otra venta: de otro local, o de otra caja de éste.
      clasificacion = {
        destino: DESTINO_RECHAZO.REVISAR,
        motivo: venta.localId !== localId ? CODIGO_RECHAZO_REGISTRO.ID_DE_OTRO_LOCAL : MOTIVO_REVISION.ID_EN_OTRA_VENTA,
      };
    } else {
      const turno = cobro.turnoId == null
        ? null
        : await tx.turno.findUnique({
            where: { id: cobro.turnoId },
            select: { localId: true, apertura: true, cierre: true, cierreEnPreparacionEn: true, anuladoEn: true },
          });
      const cajaOriginal = cobro.turnoId == null
        ? { operativa: false, motivo: MOTIVO_REVISION.SIN_TURNO }
        : estadoDeCajaOriginal(turno, { localId, hoyAR: hoyArgentinaISO() });
      clasificacion = clasificarRechazo({ codigo, cajaOriginal });
    }
    if (clasificacion.destino === DESTINO_RECHAZO.NINGUNO) return null;

    const data = {
      intentos: { increment: 1 },
      ultimoIntentoEn: ahora,
      ultimoRechazoStatus: Number.isInteger(status) ? status : null,
      ultimoRechazoCodigo: textoGuardable(codigo, 100),
      ultimoRechazoMensaje: textoGuardable(mensaje, 500),
    };
    let estado = cobro.estado;
    // El motivo de revisión es el PRIMERO: un rechazo posterior queda en
    // `ultimoRechazo*`, pero no reescribe por qué entró a revisión.
    if (clasificacion.destino === DESTINO_RECHAZO.REVISAR && cobro.estado === ESTADO_COBRO_OFFLINE.PENDIENTE) {
      estado = ESTADO_COBRO_OFFLINE.REQUIERE_REVISION;
      Object.assign(data, { estado, revisionMotivo: clasificacion.motivo });
    }
    await tx.cobroOffline.update({ where: { id: cobro.id }, data });
    return { resultado: "ANOTADO", estado };
  }, LIMITES_TRANSACCION_DEL_LOCAL);
}

/** Lo que pasó al pedir descartar un cobro. */
export const RESULTADO_DESCARTE = Object.freeze({
  DESCARTADA: "DESCARTADA",
  /** No existe, o es de otro local: no se distingue. */
  NO_ENCONTRADO: "NO_ENCONTRADO",
  /** Ya está SINCRONIZADA o DESCARTADA. */
  ESTADO_TERMINAL: "ESTADO_TERMINAL",
  /** Hay una venta con ese id: no se descarta un cobro que ya es una venta. */
  TIENE_VENTA: "TIENE_VENTA",
});

export const ACCION_DESCARTAR_COBRO_OFFLINE = "cobro_offline.descartar";

/**
 * DESCARTAR: una persona autorizada decide, con motivo, que este cobro no va a
 * ser venta. Es la salida EXCEPCIONAL de un cobro que no pudo sincronizarse.
 *
 * No borra el cobro, no crea venta y no toca stock, caja, puntos, libros ni
 * turnos: cambia el estado del cobro y deja la evidencia —quién, cuándo, por
 * qué— en el cobro y en la bitácora, en la misma transacción. Desde ahí `crear`
 * niega la venta de ese id.
 *
 * Con el MISMO candado del local que `crear` y el registro: si `crear` está
 * escribiendo la venta de este cobro, el descarte la espera, y la encuentra.
 * Un cobro con venta no se descarta: si es la de su caja, se reconcilia.
 *
 * @param {{ cobroId: number, localId: number, grupoId: number|null, usuarioId: number,
 *           operadorId: number|null, motivo: string }} pedido el motivo ya validado
 */
export async function descartarCobroOffline(prisma, { cobroId, localId, grupoId, usuarioId, operadorId, motivo }) {
  return prisma.$transaction(async (tx) => {
    await tomarCandadoDelLocal(tx, localId);
    const cobro = await cobroBloqueado(tx, { id: cobroId });
    if (!cobro || cobro.localId !== localId) return { resultado: RESULTADO_DESCARTE.NO_ENCONTRADO };
    if (!SIN_RESOLVER.includes(cobro.estado)) return { resultado: RESULTADO_DESCARTE.ESTADO_TERMINAL, estado: cobro.estado };

    const ahora = new Date();
    const venta = await tx.venta.findUnique({ where: { clientTxnId: cobro.clientTxnId }, select: { id: true, localId: true, turnoId: true } });
    if (venta) {
      if (ventaDeSuCaja(venta, cobro)) {
        await tx.cobroOffline.update({
          where: { id: cobro.id },
          data: { estado: ESTADO_COBRO_OFFLINE.SINCRONIZADA, ventaId: venta.id, sincronizadaEn: ahora },
        });
        return { resultado: RESULTADO_DESCARTE.TIENE_VENTA, estado: ESTADO_COBRO_OFFLINE.SINCRONIZADA, ventaId: venta.id };
      }
      // La venta es de otra caja u otro local: ni se descarta ni se dice cuál es.
      return { resultado: RESULTADO_DESCARTE.TIENE_VENTA, estado: cobro.estado };
    }

    await tx.cobroOffline.update({
      where: { id: cobro.id },
      data: {
        estado: ESTADO_COBRO_OFFLINE.DESCARTADA,
        resueltoPorUsuarioId: usuarioId,
        resueltoPorOperadorId: operadorId ?? null,
        resueltoEn: ahora,
        motivoResolucion: motivo,
      },
    });
    await tx.auditoriaBitacora.create({
      data: {
        usuarioId: usuarioId ?? null,
        operadorId: operadorId ?? null,
        localId,
        grupoId: grupoId ?? null,
        accion: ACCION_DESCARTAR_COBRO_OFFLINE,
        entidad: "CobroOffline",
        entidadId: String(cobro.id),
        entidadNombre: `Cobro offline ${cobro.clientTxnId}`,
        cambios: [
          {
            entidad: "Cobro offline",
            nombre: cobro.clientTxnId,
            id: String(cobro.id),
            campos: [{ campo: "estado", label: "Estado", antes: cobro.estado, despues: ESTADO_COBRO_OFFLINE.DESCARTADA }],
            resolucion: {
              cobroOfflineId: cobro.id,
              clientTxnId: cobro.clientTxnId,
              localId,
              turnoId: cobro.turnoId,
              estadoAnterior: cobro.estado,
              resueltoEn: ahora,
              motivo,
              ventaCreada: false,
            },
          },
        ],
      },
    });
    return { resultado: RESULTADO_DESCARTE.DESCARTADA, estado: ESTADO_COBRO_OFFLINE.DESCARTADA };
  }, LIMITES_TRANSACCION_DEL_LOCAL);
}
