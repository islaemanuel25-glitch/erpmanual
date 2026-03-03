import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";

export async function DELETE(req, context) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "productos.eliminar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await context.params;
    const numId = Number(id);

    if (!numId || Number.isNaN(numId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido o faltante" },
        { status: 400 }
      );
    }

    // Scope check: verificar que el producto pertenece al grupo del usuario
    let grupoId = Number(session.grupoId) || 0;
    if (!grupoId && session.localId) {
      grupoId = await getGrupoIdDeLocal(Number(session.localId));
    }
    if (grupoId) {
      const productoScope = await prisma.productoBase.findFirst({
        where: { id: numId, grupoId },
        select: { id: true },
      });
      if (!productoScope) {
        return NextResponse.json(
          { ok: false, error: "Producto no encontrado" },
          { status: 404 }
        );
      }
    }

    // Verificar si hay referencias en Transferencias o POS
    const localesProducto = await prisma.productoLocal.findMany({
      where: { baseId: numId },
      select: { id: true },
    });

    const productoLocalIds = localesProducto.map((pl) => pl.id);

    if (productoLocalIds.length > 0) {
      // Verificar TransferenciaDetalle
      const tieneTransferencias = await prisma.transferenciaDetalle.findFirst({
        where: { productoId: { in: productoLocalIds } },
        select: { id: true },
      });

      if (tieneTransferencias) {
        return NextResponse.json(
          { ok: false, error: "No se puede eliminar: tiene movimientos/historial" },
          { status: 400 }
        );
      }

      // Verificar PosTransferenciaDetalle
      const tienePOS = await prisma.posTransferenciaDetalle.findFirst({
        where: { productoId: { in: productoLocalIds } },
        select: { id: true },
      });

      if (tienePOS) {
        return NextResponse.json(
          { ok: false, error: "No se puede eliminar: tiene movimientos/historial" },
          { status: 400 }
        );
      }
    }

    // Si no hay referencias, proceder con la eliminación (transaccional)
    await prisma.$transaction(async (tx) => {
      // Eliminar StockLocal de todos los ProductoLocal de este base
      await tx.stockLocal.deleteMany({
        where: { productoId: { in: productoLocalIds } },
      });

      // Eliminar ProductoLocal
      await tx.productoLocal.deleteMany({
        where: { baseId: numId },
      });

      // Eliminar ProductoBase
      await tx.productoBase.delete({
        where: { id: numId },
      });
    });

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error("ERROR productos/eliminar:", error);

    // ✅ Respuesta JSON garantizada
    return NextResponse.json(
      { ok: false, error: "Error interno al eliminar", detalle: String(error) },
      { status: 500 }
    );
  }
}
