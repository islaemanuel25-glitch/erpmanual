// lib/apariencia/temaServidor.js
//
// Resolución SERVER-SIDE del tema INSTITUCIONAL del local activo, para pintar
// `data-theme` en <html> desde el primer frame (SSR) y evitar el FOUC.
//
// Lee solo cookies del request (JWT de sesión con localId; contexto activo para
// admin) + ConfiguracionLocal.aparienciaJson. NO decide la preferencia PERSONAL
// del dispositivo (localStorage), que sigue ganando en el cliente. Best-effort:
// cualquier fallo → null y el layout cae al tema por defecto.

import { cookies } from "next/headers";
import { verificarToken } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { SUNMI_THEMES } from "@/lib/sunmiThemes";
import { temaDesdeApariencia } from "@/lib/apariencia/resolver";

const SESION_COOKIE = "erpazul_sesion";
const CONTEXTO_COOKIE = "erpazul_contexto_activo";

/**
 * @returns {Promise<string|null>} clave de tema institucional válida, o null.
 */
export async function resolverTemaInstitucionalSSR() {
  try {
    const store = await cookies();

    const token = store.get(SESION_COOKIE)?.value;
    if (!token) return null;
    const data = verificarToken(token);
    if (!data) return null;

    // localId: del JWT (usuario de local) o del contexto activo (admin sin local fijo).
    let localId = Number(data.localId) || null;
    if (!localId) {
      const raw = store.get(CONTEXTO_COOKIE)?.value;
      if (raw) {
        try {
          const ctx = JSON.parse(raw);
          // `global` NO es una ubicación: no aplica tema de local.
          if (ctx && ctx.global !== true && Number(ctx.localId) > 0) {
            localId = Number(ctx.localId);
          }
        } catch {
          /* cookie inválida → sin local */
        }
      }
    }
    if (!localId) return null;

    const cl = await prisma.configuracionLocal.findUnique({
      where: { localId },
      select: { aparienciaJson: true },
    });
    return temaDesdeApariencia(cl?.aparienciaJson, (k) => !!SUNMI_THEMES[k]);
  } catch {
    // Sesión inválida/vencida, DB caída, etc. → default en el layout.
    return null;
  }
}
