// app/api/compras-proveedor/marcar-enviado/[id]/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { crearNotificacion } from "@/lib/notificaciones/crearNotificacion";
import { pedidoEnAlcance, ownerLocalIdDePedido } from "@/lib/compras/scope";

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

    const pedido = await prisma.pedidoProveedor.findUnique({
      where: { id: pedidoId },
      include: { proveedor: { select: { nombre: true } } },
    });

    // Lectura ajena (existe pero de otra ubicación) → 404 (no revela existencia).
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

    if (pedido.estado !== "CONFIRMADO") {
      return NextResponse.json(
        { ok: false, error: `No se puede marcar como enviado un pedido en estado ${pedido.estado}` },
        { status: 400 }
      );
    }

    const updated = await prisma.pedidoProveedor.update({
      where: { id: pedidoId },
      data: {
        estado: "ENVIADO",
        fechaEnviado: new Date(),
      },
    });

    // Notificación interna AISLADA a la ubicación dueña del pedido (no al grupo).
    // Solo la ven usuarios cuya ubicación activa == dueña Y con permiso compras.ver.
    const ownerLocalId = ownerLocalIdDePedido(pedido);
    await crearNotificacion({
      grupoId,
      alcance: ownerLocalId === pedido.depositoId ? "DEPOSITO" : "LOCAL",
      localId: ownerLocalId,
      permisoRequerido: "compras.ver",
      tipo: "PEDIDO_PROVEEDOR_ENVIADO",
      titulo: "Pedido enviado a proveedor",
      cuerpo: `Pedido #${pedidoId}${pedido.proveedor?.nombre ? ` — ${pedido.proveedor.nombre}` : ""} marcado como enviado.`,
      href: `/modulos/compras-proveedor/${pedidoId}`,
      entidadTipo: "COMPRA_PROVEEDOR",
      entidadId: pedidoId,
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (err) {
    console.error("Error compras-proveedor/marcar-enviado:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
