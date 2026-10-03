// lib/pos-ventas/cobrosOfflineConsulta.js
//
// QUÉ COBROS OFFLINE PUEDE VER QUIÉN, Y CÓMO SE MUESTRAN.
//
// Lo usan `GET /api/pos-ventas/cobros-offline` (listado) y
// `GET /api/pos-ventas/cobros-offline/[id]` (detalle). Solo lectura.
//
// ── QUIÉN VE QUÉ ───────────────────────────────────────────────────────────
//
// Un cobro offline es de una caja: la de su turno. Se mira con la misma regla
// que el resto de las cajas (lib/caja/identidadCajaServer.js):
//
//   · la caja propia, con la identidad que haya (PIN validado, o la cuenta);
//   · las ajenas, con `turnos.ver_todos`, con la intervención de Admin o del
//     Dueño en su local, o con `ventas.resolver_offline` —quien puede
//     descartar tiene que poder ver lo que descarta—.
//
// Un cobro sin turno estructurado (sin turno, o con uno inexistente o de otro
// local) no es de ninguna caja: solo lo ve quien ve todas. Y nada fuera del
// local de la sesión.
//
// ── EL PAYLOAD ES EVIDENCIA ────────────────────────────────────────────────
//
// Se devuelve tal como se guardó. Los nombres —operador, cuenta, cliente— se
// leen de sus tablas para mostrarlos; no se copian al cobro.

import { checkPerm } from "@/lib/authorize";
import { identidadParaMirar, puedeVerCaja } from "@/lib/caja/identidadCajaServer";
import { estadoDelTurno } from "@/lib/caja/cierreRelevo";
import { ESTADO_COBRO_OFFLINE, PERMISO_RESOLVER_COBROS_OFFLINE } from "@/lib/pos-ventas/cobroOffline";

/** Los estados que se pueden pedir al listado. Por defecto, los dos sin resolver. */
export const ESTADOS_LISTABLES = Object.freeze([
  ESTADO_COBRO_OFFLINE.PENDIENTE,
  ESTADO_COBRO_OFFLINE.REQUIERE_REVISION,
  ESTADO_COBRO_OFFLINE.SINCRONIZADA,
  ESTADO_COBRO_OFFLINE.DESCARTADA,
]);
const POR_DEFECTO = [ESTADO_COBRO_OFFLINE.PENDIENTE, ESTADO_COBRO_OFFLINE.REQUIERE_REVISION];
export const MAXIMO_LISTADO = 200;

/** Los estados pedidos (`?estado=A,B`), solo de la lista conocida. */
export function estadosPedidos(param) {
  if (typeof param !== "string" || !param.trim()) return [...POR_DEFECTO];
  const pedidos = param.split(",").map((e) => e.trim()).filter((e) => ESTADOS_LISTABLES.includes(e));
  return pedidos.length ? [...new Set(pedidos)] : null;
}

/** Con qué identidad mira esta sesión, y si alcanza todas las cajas del local. */
export async function alcanceDeMirada(req, session, { localId }) {
  const identidad = await identidadParaMirar(req, session, { localId });
  const verTodas =
    identidad.puedeVerAjenas === true ||
    identidad.puedeIntervenir === true ||
    checkPerm(session, PERMISO_RESOLVER_COBROS_OFFLINE).ok;
  return { identidad, verTodas };
}

const SELECT_TURNO = { id: true, localId: true, operadorId: true, vendedorId: true, apertura: true, cierre: true, cierreEnPreparacionEn: true, anuladoEn: true };

function visible(cobro, turno, { identidad, verTodas }) {
  if (verTodas) return true;
  return Boolean(turno) && turno.localId === cobro.localId && puedeVerCaja(turno, identidad);
}

/**
 * Los nombres para mostrar. Los ids DECLARADOS los manda el dispositivo: un
 * operador se nombra solo si está asignado a este local, y una cuenta
 * declarada solo si es de este local; si no, queda el id sin nombre. Las
 * cuentas que puso el servidor (quién registró, quién resolvió) se nombran.
 */
async function nombresDe(prisma, { localId, operadores = [], usuarios = [], usuariosDeclarados = [] }) {
  const ids = (xs) => [...new Set(xs.filter((x) => Number.isInteger(x) && x > 0))];
  const [ops, users, declarados] = await Promise.all([
    ids(operadores).length
      ? prisma.operadorLocal.findMany({ where: { id: { in: ids(operadores) }, locales: { some: { localId } } }, select: { id: true, nombre: true } })
      : [],
    ids(usuarios).length ? prisma.usuario.findMany({ where: { id: { in: ids(usuarios) } }, select: { id: true, nombre: true } }) : [],
    ids(usuariosDeclarados).length
      ? prisma.usuario.findMany({ where: { id: { in: ids(usuariosDeclarados) }, localId }, select: { id: true, nombre: true } })
      : [],
  ]);
  users.push(...declarados);
  return {
    operador: new Map(ops.map((o) => [o.id, o.nombre])),
    usuario: new Map(users.map((u) => [u.id, u.nombre])),
  };
}

const persona = (id, mapa) => (id == null ? null : { id, nombre: mapa.get(id) ?? null });

