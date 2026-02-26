// lib/contexto.js
import { getCookieValue } from "@/lib/auth";

const CONTEXTO_COOKIE = "erpazul_contexto_activo";
const MAX_AGE = 60 * 60 * 8; // 8h

export const ContextoActivoCookie = {
  nombre: CONTEXTO_COOKIE,
  opciones: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  },
};

/**
 * Obtiene el contexto operativo activo del usuario.
 * - Usuario con local fijo: retorna { localId, esDeposito } directo.
 * - Admin sin local: lee cookie erpazul_contexto_activo.
 * - Si no hay contexto: retorna { needsContexto: true }.
 */
export function getContextoActivo(req, session) {
  // Usuario con local fijo → contexto implícito
  if (session.localId) {
    return { localId: session.localId, esDeposito: session.esDeposito ?? false };
  }

  // Admin sin local → leer cookie
  const raw = getCookieValue(req, CONTEXTO_COOKIE);
  if (!raw) return { needsContexto: true };

  try {
    const parsed = JSON.parse(raw);
    const localId = Number(parsed.localId);
    if (!localId || Number.isNaN(localId) || localId <= 0) {
      return { needsContexto: true };
    }
    return { localId, esDeposito: parsed.esDeposito === true };
  } catch {
    return { needsContexto: true };
  }
}
