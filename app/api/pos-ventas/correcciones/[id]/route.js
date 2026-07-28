// app/api/pos-ventas/correcciones/[id]/route.js
//
// Historial de correcciones de una venta. FUENTE PRINCIPAL: la tabla
// VentaCorreccion (libro inmutable), no la bitácora general. Devuelve una lista
// legible (más reciente primero) con motivo, autor, tipo, diferencia y diffs.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";

const j = (body, status = 200) => NextResponse.json(body, { status });

export async function GET(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) return j({ ok: false, error: "No autenticado" }, 401);

    const perm = checkPerm(session, "reportes.ver");
    if (!perm.ok) return j({ ok: false, error: perm.error }, perm.status);

    const { id } = await params;
    const ventaId = Number(id);
    if (!ventaId || Number.isNaN(ventaId)) {
      return j({ ok: false, error: "ID de venta inválido" }, 400);
    }

    // Scope: leer la venta solo para validar el local (no revela ajenas → 404).
    const venta = await prisma.venta.findUnique({
      where: { id: ventaId },
      select: { id: true, localId: true, corregida: true, version: true },
    });
    if (!venta) return j({ ok: false, error: "Venta no encontrada" }, 404);
    if (!session.esAdmin && venta.localId !== Number(session.localId)) {
      return j({ ok: false, error: "Venta no encontrada" }, 404);
    }

    const correcciones = await prisma.ventaCorreccion.findMany({
      where: { ventaId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, tipo: true, motivo: true, usuarioId: true, createdAt: true,
        versionAntes: true, versionDespues: true, turnoCerrado: true,
        totalAnterior: true, totalNuevo: true, diferencia: true,
        diffProductos: true, diffPagos: true, snapshotAntes: true, snapshotDespues: true,
      },
    });

    // Resolver nombres de autor en un solo query.
    const userIds = [...new Set(correcciones.map((c) => c.usuarioId).filter(Boolean))];
    const usuarios = userIds.length
      ? await prisma.usuario.findMany({ where: { id: { in: userIds } }, select: { id: true, nombre: true } })
      : [];
    const nombrePorId = new Map(usuarios.map((u) => [u.id, u.nombre]));

    const items = correcciones.map((c) => ({
      id: c.id,
      tipo: c.tipo,
      motivo: c.motivo,
      autor: c.usuarioId ? nombrePorId.get(c.usuarioId) || `Usuario #${c.usuarioId}` : "—",
      fecha: c.createdAt,
      versionAntes: c.versionAntes,
      versionDespues: c.versionDespues,
      turnoCerrado: c.turnoCerrado,
      totalAnterior: Number(c.totalAnterior).toFixed(2),
      totalNuevo: Number(c.totalNuevo).toFixed(2),
      diferencia: Number(c.diferencia).toFixed(2),
      diffProductos: c.diffProductos || null,
      diffPagos: c.diffPagos || null,
      snapshotAntes: c.snapshotAntes || null,
      snapshotDespues: c.snapshotDespues || null,
    }));

    return j({ ok: true, ventaId, corregida: venta.corregida, version: venta.version, items });
  } catch (error) {
    console.error("Error en correcciones venta:", error);
    return j({ ok: false, error: "Error interno" }, 500);
  }
}
