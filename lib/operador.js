import { firmarToken, verificarToken, getCookieValue } from "@/lib/auth";

const OPERADOR_COOKIE = "erpazul_operador_activo";
const OPERADOR_MAX_AGE = 60 * 60 * 12; // 12 horas

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
