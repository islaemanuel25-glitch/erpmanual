// app/api/compras-proveedor/eliminar-item/[id]/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { pedidoEnAlcance } from "@/lib/compras/scope";

export async function POST(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, "compras.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const pedidoId = Number(id);

    if (!pedidoId) {
      return NextResponse.json(
        { ok: false, error: "id requerido" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { detalleId } = body;

    if (!detalleId || !Number.isFinite(Number(detalleId))) {
      return NextResponse.json(
        { ok: false, error: "detalleId requerido" },
        { status: 400 }
      );
    }

    const pedido = await prisma.pedidoProveedor.findUnique({
      where: { id: pedidoId },
    });

    if (!pedido || pedido.grupoId !== grupoId) {
      return NextResponse.json(
        { ok: false, error: "Pedido no encontrado" },
        { status: 404 }
      );
    }
    // Escritura sobre pedido de otra ubicación del mismo grupo → 403.
    if (!pedidoEnAlcance(pedido, { grupoId, localId })) {
      return NextResponse.json(
        { ok: false, error: "Pedido fuera de tu alcance" },
        { status: 403 }
      );
    }

    if (!["BORRADOR", "ENVIADO"].includes(pedido.estado)) {
      return NextResponse.json(
        { ok: false, error: "Solo se pueden eliminar ítems en estado BORRADOR o ENVIADO" },
        { status: 400 }
      );
    }

    const detalle = await prisma.pedidoProveedorDetalle.findUnique({
      where: { id: Number(detalleId) },
    });

    if (!detalle || detalle.pedidoId !== pedidoId) {
      return NextResponse.json(
        { ok: false, error: "Detalle no encontrado en este pedido" },
        { status: 404 }
      );
    }

    let pedidoEliminado = false;

    await prisma.$transaction(async (tx) => {
      await tx.pedidoProveedorDetalle.delete({
        where: { id: Number(detalleId) },
      });

      // Prevención de borradores vacíos: si era el ÚLTIMO ítem de un BORRADOR,
      // se elimina el pedido (no dejamos borradores sin nada para continuar).
      // Solo aplica a BORRADOR — no se tocan pedidos ENVIADO ni otros estados.
      if (pedido.estado === "BORRADOR") {
        const restantes = await tx.pedidoProveedorDetalle.count({
          where: { pedidoId },
        });
        if (restantes === 0) {
          await tx.pedidoProveedor.delete({ where: { id: pedidoId } });
          pedidoEliminado = true;
        }
      }
    });

    return NextResponse.json({ ok: true, pedidoEliminado });
  } catch (err) {
    console.error("Error compras-proveedor/eliminar-item:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