function resumen(cobro, turno, nombres) {
  const items = Array.isArray(cobro.payload?.items) ? cobro.payload.items : [];
  return {
    id: cobro.id,
    clientTxnId: cobro.clientTxnId,
    localId: cobro.localId,
    estado: cobro.estado,
    cobradoEnDispositivo: cobro.cobradoEnDispositivo,
    registradoEn: cobro.registradoEn,
    totalDeclarado: cobro.totalDeclarado.toString(),
    formaPagoDeclarada: cobro.formaPagoDeclarada,
    operadorDeclarado: persona(cobro.operadorDeclaradoId, nombres.operador),
    operadorVerificado: persona(cobro.operadorVerificadoId, nombres.operador),
    turno: cobro.turnoId == null ? null : { id: cobro.turnoId, estado: estadoDelTurno(turno) },
    cantidadItems: items.length,
    intentos: cobro.intentos,
    ultimoIntentoEn: cobro.ultimoIntentoEn,
    ultimoRechazo: cobro.ultimoRechazoCodigo || cobro.ultimoRechazoStatus != null
      ? { status: cobro.ultimoRechazoStatus, codigo: cobro.ultimoRechazoCodigo, mensaje: cobro.ultimoRechazoMensaje }
      : null,
    revisionMotivo: cobro.revisionMotivo,
    ventaId: cobro.ventaId,
  };
}

/**
 * Los cobros del local en esos estados que esta identidad puede ver, del más
 * nuevo al más viejo.
 */
export async function listarCobrosOffline(prisma, { localId, estados, alcance }) {
  const cobros = await prisma.cobroOffline.findMany({
    where: { localId, estado: { in: estados } },
    orderBy: [{ registradoEn: "desc" }, { id: "desc" }],
    take: MAXIMO_LISTADO,
  });
  const turnoIds = [...new Set(cobros.map((c) => c.turnoId).filter((t) => t != null))];
  const turnos = turnoIds.length
    ? new Map((await prisma.turno.findMany({ where: { id: { in: turnoIds } }, select: SELECT_TURNO })).map((t) => [t.id, t]))
    : new Map();
  const visibles = cobros.filter((c) => visible(c, turnos.get(c.turnoId), alcance));
  const nombres = await nombresDe(prisma, { localId, operadores: visibles.flatMap((c) => [c.operadorDeclaradoId, c.operadorVerificadoId]) });
  return {
    items: visibles.map((c) => resumen(c, turnos.get(c.turnoId), nombres)),
    truncado: cobros.length === MAXIMO_LISTADO,
  };
}

/**
 * Un cobro, con todo lo que hace falta para entenderlo. null si no existe, si
 * es de otro local o si esta identidad no puede ver su caja: los tres se
 * responden igual.
 */
export async function detalleCobroOffline(prisma, { cobroId, localId, alcance }) {
  const cobro = await prisma.cobroOffline.findUnique({ where: { id: cobroId } });
  if (!cobro || cobro.localId !== localId) return null;
  const turno = cobro.turnoId == null ? null : await prisma.turno.findUnique({ where: { id: cobro.turnoId }, select: SELECT_TURNO });
  if (!visible(cobro, turno, alcance)) return null;

  const payload = cobro.payload ?? {};
  const clienteId = Number.isInteger(payload.clienteId) ? payload.clienteId : null;
  const [nombres, cliente, venta] = await Promise.all([
    nombresDe(prisma, {
      localId,
      operadores: [cobro.operadorDeclaradoId, cobro.operadorVerificadoId, cobro.registradoPorOperadorId, cobro.resueltoPorOperadorId],
      usuarios: [cobro.registradoPorUsuarioId, cobro.resueltoPorUsuarioId],
      usuariosDeclarados: [cobro.cuentaDeclaradaId],
    }),
    // El cliente solo si es del grupo del cobro: un id declarado no abre la
    // ficha de un cliente de otro grupo.
    clienteId ? prisma.cliente.findFirst({ where: { id: clienteId, grupoId: cobro.grupoId }, select: { id: true, nombre: true } }) : null,
    cobro.ventaId ? prisma.venta.findFirst({ where: { id: cobro.ventaId, localId }, select: { id: true, numero: true } }) : null,
  ]);

  return {
    ...resumen(cobro, turno, nombres),
    grupoId: cobro.grupoId,
    registradoPor: { usuario: persona(cobro.registradoPorUsuarioId, nombres.usuario), operador: persona(cobro.registradoPorOperadorId, nombres.operador) },
    cuentaDeclarada: persona(cobro.cuentaDeclaradaId, nombres.usuario),
    relojDispositivoAlRegistrar: cobro.relojDispositivoAlRegistrar,
    ultimoRegistroEn: cobro.ultimoRegistroEn,
    turno: turno
      ? { id: turno.id, estado: estadoDelTurno(turno), apertura: turno.apertura, cierre: turno.cierre }
      : cobro.turnoId == null ? null : { id: cobro.turnoId, estado: null },
    cliente: clienteId ? { id: clienteId, nombre: cliente?.nombre ?? null } : null,
    venta: venta ? { id: venta.id, numero: venta.numero } : null,
    sincronizadaEn: cobro.sincronizadaEn,
    resolucion: cobro.resueltoEn
      ? {
          usuario: persona(cobro.resueltoPorUsuarioId, nombres.usuario),
          operador: persona(cobro.resueltoPorOperadorId, nombres.operador),
          resueltoEn: cobro.resueltoEn,
          motivo: cobro.motivoResolucion,
        }
      : null,
    payload,
  };
}
