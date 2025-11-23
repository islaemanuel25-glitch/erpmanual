import jwt from "jsonwebtoken";

const COOKIE_NAME = "erpazul_sesion";
const MAX_AGE = 60 * 60 * 8;

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
// OBTENER TOKEN DESDE REQUEST
// -----------------------------------------------------
export function getTokenFromRequest(req) {
  const cookie = req.headers.get("cookie") || "";
  const piezas = cookie.split(";").map((c) => c.trim());
  const par = piezas.find((p) => p.startsWith(`${COOKIE_NAME}=`));
  return par ? decodeURIComponent(par.split("=")[1]) : null;
}

// -----------------------------------------------------
// ⭐ OBTENER SESIÓN DEL USUARIO (CORREGIDO)
// -----------------------------------------------------
export function getUsuarioSession(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;

  const data = verificarToken(token);
  if (!data) return null;

  // 🔵 Corrección definitiva: normalizar localId correctamente
  const localId =
    data.localId === undefined ||
    data.localId === null ||
    data.localId === "" ||
    isNaN(Number(data.localId))
      ? null
      : Number(data.localId);

  // Normalizar permisos
  const permisos = Array.isArray(data.permisos) ? data.permisos : [];

  return {
    id: data.id || null,
    rolId: data.rolId || null,
    localId,
    permisos,
    grupoId: data.grupoId || null,
  };
}

// -----------------------------------------------------
// COOKIE CONFIG
// -----------------------------------------------------
export const SesionCookie = {
  nombre: COOKIE_NAME,
  opciones: {
    httpOnly: true,
    secure: false, // en DEV
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  },
};
