import jwt from "jsonwebtoken";

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

  return session;
}

// -----------------------------------------------------
// COOKIE CONFIG
// -----------------------------------------------------
export const SesionCookie = {
  nombre: COOKIE_NAME,
  opciones: {
    httpOnly: true,
    secure: false, // DEV
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  },
};

export const GrupoActivoCookie = {
  nombre: ACTIVE_GROUP_COOKIE,
  opciones: {
    httpOnly: true,
    secure: false, // DEV
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  },
};
