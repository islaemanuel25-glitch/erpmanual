import prisma from "@/lib/prisma";
import { enviarPushANotificacion } from "@/lib/notificaciones/enviarPush";

// Tipos que disparan push automático al celular/PC (Etapa 2).
const TIPOS_PUSH = new Set(["PEDIDO_PROVEEDOR_ENVIADO"]);

const ALCANCES = new Set(["USUARIO", "LOCAL", "DEPOSITO", "PARTICIPANTES", "GRUPO"]);

/**
 * Crea una notificación interna con AISLAMIENTO POR UBICACIÓN.
 * No lanza si falla: registra el error y devuelve null, para no romper el flujo
 * de negocio que la dispara (ej. marcar pedido como enviado).
 *
 * @param {object} datos
 *   - grupoId (req), tipo (req), titulo (req)
 *   - alcance? "USUARIO"|"LOCAL"|"DEPOSITO"|"PARTICIPANTES"|"GRUPO" (default GRUPO)
 *   - localId? (para LOCAL/DEPOSITO), origenLocalId?/destinoLocalId? (PARTICIPANTES)
 *   - usuarioId? (destinatario directo; obligatorio de hecho para alcance USUARIO)
 *   - permisoRequerido? (solo lo ve quien tenga ese permiso, o "*")
 *   - cuerpo?, href?, entidadTipo?, entidadId?
 * @param {object} [db] cliente Prisma o tx (default: prisma)
 */
export async function crearNotificacion(datos, db = prisma) {
  try {
    const { grupoId, tipo, titulo } = datos || {};
    if (!grupoId || !tipo || !titulo) return null;

    const alcance =
      datos.alcance && ALCANCES.has(String(datos.alcance))
        ? String(datos.alcance)
        : "GRUPO";
    const numOrNull = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);

    const notif = await db.notificacion.create({
      data: {
        grupoId: Number(grupoId),
        usuarioId: numOrNull(datos.usuarioId),
        tipo: String(tipo),
        titulo: String(titulo),
        cuerpo: datos.cuerpo != null ? String(datos.cuerpo) : null,
        href: datos.href != null ? String(datos.href) : null,
        entidadTipo: datos.entidadTipo != null ? String(datos.entidadTipo) : null,
        entidadId: numOrNull(datos.entidadId),
        // Aislamiento por ubicación.
        alcance,
        localId: numOrNull(datos.localId),
        origenLocalId: numOrNull(datos.origenLocalId),
        destinoLocalId: numOrNull(datos.destinoLocalId),
        permisoRequerido:
          datos.permisoRequerido != null ? String(datos.permisoRequerido) : null,
      },
    });

    // Push automático SOLO para tipos whitelisteados. Fire-and-forget:
    // no se await-ea ni se deja propagar el error → nunca bloquea ni rompe el flujo.
    // (Usa prisma global, no `db`, por si `db` fuese una tx ya cerrada.)
    if (TIPOS_PUSH.has(notif.tipo)) {
      enviarPushANotificacion(notif).catch((e) =>
        console.error("push notif (fire-and-forget):", e?.message)
      );
    }

    return notif;
  } catch (err) {
    console.error("crearNotificacion error:", err);
    return null;
  }
}
