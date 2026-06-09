import webpush from "web-push";
import prisma from "@/lib/prisma";

const PUBLIC_KEY =
  process.env.WEB_PUSH_PUBLIC_KEY || process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
const PRIVATE_KEY = process.env.WEB_PUSH_PRIVATE_KEY;
const SUBJECT = process.env.WEB_PUSH_SUBJECT || "mailto:admin@erpazul";

let configurado = false;
function configurar() {
  if (configurado) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configurado = true;
  return true;
}

export function pushConfigurado() {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

// Normaliza una fila PushSubscription o un objeto subscription del navegador.
function aSubscription(s) {
  if (s?.keys) return s; // ya es {endpoint, keys}
  return { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
}

/**
 * Envía un push a una lista de suscripciones.
 * @param subs  Array de filas PushSubscription (con id/endpoint/p256dh/auth) u objetos {endpoint, keys}.
 * @param payload  Objeto → se serializa a JSON (titulo, cuerpo, href, tag).
 * @param db  cliente Prisma (default prisma).
 * Maneja 404/410 desactivando el endpoint (si la fila tiene id). No rompe si falla.
 */
export async function enviarPush(subs, payload, db = prisma) {
  if (!configurar()) {
    console.error("enviarPush: VAPID no configurado");
    return { ok: false, enviadas: 0, fallidas: 0 };
  }
  const json = JSON.stringify(payload || {});
  let enviadas = 0;
  let fallidas = 0;

  await Promise.all(
    (subs || []).map(async (s) => {
      try {
        await webpush.sendNotification(aSubscription(s), json);
        enviadas++;
      } catch (err) {
        fallidas++;
        const code = err?.statusCode;
        if ((code === 404 || code === 410) && s?.id) {
          try {
            await db.pushSubscription.update({ where: { id: s.id }, data: { activo: false } });
          } catch {
            // ignorar: limpieza best-effort
          }
        } else {
          // No imprimir secrets: solo código y mensaje del push service.
          console.error("enviarPush err:", code, err?.body || err?.message);
        }
      }
    })
  );

  return { ok: true, enviadas, fallidas };
}

/**
 * Resuelve los dispositivos activos del scope de una notificación y les envía push.
 * - usuarioId presente → solo dispositivos de ese usuario.
 * - usuarioId null → todos los dispositivos activos del grupo.
 * No lanza al caller (uso fire-and-forget desde crearNotificacion).
 */
export async function enviarPushANotificacion(notif, db = prisma) {
  try {
    if (!notif?.grupoId || !pushConfigurado()) return { ok: false, enviadas: 0 };

    const where = { grupoId: notif.grupoId, activo: true };
    if (notif.usuarioId != null) where.usuarioId = notif.usuarioId;

    const subs = await db.pushSubscription.findMany({ where });
    if (subs.length === 0) return { ok: true, enviadas: 0 };

    const payload = {
      titulo: notif.titulo,
      cuerpo: notif.cuerpo || "",
      href: notif.href || "/modulos/notificaciones",
      tag: `${notif.tipo}-${notif.entidadTipo || "GEN"}-${notif.entidadId || notif.id}`,
    };
    return await enviarPush(subs, payload, db);
  } catch (err) {
    console.error("enviarPushANotificacion:", err?.message);
    return { ok: false, enviadas: 0 };
  }
}
