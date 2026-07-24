import { firmarToken, verificarToken, verificarTokenIgnorandoVencimiento, getCookieValue } from "@/lib/auth";
import { seedAuditoria } from "@/lib/auditoria/contexto";

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
 * Exige operador activo. Retorna { ok, operador } o { ok: false, error, status }.
 */
export function requireOperador(req) {
  const operador = getOperadorActivo(req);
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
 * Exige operador activo SALVO que el usuario sea dueño (permiso "*").
 * Para el dueño el operador es opcional (comportamiento histórico): puede
 * operar sin operario. Para el resto, sin operario activo → rechazo 428.
 *
 * @param {Request} req
 * @param {{ esAdmin?: boolean }} session - sesión ya resuelta (getUsuarioSession / scope)
 * @returns {{ ok:true, operadorId:number|null }}
 *        | {{ ok:false, status:number, error:string, needsOperador:true }}
 */
export function requireOperadorSalvoDueno(req, session) {
  if (session?.esAdmin) {
    const op = getOperadorActivo(req);
    return { ok: true, operadorId: op?.operadorId ?? null };
  }
  const r = requireOperador(req);
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
