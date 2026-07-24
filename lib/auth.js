import jwt from "jsonwebtoken";
import { seedAuditoria } from "@/lib/auditoria/contexto";

const COOKIE_NAME = "erpazul_sesion";
const MAX_AGE = 60 * 60 * 8;

// ✅ nuevo: grupo activo (solo para admin padre)
export const ACTIVE_GROUP_COOKIE = "erpazul_grupo_activo";

// -----------------------------------------------------
// FIRMAR TOKEN
// -----------------------------------------------------
export function firmarToken(payload) {
  return jwt.sign(payload, process.env.AUTH_SECRET, { expiresIn: MAX_AGE });
}

// -----------------------------------------------------
// VERIFICAR TOKEN
// -----------------------------------------------------
export function verificarToken(token) {
  try {
    return jwt.verify(token, process.env.AUTH_SECRET);
  } catch {
    return null;
  }
}

// Verifica la FIRMA de un token pero ignora su expiración. Se usa solo para el
// voucher de operador en el replay de cola offline: la venta ya se cobró con un
// operador identificado, así que no exigimos token vigente — pero la firma
// (AUTH_SECRET) sigue siendo infalsificable.
export function verificarTokenIgnorandoVencimiento(token) {
  try {
    return jwt.verify(token, process.env.AUTH_SECRET, { ignoreExpiration: true });
  } catch {
    return null;
  }
}

// -----------------------------------------------------
// OBTENER COOKIE VALUE DESDE REQUEST
// -----------------------------------------------------
export function getCookieValue(req, cookieName) {
  const cookie = req.headers.get("cookie") || "";
  const piezas = cookie.split(";").map((c) => c.trim());
  const par = piezas.find((p) => p.startsWith(`${cookieName}=`));
  return par ? decodeURIComponent(par.split("=")[1]) : null;
}

// -----------------------------------------------------
// OBTENER TOKEN DESDE REQUEST
// -----------------------------------------------------
export function getTokenFromRequest(req) {
  return getCookieValue(req, COOKIE_NAME);
}

// -----------------------------------------------------
// ⭐ OBTENER SESIÓN DEL USUARIO
// -----------------------------------------------------
export function getUsuarioSession(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;

  const data = verificarToken(token);
  if (!data) return null;

  const localId =
    data.localId === undefined ||
    data.localId === null ||
    data.localId === "" ||
    Number.isNaN(Number(data.localId))
      ? null
      : Number(data.localId);

  const permisos = Array.isArray(data.permisos) ? data.permisos : [];
  const esAdmin = permisos.includes("*");

  // ✅ Para admin padre: leer grupo activo desde cookie
  const activeGroupRaw = getCookieValue(req, ACTIVE_GROUP_COOKIE);
  const activeGroupNum =
    activeGroupRaw === undefined ||
    activeGroupRaw === null ||
    activeGroupRaw === "" ||
    Number.isNaN(Number(activeGroupRaw))
      ? null
      : Number(activeGroupRaw);

  const activeGroupId = activeGroupNum && activeGroupNum > 0 ? activeGroupNum : null;

  const session = {
    id: data.id ?? null,
    rolId: data.rolId ?? null,
    localId,
    permisos,
    esAdmin,
    esDeposito: data.esDeposito === true,
    grupoId: esAdmin ? activeGroupId : null,
    grupoActivoId: esAdmin ? activeGroupId : null,
  };

  // Auditoría: sembramos la identidad del usuario para el interceptor de Prisma.
  // Es aditivo (no altera el retorno); el local del JWT ya sirve como fallback.
  seedAuditoria({ usuarioId: session.id, esAdmin, localId: session.localId });

  return session;
}

// -----------------------------------------------------
// COOKIE CONFIG
// -----------------------------------------------------
const isProd = process.env.NODE_ENV === "production";
export const SesionCookie = {
  nombre: COOKIE_NAME,
  opciones: {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  },
};

export const GrupoActivoCookie = {
  nombre: ACTIVE_GROUP_COOKIE,
  opciones: {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  },
};
