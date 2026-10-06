// lib/integraciones/azul-chat/limitador.js
//
// EL CUPO DE CONSULTAS DE LA INTEGRACIÓN. V1: EN MEMORIA DEL PROCESO.
//
// ── QUÉ FRENA ──────────────────────────────────────────────────────────────
//
// A una aplicación AUTENTICADA que se desboca —un bucle, un reintento sin
// espera— y convierte cada pedido en consultas de ventas sobre hasta 31 días.
// Por eso cuenta después de la firma y antes de la base. Dos cupos, con ventana
// fija de un minuto, y hay que tener lugar en LOS DOS:
//
//   · por aplicación y usuario: una persona no le saca el cupo a las demás;
//   · por aplicación, en total: rotar `usuarioId` no sirve para pasar más.
//
// Una solicitud sin firma válida no llega acá: verificar un HMAC no toca la
// base y cuesta menos que contarla.
//
// ── POR QUÉ NO ES EL DEL LOGIN ─────────────────────────────────────────────
//
// El único limitador del repo vive adentro de `app/api/login/route.js` y decide
// otra cosa: frena a quien PRUEBA CONTRASEÑAS, perdona los aciertos y corre la
// ventana desde el último intento —su candado, `lib/auth/limiteDeLogin.test.mjs`,
// fija exactamente eso—. Acá no hay aciertos que perdonar: una consulta válida
// también gasta, porque lo que se cuida es la base. Sacarlo de la ruta del login
// para compartirlo habría cambiado el login en una tanda que no lo toca.
//
// ── LO QUE NO HACE ─────────────────────────────────────────────────────────
//
// Es por PROCESO: con varias réplicas, cada una cuenta lo suyo, y un reinicio
// lo vacía. Para V1 —una sola aplicación, un solo contenedor— alcanza. Un
// límite compartido entre réplicas pide infraestructura (Redis o la base) que
// esta tanda no agrega.

export const VENTANA_MS = 60 * 1000;
export const MAX_POR_USUARIO = 30;
export const MAX_POR_APLICACION = 120;

/** Más claves que esto en memoria y se barren las vencidas antes de seguir. */
const MAX_CLAVES = 10_000;

/**
 * @param {{ventanaMs?:number, maxPorUsuario?:number, maxPorAplicacion?:number}} [config]
 */
export function crearLimitador({ ventanaMs = VENTANA_MS, maxPorUsuario = MAX_POR_USUARIO, maxPorAplicacion = MAX_POR_APLICACION } = {}) {
  const cupos = new Map();

  const vigente = (clave, ahora) => {
    const c = cupos.get(clave);
    if (!c || ahora >= c.resetAt) return { cuenta: 0, resetAt: ahora + ventanaMs };
    return c;
  };
  const barrer = (ahora) => {
    for (const [k, c] of cupos) if (ahora >= c.resetAt) cupos.delete(k);
  };

  return {
    /**
     * Gasta un lugar de los dos cupos, o dice cuánto falta.
     * @returns {{ok:true} | {ok:false, reintentarEnSegundos:number}}
     */
    consumir({ aplicacion, usuarioId }, ahora = Date.now()) {
      if (cupos.size > MAX_CLAVES) barrer(ahora);
      const claveApp = `app:${aplicacion}`;
      const claveUsuario = `usr:${aplicacion}:${String(usuarioId)}`;
      const app = vigente(claveApp, ahora);
      const usuario = vigente(claveUsuario, ahora);
      if (app.cuenta >= maxPorAplicacion || usuario.cuenta >= maxPorUsuario) {
        const lleno = app.cuenta >= maxPorAplicacion ? app : usuario;
        return { ok: false, reintentarEnSegundos: Math.max(1, Math.ceil((lleno.resetAt - ahora) / 1000)) };
      }
      cupos.set(claveApp, { cuenta: app.cuenta + 1, resetAt: app.resetAt });
      cupos.set(claveUsuario, { cuenta: usuario.cuenta + 1, resetAt: usuario.resetAt });
      return { ok: true };
    },
    /** Para los candados: cuántas claves hay en memoria. */
    tamano: () => cupos.size,
  };
}
