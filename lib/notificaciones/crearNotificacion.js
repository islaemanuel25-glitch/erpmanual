import prisma from "@/lib/prisma";

/**
 * Crea una notificación interna (v1).
 * No lanza si falla: registra el error y devuelve null, para no romper el flujo
 * de negocio que la dispara (ej. marcar pedido como enviado).
 *
 * @param {object} datos
 *   - grupoId (req), tipo (req), titulo (req)
 *   - usuarioId? (null = para todo el grupo)
 *   - cuerpo?, href?, entidadTipo?, entidadId?
 * @param {object} [db] cliente Prisma o tx (default: prisma)
 */
export async function crearNotificacion(datos, db = prisma) {
  try {
    const { grupoId, tipo, titulo } = datos || {};
    if (!grupoId || !tipo || !titulo) return null;
    return await db.notificacion.create({
      data: {
        grupoId: Number(grupoId),
        usuarioId: datos.usuarioId != null ? Number(datos.usuarioId) : null,
        tipo: String(tipo),
        titulo: String(titulo),
        cuerpo: datos.cuerpo != null ? String(datos.cuerpo) : null,
        href: datos.href != null ? String(datos.href) : null,
        entidadTipo: datos.entidadTipo != null ? String(datos.entidadTipo) : null,
        entidadId: datos.entidadId != null ? Number(datos.entidadId) : null,
      },
    });
  } catch (err) {
    console.error("crearNotificacion error:", err);
    return null;
  }
}
