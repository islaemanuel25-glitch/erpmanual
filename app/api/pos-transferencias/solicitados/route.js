// app/api/pos-transferencias/solicitados/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { sinCancelados } from "@/lib/pedidos/estados";
import { depositoEmpezo } from "@/lib/pedidos/bloqueoDelPedido";
import { WHERE_LINEA_REVISADA } from "@/lib/pedidos/revisionDeLinea";
import { localesQueArmaElDeposito } from "@/lib/pedidos/depositosDelPedido";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "pos_transferencias.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const isAdmin =
      Array.isArray(session.permisos) &&
      session.permisos.includes("*") &&
      !session.localId;

    let where = { estado: "Solicitado" };

    if (isAdmin) {
      // Admin ve todos los solicitados
    } else {
      const localId = Number(session.localId);
      if (!localId) {
        return NextResponse.json(
          { ok: false, error: "Usuario sin local válido" },
          { status: 400 }
        );
      }

      const local = await prisma.local.findUnique({
        where: { id: localId },
        select: { es_deposito: true },
      });

      if (local?.es_deposito) {
        // Depósito ve los pedidos donde él es el origen y los de los locales de
        // su empresa: los dos depósitos de una empresa arman el mismo pedido
        // (2026-10-28, `lib/pedidos/depositosDelPedido.js`).
        where.OR = [{ origenId: localId }, { destinoId: { in: await localesQueArmaElDeposito(prisma, localId) } }];
      } else {
        // Local ve pedidos donde él es el destino
        where.destinoId = localId;
      }
    }

    const rows = await prisma.posTransferencia.findMany({
      where: sinCancelados(where),
      include: {
        origen: { select: { id: true, nombre: true } },
        destino: { select: { id: true, nombre: true } },
        solicitadoPor: { select: { id: true, nombre: true } },
        _count: { select: { detalles: true } },
      },
      orderBy: { solicitadoAt: "desc" },
    });

    // ── EL AVANCE DE CADA PEDIDO (2026-10-22) ─────────────────────────────
    // Para la entrada del depósito en el celular: "Nuevo" o "Preparando · N
    // de M". Se AGREGAN dos campos y no cambia ninguno de los que había.
    // `revisados` cuenta con el mismo criterio que la pantalla de preparar
    // (`WHERE_LINEA_REVISADA`) y `depositoEmpezo` es el de los bloqueos, el
    // mismo que lee el local.
    const ids = rows.map((r) => r.id);
    const revisadasPorPedido = ids.length
      ? await prisma.posTransferenciaDetalle.groupBy({
          by: ["posTransferenciaId"],
          where: { posTransferenciaId: { in: ids }, ...WHERE_LINEA_REVISADA, pos: sinCancelados() },
          _count: { _all: true },
        })
      : [];
    const revisadas = new Map(revisadasPorPedido.map((g) => [g.posTransferenciaId, g._count._all]));

    const items = await Promise.all(rows.map(async (r) => ({
      id: r.id,
      origenId: r.origenId,
      origenNombre: r.origen?.nombre || "-",
      destinoId: r.destinoId,
      destinoNombre: r.destino?.nombre || "-",
      solicitadoAt: r.solicitadoAt?.toISOString() || null,
      itemCount: r._count.detalles,
      solicitadoPorNombre: r.solicitadoPor?.nombre || "-",
      revisados: revisadas.get(r.id) || 0,
      depositoEmpezo: await depositoEmpezo(prisma, r),
    })));

    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("Error solicitados POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
