import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { pedidoEnAlcance } from "@/lib/compras/scope";
import { sePuedeAnular } from "@/lib/compras-proveedor/anularPedido";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

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

    if (!sePuedeAnular(pedido.estado)) {
      return NextResponse.json(
        { ok: false, error: `No se puede anular un pedido en estado ${pedido.estado}` },
        { status: 400 }
      );
    }

    // ── LAS FACTURAS DEL PEDIDO SE ANULAN CON ÉL ─────────────────────────
    //
    // Desde 2026-10-22 se anula también desde la recepción, donde un pedido
    // puede tener facturas subidas. Quedarían vivas colgando de un pedido
    // anulado, y su archivo y su CAE chocarían como repetidos contra la misma
    // factura subida en otro pedido (`subir`, `facturaRepetida`), que ya no
    // miran las anuladas. En la misma transacción: un pedido anulado con sus
    // facturas vivas sería un estado a medias.
    const { pedido: updated, comprobantes } = await prisma.$transaction(async (tx) => {
      const p = await tx.pedidoProveedor.update({
        where: { id: pedidoId },
        data: {
          estado: "ANULADO",
          fechaAnulado: new Date(),
        },
      });
      const c = await tx.comprobanteProveedor.updateMany({
        where: { pedidoId, grupoId, estado: { not: "ANULADO" } },
        data: { estado: "ANULADO" },
      });
      return { pedido: p, comprobantes: c.count };
    });

    return NextResponse.json({ ok: true, item: updated, comprobantesAnulados: comprobantes });
  } catch (err) {
    console.error("Error compras-proveedor/anular:", err);
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "anular el pedido",
          quedo: "El pedido quedó como estaba: no se anuló nada.",
        }),
      },
      { status: 500 }
    );
  }
}
