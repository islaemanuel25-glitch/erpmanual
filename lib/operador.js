import prisma from "@/lib/prisma";
import { firmarToken, verificarToken, verificarTokenIgnorandoVencimiento, getCookieValue } from "@/lib/auth";
import { seedAuditoria } from "@/lib/auditoria/contexto";
import { puedeOperarSinOperador } from "@/lib/operador-exencion";
import { getExigirOperador } from "@/lib/config/local";

// Re-export para compatibilidad: la regla vive en el módulo puro
// lib/operador-exencion.js (testeable, sin imports de servidor).
export { puedeOperarSinOperador };

const OPERADOR_COOKIE = "erpazul_operador_activo";
const OPERADOR_VOUCHER_TIPO = "operador_voucher";
// Alineado con el vencimiento del JWT (lib/auth.js MAX_AGE = 8h). La cookie no
// debe sobrevivir al token que lleva adentro: si no, queda una cookie viva con
// un JWT ya vencido y getOperadorActivo devuelve null igual.
const OPERADOR_MAX_AGE = 60 * 60 * 8; // 8 horas

const isProd = process.env.NODE_ENV === "production";

export const OperadorCookie = {
  nombre: OPERADOR_COOKIE,
  opciones: {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: OPERADOR_MAX_AGE,
  },
};

/**
 * Firma un token de operador activo (separado del JWT principal).
 */
export function firmarTokenOperador(payload) {
  return firmarToken({ ...payload, _tipo: "operador" });
}

/**
 * Obtiene el operador activo desde la cookie de la request.
 * Retorna { operadorId, nombre, localId } o null.
 */
export function getOperadorActivo(req) {
  const token = getCookieValue(req, OPERADOR_COOKIE);
  if (!token) return null;

  const data = verificarToken(token);
  if (!data || data._tipo !== "operador") return null;

  // Auditoría: sembramos la identidad operativa para el interceptor de Prisma.
  seedAuditoria({
    operadorId: data.operadorId ?? null,
    operadorNombre: data.nombre ?? null,
    localId: data.localId ?? null,
  });

  return {
    operadorId: data.operadorId ?? null,
    nombre: data.nombre ?? null,
    localId: data.localId ?? null,
  };
}

/**
 * El operador activo, VALIDADO contra el local de la operación.
 *
 * La cookie dice quién hizo PIN y en qué local; firmada, no se puede fabricar,
 * pero sola no alcanza para decidir de quién es una caja:
 *
 *   · se firmó para UN local. Llevada a otro —un Admin que cambia de contexto,
 *     un operador asignado a dos locales— identificaría a alguien que no se
 *     identificó acá;
 *   · vive 8 horas. Un operador desasignado del local o desactivado después del
 *     PIN seguiría operando hasta que venza.
 *
 * Se exige lo mismo que exige `/api/operador/login` al firmarla: que el local de
 * la cookie sea el de la operación, que el operador siga asignado a ese local
 * (`OperadorEnLocal`) y que siga `activo`. Si algo no se cumple, es como si no
 * hubiera operador: quien lo pide decide si eso es un 428 o una caja de cuenta.
 *
 * El `localId` DEBE ser el ya autorizado por el scope del endpoint.
 *
 * @returns {Promise<{ operadorId:number, nombre:string|null, localId:number } | null>}
 */
export async function getOperadorActivoDelLocal(req, localId) {
  const op = getOperadorActivo(req);
  const operadorId = Number(op?.operadorId);
  if (!Number.isInteger(operadorId) || operadorId <= 0) return null;
  const local = Number(localId);
  if (!Number.isInteger(local) || local <= 0) return null;
  if (Number(op.localId) !== local) return null;

  const asignacion = await prisma.operadorEnLocal.findUnique({
    where: { operadorId_localId: { operadorId, localId: local } },
    select: { operador: { select: { activo: true } } },
  });
  if (asignacion?.operador?.activo !== true) return null;

  return { operadorId, nombre: op.nombre ?? null, localId: local };
}

/**
 * Exige operador activo Y válido en el local de la operación.
 * Retorna { ok, operador } o { ok: false, error, status }.
 */
export async function requireOperador(req, { localId } = {}) {
  const operador = await getOperadorActivoDelLocal(req, localId);
  if (!operador || !operador.operadorId) {
    return {
      ok: false,
      status: 428,
      error: "Se requiere un operador activo para esta acción.",
      needsOperador: true,
    };
  }
  return { ok: true, operador };
}

/**
 * Firma un VOUCHER de operador: prueba infalsificable de que este operador
 * estuvo activo en este local. Se entrega al cliente (login / me) para que lo
 * adjunte a las ventas que encola offline. Tipo distinto al token de la cookie:
 * NO sirve como sesión de operador (getOperadorActivo lo rechaza), así que su
 * exposición a JS es de bajo riesgo.
 */
