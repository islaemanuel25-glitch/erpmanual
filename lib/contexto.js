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
 * - Admin sin local: lee cookie erpazul_contexto_activo, que puede ser:
 *     · { localId, esDeposito } → una ubicación concreta.
 *     · { global: true }        → VISTA GLOBAL EXPLÍCITA (opt-in del admin).
 * - Si no hay contexto: retorna { needsContexto: true }.
 *
 * IMPORTANTE: `global` NO es una ubicación operable. Los resolvedores de operación
 * (resolveLocalAndGrupo/resolveScope) lo tratan como needsContexto: no se puede
 * vender/mover stock "en global". Solo lo consumen las vistas agregadas
 * (resolveVistaOperativa).
 */
export function getContextoActivo(req, session) {
  // Usuario con local fijo → contexto implícito (nunca global)
  if (session.localId) {
    return { localId: session.localId, esDeposito: session.esDeposito ?? false };
  }

  // Admin sin local → leer cookie
  const raw = getCookieValue(req, CONTEXTO_COOKIE);
  if (!raw) return { needsContexto: true };

  try {
    const parsed = JSON.parse(raw);
    if (parsed.global === true) return { global: true };
    const localId = Number(parsed.localId);
    if (!localId || Number.isNaN(localId) || localId <= 0) {
      return { needsContexto: true };
    }
    return { localId, esDeposito: parsed.esDeposito === true };
  } catch {
    return { needsContexto: true };
  }
}