export function firmarVoucherOperador({ operadorId, localId }) {
  return firmarToken({ operadorId, localId, _tipo: OPERADOR_VOUCHER_TIPO });
}

/**
 * Verifica un voucher de operador IGNORANDO el vencimiento. Retorna el
 * operadorId solo si la firma es válida, el tipo coincide y el localId coincide
 * con el de la venta. Si no, null (la venta se persiste sin operador antes que
 * perderse). Un cliente sin AUTH_SECRET no puede fabricar un voucher válido:
 * por eso no puede atribuir una venta offline a un operador que no autenticó.
 */
export function verificarVoucherOperador(voucher, localId) {
  if (!voucher) return null;
  const data = verificarTokenIgnorandoVencimiento(voucher);
  if (!data || data._tipo !== OPERADOR_VOUCHER_TIPO) return null;
  if (Number(data.localId) !== Number(localId)) return null;
  const id = Number(data.operadorId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Exige operador activo SALVO que el usuario esté exento (Admin, o DUEÑO_LOCAL en
 * SU local). Para el exento el operador es opcional: opera sin operario y la
 * operación queda con operadorId = null (mismo patrón que el Admin histórico).
 * Para el resto (CAJERO/ENCARGADO), sin operario activo → rechazo 428.
 *
 * IMPORTANTE: el `localId` que se pasa acá DEBE ser el local YA resuelto y
 * autorizado por el scope del endpoint (resolveScope/resolveLocalAndGrupo), nunca
 * el crudo del body/query. Así el bypass de DUEÑO_LOCAL solo aplica en su local.
 *
 * @param {Request} req
 * @param {{ esAdmin?: boolean, esDuenoLocal?: boolean, localId?: number|null }} session
 * @param {{ localId?: number|null }} ctx - local autorizado de la operación
 * @returns {{ ok:true, operadorId:number|null }}
 *        | {{ ok:false, status:number, error:string, needsOperador:true }}
 */
export async function requireOperadorSalvoDueno(req, session, { localId } = {}) {
  if (puedeOperarSinOperador(session, { localId })) {
    const op = await getOperadorActivoDelLocal(req, localId);
    return { ok: true, operadorId: op?.operadorId ?? null };
  }
  const r = await requireOperador(req, { localId });
  if (!r.ok) return r;
  return { ok: true, operadorId: r.operador.operadorId };
}

/**
 * Igual que requireOperadorSalvoDueno pero además respeta el flag POR LOCAL
 * `exigirOperador` (ConfiguracionLocal). Orden de exención:
 *   1. Rol: Admin, o DUEÑO_LOCAL en SU local (puedeOperarSinOperador) → opcional.
 *   2. Config del local: si la ubicación desactivó el operario obligatorio
 *      (`exigirOperador === false`) → opcional para TODOS (incluido CAJERO).
 *   3. Si no, se exige operario activo (428 si no hay).
 *
 * Es async (lee la config del local). El `localId` DEBE ser el ya autorizado por
 * el scope del endpoint (resolveScope/resolveLocalAndGrupo), nunca el crudo del
 * request: así la exención por config solo aplica a la ubicación autorizada.
 *
 * @param {Request} req
 * @param {{ esAdmin?: boolean, esDuenoLocal?: boolean, localId?: number|null }} session
 * @param {{ localId?: number|null }} ctx - local autorizado de la operación
 * @returns {Promise<{ ok:true, operadorId:number|null }
 *        | { ok:false, status:number, error:string, needsOperador:true }>}
 */
export async function requireOperadorSegunConfig(req, session, { localId } = {}) {
  if (puedeOperarSinOperador(session, { localId })) {
    const op = await getOperadorActivoDelLocal(req, localId);
    return { ok: true, operadorId: op?.operadorId ?? null };
  }
  // Fail-closed: sin localId autorizado, getExigirOperador devuelve true.
  const exigir = await getExigirOperador(localId);
  if (exigir === false) {
    const op = await getOperadorActivoDelLocal(req, localId);
    return { ok: true, operadorId: op?.operadorId ?? null };
  }
  const r = await requireOperador(req, { localId });
  if (!r.ok) return r;
  return { ok: true, operadorId: r.operador.operadorId };
}

/**
 * Resuelve contexto completo para auditoría:
 * - usuario autenticado (acceso)
 * - operador activo (identidad operativa)
 * - local activo
 * Retorna un objeto plano listo para persistir en logs.
 */
export function resolveContextoAuditoria(req, session, extra = {}) {
  const operador = getOperadorActivo(req);
  return {
    usuarioId: session?.id ?? null,
    operadorId: operador?.operadorId ?? null,
    operadorNombre: operador?.nombre ?? null,
    localId: session?.localId ?? extra.localId ?? operador?.localId ?? null,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}
